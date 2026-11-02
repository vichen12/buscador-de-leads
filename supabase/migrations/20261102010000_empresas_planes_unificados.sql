-- Plan de cada empresa = uno de la tabla "planes" (o "a medida"), y fija el tope de IA y de usuarios.
-- 1) Plan de prueba (no se muestra en la página pública)
insert into public.planes (id, nombre, descripcion, precio_mensual, usuarios_max, ia_mes, modos, destacado, activo, orden)
values ('prueba', 'Prueba', 'Para probar unos días sin pagar', 0, 2, 100, '{b2b,b2c}', false, false, 0)
on conflict (id) do nothing;

-- 2) Planes viejos de las empresas → los nuevos
update public.empresas set plan = 'equipo' where plan = 'pro';
update public.empresas set plan = 'medida' where plan not in (select id from public.planes) and plan not in ('medida', 'ilimitado');

-- 3) El listado de empresas devuelve también el tope de usuarios
drop function if exists public.admin_empresas();
create function public.admin_empresas()
returns table (id uuid, nombre text, contacto text, notas text, activa boolean, creada timestamptz,
               usuarios bigint, prospectos bigint, enviados bigint, clientes bigint, codigos_activos bigint,
               plan text, limite_ia_mes int, uso_ia_mes bigint, tokens_mes bigint, usuarios_max int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select e.id, e.nombre, e.contacto, e.notas, e.activa, e.created_at,
         (select count(*) from public.perfiles p where p.empresa_id = e.id),
         (select count(*) from public.prospectos x join public.perfiles p on p.id = x.owner_id where p.empresa_id = e.id),
         (select count(*) from public.interacciones i join public.perfiles p on p.id = i.owner_id where p.empresa_id = e.id and i.tipo = 'enviado'),
         (select count(*) from public.prospectos x join public.perfiles p on p.id = x.owner_id where p.empresa_id = e.id and x.estado = 'cliente'),
         (select count(*) from public.codigos_invitacion c where c.empresa_id = e.id and c.activo and c.usos < c.usos_max),
         e.plan, e.limite_ia_mes,
         (select count(*) from public.chat_uso u join public.perfiles p on p.id = u.owner_id
           where p.empresa_id = e.id and u.created_at >= date_trunc('month', now() at time zone 'America/Argentina/Mendoza') at time zone 'America/Argentina/Mendoza'),
         (select coalesce(sum(u.tokens_in + u.tokens_out), 0)::bigint from public.chat_uso u join public.perfiles p on p.id = u.owner_id
           where p.empresa_id = e.id and u.created_at >= date_trunc('month', now() at time zone 'America/Argentina/Mendoza') at time zone 'America/Argentina/Mendoza'),
         e.usuarios_max
    from public.empresas e order by e.created_at;
end $$;
revoke execute on function public.admin_empresas() from public, anon;
grant execute on function public.admin_empresas() to authenticated;

-- 4) Guardar empresa con plan, tope de IA y tope de usuarios
create or replace function public.admin_guardar_empresa(p_id uuid, p_nombre text, p_contacto text, p_notas text, p_activa boolean,
                                                        p_plan text, p_limite_ia_mes int, p_usuarios_max int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  perform public.exigir_admin();
  if p_id is null then
    insert into public.empresas (nombre, contacto, notas, activa, plan, limite_ia_mes, usuarios_max)
    values (trim(p_nombre), coalesce(p_contacto, ''), coalesce(p_notas, ''), coalesce(p_activa, true), coalesce(p_plan, 'basico'),
            case when p_limite_ia_mes = -1 then 500 else p_limite_ia_mes end,
            case when coalesce(p_usuarios_max, -1) < 1 then 5 else least(p_usuarios_max, 500) end)
    returning id into r;
  else
    update public.empresas set nombre = trim(p_nombre), contacto = coalesce(p_contacto, ''), notas = coalesce(p_notas, ''),
           activa = coalesce(p_activa, activa), plan = coalesce(p_plan, plan),
           limite_ia_mes = case when p_limite_ia_mes = -1 then limite_ia_mes else p_limite_ia_mes end,
           usuarios_max = case when coalesce(p_usuarios_max, -1) < 1 then usuarios_max else least(p_usuarios_max, 500) end
     where id = p_id returning id into r;
  end if;
  return r;
end $$;
revoke execute on function public.admin_guardar_empresa(uuid, text, text, text, boolean, text, int, int) from public, anon;
grant execute on function public.admin_guardar_empresa(uuid, text, text, text, boolean, text, int, int) to authenticated;
