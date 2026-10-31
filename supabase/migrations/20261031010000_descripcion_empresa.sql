-- Qué es cada empresa (aparte de "encaje" = por qué le serviría a quien busca)
alter table public.hallazgos add column if not exists descripcion text check (descripcion is null or length(descripcion) <= 400);
alter table public.prospectos add column if not exists descripcion text check (descripcion is null or length(descripcion) <= 400);

-- Al sumar una empresa de la bandeja a la lista, se lleva la descripción
create or replace function public.hallazgo_copiar_descripcion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.prospecto_id is not null and new.descripcion is not null and (old.prospecto_id is distinct from new.prospecto_id) then
    update public.prospectos set descripcion = new.descripcion where id = new.prospecto_id and descripcion is null;
  end if;
  return new;
end $$;
revoke execute on function public.hallazgo_copiar_descripcion() from public, anon, authenticated;
drop trigger if exists hallazgo_copiar_descripcion on public.hallazgos;
create trigger hallazgo_copiar_descripcion after update of prospecto_id on public.hallazgos
  for each row execute function public.hallazgo_copiar_descripcion();
