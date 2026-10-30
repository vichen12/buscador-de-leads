-- =====================================================================
-- Prospecta · esquema inicial
-- Multiusuario: cada cuenta ve SOLO sus prospectos, mensajes e interacciones
-- (Row Level Security con owner_id = (select auth.uid())).
-- Reglas anti-spam que viven en la base (no se pueden saltear desde el front):
--   · límite diario de envíos por usuario
--   · opt-out: a un prospecto "no_interesado" no se le registra ningún envío más
--   · no se puede registrar como enviado un texto idéntico a otro ya enviado
-- =====================================================================

-- gen_random_uuid() es nativo desde Postgres 13 (Supabase usa 15+)

-- ---------- Tipos ----------
create type estado_prospecto as enum ('pendiente', 'contactado', 'respondio', 'no_interesado', 'cliente');
create type tipo_mensaje     as enum ('whatsapp', 'email', 'seguimiento');
create type tipo_interaccion as enum ('enviado', 'respuesta', 'nota', 'cambio_estado', 'llamada');
create type canal_contacto   as enum ('whatsapp', 'email', 'instagram', 'telefono', 'otro');

-- ---------- Utilidades ----------
-- Normaliza teléfonos argentinos a los 10 dígitos "área + número":
--   "0261 15-555-1234", "+54 9 261 555 1234", "2615551234" -> "2615551234"
create or replace function public.normalizar_telefono(t text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(t, ''), '\D', '', 'g');
  a int;
begin
  if d = '' then return ''; end if;
  if left(d, 2) = '54' and length(d) >= 12 then d := substr(d, 3); end if;
  if left(d, 1) = '9' and length(d) = 11 then d := substr(d, 2); end if;
  if left(d, 1) = '0' then d := substr(d, 2); end if;
  -- quitar el "15" de celulares escritos a la antigua (área de 2, 3 o 4 dígitos)
  if length(d) = 12 then
    foreach a in array array[2, 3, 4] loop
      if substr(d, a + 1, 2) = '15' then
        return left(d, a) || substr(d, a + 3);
      end if;
    end loop;
  end if;
  return right(d, 10);
end $$;

-- Clave para deduplicar por nombre + dirección (minúsculas, sin acentos ni signos)
create or replace function public.clave_texto(t text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.regexp_replace(
           pg_catalog.translate(pg_catalog.lower(coalesce(t, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
           '[^a-z0-9]', '', 'g')
$$;

create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- Usuarios (perfil de cada cuenta) ----------
create table public.perfiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  nombre           text not null default '',
  estudio          text not null default '',
  firma            text not null default '',
  email_contacto   text not null default '',
  portfolio_url    text not null default '',
  limite_diario    int  not null default 15 check (limite_diario between 1 and 100),
  dias_seguimiento int  not null default 5  check (dias_seguimiento between 1 and 60),
  zona_horaria     text not null default 'America/Argentina/Mendoza',
  instrucciones_ia text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger perfiles_updated before update on public.perfiles
  for each row execute function public.tocar_updated_at();

-- Crear el perfil automáticamente al registrarse
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, email_contacto)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''), coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- ---------- Prospectos ----------
create table public.prospectos (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre              text not null check (length(trim(nombre)) > 0),
  rubro               text not null default '',
  zona                text not null default '',
  direccion           text not null default '',
  telefono            text not null default '',
  email               text not null default '',
  instagram           text not null default '',
  que_tiene_hoy       text not null default '',   -- "Sin web", "Instagram", "Fresha (turnos)", ...
  web_actual          text not null default '',   -- el link que figura como web (si hay)
  rating              numeric(2, 1),
  resenas             int,
  google_maps_url     text not null default '',
  place_id            text not null default '',
  estado              estado_prospecto not null default 'pendiente',
  notas               text not null default '',
  fuente              text not null default 'manual', -- manual | csv | google_places
  ultimo_contacto     timestamptz,
  proximo_seguimiento date,
  telefono_norm       text generated always as (public.normalizar_telefono(telefono)) stored,
  clave_nombre_dir    text generated always as (public.clave_texto(nombre) || '|' || public.clave_texto(direccion)) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Deduplicado (por cuenta): mismo teléfono, o mismo nombre + dirección
create unique index prospectos_tel_unico   on public.prospectos (owner_id, telefono_norm) where telefono_norm <> '';
create unique index prospectos_nomdir_unico on public.prospectos (owner_id, clave_nombre_dir);
create index prospectos_owner_estado on public.prospectos (owner_id, estado);
create index prospectos_seguimiento  on public.prospectos (owner_id, proximo_seguimiento) where estado = 'contactado';

create trigger prospectos_updated before update on public.prospectos
  for each row execute function public.tocar_updated_at();

-- Opt-out: al marcar "no interesado" sale de toda secuencia futura
create or replace function public.al_cambiar_estado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado in ('no_interesado'::public.estado_prospecto, 'cliente', 'respondio') then
      new.proximo_seguimiento := null;
    end if;
  end if;
  return new;
end $$;

create trigger prospectos_estado before update of estado on public.prospectos
  for each row execute function public.al_cambiar_estado();

-- ---------- Mensajes (borradores editables, uno por tipo y prospecto) ----------
create table public.mensajes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  prospecto_id  uuid not null references public.prospectos (id) on delete cascade,
  tipo          tipo_mensaje not null,
  asunto        text not null default '',
  cuerpo        text not null default '',
  generado_por  text not null default 'manual' check (generado_por in ('ia', 'plantilla', 'manual')),
  editado       boolean not null default false,
  enviado_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (prospecto_id, tipo)
);

create index mensajes_owner on public.mensajes (owner_id);
create trigger mensajes_updated before update on public.mensajes
  for each row execute function public.tocar_updated_at();

-- ---------- Interacciones (historial de contacto) ----------
create table public.interacciones (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  prospecto_id  uuid not null references public.prospectos (id) on delete cascade,
  mensaje_id    uuid references public.mensajes (id) on delete set null,
  tipo          tipo_interaccion not null,
  canal         canal_contacto,
  detalle       text not null default '',
  created_at    timestamptz not null default now()
);

create index interacciones_prospecto on public.interacciones (prospecto_id, created_at desc);
create index interacciones_envios    on public.interacciones (owner_id, created_at) where tipo = 'enviado';
create index interacciones_mensaje   on public.interacciones (mensaje_id);

-- Reglas al registrar una interacción
create or replace function public.al_registrar_interaccion()
returns trigger language plpgsql set search_path = '' as $$
declare
  p          public.prospectos;
  perf       public.perfiles;
  hoy_inicio timestamptz;
  enviados   int;
  cuerpo_msg text;
begin
  select * into p from public.prospectos where id = new.prospecto_id;
  if p.id is null or p.owner_id <> new.owner_id then
    raise exception 'El prospecto no pertenece a esta cuenta';
  end if;
  select * into perf from public.perfiles where id = new.owner_id;

  if new.tipo = 'enviado' then
    -- opt-out
    if p.estado = 'no_interesado' then
      raise exception 'OPT_OUT: % pidió no ser contactado', p.nombre;
    end if;
    -- límite diario (en la zona horaria del usuario)
    hoy_inicio := date_trunc('day', now() at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza'))
                  at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza');
    select count(*) into enviados from public.interacciones
     where owner_id = new.owner_id and tipo = 'enviado' and created_at >= hoy_inicio;
    if enviados >= coalesce(perf.limite_diario, 15) then
      raise exception 'LIMITE_DIARIO: ya registraste % envíos hoy (límite %)', enviados, perf.limite_diario;
    end if;
    -- nada de textos idénticos en masa
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
  elsif new.tipo = 'respuesta' then
    update public.prospectos
       set estado = case when estado in ('pendiente', 'contactado') then 'respondio'::public.estado_prospecto else estado end,
           proximo_seguimiento = null
     where id = new.prospecto_id;
  end if;
  return new;
end $$;

create trigger interacciones_reglas before insert on public.interacciones
  for each row execute function public.al_registrar_interaccion();

-- ---------- Row Level Security ----------
alter table public.perfiles      enable row level security;
alter table public.prospectos    enable row level security;
alter table public.mensajes      enable row level security;
alter table public.interacciones enable row level security;

create policy "perfil propio" on public.perfiles
  for all using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "prospectos propios" on public.prospectos
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "mensajes propios" on public.mensajes
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.prospectos p where p.id = prospecto_id and p.owner_id = (select auth.uid())));

-- El historial no se edita ni se borra: sólo se lee y se agrega
create policy "interacciones propias (leer)" on public.interacciones
  for select using (owner_id = (select auth.uid()));
create policy "interacciones propias (agregar)" on public.interacciones
  for insert with check (owner_id = (select auth.uid())
              and exists (select 1 from public.prospectos p where p.id = prospecto_id and p.owner_id = (select auth.uid())));

-- ---------- Importación con deduplicado ----------
-- Recibe un array JSON de prospectos; inserta los nuevos y saltea duplicados
-- (por teléfono o nombre+dirección, dentro de la cuenta). Corre con los permisos
-- del usuario (security invoker), así que RLS aplica igual.
create or replace function public.importar_prospectos(filas jsonb, origen text default 'csv')
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  f jsonb;
  insertados int := 0;
  duplicados int := 0;
  invalidos  int := 0;
  n int;
begin
  for f in select * from jsonb_array_elements(filas) loop
    if coalesce(trim(f ->> 'nombre'), '') = '' then
      invalidos := invalidos + 1;
      continue;
    end if;
    insert into public.prospectos (nombre, rubro, zona, direccion, telefono, email, instagram,
                                   que_tiene_hoy, web_actual, rating, resenas, google_maps_url,
                                   place_id, notas, fuente)
    values (trim(f ->> 'nombre'), coalesce(f ->> 'rubro', ''), coalesce(f ->> 'zona', ''),
            coalesce(f ->> 'direccion', ''), coalesce(f ->> 'telefono', ''), coalesce(f ->> 'email', ''),
            coalesce(f ->> 'instagram', ''), coalesce(f ->> 'que_tiene_hoy', ''), coalesce(f ->> 'web_actual', ''),
            nullif(replace(f ->> 'rating', ',', '.'), '')::numeric,
            nullif(regexp_replace(coalesce(f ->> 'resenas', ''), '\D', '', 'g'), '')::int,
            coalesce(f ->> 'google_maps_url', ''), coalesce(f ->> 'place_id', ''),
            coalesce(f ->> 'notas', ''), origen)
    on conflict do nothing;
    get diagnostics n = row_count;
    if n = 1 then insertados := insertados + 1; else duplicados := duplicados + 1; end if;
  end loop;
  return jsonb_build_object('insertados', insertados, 'duplicados', duplicados, 'invalidos', invalidos);
end $$;

-- ---------- Tablero ----------
create or replace function public.tablero()
returns jsonb language sql stable security invoker set search_path = public as $$
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
    'enviados_hoy', (select count(*) from interacciones, hoy where tipo = 'enviado' and created_at >= hoy.inicio),
    'limite_diario', coalesce((select limite_diario from perf), 15),
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

-- Permisos de ejecución: sólo usuarios logueados (y nadie llama al trigger de alta por RPC)
revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.importar_prospectos(jsonb, text) from public, anon;
revoke execute on function public.tablero() from public, anon;
grant execute on function public.importar_prospectos(jsonb, text) to authenticated;
grant execute on function public.tablero() to authenticated;
