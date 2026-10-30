drop function if exists public.tomar_envios(int);
create or replace function public.tomar_envios(p_max int default 20, p_owner uuid default null)
returns setof public.envios_cola language plpgsql security definer set search_path = '' as $$
declare o uuid; fila public.envios_cola;
begin
  update public.envios_cola set estado = 'fallido', error = 'Se cortó mientras se enviaba: revisá en tu carpeta Enviados si salió antes de reintentar'
   where estado = 'enviando' and proximo_at < now() - interval '10 minutes';
  for o in select distinct x.owner_id from public.envios_cola x
            where x.estado = 'en_cola' and x.proximo_at <= now() and (p_owner is null or x.owner_id = p_owner) limit p_max loop
    select x.* into fila from public.envios_cola x
      left join public.lotes_envio l on l.id = x.lote_id
     where x.owner_id = o and x.estado = 'en_cola' and x.proximo_at <= now() and coalesce(l.estado, 'activo') = 'activo'
       and not exists (select 1 from public.envios_cola y where y.owner_id = o and y.estado = 'enviando')
     order by x.proximo_at, x.created_at
     limit 1 for update of x skip locked;
    if fila.id is not null then
      update public.envios_cola set estado = 'enviando', intentos = intentos + 1, proximo_at = now() where id = fila.id returning * into fila;
      return next fila;
    end if;
    fila := null;
  end loop;
end $$;
revoke execute on function public.tomar_envios(int, uuid) from public, anon, authenticated;
grant execute on function public.tomar_envios(int, uuid) to service_role;
grant execute on function public.suprimir_email(uuid, text, text, text) to service_role;
grant execute on function public.frenar_secuencias(uuid, text) to service_role;
