-- Créditos con reserva, planes, seguimientos en todas las etapas y la misma empresa en los dos mundos.
-- Se puede correr más de una vez. No borra datos.

-- 1) Reserva de créditos: aparta los créditos de una búsqueda ANTES de hacerla, con candado por empresa.
--    Así varias búsquedas a la vez no pueden pasarse del plan. La función de búsqueda después ajusta al
--    costo real (devuelve lo que sobró). Las reservas que quedaron colgadas (más de 10 minutos) se limpian.
alter table public.chat_uso add column if not exists funcion text;

create or replace function public.reservar_creditos(p_usuario uuid, p_creditos int, p_funcion text default 'prospecta_buscar_reserva')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  emp uuid; c jsonb; ids bigint[];
begin
  if p_creditos is null or p_creditos < 1 or p_creditos > 200 then
    raise exception 'Cantidad de créditos inválida';
  end if;
  select empresa_id into emp from public.perfiles where id = p_usuario;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(emp, p_usuario)::text, 0));
  delete from public.chat_uso
   where owner_id = p_usuario and funcion = 'prospecta_buscar_reserva' and created_at < now() - interval '10 minutes';
  c := public.cupo_chat(p_usuario);
  if not coalesce((c ->> 'sin_tope')::boolean, false)
     and coalesce((c ->> 'usados')::int, 0) + p_creditos > coalesce((c ->> 'limite')::int, 0) then
    return jsonb_build_object('ok', false, 'cupo', c || jsonb_build_object('mensaje', coalesce(c ->> 'mensaje',
      format('Esta búsqueda usa unos %s créditos y te quedan %s. Elegí una búsqueda más liviana o ampliá el plan.',
             p_creditos, greatest(0, coalesce((c ->> 'limite')::int, 0) - coalesce((c ->> 'usados')::int, 0))))));
  end if;
  with nuevas as (
    insert into public.chat_uso (owner_id, funcion)
    select p_usuario, p_funcion from generate_series(1, p_creditos)
    returning id
  )
  select array_agg(id) into ids from nuevas;
  return jsonb_build_object('ok', true, 'ids', to_jsonb(ids));
end $$;
revoke execute on function public.reservar_creditos(uuid, int, text) from public, anon, authenticated;
grant execute on function public.reservar_creditos(uuid, int, text) to service_role;

-- 2) Planes. Un crédito se vende a USD 0,10 y cada búsqueda descuenta el DOBLE de lo que cuesta de verdad
--    (Claude + búsquedas web + Google Maps), así el margen queda asegurado en cualquier plan.
--    Una búsqueda rápida ronda los 5 créditos; un mensaje, 1.
update public.planes set ia_mes = 30,   descripcion = 'Para probar unos días sin pagar: unas 6 búsquedas' where id = 'prueba';
update public.planes set ia_mes = 300,  precio_mensual = 29,  descripcion = 'Para una persona que prospecta sola: unas 60 búsquedas al mes' where id = 'basico';
update public.planes set ia_mes = 900,  precio_mensual = 79,  descripcion = 'Hasta 5 vendedores: unas 180 búsquedas al mes' where id = 'equipo';
update public.planes set ia_mes = 2500, precio_mensual = 199, descripcion = 'Equipos grandes y varias marcas: unas 500 búsquedas al mes' where id = 'empresa';
-- Las empresas que tenían el tope de fábrica de su plan pasan al nuevo (las que tienen un tope a medida, no se tocan)
update public.empresas e set limite_ia_mes = p.ia_mes
  from public.planes p
 where e.plan = p.id and p.id in ('prueba', 'basico', 'equipo', 'empresa')
   and e.limite_ia_mes in (100, 500, 2500, 10000) and e.limite_ia_mes <> p.ia_mes;

-- 3) Seguimientos: valen en cualquier etapa activa, no sólo en «Contactado».
--    Se corrigen las funciones que ya existen cambiando sólo la línea que hace falta (si la línea no está
--    tal cual, no se toca nada y se avisa).
do $$
declare def text; nuevo text;
begin
  -- a) El contador del menú
  select pg_get_functiondef('public.tablero()'::regprocedure) into def;
  nuevo := replace(def, $v$from mios where estado = 'contactado' and proximo_seguimiento <=$v$,
                        $n$from mios where estado in ('contactado', 'respondio', 'reunion', 'propuesta') and proximo_seguimiento <=$n$);
  if nuevo <> def then execute nuevo; else raise notice 'tablero(): no se encontró la línea de seguimientos (¿ya estaba corregida?)'; end if;

  -- b) Registrar un envío ya no borra el seguimiento agendado de una reunión o propuesta,
  --    y a una empresa «Perdida · no interesada» no se le vuelve a escribir.
  select pg_get_functiondef('public.al_registrar_interaccion()'::regprocedure) into def;
  nuevo := replace(def, $v$+ coalesce(perf.dias_seguimiento, 5) else null end$v$,
                        $n$+ coalesce(perf.dias_seguimiento, 5) else proximo_seguimiento end$n$);
  nuevo := replace(nuevo, $v$if p.estado in ('no_interesado', 'no_contactar') then$v$,
                          $n$if p.estado in ('no_interesado', 'no_contactar') or (p.estado = 'perdido' and p.perdido_motivo = 'no_interesado') then$n$);
  if nuevo <> def then execute nuevo; else raise notice 'al_registrar_interaccion(): no se encontraron las líneas a corregir (¿ya estaban corregidas?)'; end if;
exception when others then
  raise notice 'No se pudieron corregir las funciones de seguimiento: %', sqlerrm;
end $$;

-- 4) La misma empresa puede estar en los dos mundos (mi negocio y búsqueda libre).
--    Primero se crea el índice nuevo. El viejo se saca en el PASO B, después de publicar las funciones.
create unique index if not exists hallazgos_mundo_unico on public.hallazgos (owner_id, libre, clave_nombre);
