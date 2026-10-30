-- Parte 3 · B2C: aliados (negocios que te mandan clientes), creadores (influencers) y campañas a tus clientes con permiso.
-- Todo vive separado del pipeline B2B.

-- ---------- Aliados ----------
create table if not exists public.aliados (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 160),
  rubro text, zona text, contacto text, email text, telefono text, web text, instagram text,
  estado text not null default 'identificado' check (estado in ('identificado', 'contactado', 'conversando', 'activo', 'pausado', 'descartado')),
  comision_tipo text not null default 'porcentaje' check (comision_tipo in ('porcentaje', 'fijo', 'canje', 'ninguna')),
  comision_valor numeric(12, 2) not null default 0,
  codigo text,               -- código o link que usan sus clientes para que se sepa que vienen de este aliado
  acuerdo text not null default '',
  notas text not null default '',
  proximo_contacto date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists aliados_owner on public.aliados (owner_id, estado);

-- ---------- Creadores ----------
create table if not exists public.creadores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 160),
  red text not null default 'instagram' check (red in ('instagram', 'tiktok', 'youtube', 'x', 'otra')),
  usuario text, link text, seguidores int, nicho text, zona text, email text,
  estado text not null default 'identificado' check (estado in ('identificado', 'contactado', 'negociando', 'acordado', 'publicado', 'descartado')),
  propuesta text not null default '',     -- canje, pago, comisión…
  costo numeric(12, 2) not null default 0,
  codigo text,
  resultado text not null default '',
  notas text not null default '',
  publicado_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creadores_owner on public.creadores (owner_id, estado);

-- De dónde vino cada cliente
alter table public.clientes add column if not exists aliado_id uuid references public.aliados(id) on delete set null;
alter table public.clientes add column if not exists creador_id uuid references public.creadores(id) on delete set null;

-- ---------- Campañas a clientes (sólo a quienes aceptaron ese canal) ----------
create table if not exists public.campanas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 160),
  tipo text not null default 'novedad' check (tipo in ('recompra', 'reactivacion', 'referidos', 'resena', 'cumpleanos', 'novedad', 'promo')),
  canal text not null check (canal in ('email', 'whatsapp')),
  segmento text not null default 'todos' check (segmento in ('todos', 'recompra', 'dormidos', 'una_compra', 'cumpleanos', 'nuevos')),
  asunto text not null default '',
  cuerpo text not null default '',
  estado text not null default 'borrador' check (estado in ('borrador', 'enviando', 'terminada')),
  created_at timestamptz not null default now()
);
create table if not exists public.campana_envios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campana_id uuid not null references public.campanas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp')),
  estado text not null default 'enviado' check (estado in ('enviado', 'fallido')),
  error text not null default '',
  created_at timestamptz not null default now(),
  unique (campana_id, cliente_id)
);
create index if not exists campana_envios_hoy on public.campana_envios (owner_id, canal, created_at);

-- Nunca se registra un envío a alguien sin permiso para ese canal (lo controla la base, no la pantalla)
create or replace function public.campana_envio_permitido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'enviado' and not public.cliente_contactable(new.cliente_id, new.canal) then
    raise exception 'SIN_PERMISO: este cliente no aceptó recibir mensajes por %', new.canal;
  end if;
  if not exists (select 1 from public.clientes c where c.id = new.cliente_id and c.owner_id = new.owner_id) then
    raise exception 'Ese cliente no es tuyo';
  end if;
  return new;
end $$;
drop trigger if exists campana_envio_permitido on public.campana_envios;
create trigger campana_envio_permitido before insert on public.campana_envios for each row execute function public.campana_envio_permitido();

-- RLS: el equipo lee, cada uno escribe lo suyo
do $$
declare t text;
begin
  foreach t in array array['aliados', 'creadores', 'campanas', 'campana_envios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s leer" on public.%I', t, t);
    execute format('create policy "%s leer" on public.%I for select using ((select public.acceso_activo()) and (owner_id = (select auth.uid()) or (select public.mismo_equipo(owner_id))))', t, t);
    execute format('drop policy if exists "%s escribir" on public.%I', t, t);
    execute format('create policy "%s escribir" on public.%I for insert with check (owner_id = (select auth.uid()) and (select public.acceso_activo()))', t, t);
    execute format('drop policy if exists "%s editar" on public.%I', t, t);
    execute format('create policy "%s editar" on public.%I for update using (owner_id = (select auth.uid()) and (select public.acceso_activo())) with check (owner_id = (select auth.uid()))', t, t);
    execute format('drop policy if exists "%s borrar" on public.%I', t, t);
    execute format('create policy "%s borrar" on public.%I for delete using (owner_id = (select auth.uid()) and (select public.acceso_activo()))', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists tocar on public.aliados;
create trigger tocar before update on public.aliados for each row execute function public.tocar_updated_at();
drop trigger if exists tocar on public.creadores;
create trigger tocar before update on public.creadores for each row execute function public.tocar_updated_at();

-- Si alguien pide la baja por mail, también se marca en Mis clientes
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
  if new.email is not null then
    update public.clientes c set baja_at = now()
     where public.tenant_de(c.owner_id) = new.tenant_id and c.email = new.email and c.baja_at is null;
  end if;
  return new;
end $$;

-- El límite diario de la casilla cuenta también los mails a clientes (es la misma casilla y la misma reputación)
create or replace function public.limite_email(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  c public.conexiones_correo; tz text; inicio timestamptz; desde timestamptz; semanas int;
  tipo text; maximo int; elegido int; calentando int; hoy int; enviados int; etapa int;
begin
  if p_owner is distinct from (select auth.uid()) and coalesce((select auth.role()), '') <> 'service_role' then return null; end if;
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
  select (select count(*) from public.interacciones
           where owner_id = p_owner and tipo = 'enviado' and canal = 'email' and created_at >= inicio)
       + (select count(*) from public.campana_envios
           where owner_id = p_owner and canal = 'email' and estado = 'enviado' and created_at >= inicio)
    into enviados;
  return jsonb_build_object(
    'tipo', tipo, 'proveedor', case tipo when 'gmail' then 'Gmail personal' when 'workspace' then 'Google Workspace' else 'Correo de tu dominio' end,
    'maximo', maximo, 'elegido', elegido, 'limite_hoy', hoy, 'enviados_hoy', enviados,
    'etapa', etapa, 'calentando', calentando is not null, 'limite_calentamiento', calentando,
    'proxima_etapa', case when etapa < 4 then (desde + make_interval(weeks => etapa)) end);
end $function$;

-- Tablero B2C con aliados y creadores
create or replace function public.tablero_b2c()
returns jsonb language sql stable set search_path = 'public' as $$
  with mios as (select * from clientes where owner_id = (select auth.uid()))
  select jsonb_build_object(
    'total', (select count(*) from mios),
    'con_consentimiento', (select count(*) from mios where (acepta_email or acepta_whatsapp) and baja_at is null),
    'acepta_email', (select count(*) from mios where acepta_email and baja_at is null),
    'acepta_whatsapp', (select count(*) from mios where acepta_whatsapp and baja_at is null),
    'compraron', (select count(*) from mios where compras > 0),
    'recompraron', (select count(*) from mios where compras > 1),
    'dormidos', (select count(*) from mios where ultima_compra < current_date - 90),
    'facturado', (select coalesce(sum(total_gastado), 0) from mios),
    'ticket_promedio', (select coalesce(round(sum(total_gastado) / nullif(sum(compras), 0), 2), 0) from mios),
    'nuevos_30', (select count(*) from mios where created_at >= now() - interval '30 days'),
    'cumplen_semana', (select count(*) from mios where cumpleanos is not null
                         and to_char(cumpleanos, 'MMDD') between to_char(current_date, 'MMDD') and to_char(current_date + 7, 'MMDD')),
    'por_origen', coalesce((select jsonb_object_agg(origen, c) from (select origen, count(*) c from mios group by origen) s), '{}'::jsonb),
    'aliados_activos', (select count(*) from aliados where owner_id = (select auth.uid()) and estado = 'activo'),
    'creadores_acordados', (select count(*) from creadores where owner_id = (select auth.uid()) and estado in ('acordado', 'publicado')),
    'campanas_30', (select count(*) from campana_envios where owner_id = (select auth.uid()) and estado = 'enviado' and created_at >= now() - interval '30 days')
  )
$$;
