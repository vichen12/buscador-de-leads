-- P5 · Medición: un único RPC de reportes. Es SECURITY INVOKER: RLS decide qué ve cada uno
-- (el vendedor ve lo de su equipo en lectura; con p_owner se filtra a una persona).
create or replace function public.reporte(p_desde date, p_hasta date, p_owner uuid default null)
returns jsonb language sql stable security invoker set search_path = 'public' as $$
  with rango as (
    select p_desde::timestamptz as ini, (p_hasta + 1)::timestamptz as fin
  ),
  env as (  -- envíos del período
    select i.prospecto_id, i.owner_id, coalesce(i.canal, 'email') canal, i.created_at
      from interacciones i, rango r
     where i.tipo = 'enviado' and i.created_at >= r.ini and i.created_at < r.fin
       and (p_owner is null or i.owner_id = p_owner)
  ),
  resp as (  -- respuestas reales (no automáticas) del período
    select x.prospecto_id, x.recibida_at, x.clasificacion
      from respuestas x, rango r
     where x.recibida_at >= r.ini and x.recibida_at < r.fin
       and coalesce(x.clasificacion, 'otro') not in ('fuera_oficina', 'rebote')
       and (p_owner is null or x.owner_id = p_owner)
  ),
  base as (
    select p.id, p.owner_id, coalesce(nullif(p.rubro, ''), 'Sin rubro') rubro, coalesce(nullif(p.zona, ''), 'Sin zona') zona,
           p.busqueda_id, p.calificacion, p.estado::text estado, p.perdido_motivo, coalesce(p.valor_estimado, 0) valor,
           exists (select 1 from env e where e.prospecto_id = p.id) contactado,
           (exists (select 1 from resp x where x.prospecto_id = p.id)
             or (p.estado::text in ('respondio', 'reunion', 'propuesta', 'cliente') and exists (select 1 from env e where e.prospecto_id = p.id))) respondio,
           p.estado::text in ('reunion', 'propuesta', 'cliente') reunion,
           p.estado::text = 'cliente' cliente,
           (select m.personalizado from mensajes m where m.prospecto_id = p.id and m.tipo = 'email' limit 1) personalizado
      from prospectos p
     where (p_owner is null or p.owner_id = p_owner)
  ),
  periodo as (select * from base where contactado)
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'totales', jsonb_build_object(
      'enviados', (select count(*) from env),
      'contactados', (select count(*) from periodo),
      'respondieron', (select count(*) from periodo where respondio),
      'reuniones', (select count(*) from periodo where reunion),
      'clientes', (select count(*) from periodo where cliente),
      'respuestas', (select count(*) from resp),
      'nuevas_empresas', (select count(*) from prospectos p, rango r where p.created_at >= r.ini and p.created_at < r.fin and (p_owner is null or p.owner_id = p_owner))
    ),
    'embudo', coalesce((select jsonb_object_agg(estado, c) from (select estado, count(*) c from base group by estado) s), '{}'::jsonb),
    'valor_por_estado', coalesce((select jsonb_object_agg(estado, v) from (select estado, sum(valor) v from base where valor > 0 group by estado) s), '{}'::jsonb),
    'por_rubro', coalesce((select jsonb_agg(f order by f.contactados desc, f.total desc) from (
        select rubro clave, count(*) total, count(*) filter (where contactado) contactados, count(*) filter (where respondio) respondieron,
               count(*) filter (where reunion) reuniones, count(*) filter (where cliente) clientes
          from base group by rubro) f), '[]'::jsonb),
    'por_zona', coalesce((select jsonb_agg(f order by f.contactados desc, f.total desc) from (
        select zona clave, count(*) total, count(*) filter (where contactado) contactados, count(*) filter (where respondio) respondieron,
               count(*) filter (where reunion) reuniones, count(*) filter (where cliente) clientes
          from base group by zona) f), '[]'::jsonb),
    'por_busqueda', coalesce((select jsonb_agg(f order by f.contactados desc, f.total desc) from (
        select coalesce((select b.rubro || ' · ' || b.zona from busquedas b where b.id = base.busqueda_id), case when busqueda_id is null then 'Cargadas a mano o importadas' else 'Otra búsqueda' end) clave,
               count(*) total, count(*) filter (where contactado) contactados, count(*) filter (where respondio) respondieron,
               count(*) filter (where reunion) reuniones, count(*) filter (where cliente) clientes
          from base group by 1) f), '[]'::jsonb),
    'por_calificacion', coalesce((select jsonb_agg(f order by f.clave desc) from (
        select coalesce(calificacion::text, 'sin') clave, count(*) total, count(*) filter (where contactado) contactados,
               count(*) filter (where respondio) respondieron, count(*) filter (where reunion) reuniones, count(*) filter (where cliente) clientes
          from base group by 1) f), '[]'::jsonb),
    'por_personalizacion', coalesce((select jsonb_agg(f) from (
        select case when personalizado is null then 'Sin borrador' when jsonb_typeof(personalizado) = 'array' and jsonb_array_length(personalizado) > 0 then 'Con frases personalizadas' else 'Genérico' end clave,
               count(*) filter (where contactado) contactados, count(*) filter (where respondio) respondieron, count(*) filter (where cliente) clientes
          from base group by 1 having count(*) filter (where contactado) > 0) f), '[]'::jsonb),
    'por_vendedor', coalesce((select jsonb_agg(f order by f.enviados desc) from (
        select o.owner_id, (select count(*) from env e where e.owner_id = o.owner_id) enviados,
               count(*) filter (where contactado) contactados, count(*) filter (where respondio) respondieron,
               count(*) filter (where reunion) reuniones, count(*) filter (where cliente) clientes, sum(valor) filter (where cliente) valor_ganado
          from base o group by o.owner_id) f), '[]'::jsonb),
    'por_canal', coalesce((select jsonb_agg(f order by f.enviados desc) from (
        select canal clave, count(*) enviados, count(distinct prospecto_id) empresas from env group by canal) f), '[]'::jsonb),
    'motivos_perdida', coalesce((select jsonb_agg(f order by f.cantidad desc) from (
        select coalesce(perdido_motivo, 'sin_motivo') clave, count(*) cantidad, sum(valor) valor
          from base where estado = 'perdido' group by 1) f), '[]'::jsonb),
    'clasificacion_respuestas', coalesce((select jsonb_object_agg(coalesce(clasificacion, 'otro'), c) from (select clasificacion, count(*) c from resp group by 1) s), '{}'::jsonb),
    'ab', coalesce((select jsonb_agg(f order by f.lote, f.variante) from (
        select l.id lote_id, l.nombre lote, c.variante, min(c.asunto) asunto, count(*) filter (where c.estado = 'enviado') enviados,
               count(distinct c.prospecto_id) filter (where c.estado = 'enviado' and exists (select 1 from respuestas x where x.prospecto_id = c.prospecto_id and x.recibida_at >= c.enviado_at)) respondieron
          from envios_cola c join lotes_envio l on l.id = c.lote_id, rango r
         where c.variante is not null and l.created_at >= r.ini and l.created_at < r.fin and (p_owner is null or c.owner_id = p_owner)
         group by l.id, l.nombre, c.variante) f), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d::date,
          'enviados', (select count(*) from env e where e.created_at::date = d::date),
          'respuestas', (select count(*) from resp x where x.recibida_at::date = d::date)) order by d)
        from generate_series(p_desde, p_hasta, interval '1 day') d), '[]'::jsonb)
  )
$$;

revoke all on function public.reporte(date, date, uuid) from public, anon;
grant execute on function public.reporte(date, date, uuid) to authenticated;
