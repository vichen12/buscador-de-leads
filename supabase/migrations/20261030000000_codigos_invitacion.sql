-- Alta de cuentas con código de invitación (sin depender del envío de mails).
-- Sólo la Edge Function `registro` (con service role) usa esta tabla:
-- RLS activado y sin políticas = nadie más puede verla.
create table public.codigos_invitacion (
  codigo      text primary key,
  descripcion text not null default '',
  usos_max    int  not null default 10 check (usos_max > 0),
  usos        int  not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.codigos_invitacion enable row level security;

-- Consume un uso del código de forma atómica. Devuelve true si era válido.
create or replace function public.consumir_codigo(p_codigo text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.codigos_invitacion
     set usos = usos + 1
   where codigo = p_codigo and activo and usos < usos_max;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Devuelve el uso si el alta falló (ej. email ya registrado)
create or replace function public.devolver_codigo(p_codigo text)
returns void language sql security definer set search_path = '' as $$
  update public.codigos_invitacion set usos = greatest(usos - 1, 0) where codigo = p_codigo
$$;

revoke execute on function public.consumir_codigo(text) from public, anon, authenticated;
revoke execute on function public.devolver_codigo(text) from public, anon, authenticated;
grant execute on function public.consumir_codigo(text) to service_role;
grant execute on function public.devolver_codigo(text) to service_role;

-- Para crear un código (SQL Editor):
--   insert into public.codigos_invitacion (codigo, descripcion, usos_max) values ('MZA-XXXXXXXX', 'Equipo de ventas', 10);
