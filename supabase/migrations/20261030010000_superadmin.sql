-- =====================================================================
-- Super admin: empresas, accesos y claves de servicio
--  · empresas: el super admin las da de alta o las suspende
--  · cada cuenta pertenece a una empresa (por el código con el que se registró)
--  · empresa suspendida o usuario suspendido → RLS no le deja ver ni tocar nada
--  · claves de Claude / Google Places guardadas en la base, editables desde el panel
--    (nadie las puede leer desde el navegador: sólo las Edge Functions con service role)
-- =====================================================================

create table if not exists public.empresas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  contacto   text not null default '',
  notas      text not null default '',
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.empresas enable row level security;

alter table public.perfiles add column if not exists empresa_id uuid references public.empresas (id) on delete set null;
alter table public.perfiles add column if not exists activo boolean not null default true;
alter table public.codigos_invitacion add column if not exists empresa_id uuid references public.empresas (id) on delete cascade;
create index if not exists perfiles_empresa on public.perfiles (empresa_id);
create index if not exists codigos_empresa on public.codigos_invitacion (empresa_id);

-- Empresa inicial: el estudio del dueño, con el código que ya existía
do $$
declare e uuid;
begin
  if not exists (select 1 from public.empresas) then
    insert into public.empresas (nombre, contacto) values ('Mi estudio', 'dallapevincenzo@gmail.com') returning id into e;
    update public.codigos_invitacion set empresa_id = e where empresa_id is null;
    update public.perfiles set empresa_id = e where empresa_id is null;
  end if;
end $$;

-- ¿La cuenta actual puede operar? (activa y con su empresa activa; el super admin siempre)
create or replace function public.acceso_activo()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.es_admin or (p.activo and (p.empresa_id is null or coalesce(e.activa, false)))
      from public.perfiles p left join public.empresas e on e.id = p.empresa_id
     where p.id = (select auth.uid())), false)
$$;
revoke execute on function public.acceso_activo() from public, anon;
grant execute on function public.acceso_activo() to authenticated;

-- RLS: además de ser el dueño, la cuenta tiene que estar habilitada
alter policy "prospectos propios" on public.prospectos
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));
alter policy "mensajes propios" on public.mensajes
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo())
              and exists (select 1 from public.prospectos p where p.id = prospecto_id and p.owner_id = (select auth.uid())));
alter policy "interacciones propias (leer)" on public.interacciones
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()));
alter policy "interacciones propias (agregar)" on public.interacciones
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo())
              and exists (select 1 from public.prospectos p where p.id = prospecto_id and p.owner_id = (select auth.uid())));

-- Alta: el perfil toma la empresa del código (sólo si la empresa existe)
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare emp uuid;
begin
  select e.id into emp from public.empresas e where e.id::text = new.raw_user_meta_data ->> 'empresa_id';
  insert into public.perfiles (id, nombre, email_contacto, es_admin, codigo_invitacion, empresa_id)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''), coalesce(new.email, ''),
          exists (select 1 from public.admins_por_email a where lower(a.email) = lower(new.email)),
          nullif(new.raw_user_meta_data ->> 'codigo', ''), emp)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

-- Un usuario no puede cambiarse rol, empresa ni estado de acceso
create or replace function public.proteger_es_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.es_admin := old.es_admin;
    new.codigo_invitacion := old.codigo_invitacion;
    new.empresa_id := old.empresa_id;
    new.activo := old.activo;
  end if;
  return new;
end $$;

-- Canje de código para el alta: valida código y empresa, consume un uso, devuelve la empresa
create or replace function public.canjear_codigo(p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.codigos_invitacion; activa boolean;
begin
  select * into c from public.codigos_invitacion where codigo = p_codigo for update;
  if c.codigo is null or not c.activo or c.usos >= c.usos_max then
    return jsonb_build_object('ok', false, 'motivo', 'codigo');
  end if;
  select e.activa into activa from public.empresas e where e.id = c.empresa_id;
  if c.empresa_id is not null and not coalesce(activa, false) then
    return jsonb_build_object('ok', false, 'motivo', 'empresa');
  end if;
  update public.codigos_invitacion set usos = usos + 1 where codigo = p_codigo;
  return jsonb_build_object('ok', true, 'empresa_id', c.empresa_id);
end $$;
revoke execute on function public.canjear_codigo(text) from public, anon, authenticated;
grant execute on function public.canjear_codigo(text) to service_role;

-- ---------- Claves de servicio (Claude, Google Places) ----------
create table if not exists public.config_claves (
  nombre          text primary key check (nombre in ('anthropic', 'google_places', 'modelo_ia')),
  valor           text not null,
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);
alter table public.config_claves enable row level security;  -- sin políticas: sólo service role

-- ---------- Funciones del super admin ----------
create or replace function public.exigir_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select es_admin from public.perfiles where id = (select auth.uid())), false) then
    raise exception 'SOLO_ADMIN: necesitás ser super admin';
  end if;
end $$;
revoke execute on function public.exigir_admin() from public, anon;
grant execute on function public.exigir_admin() to authenticated;

create or replace function public.admin_empresas()
returns table (id uuid, nombre text, contacto text, notas text, activa boolean, creada timestamptz,
               usuarios bigint, prospectos bigint, enviados bigint, clientes bigint, codigos_activos bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select e.id, e.nombre, e.contacto, e.notas, e.activa, e.created_at,
         (select count(*) from public.perfiles p where p.empresa_id = e.id),
         (select count(*) from public.prospectos x join public.perfiles p on p.id = x.owner_id where p.empresa_id = e.id),
         (select count(*) from public.interacciones i join public.perfiles p on p.id = i.owner_id where p.empresa_id = e.id and i.tipo = 'enviado'),
         (select count(*) from public.prospectos x join public.perfiles p on p.id = x.owner_id where p.empresa_id = e.id and x.estado = 'cliente'),
         (select count(*) from public.codigos_invitacion c where c.empresa_id = e.id and c.activo and c.usos < c.usos_max)
    from public.empresas e order by e.created_at;
end $$;

create or replace function public.admin_guardar_empresa(p_id uuid, p_nombre text, p_contacto text, p_notas text, p_activa boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  perform public.exigir_admin();
  if p_id is null then
    insert into public.empresas (nombre, contacto, notas, activa) values (trim(p_nombre), coalesce(p_contacto, ''), coalesce(p_notas, ''), coalesce(p_activa, true))
    returning id into r;
  else
    update public.empresas set nombre = trim(p_nombre), contacto = coalesce(p_contacto, ''), notas = coalesce(p_notas, ''), activa = coalesce(p_activa, activa)
     where id = p_id returning id into r;
  end if;
  return r;
end $$;

create or replace function public.admin_usuarios()
returns table (id uuid, nombre text, estudio text, email text, empresa_id uuid, empresa text, codigo text, es_admin boolean,
               activo boolean, creado timestamptz, ultimo_ingreso timestamptz, prospectos bigint, enviados bigint, clientes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select p.id, p.nombre, p.estudio, u.email::text, p.empresa_id, e.nombre, p.codigo_invitacion, p.es_admin, p.activo, p.created_at, u.last_sign_in_at,
         (select count(*) from public.prospectos x where x.owner_id = p.id),
         (select count(*) from public.interacciones i where i.owner_id = p.id and i.tipo = 'enviado'),
         (select count(*) from public.prospectos x where x.owner_id = p.id and x.estado = 'cliente')
    from public.perfiles p join auth.users u on u.id = p.id left join public.empresas e on e.id = p.empresa_id
   order by p.created_at;
end $$;

create or replace function public.admin_actualizar_usuario(p_id uuid, p_activo boolean, p_empresa uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if p_id = (select auth.uid()) and p_activo = false then raise exception 'No podés suspender tu propia cuenta'; end if;
  update public.perfiles set activo = coalesce(p_activo, activo), empresa_id = p_empresa where id = p_id;
end $$;

create or replace function public.admin_guardar_clave(p_nombre text, p_valor text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if coalesce(trim(p_valor), '') = '' then
    delete from public.config_claves where nombre = p_nombre;
  else
    insert into public.config_claves (nombre, valor, actualizado, actualizado_por) values (p_nombre, trim(p_valor), now(), (select auth.uid()))
    on conflict (nombre) do update set valor = excluded.valor, actualizado = now(), actualizado_por = excluded.actualizado_por;
  end if;
end $$;

-- Sólo dice si están cargadas y sus últimos 4 caracteres; nunca devuelve la clave
create or replace function public.admin_estado_claves()
returns table (nombre text, configurada boolean, final text, actualizado timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select n.nombre, c.valor is not null, case when c.nombre = 'modelo_ia' then c.valor else right(c.valor, 4) end, c.actualizado
    from (values ('anthropic'), ('google_places'), ('modelo_ia')) n (nombre)
    left join public.config_claves c on c.nombre = n.nombre;
end $$;

-- Mi empresa (para mostrarla en la cuenta y explicar una suspensión)
create or replace function public.mi_acceso()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('activo', p.activo, 'es_admin', p.es_admin, 'empresa', e.nombre, 'empresa_activa', coalesce(e.activa, true),
                            'habilitado', public.acceso_activo())
    from public.perfiles p left join public.empresas e on e.id = p.empresa_id where p.id = (select auth.uid())
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_empresas()', 'admin_guardar_empresa(uuid, text, text, text, boolean)', 'admin_usuarios()',
                           'admin_actualizar_usuario(uuid, boolean, uuid)', 'admin_guardar_clave(text, text)', 'admin_estado_claves()', 'mi_acceso()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Los códigos ahora se gestionan por empresa (las políticas de admin ya existen)
