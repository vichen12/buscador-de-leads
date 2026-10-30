-- Prioridad 1: proteger la casilla del usuario y cumplir la ley
-- · Lista de "No contactar" (supresión) por empresa cliente, con email y dominio
-- · Bajas por link público (tokens) y por respuesta
-- · Verificación de emails (estado válido / dudoso / inválido) y rebotes
-- · Límite de envíos por proveedor de la casilla + calentamiento de casillas nuevas

-- ---------- Empresa cliente (tenant) ----------
create or replace function public.tenant_de(p_usuario uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(p.empresa_id, p.id) from public.perfiles p where p.id = p_usuario
$$;
create or replace function public.mi_tenant()
returns uuid language sql stable security definer set search_path = '' as $$
  select public.tenant_de((select auth.uid()))
$$;

-- Dominios de correo gratuitos: una baja ahí bloquea sólo ese email, no todo el dominio
create or replace function public.es_dominio_publico(d text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(coalesce(d, '')) ~ '^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|protonmail|proton|gmx|zoho|zohomail|mail|yandex|arnet|fibertel|speedy|ciudad|uol|bol|terra|movistar|personal|claro|tutanota|hey)\.'
$$;

-- ---------- Lista de supresión ----------
create table if not exists public.supresion (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.mi_tenant(),
  owner_id    uuid references auth.users on delete set null default auth.uid(),
  email       text,
  dominio     text,
  motivo      text not null default '',
  origen      text not null default 'manual' check (origen in ('manual', 'importado', 'link', 'respuesta')),
  created_at  timestamptz not null default now(),
  check (email is not null or dominio is not null)
);
create unique index if not exists supresion_unica on public.supresion (tenant_id, coalesce(email, ''), coalesce(dominio, ''));
create index if not exists supresion_dominio on public.supresion (tenant_id, dominio) where dominio is not null;

create or replace function public.supresion_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.dominio := nullif(lower(regexp_replace(trim(coalesce(new.dominio, '')), '^(https?://)?(www\.)?@?', '')), '');
  new.dominio := nullif(split_part(coalesce(new.dominio, ''), '/', 1), '');
  return new;
end $$;
drop trigger if exists supresion_normalizar on public.supresion;
create trigger supresion_normalizar before insert or update on public.supresion
  for each row execute function public.supresion_normalizar();

alter table public.supresion enable row level security;
drop policy if exists "supresion del equipo (leer)" on public.supresion;
create policy "supresion del equipo (leer)" on public.supresion for select
  using (tenant_id = (select public.mi_tenant()) and (select public.acceso_activo()));
drop policy if exists "supresion del equipo (agregar)" on public.supresion;
create policy "supresion del equipo (agregar)" on public.supresion for insert
  with check (tenant_id = (select public.mi_tenant()) and (select public.acceso_activo()));
drop policy if exists "supresion del equipo (borrar)" on public.supresion;
create policy "supresion del equipo (borrar)" on public.supresion for delete
  using (tenant_id = (select public.mi_tenant()) and origen in ('manual', 'importado'));

-- ¿Está bloqueado este email para la empresa cliente de este usuario? Devuelve el motivo o null.
create or replace function public.motivo_supresion(p_owner uuid, p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select case when s.email is not null then 'Pidió no recibir más mensajes (' || s.email || ')'
              else 'Todo el dominio @' || s.dominio || ' pidió no recibir más mensajes' end
    from public.supresion s
   where s.tenant_id = public.tenant_de(p_owner)
     and (s.email = lower(trim(p_email)) or s.dominio = lower(split_part(trim(p_email), '@', 2)))
   order by (s.email is not null) desc
   limit 1
$$;

-- Al agregar a la lista: las empresas del equipo con ese email/dominio quedan en "No contactar"
create or replace function public.al_suprimir()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.prospectos p
     set estado = 'no_contactar', proximo_seguimiento = null
   where public.tenant_de(p.owner_id) = new.tenant_id
     and p.estado <> 'no_contactar'
     and coalesce(p.email, '') <> ''
     and ((new.email is not null and lower(trim(p.email)) = new.email)
       or (new.dominio is not null and lower(split_part(trim(p.email), '@', 2)) = new.dominio));
  return new;
end $$;
drop trigger if exists supresion_marca_prospectos on public.supresion;
create trigger supresion_marca_prospectos after insert on public.supresion
  for each row execute function public.al_suprimir();

-- Agrega un email a la lista (y su dominio si no es un correo gratuito)
create or replace function public.suprimir_email(p_owner uuid, p_email text, p_origen text, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare t uuid := public.tenant_de(p_owner); e text := lower(trim(p_email)); d text := lower(split_part(trim(p_email), '@', 2));
begin
  if t is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  insert into public.supresion (tenant_id, owner_id, email, motivo, origen) values (t, p_owner, e, coalesce(p_motivo, ''), p_origen)
    on conflict do nothing;
  if not public.es_dominio_publico(d) then
    insert into public.supresion (tenant_id, owner_id, dominio, motivo, origen) values (t, p_owner, d, coalesce(p_motivo, ''), p_origen)
      on conflict do nothing;
  end if;
end $$;
revoke execute on function public.suprimir_email(uuid, text, text, text) from public, anon, authenticated;

-- ---------- Bajas por link (página pública sin login) ----------
create table if not exists public.bajas_tokens (
  token        text primary key,
  owner_id     uuid not null references auth.users on delete cascade,
  prospecto_id uuid references public.prospectos on delete set null,
  email        text not null,
  created_at   timestamptz not null default now(),
  usado_at     timestamptz
);
alter table public.bajas_tokens enable row level security; -- sin políticas: sólo las funciones de abajo y el servidor

create or replace function public.info_baja(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', regexp_replace(b.email, '^(.)[^@]*(@.*)$', '\1•••\2'),
    'remitente', coalesce(nullif(e.nombre, ''), nullif(pf.estudio, ''), 'la empresa que te escribió'),
    'ya', b.usado_at is not null)
    from public.bajas_tokens b
    join public.perfiles pf on pf.id = b.owner_id
    left join public.empresas e on e.id = pf.empresa_id
   where b.token = p_token and length(p_token) >= 40
$$;

create or replace function public.confirmar_baja(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.bajas_tokens;
begin
  select * into b from public.bajas_tokens where token = p_token and length(p_token) >= 40;
  if b.token is null then return jsonb_build_object('ok', false); end if;
  if b.usado_at is null then
    perform public.suprimir_email(b.owner_id, b.email, 'link', 'Pidió la baja desde el link del mail');
    update public.bajas_tokens set usado_at = now() where token = b.token;
    if b.prospecto_id is not null then
      insert into public.interacciones (owner_id, prospecto_id, tipo, canal, detalle)
        values (b.owner_id, b.prospecto_id, 'baja', 'email', 'Pidió no recibir más mensajes desde el link del mail');
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.info_baja(text) to anon, authenticated;
grant execute on function public.confirmar_baja(text) to anon, authenticated;

-- ---------- Verificación de email y rebotes ----------
alter table public.prospectos add column if not exists email_estado text check (email_estado in ('valido', 'dudoso', 'invalido'));
alter table public.prospectos add column if not exists email_motivo text;
alter table public.prospectos add column if not exists email_verificado_at timestamptz;

create or replace function public.al_cambiar_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  if lower(trim(coalesce(new.email, ''))) is distinct from lower(trim(coalesce(old.email, ''))) then
    new.email_estado := null; new.email_motivo := null; new.email_verificado_at := null;
  end if;
  return new;
end $$;
drop trigger if exists prospectos_email on public.prospectos;
create trigger prospectos_email before update of email on public.prospectos
  for each row execute function public.al_cambiar_email();

-- ---------- Límite de envíos por casilla + calentamiento ----------
alter table public.conexiones_correo add column if not exists limite_usuario int check (limite_usuario is null or limite_usuario between 1 and 300);

create or replace function public.limite_email(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.conexiones_correo; tz text; inicio timestamptz; desde timestamptz; semanas int;
  tipo text; maximo int; elegido int; calentando int; hoy int; enviados int; etapa int;
begin
  select * into c from public.conexiones_correo where owner_id = p_owner;
  if c.owner_id is null then return null; end if;
  select coalesce(zona_horaria, 'America/Argentina/Mendoza') into tz from public.perfiles where id = p_owner;
  inicio := date_trunc('day', now() at time zone tz) at time zone tz;
  tipo := case when c.email ~* '@(gmail|googlemail)\.com$' then 'gmail'
               when c.smtp_host ilike '%gmail%' or c.smtp_host ilike '%google%' then 'workspace'
               else 'otro' end;
  maximo := case tipo when 'gmail' then 100 when 'workspace' then 300 else 150 end;
  elegido := least(coalesce(c.limite_usuario, maximo), maximo);
  select least(c.created_at, coalesce(min(i.created_at), c.created_at)) into desde
    from public.interacciones i where i.owner_id = p_owner and i.tipo = 'enviado' and i.canal = 'email';
  semanas := floor(extract(epoch from (now() - desde)) / 604800)::int;
  etapa := least(semanas + 1, 4);
  calentando := case etapa when 1 then 20 when 2 then 40 when 3 then 80 else null end;
  hoy := least(elegido, coalesce(calentando, elegido));
  select count(*) into enviados from public.interacciones
   where owner_id = p_owner and tipo = 'enviado' and canal = 'email' and created_at >= inicio;
  return jsonb_build_object(
    'tipo', tipo, 'proveedor', case tipo when 'gmail' then 'Gmail personal' when 'workspace' then 'Google Workspace' else 'Correo de tu dominio' end,
    'maximo', maximo, 'elegido', elegido, 'limite_hoy', hoy, 'enviados_hoy', enviados,
    'etapa', etapa, 'calentando', calentando is not null, 'limite_calentamiento', calentando,
    'proxima_etapa', case when etapa < 4 then (desde + make_interval(weeks => etapa)) end);
end $$;
grant execute on function public.limite_email(uuid) to authenticated;

create or replace function public.mi_limite_email()
returns jsonb language sql stable security definer set search_path = '' as $$ select public.limite_email((select auth.uid())) $$;

create or replace function public.guardar_limite_email(p_limite int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l jsonb := public.limite_email((select auth.uid()));
begin
  if l is null then raise exception 'Primero conectá tu casilla.'; end if;
  update public.conexiones_correo
     set limite_usuario = case when p_limite is null or p_limite >= (l->>'maximo')::int then null else greatest(1, p_limite) end
   where owner_id = (select auth.uid());
  return public.limite_email((select auth.uid()));
end $$;

-- ---------- Reglas al registrar un envío ----------
create or replace function public.al_registrar_interaccion()
returns trigger language plpgsql set search_path = '' as $$
declare
  p          public.prospectos;
  perf       public.perfiles;
  hoy_inicio timestamptz;
  enviados   int;
  cuerpo_msg text;
  lim        jsonb;
  bloqueo    text;
begin
  select * into p from public.prospectos where id = new.prospecto_id;
  if p.id is null or p.owner_id <> new.owner_id then
    raise exception 'El prospecto no pertenece a esta cuenta';
  end if;
  select * into perf from public.perfiles where id = new.owner_id;

  if new.tipo = 'enviado' then
    if p.estado in ('no_interesado', 'no_contactar') then
      raise exception 'OPT_OUT: % pidió no ser contactado', p.nombre;
    end if;
    hoy_inicio := date_trunc('day', now() at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza'))
                  at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza');
    if new.canal = 'email' then
      bloqueo := public.motivo_supresion(new.owner_id, p.email);
      if bloqueo is not null then raise exception 'SUPRIMIDO: %', bloqueo; end if;
      lim := public.limite_email(new.owner_id);
      if lim is not null and (lim->>'enviados_hoy')::int >= (lim->>'limite_hoy')::int then
        raise exception 'LIMITE_EMAIL: ya enviaste % emails hoy (límite %)', lim->>'enviados_hoy', lim->>'limite_hoy';
      end if;
    else
      select count(*) into enviados from public.interacciones
       where owner_id = new.owner_id and tipo = 'enviado' and canal is distinct from 'email' and created_at >= hoy_inicio;
      if enviados >= coalesce(perf.limite_diario, 15) then
        raise exception 'LIMITE_DIARIO: ya registraste % envíos hoy (límite %)', enviados, perf.limite_diario;
      end if;
    end if;
    if new.mensaje_id is not null then
      select cuerpo into cuerpo_msg from public.mensajes where id = new.mensaje_id;
      if exists (select 1 from public.mensajes m
                  where m.owner_id = new.owner_id and m.enviado_at is not null
                    and m.id <> new.mensaje_id and m.cuerpo = cuerpo_msg) then
        raise exception 'TEXTO_REPETIDO: ese texto ya se envió a otro prospecto; personalizalo antes de enviarlo';
      end if;
      update public.mensajes set enviado_at = now() where id = new.mensaje_id;
    end if;
    update public.prospectos
       set estado = case when estado = 'pendiente' then 'contactado'::public.estado_prospecto else estado end,
           ultimo_contacto = now(),
           proximo_seguimiento = case when estado in ('pendiente', 'contactado')
                                      then (now() at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza'))::date
                                           + coalesce(perf.dias_seguimiento, 5) else null end
     where id = new.prospecto_id;
  elsif new.tipo = 'llamada' then
    update public.prospectos
       set estado = case when estado = 'pendiente' then 'contactado'::public.estado_prospecto else estado end,
           ultimo_contacto = now()
     where id = new.prospecto_id;
  elsif new.tipo = 'respuesta' then
    update public.prospectos
       set estado = case when estado in ('pendiente', 'contactado') then 'respondio'::public.estado_prospecto else estado end,
           proximo_seguimiento = null
     where id = new.prospecto_id;
  elsif new.tipo = 'rebote' then
    update public.prospectos
       set email_estado = 'invalido', email_motivo = 'El mail rebotó: la dirección no existe o no recibe correo',
           email_verificado_at = now(), proximo_seguimiento = null
     where id = new.prospecto_id;
  end if;
  return new;
end $$;

create or replace function public.al_cambiar_estado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado in ('no_interesado'::public.estado_prospecto, 'no_contactar', 'cliente', 'respondio') then
      new.proximo_seguimiento := null;
    end if;
  end if;
  return new;
end $$;

-- ---------- Tablero: suma el límite de la casilla ----------
create or replace function public.tablero()
returns jsonb language sql stable set search_path = 'public' as $$
  with perf as (select * from perfiles where id = (select auth.uid())),
  hoy as (
    select date_trunc('day', now() at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza'))
           at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza') as inicio,
           (now() at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza'))::date as dia
  ),
  est as (select estado, count(*) c from prospectos group by estado),
  contactados as (select count(distinct prospecto_id) c from interacciones where tipo = 'enviado')
  select jsonb_build_object(
    'por_estado', coalesce((select jsonb_object_agg(estado, c) from est), '{}'::jsonb),
    'total', (select count(*) from prospectos),
    'enviados_hoy', (select count(*) from interacciones, hoy where tipo = 'enviado' and canal is distinct from 'email' and created_at >= hoy.inicio),
    'limite_diario', coalesce((select limite_diario from perf), 15),
    'email', public.limite_email((select auth.uid())),
    'seguimientos_vencidos', (select count(*) from prospectos where estado = 'contactado' and proximo_seguimiento <= (select dia from hoy)),
    'contactados', (select c from contactados),
    'respondieron', (select count(*) from prospectos where estado in ('respondio', 'cliente')
                       and id in (select prospecto_id from interacciones where tipo = 'enviado')),
    'clientes', (select count(*) from prospectos where estado = 'cliente'),
    'envios_7_dias', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d::date, 'envios', (
               select count(*) from interacciones i
                where i.tipo = 'enviado'
                  and (i.created_at at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza'))::date = d::date))
             order by d)
        from generate_series((select dia from hoy) - 6, (select dia from hoy), interval '1 day') d), '[]'::jsonb)
  )
$$;

-- ---------- Datos legales visibles sin login ----------
create or replace function public.datos_legales()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email_privacidad', (select nullif(valor, '') from public.config_claves where nombre = 'email_privacidad'),
    'responsable', (select nullif(valor, '') from public.config_claves where nombre = 'responsable_legal'))
$$;
grant execute on function public.datos_legales() to anon, authenticated;
