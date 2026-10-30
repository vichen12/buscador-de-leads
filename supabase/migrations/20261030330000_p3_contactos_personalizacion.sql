-- Personas dentro de cada empresa (decisores), con su fuente
create table if not exists public.contactos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users on delete cascade default auth.uid(),
  prospecto_id  uuid not null references public.prospectos on delete cascade,
  nombre        text not null default '',
  cargo         text not null default '',
  email         text not null default '',
  telefono      text not null default '',
  linkedin      text not null default '',
  principal     boolean not null default false,
  fuente        text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists contactos_prospecto on public.contactos (prospecto_id);
create unique index if not exists contactos_principal_unico on public.contactos (prospecto_id) where principal;
alter table public.contactos enable row level security;
drop policy if exists "contactos propios" on public.contactos;
create policy "contactos propios" on public.contactos for all
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo())
              and exists (select 1 from public.prospectos p where p.id = prospecto_id and p.owner_id = (select auth.uid())));

create or replace function public.contacto_principal_inicial()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.contactos c where c.prospecto_id = new.prospecto_id and c.id <> new.id) then new.principal := true; end if;
  if new.principal then update public.contactos set principal = false where prospecto_id = new.prospecto_id and id <> new.id and principal; end if;
  return new;
end $$;
drop trigger if exists contactos_principal on public.contactos;
create trigger contactos_principal before insert or update of principal on public.contactos for each row execute function public.contacto_principal_inicial();

alter table public.mensajes add column if not exists personalizado jsonb not null default '[]'::jsonb;
alter table public.prospectos add column if not exists senales text not null default '';
alter table public.hallazgos add column if not exists senales text not null default '';
alter table public.perfiles add column if not exists link_agenda text not null default '';
