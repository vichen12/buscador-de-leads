-- Directorio: cada cuenta puede publicar su empresa (qué hace, a quién le vende, qué busca, cómo
-- contactarla) y las demás la encuentran desde «Directorio». Es opcional: sólo se ve lo publicado.
-- Se puede correr más de una vez. No toca ninguna tabla existente.
create table if not exists public.directorio (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 120),
  que_hace    text not null default '' check (length(que_hace) <= 700),
  rubro       text not null default '' check (length(rubro) <= 80),
  zona        text not null default '' check (length(zona) <= 120),
  vende_a     text not null default 'empresas' check (vende_a in ('empresas', 'personas', 'ambos')),
  busca       text not null default '' check (length(busca) <= 300),
  web         text not null default '' check (length(web) <= 200),
  email       text not null default '' check (length(email) <= 160),
  telefono    text not null default '' check (length(telefono) <= 40),
  instagram   text not null default '' check (length(instagram) <= 120),
  publicado   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists directorio_publicado on public.directorio (publicado, updated_at desc);

alter table public.directorio enable row level security;
-- Ver: lo publicado (cualquier cuenta activa) y la propia ficha aunque no esté publicada
drop policy if exists "directorio ver" on public.directorio;
create policy "directorio ver" on public.directorio for select to authenticated
  using ((select public.acceso_activo()) and (publicado or owner_id = (select auth.uid())));
-- Escribir: sólo la propia
drop policy if exists "directorio propia" on public.directorio;
create policy "directorio propia" on public.directorio for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));
revoke all on public.directorio from anon;
grant select, insert, update, delete on public.directorio to authenticated;

create or replace function public.directorio_al_guardar() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  -- Los links sólo http(s): lo que venga con otro esquema (javascript:, data:) no se guarda
  if new.web <> '' and new.web !~* '^https?://' then
    new.web := case when new.web ~* '^[a-z][a-z0-9+.-]*:' then '' else 'https://' || new.web end;
  end if;
  return new;
end $$;
drop trigger if exists directorio_al_guardar on public.directorio;
create trigger directorio_al_guardar before insert or update on public.directorio
  for each row execute function public.directorio_al_guardar();
