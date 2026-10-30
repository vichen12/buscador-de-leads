-- Parte 3 · Planes configurables (cobro apagado), sugerencias de los usuarios y registro de errores de la app.

-- Planes: el super admin los edita. El cobro queda apagado (pendiente de decisión: Mercado Pago / Stripe).
create table if not exists public.planes (
  id text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  nombre text not null,
  descripcion text not null default '',
  precio_mensual numeric(12, 2) not null default 0,
  moneda text not null default 'USD',
  usuarios_max int not null default 1,
  ia_mes int not null default 500,
  modos text[] not null default '{b2b}',
  destacado boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0
);
alter table public.planes enable row level security;
drop policy if exists "planes leer" on public.planes;
create policy "planes leer" on public.planes for select using (true);
drop policy if exists "planes admin" on public.planes;
create policy "planes admin" on public.planes for all using ((select public.es_admin())) with check ((select public.es_admin()));
grant select on public.planes to anon, authenticated;
grant insert, update, delete on public.planes to authenticated;
insert into public.planes (id, nombre, descripcion, precio_mensual, usuarios_max, ia_mes, modos, destacado, orden) values
  ('basico', 'Inicial', 'Para una persona que prospecta sola', 29, 1, 500, '{b2b}', false, 1),
  ('equipo', 'Equipo', 'Hasta 5 vendedores, metas y ranking', 79, 5, 2500, '{b2b,b2c}', true, 2),
  ('empresa', 'Empresa', 'Equipos grandes y varias marcas', 199, 25, 10000, '{b2b,b2c}', false, 3)
on conflict (id) do nothing;

-- Sugerencias, errores reportados y consultas desde "Ayuda"
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null default 'idea' check (tipo in ('idea', 'error', 'consulta')),
  texto text not null check (length(trim(texto)) between 3 and 3000),
  pagina text not null default '',
  estado text not null default 'nuevo' check (estado in ('nuevo', 'visto', 'resuelto')),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback propio" on public.feedback;
create policy "feedback propio" on public.feedback for select using (owner_id = (select auth.uid()) or (select public.es_admin()));
drop policy if exists "feedback enviar" on public.feedback;
create policy "feedback enviar" on public.feedback for insert with check (owner_id = (select auth.uid()));
drop policy if exists "feedback admin" on public.feedback;
create policy "feedback admin" on public.feedback for update using ((select public.es_admin())) with check ((select public.es_admin()));
grant select, insert, update on public.feedback to authenticated;

-- Errores que ve la gente en la app (para el super admin). Se guardan acotados.
create table if not exists public.errores_app (
  id bigint generated always as identity primary key,
  owner_id uuid default auth.uid() references auth.users(id) on delete set null,
  mensaje text not null,
  pagina text not null default '',
  detalle text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists errores_app_fecha on public.errores_app (created_at desc);
alter table public.errores_app enable row level security;
drop policy if exists "errores registrar" on public.errores_app;
create policy "errores registrar" on public.errores_app for insert with check (owner_id = (select auth.uid()) and length(mensaje) <= 500 and length(detalle) <= 4000);
drop policy if exists "errores admin" on public.errores_app;
create policy "errores admin" on public.errores_app for select using ((select public.es_admin()));
grant select, insert on public.errores_app to authenticated;

-- Métricas generales para el super admin
create or replace function public.admin_metricas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Sólo super admin'; end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from public.perfiles where activo),
    'empresas', (select count(*) from public.empresas where activa),
    'activos_7', (select count(distinct owner_id) from public.interacciones where created_at >= now() - interval '7 days'),
    'prospectos', (select count(*) from public.prospectos),
    'clientes_b2c', (select count(*) from public.clientes),
    'envios_30', (select count(*) from public.interacciones where tipo = 'enviado' and created_at >= now() - interval '30 days'),
    'respuestas_30', (select count(*) from public.respuestas where recibida_at >= now() - interval '30 days'),
    'ia_30', (select count(*) from public.chat_uso where created_at >= now() - interval '30 days'),
    'errores_7', (select count(*) from public.errores_app where created_at >= now() - interval '7 days'),
    'feedback_nuevo', (select count(*) from public.feedback where estado = 'nuevo'),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d::date,
        'envios', (select count(*) from public.interacciones i where i.tipo = 'enviado' and i.created_at::date = d::date),
        'activos', (select count(distinct i.owner_id) from public.interacciones i where i.created_at::date = d::date)) order by d)
      from generate_series(current_date - 29, current_date, interval '1 day') d), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_metricas() from public, anon;
grant execute on function public.admin_metricas() to authenticated;
