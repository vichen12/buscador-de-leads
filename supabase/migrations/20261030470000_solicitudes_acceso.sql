-- Página pública: pedidos de acceso / demo. Los ve el super admin.
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, empresa text not null default '', email text not null, telefono text not null default '',
  modo text not null default 'b2b', plan text not null default '', mensaje text not null default '',
  estado text not null default 'nueva' check (estado in ('nueva', 'contactada', 'alta', 'descartada')),
  created_at timestamptz not null default now()
);
alter table public.solicitudes enable row level security;
drop policy if exists "solicitudes admin" on public.solicitudes;
create policy "solicitudes admin" on public.solicitudes for all using ((select public.es_admin())) with check ((select public.es_admin()));
grant select, update on public.solicitudes to authenticated;

create or replace function public.solicitar_acceso(p_nombre text, p_empresa text, p_email text, p_telefono text, p_modo text, p_plan text, p_mensaje text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(trim(coalesce(p_nombre, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'Revisá tu nombre y tu email'); end if;
  if (select count(*) from public.solicitudes where created_at >= now() - interval '1 hour') >= 30 then return jsonb_build_object('ok', false, 'error', 'Probá en un rato'); end if;
  if exists (select 1 from public.solicitudes where email = e and created_at >= now() - interval '1 day') then return jsonb_build_object('ok', true); end if;
  insert into public.solicitudes (nombre, empresa, email, telefono, modo, plan, mensaje)
  values (left(trim(p_nombre), 120), left(coalesce(trim(p_empresa), ''), 160), e, left(coalesce(trim(p_telefono), ''), 40),
          case when p_modo = 'b2c' then 'b2c' else 'b2b' end, left(coalesce(p_plan, ''), 30), left(coalesce(p_mensaje, ''), 1500));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.solicitar_acceso(text, text, text, text, text, text, text) from public;
grant execute on function public.solicitar_acceso(text, text, text, text, text, text, text) to anon, authenticated;
