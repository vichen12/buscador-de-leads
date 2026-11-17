-- Notas por empresa con el estado en que estaba cuando se escribió («Contactado», «Reunión»…),
-- para que el historial de notas se entienda aunque la empresa cambie de estado después.
-- Sólo agrega una columna y un trigger; no toca datos existentes. Se puede correr más de una vez.
alter table public.interacciones add column if not exists estado text;

create or replace function public.interaccion_con_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado is null then
    select p.estado::text into new.estado from public.prospectos p where p.id = new.prospecto_id;
  end if;
  return new;
end $$;

drop trigger if exists interaccion_con_estado on public.interacciones;
create trigger interaccion_con_estado before insert on public.interacciones
  for each row execute function public.interaccion_con_estado();

-- Para traer rápido las notas de la lista
create index if not exists interacciones_notas on public.interacciones (owner_id, prospecto_id, created_at desc) where tipo = 'nota';
