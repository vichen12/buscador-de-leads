-- Arreglo: en limite_email las columnas "tipo" chocaban con la variable del mismo nombre (se califican con alias)
create or replace function public.limite_email(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  c public.conexiones_correo; tz text; inicio timestamptz; desde timestamptz; semanas int;
  tipo text; maximo int; elegido int; calentando int; hoy int; enviados int; etapa int;
begin
  if p_owner is distinct from (select auth.uid()) and coalesce((select auth.role()), '') <> 'service_role' then return null; end if;
  select * into c from public.conexiones_correo where owner_id = p_owner;
  if c.owner_id is null then return null; end if;
  select coalesce(zona_horaria, 'America/Argentina/Mendoza') into tz from public.perfiles where id = p_owner;
  inicio := date_trunc('day', now() at time zone tz) at time zone tz;
  tipo := case when c.email ~* '@(gmail|googlemail)\.com$' then 'gmail'
               when c.smtp_host ilike '%gmail%' or c.smtp_host ilike '%google%' then 'workspace'
               else 'otro' end;
  maximo := case tipo when 'gmail' then 100 when 'workspace' then 300 else 150 end;
  elegido := least(coalesce(c.limite_usuario, maximo), maximo);
  select least(c.created_at, coalesce(min(i.created_at), c.created_at)) into desde
    from public.interacciones i where i.owner_id = p_owner and i.tipo = 'enviado' and i.canal = 'email';
  semanas := floor(extract(epoch from (now() - desde)) / 604800)::int;
  etapa := least(semanas + 1, 4);
  calentando := case etapa when 1 then 20 when 2 then 40 when 3 then 80 else null end;
  hoy := least(elegido, coalesce(calentando, elegido));
  enviados := (select count(*) from public.interacciones i2
                where i2.owner_id = p_owner and i2.tipo = 'enviado' and i2.canal = 'email' and i2.created_at >= inicio)
            + (select count(*) from public.campana_envios ce
                where ce.owner_id = p_owner and ce.canal = 'email' and ce.estado = 'enviado' and ce.created_at >= inicio);
  return jsonb_build_object(
    'tipo', tipo, 'proveedor', case tipo when 'gmail' then 'Gmail personal' when 'workspace' then 'Google Workspace' else 'Correo de tu dominio' end,
    'maximo', maximo, 'elegido', elegido, 'limite_hoy', hoy, 'enviados_hoy', enviados,
    'etapa', etapa, 'calentando', calentando is not null, 'limite_calentamiento', calentando,
    'proxima_etapa', case when etapa < 4 then (desde + make_interval(weeks => etapa)) end);
end $function$;
