-- Parte 3 · Base: B2B y B2C separados.
-- Cada cuenta trabaja en un modo (b2b = vende a empresas, b2c = vende a consumidores). Si tiene los dos habilitados,
-- cambia de espacio de trabajo con un selector; los datos de cada modo viven en tablas distintas y nunca se mezclan.
alter table public.perfiles add column if not exists modo text not null default 'b2b' check (modo in ('b2b', 'b2c'));
alter table public.perfiles add column if not exists modos text[] not null default '{b2b}'
  check (modos <@ array['b2b', 'b2c']::text[] and cardinality(modos) >= 1);

-- Cambiar de espacio de trabajo (sólo a un modo habilitado)
create or replace function public.cambiar_modo(p_modo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_modo not in ('b2b', 'b2c') then raise exception 'Modo desconocido'; end if;
  update public.perfiles set modo = p_modo where id = (select auth.uid()) and p_modo = any(modos);
  if not found then raise exception 'Ese modo no está habilitado en tu cuenta'; end if;
end $$;

-- Habilitar un modo (y pasar a él). Si la persona es de una empresa, sólo el admin lo habilita y vale para todo el equipo.
-- Pendiente de decisión: si B2C pasa a ser un plan pago, esto se limita según el plan.
create or replace function public.habilitar_modo(p_modo text)
returns void language plpgsql security definer set search_path = '' as $$
declare yo public.perfiles;
begin
  if p_modo not in ('b2b', 'b2c') then raise exception 'Modo desconocido'; end if;
  select * into yo from public.perfiles where id = (select auth.uid());
  if yo.empresa_id is not null and yo.rol <> 'admin' and not yo.es_admin then
    raise exception 'Pedile al admin de tu empresa que habilite este modo';
  end if;
  update public.perfiles set modos = (select array_agg(distinct m) from unnest(modos || p_modo) m)
   where (yo.empresa_id is not null and empresa_id = yo.empresa_id) or id = yo.id;
  update public.perfiles set modo = p_modo where id = yo.id;
end $$;

-- ---------- B2C: Mis clientes (consumidores que ya compraron o dejaron sus datos, con consentimiento) ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 160),
  email text,
  telefono text,
  telefono_e164 text,
  ciudad text,
  origen text not null default 'manual' check (origen in ('manual', 'compra', 'formulario', 'importado', 'referido', 'aliado', 'creador')),
  referido_por uuid references public.clientes(id) on delete set null,
  -- Consentimiento: sin él no se le escribe por ese canal. Se guarda cuándo y cómo lo dio.
  acepta_email boolean not null default false,
  acepta_whatsapp boolean not null default false,
  consentimiento_at timestamptz,
  consentimiento_fuente text,
  baja_at timestamptz,
  compras int not null default 0 check (compras >= 0),
  total_gastado numeric(14, 2) not null default 0,
  moneda text not null default 'ARS',
  ultima_compra date,
  cumpleanos date,
  intereses text[] not null default '{}',
  etiquetas text[] not null default '{}',
  notas text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consentimiento_documentado check (not (acepta_email or acepta_whatsapp) or (consentimiento_at is not null and length(coalesce(consentimiento_fuente, '')) > 0)),
  constraint contacto_minimo check (email is not null or telefono is not null)
);
create index if not exists clientes_owner on public.clientes (owner_id, created_at desc);
create unique index if not exists clientes_email_unico on public.clientes (owner_id, lower(email)) where email is not null;

create or replace function public.clientes_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.telefono := nullif(trim(new.telefono), '');
  new.telefono_e164 := public.telefono_e164(new.telefono);
  new.updated_at := now();
  -- Al dar la baja se pierde el consentimiento (y queda registrado cuándo)
  if new.baja_at is not null then new.acepta_email := false; new.acepta_whatsapp := false; end if;
  -- Si recién da el consentimiento y no se dijo cuándo, es ahora
  if (new.acepta_email or new.acepta_whatsapp) and new.consentimiento_at is null then new.consentimiento_at := now(); end if;
  return new;
end $$;
drop trigger if exists clientes_normalizar on public.clientes;
create trigger clientes_normalizar before insert or update on public.clientes for each row execute function public.clientes_normalizar();

alter table public.clientes enable row level security;
drop policy if exists "clientes del equipo (leer)" on public.clientes;
create policy "clientes del equipo (leer)" on public.clientes for select
  using ((select public.acceso_activo()) and (owner_id = (select auth.uid()) or (select public.mismo_equipo(owner_id))));
drop policy if exists "clientes propios (escribir)" on public.clientes;
create policy "clientes propios (escribir)" on public.clientes for insert
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));
drop policy if exists "clientes propios (editar)" on public.clientes;
create policy "clientes propios (editar)" on public.clientes for update
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));
drop policy if exists "clientes propios (borrar)" on public.clientes;
create policy "clientes propios (borrar)" on public.clientes for delete
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()));
grant select, insert, update, delete on public.clientes to authenticated;

-- ¿Se le puede escribir por este canal? (la app y el servidor lo consultan antes de cualquier envío B2C)
create or replace function public.cliente_contactable(p_id uuid, p_canal text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select c.baja_at is null and case p_canal when 'email' then c.acepta_email and c.email is not null
                                                          when 'whatsapp' then c.acepta_whatsapp and c.telefono is not null
                                                          else false end
                     from public.clientes c where c.id = p_id), false)
$$;

-- Tablero B2C
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
    'por_origen', coalesce((select jsonb_object_agg(origen, c) from (select origen, count(*) c from mios group by origen) s), '{}'::jsonb)
  )
$$;

revoke all on function public.cambiar_modo(text), public.habilitar_modo(text), public.cliente_contactable(uuid, text), public.tablero_b2c() from public, anon;
grant execute on function public.cambiar_modo(text), public.habilitar_modo(text), public.cliente_contactable(uuid, text), public.tablero_b2c() to authenticated;
