-- "Llamé" pasa la empresa de pendiente a contactado y registra el último contacto
create or replace function public.al_registrar_interaccion()
returns trigger language plpgsql set search_path = '' as $$
declare
  p          public.prospectos;
  perf       public.perfiles;
  hoy_inicio timestamptz;
  enviados   int;
  cuerpo_msg text;
begin
  select * into p from public.prospectos where id = new.prospecto_id;
  if p.id is null or p.owner_id <> new.owner_id then
    raise exception 'El prospecto no pertenece a esta cuenta';
  end if;
  select * into perf from public.perfiles where id = new.owner_id;

  if new.tipo = 'enviado' then
    -- opt-out
    if p.estado = 'no_interesado' then
      raise exception 'OPT_OUT: % pidió no ser contactado', p.nombre;
    end if;
    -- límite diario (en la zona horaria del usuario)
    hoy_inicio := date_trunc('day', now() at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza'))
                  at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza');
    select count(*) into enviados from public.interacciones
     where owner_id = new.owner_id and tipo = 'enviado' and created_at >= hoy_inicio;
    if enviados >= coalesce(perf.limite_diario, 15) then
      raise exception 'LIMITE_DIARIO: ya registraste % envíos hoy (límite %)', enviados, perf.limite_diario;
    end if;
    -- nada de textos idénticos en masa
    if new.mensaje_id is not null then
      select cuerpo into cuerpo_msg from public.mensajes where id = new.mensaje_id;
      if exists (select 1 from public.mensajes m
                  where m.owner_id = new.owner_id and m.enviado_at is not null
                    and m.id <> new.mensaje_id and m.cuerpo = cuerpo_msg) then
        raise exception 'TEXTO_REPETIDO: ese texto ya se envió a otro prospecto; personalizalo antes de enviarlo';
      end if;
      update public.mensajes set enviado_at = now() where id = new.mensaje_id;
    end if;
    update public.prospectos
       set estado = case when estado = 'pendiente' then 'contactado'::public.estado_prospecto else estado end,
           ultimo_contacto = now(),
           proximo_seguimiento = case when estado in ('pendiente', 'contactado')
                                      then (now() at time zone coalesce(perf.zona_horaria, 'America/Argentina/Mendoza'))::date
                                           + coalesce(perf.dias_seguimiento, 5) else null end
     where id = new.prospecto_id;
  elsif new.tipo = 'llamada' then
    -- Una llamada cuenta como contacto: pendiente pasa a contactado
    update public.prospectos
       set estado = case when estado = 'pendiente' then 'contactado'::public.estado_prospecto else estado end,
           ultimo_contacto = now()
     where id = new.prospecto_id;
  elsif new.tipo = 'respuesta' then
    update public.prospectos
       set estado = case when estado in ('pendiente', 'contactado') then 'respondio'::public.estado_prospecto else estado end,
           proximo_seguimiento = null
     where id = new.prospecto_id;
  end if;
  return new;
end $$;

