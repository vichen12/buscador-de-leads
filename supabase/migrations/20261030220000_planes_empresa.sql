-- Planes por empresa: tope mensual de consultas de IA (búsquedas, asistente, estrategia, mensajes)
-- compartido por todos sus usuarios. null = sin tope. El tope diario por usuario sigue existiendo.
alter table public.empresas add column if not exists plan text not null default 'basico';
alter table public.empresas add column if not exists limite_ia_mes int check (limite_ia_mes is null or limite_ia_mes >= 0);
update public.empresas set limite_ia_mes = 500 where limite_ia_mes is null and plan = 'basico';

-- Cupo efectivo: el menor entre el diario del usuario y lo que le queda a su empresa en el mes
create or replace function public.cupo_chat(p_usuario uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  lim int; tz text; usados int; emp uuid; emp_lim int; emp_usados int := 0; emp_plan text;
begin
  select coalesce(p.limite_chat, (select nullif(c.valor, '')::int from public.config_claves c where c.nombre = 'limite_chat'), 30),
         coalesce(p.zona_horaria, 'America/Argentina/Mendoza'), p.empresa_id
    into lim, tz, emp from public.perfiles p where p.id = p_usuario;
  select count(*) into usados from public.chat_uso u
   where u.owner_id = p_usuario and u.created_at >= date_trunc('day', now() at time zone tz) at time zone tz;
  if emp is not null then
    select e.limite_ia_mes, e.plan into emp_lim, emp_plan from public.empresas e where e.id = emp;
    select count(*) into emp_usados from public.chat_uso u join public.perfiles p on p.id = u.owner_id
     where p.empresa_id = emp and u.created_at >= date_trunc('month', now() at time zone tz) at time zone tz;
  end if;
  if emp_lim is not null and emp_usados >= emp_lim then
    return jsonb_build_object('limite', lim, 'usados', greatest(usados, lim), 'empresa_limite', emp_lim, 'empresa_usados', emp_usados, 'plan', emp_plan,
      'motivo', 'empresa', 'mensaje', format('Tu empresa usó las %s consultas de IA de su plan este mes. Para seguir, pedí que amplíen el plan.', emp_lim));
  end if;
  return jsonb_build_object('limite', lim, 'usados', usados, 'empresa_limite', emp_lim, 'empresa_usados', emp_usados, 'plan', emp_plan,
    'motivo', case when usados >= lim then 'diario' end,
    'mensaje', case when usados >= lim then format('Llegaste al límite de %s consultas de IA de hoy. Mañana se renueva.', lim) end);
end $$;
revoke execute on function public.cupo_chat(uuid) from public, anon, authenticated;
grant execute on function public.cupo_chat(uuid) to service_role;

drop function if exists public.admin_empresas();
create function public.admin_empresas()
returns table (id uuid, nombre text, contacto text, notas text, activa boolean, creada timestamptz,
               usuarios bigint, prospectos bigint, enviados bigint, clientes bigint, codigos_activos bigint,
               plan text, limite_ia_mes int, uso_ia_mes bigint, tokens_mes bigint)
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
           where p.empresa_id = e.id and u.created_at >= date_trunc('month', now() at time zone 'America/Argentina/Mendoza') at time zone 'America/Argentina/Mendoza')
    from public.empresas e order by e.created_at;
end $$;
revoke execute on function public.admin_empresas() from public, anon;
grant execute on function public.admin_empresas() to authenticated;

drop function if exists public.admin_guardar_empresa(uuid, text, text, text, boolean);
create function public.admin_guardar_empresa(p_id uuid, p_nombre text, p_contacto text, p_notas text, p_activa boolean,
                                             p_plan text default null, p_limite_ia_mes int default -1)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  perform public.exigir_admin();
  if p_id is null then
    insert into public.empresas (nombre, contacto, notas, activa, plan, limite_ia_mes)
    values (trim(p_nombre), coalesce(p_contacto, ''), coalesce(p_notas, ''), coalesce(p_activa, true), coalesce(p_plan, 'basico'),
            case when p_limite_ia_mes = -1 then 500 else p_limite_ia_mes end)
    returning id into r;
  else
    update public.empresas set nombre = trim(p_nombre), contacto = coalesce(p_contacto, ''), notas = coalesce(p_notas, ''),
           activa = coalesce(p_activa, activa), plan = coalesce(p_plan, plan),
           limite_ia_mes = case when p_limite_ia_mes = -1 then limite_ia_mes else p_limite_ia_mes end
     where id = p_id returning id into r;
  end if;
  return r;
end $$;
revoke execute on function public.admin_guardar_empresa(uuid, text, text, text, boolean, text, int) from public, anon;
grant execute on function public.admin_guardar_empresa(uuid, text, text, text, boolean, text, int) to authenticated;
