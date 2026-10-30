-- Parte 2 · Base de datos: etiquetas, vistas guardadas, comentarios con @menciones y notificaciones, archivos por empresa,
-- metas / ranking / racha, catálogo y propuestas, visitas, formulario de leads entrantes.

-- ---------- Etiquetas ----------
alter table public.prospectos add column if not exists etiquetas text[] not null default '{}';
create index if not exists prospectos_etiquetas on public.prospectos using gin (etiquetas);

-- ---------- Helper de RLS "del equipo lee, cada uno escribe lo suyo" ----------
create or replace function public.rls_equipo(p_tabla text)
returns void language plpgsql set search_path = '' as $$
begin
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('drop policy if exists "%s leer" on public.%I', p_tabla, p_tabla);
  execute format('create policy "%s leer" on public.%I for select using ((select public.acceso_activo()) and (owner_id = (select auth.uid()) or (select public.mismo_equipo(owner_id))))', p_tabla, p_tabla);
  execute format('drop policy if exists "%s escribir" on public.%I', p_tabla, p_tabla);
  execute format('create policy "%s escribir" on public.%I for insert with check (owner_id = (select auth.uid()) and (select public.acceso_activo()))', p_tabla, p_tabla);
  execute format('drop policy if exists "%s editar" on public.%I', p_tabla, p_tabla);
  execute format('create policy "%s editar" on public.%I for update using (owner_id = (select auth.uid()) and (select public.acceso_activo())) with check (owner_id = (select auth.uid()))', p_tabla, p_tabla);
  execute format('drop policy if exists "%s borrar" on public.%I', p_tabla, p_tabla);
  execute format('create policy "%s borrar" on public.%I for delete using (owner_id = (select auth.uid()) and (select public.acceso_activo()))', p_tabla, p_tabla);
  execute format('grant select, insert, update, delete on public.%I to authenticated', p_tabla);
end $$;
revoke all on function public.rls_equipo(text) from public, anon, authenticated;

-- ---------- Vistas guardadas (filtros de una pantalla) ----------
create table if not exists public.vistas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pagina text not null default 'prospectos',
  nombre text not null check (length(trim(nombre)) between 1 and 60),
  filtros jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.vistas enable row level security;
drop policy if exists "vistas propias" on public.vistas;
create policy "vistas propias" on public.vistas for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.vistas to authenticated;

-- ---------- Comentarios internos con @menciones + notificaciones ----------
create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospecto_id uuid not null references public.prospectos(id) on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 2000),
  menciones uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists comentarios_prospecto on public.comentarios (prospecto_id, created_at);
select public.rls_equipo('comentarios');

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  para uuid not null references auth.users(id) on delete cascade,
  de uuid references auth.users(id) on delete set null,
  tipo text not null default 'mencion',
  texto text not null,
  link text not null default '/',
  leida boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notificaciones_para on public.notificaciones (para, leida, created_at desc);
alter table public.notificaciones enable row level security;
drop policy if exists "mis notificaciones" on public.notificaciones;
create policy "mis notificaciones" on public.notificaciones for select using (para = (select auth.uid()));
drop policy if exists "marcar leidas" on public.notificaciones;
create policy "marcar leidas" on public.notificaciones for update using (para = (select auth.uid())) with check (para = (select auth.uid()));
grant select, update on public.notificaciones to authenticated;

create or replace function public.al_comentar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quien text; empresa text; m uuid;
begin
  select coalesce(nullif(nombre, ''), 'Alguien') into quien from public.perfiles where id = new.owner_id;
  select nombre into empresa from public.prospectos where id = new.prospecto_id;
  foreach m in array new.menciones loop
    if m <> new.owner_id and public.tenant_de(m) = public.tenant_de(new.owner_id) then
      insert into public.notificaciones (para, de, tipo, texto, link)
      values (m, new.owner_id, 'mencion', quien || ' te mencionó en ' || coalesce(empresa, 'una empresa') || ': ' || left(new.texto, 140), '/prospectos/' || new.prospecto_id || '?tab=comentarios');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists al_comentar on public.comentarios;
create trigger al_comentar after insert on public.comentarios for each row execute function public.al_comentar();

-- ---------- Archivos por empresa (propuestas, planos, fotos) ----------
alter table public.archivos add column if not exists prospecto_id uuid references public.prospectos(id) on delete cascade;
alter table public.archivos drop constraint if exists archivos_tipo_check;
alter table public.archivos add constraint archivos_tipo_check check (tipo in ('firma', 'adjunto', 'empresa'));

-- ---------- Metas, ranking y racha ----------
create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('envios', 'respuestas', 'reuniones', 'clientes')),
  periodo text not null default 'semana' check (periodo in ('semana', 'mes')),
  objetivo int not null check (objetivo between 1 and 100000),
  unique (owner_id, tipo, periodo)
);
select public.rls_equipo('metas');

-- Cuánto hizo una persona desde una fecha (para metas y ranking)
create or replace function public.logros(p_owner uuid, p_desde timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.mismo_equipo(p_owner) or p_owner = (select auth.uid()) then jsonb_build_object(
    'envios', (select count(*) from public.interacciones i where i.owner_id = p_owner and i.tipo = 'enviado' and i.created_at >= p_desde),
    'respuestas', (select count(*) from public.respuestas r where r.owner_id = p_owner and r.recibida_at >= p_desde and coalesce(r.clasificacion, 'otro') not in ('fuera_oficina', 'rebote')),
    'reuniones', (select count(*) from public.interacciones i where i.owner_id = p_owner and i.tipo = 'cambio_estado' and i.created_at >= p_desde and i.detalle ilike '%reuni%'),
    'clientes', (select count(*) from public.interacciones i where i.owner_id = p_owner and i.tipo = 'cambio_estado' and i.created_at >= p_desde and i.detalle ilike '%cliente%')
  ) end
$$;

-- Días seguidos (hábiles) con al menos un envío
create or replace function public.mi_racha()
returns int language plpgsql stable security definer set search_path = '' as $$
declare d date := current_date; n int := 0; hay boolean;
begin
  for i in 0..120 loop
    if extract(isodow from d) = 7 then d := d - 1; continue; end if;
    select exists (select 1 from public.interacciones where owner_id = (select auth.uid()) and tipo = 'enviado' and created_at::date = d) into hay;
    if not hay then
      if d = current_date then d := d - 1; continue; end if; -- hoy todavía puede sumar
      exit;
    end if;
    n := n + 1; d := d - 1;
  end loop;
  return n;
end $$;

create or replace function public.ranking_equipo(p_desde timestamptz)
returns table (owner_id uuid, nombre text, envios bigint, respuestas bigint, reuniones bigint, clientes bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(p.nombre, ''), 'Sin nombre'),
         (select count(*) from public.interacciones i where i.owner_id = p.id and i.tipo = 'enviado' and i.created_at >= p_desde),
         (select count(*) from public.respuestas r where r.owner_id = p.id and r.recibida_at >= p_desde and coalesce(r.clasificacion, 'otro') not in ('fuera_oficina', 'rebote')),
         (select count(*) from public.interacciones i where i.owner_id = p.id and i.tipo = 'cambio_estado' and i.created_at >= p_desde and i.detalle ilike '%reuni%'),
         (select count(*) from public.interacciones i where i.owner_id = p.id and i.tipo = 'cambio_estado' and i.created_at >= p_desde and i.detalle ilike '%cliente%')
    from public.perfiles p
   where coalesce(p.empresa_id, p.id) = public.mi_tenant() and p.activo
$$;

-- ---------- Catálogo y propuestas ----------
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 160),
  descripcion text not null default '',
  precio numeric(14, 2) not null default 0,
  moneda text not null default 'ARS',
  unidad text not null default 'unidad',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
select public.rls_equipo('productos');

create table if not exists public.propuestas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospecto_id uuid not null references public.prospectos(id) on delete cascade,
  numero serial,
  titulo text not null default 'Propuesta comercial',
  items jsonb not null default '[]',        -- [{ nombre, descripcion, cantidad, precio, descuento }]
  moneda text not null default 'ARS',
  total numeric(14, 2) not null default 0,
  validez_dias int not null default 15,
  condiciones text not null default '',
  estado text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aceptada', 'rechazada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists propuestas_prospecto on public.propuestas (prospecto_id);
select public.rls_equipo('propuestas');
drop trigger if exists tocar on public.propuestas;
create trigger tocar before update on public.propuestas for each row execute function public.tocar_updated_at();

-- Al enviar una propuesta, la empresa pasa a "Propuesta enviada" (si venía antes) y su valor estimado toma el total
create or replace function public.al_cambiar_propuesta()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'enviada' and old.estado is distinct from 'enviada' then
    update public.prospectos set estado = 'propuesta', valor_estimado = coalesce(nullif(new.total, 0), valor_estimado), moneda = new.moneda
     where id = new.prospecto_id and estado::text in ('pendiente', 'contactado', 'respondio', 'reunion');
    insert into public.interacciones (owner_id, prospecto_id, tipo, detalle) values (new.owner_id, new.prospecto_id, 'nota', 'Propuesta #' || new.numero || ' enviada por ' || new.moneda || ' ' || to_char(new.total, 'FM999G999G999D00'));
  elsif new.estado = 'aceptada' and old.estado is distinct from 'aceptada' then
    update public.prospectos set estado = 'cliente', valor_estimado = coalesce(nullif(new.total, 0), valor_estimado) where id = new.prospecto_id;
    insert into public.interacciones (owner_id, prospecto_id, tipo, detalle) values (new.owner_id, new.prospecto_id, 'cambio_estado', 'Pasó a "Cliente" (aceptó la propuesta #' || new.numero || ')');
  end if;
  return new;
end $$;
drop trigger if exists al_cambiar_propuesta on public.propuestas;
create trigger al_cambiar_propuesta after update on public.propuestas for each row execute function public.al_cambiar_propuesta();

-- ---------- Visitas en persona ----------
create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospecto_id uuid not null references public.prospectos(id) on delete cascade,
  fecha date not null default current_date,
  hecha boolean not null default false,
  resultado text not null default '' check (resultado in ('', 'atendieron', 'no_estaba', 'volver', 'interesado', 'no_interesado')),
  notas text not null default '',
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists visitas_dia on public.visitas (owner_id, fecha);
select public.rls_equipo('visitas');

-- ---------- Leads que llegan solos (formulario para tu web) ----------
alter table public.perfiles add column if not exists token_formulario text unique;

create or replace function public.mi_token_formulario()
returns text language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  select token_formulario into t from public.perfiles where id = (select auth.uid());
  if t is null then
    t := encode(extensions.gen_random_bytes(18), 'hex');
    update public.perfiles set token_formulario = t where id = (select auth.uid());
  end if;
  return t;
end $$;
revoke all on function public.mi_token_formulario() from public, anon;
grant execute on function public.mi_token_formulario() to authenticated;

-- Lo llama el formulario público. Sólo crea una empresa nueva (o suma la nota a una existente) y una tarea; nada más.
create or replace function public.recibir_lead(p_token text, p_nombre text, p_empresa text, p_email text, p_telefono text, p_mensaje text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dueno uuid; pid uuid; hoy int; e text := lower(trim(coalesce(p_email, ''))); nombre_emp text;
begin
  if length(coalesce(p_token, '')) < 30 then return jsonb_build_object('ok', false); end if;
  select id into dueno from public.perfiles where token_formulario = p_token and activo;
  if dueno is null then return jsonb_build_object('ok', false); end if;
  if e <> '' and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Email inválido'); end if;
  if e = '' and length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) < 6 then return jsonb_build_object('ok', false, 'error', 'Dejá un email o un teléfono'); end if;
  -- Freno anti-spam: hasta 100 por día por cuenta
  select count(*) into hoy from public.prospectos where owner_id = dueno and fuente = 'formulario' and created_at >= now() - interval '1 day';
  if hoy >= 100 then return jsonb_build_object('ok', false, 'error', 'Probá más tarde'); end if;
  nombre_emp := left(coalesce(nullif(trim(p_empresa), ''), nullif(trim(p_nombre), ''), e, 'Contacto web'), 160);
  if e <> '' then select id into pid from public.prospectos where owner_id = dueno and lower(email) = e limit 1; end if;
  if pid is null then
    insert into public.prospectos (owner_id, nombre, email, telefono, fuente, estado, notas)
    values (dueno, nombre_emp, nullif(e, ''), nullif(left(trim(p_telefono), 40), ''), 'formulario', 'respondio',
            'Llegó por el formulario de tu web' || case when coalesce(trim(p_nombre), '') <> '' then ' · ' || left(trim(p_nombre), 120) else '' end)
    returning id into pid;
  end if;
  if coalesce(trim(p_nombre), '') <> '' then
    insert into public.contactos (owner_id, prospecto_id, nombre, email, telefono)
    select dueno, pid, left(trim(p_nombre), 120), nullif(e, ''), nullif(left(trim(p_telefono), 40), '')
     where not exists (select 1 from public.contactos c where c.prospecto_id = pid and lower(c.nombre) = lower(trim(p_nombre)));
  end if;
  insert into public.interacciones (owner_id, prospecto_id, tipo, detalle) values (dueno, pid, 'nota', 'Mensaje del formulario: ' || left(coalesce(p_mensaje, ''), 1500));
  insert into public.tareas (owner_id, prospecto_id, tipo, titulo, texto, vence, origen)
  values (dueno, pid, case when e <> '' then 'email' else 'llamar' end, 'Responder a ' || nombre_emp || ' (escribió desde tu web)', left(coalesce(p_mensaje, ''), 1500), current_date, 'manual');
  insert into public.notificaciones (para, tipo, texto, link) values (dueno, 'lead', nombre_emp || ' te escribió desde tu web', '/prospectos/' || pid);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.recibir_lead(text, text, text, text, text, text) from public;
grant execute on function public.recibir_lead(text, text, text, text, text, text) to anon, authenticated;
