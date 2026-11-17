-- Estado nuevo «Primer llamado»: entre «Pendiente» y «Contactado» (ya lo llamaste una vez, todavía
-- no hubo un contacto en serio). Si después le mandás un mensaje pasa a «Contactado», y si responde
-- a «Respondió», igual que desde «Pendiente». Se puede correr más de una vez.
alter type public.estado_prospecto add value if not exists 'primer_llamado' before 'contactado';

create or replace function public.primer_llamado_avanza() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'enviado' then
    update public.prospectos set estado = 'contactado'
     where id = new.prospecto_id and estado::text = 'primer_llamado';
  elsif new.tipo = 'respuesta' then
    update public.prospectos set estado = 'respondio'
     where id = new.prospecto_id and estado::text = 'primer_llamado';
  end if;
  return new;
end $$;

drop trigger if exists primer_llamado_avanza on public.interacciones;
create trigger primer_llamado_avanza after insert on public.interacciones
  for each row execute function public.primer_llamado_avanza();
