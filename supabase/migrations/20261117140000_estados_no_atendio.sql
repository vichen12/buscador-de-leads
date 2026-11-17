-- Estados de llamada: «No atendió · volver a llamar» (sigue abierto, entra en seguimientos) y
-- «No atendió · no insistir» (cerrado). Si después le escribís pasa a «Contactado» y si responde a
-- «Respondió», igual que «Primer llamado». Se puede correr más de una vez.
alter type public.estado_prospecto add value if not exists 'no_atendio' before 'contactado';
alter type public.estado_prospecto add value if not exists 'no_insistir';

create or replace function public.primer_llamado_avanza() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'enviado' then
    update public.prospectos set estado = 'contactado'
     where id = new.prospecto_id and estado::text in ('primer_llamado', 'no_atendio');
  elsif new.tipo = 'respuesta' then
    update public.prospectos set estado = 'respondio'
     where id = new.prospecto_id and estado::text in ('primer_llamado', 'no_atendio', 'no_insistir');
  end if;
  return new;
end $$;
