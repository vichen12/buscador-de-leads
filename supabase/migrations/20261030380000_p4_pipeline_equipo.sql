-- Prioridad 4: pipeline con estados nuevos, valor estimado, roles dentro del equipo y responsable

alter table public.prospectos add column if not exists perdido_motivo text check (perdido_motivo in ('precio', 'timing', 'ya_tiene_proveedor', 'no_responde', 'no_interesado', 'otro'));
alter table public.prospectos add column if not exists perdido_detalle text not null default '';
alter table public.prospectos add column if not exists valor_estimado numeric(14, 2);
alter table public.prospectos add column if not exists moneda text not null default 'ARS';

-- "No interesado" pasa a "Perdido" con el motivo "No interesado"
alter table public.prospectos disable trigger prospectos_updated;
update public.prospectos set estado = 'perdido', perdido_motivo = 'no_interesado' where estado = 'no_interesado';
alter table public.prospectos enable trigger prospectos_updated;

-- Perdido pide motivo
create or replace function public.al_cambiar_estado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'perdido' and new.perdido_motivo is null then
      raise exception 'MOTIVO_PERDIDO: para marcar como Perdido hay que elegir un motivo';
    end if;
    if new.estado <> 'perdido' then new.perdido_motivo := null; new.perdido_detalle := ''; end if;
    if new.estado in ('no_interesado'::public.estado_prospecto, 'no_contactar', 'cliente', 'respondio', 'perdido', 'reunion', 'propuesta') then
      new.proximo_seguimiento := case when new.estado in ('reunion', 'propuesta') then new.proximo_seguimiento else null end;
    end if;
  end if;
  return new;
end $$;

-- ---------- Equipo: roles, límite de usuarios y responsable ----------
alter table public.perfiles add column if not exists rol text not null default 'admin' check (rol in ('admin', 'vendedor'));
alter table public.empresas add column if not exists usuarios_max int not null default 5 check (usuarios_max between 1 and 500);

create or replace function public.mismo_equipo(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.tenant_de(p_owner) = public.mi_tenant()
$$;

-- Las empresas del pipeline se ven en todo el equipo (para "Todas" y para avisar si otro la está trabajando); se editan las propias
drop policy if exists "prospectos propios" on public.prospectos;
drop policy if exists "prospectos del equipo (leer)" on public.prospectos;
create policy "prospectos del equipo (leer)" on public.prospectos for select
  using ((select public.acceso_activo()) and (owner_id = (select auth.uid())
         or owner_id in (select p.id from public.perfiles p where coalesce(p.empresa_id, p.id) = (select public.mi_tenant()))));
drop policy if exists "prospectos propios (escribir)" on public.prospectos;
create policy "prospectos propios (escribir)" on public.prospectos for insert
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));
drop policy if exists "prospectos propios (editar)" on public.prospectos;
create policy "prospectos propios (editar)" on public.prospectos for update
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));
drop policy if exists "prospectos propios (borrar)" on public.prospectos;
create policy "prospectos propios (borrar)" on public.prospectos for delete
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()));

-- El historial también lo ve el equipo (no se modifica el de otro)
drop policy if exists "interacciones del equipo (leer)" on public.interacciones;
create policy "interacciones del equipo (leer)" on public.interacciones for select
  using ((select public.acceso_activo()) and (owner_id = (select auth.uid())
         or owner_id in (select p.id from public.perfiles p where coalesce(p.empresa_id, p.id) = (select public.mi_tenant()))));
drop policy if exists "interacciones propias (leer)" on public.interacciones;

-- Nombre del responsable de cada empresa (para "La está trabajando Juan")
create or replace function public.responsables()
returns table (id uuid, nombre text) language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(p.nombre, ''), split_part(u.email::text, '@', 1))
    from public.perfiles p join auth.users u on u.id = p.id
   where coalesce(p.empresa_id, p.id) = public.mi_tenant()
$$;

-- Tomar una empresa que trabaja otro del equipo: pasa a ser responsable quien la toma (con sus tareas y secuencia)
create or replace function public.tomar_prospecto(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.prospectos; antes text;
begin
  select * into p from public.prospectos where id = p_id;
  if p.id is null or not public.mismo_equipo(p.owner_id) then raise exception 'No encontré la empresa'; end if;
  if p.owner_id = (select auth.uid()) then return jsonb_build_object('ok', true); end if;
  select coalesce(nullif(nombre, ''), 'otra persona') into antes from public.perfiles where id = p.owner_id;
  update public.prospectos set owner_id = (select auth.uid()) where id = p_id;
  update public.contactos set owner_id = (select auth.uid()) where prospecto_id = p_id;
  update public.tareas set owner_id = (select auth.uid()) where prospecto_id = p_id and hecha_at is null;
  update public.inscripciones set estado = 'frenada', motivo = 'Cambió el responsable' where prospecto_id = p_id and estado in ('activa', 'pausada');
  update public.envios_cola set estado = 'cancelado', error = 'Cambió el responsable' where prospecto_id = p_id and estado = 'en_cola';
  insert into public.interacciones (owner_id, prospecto_id, tipo, detalle) values ((select auth.uid()), p_id, 'nota', 'Pasó a ser responsable (antes la trabajaba ' || antes || ')');
  return jsonb_build_object('ok', true);
end $$;

-- Equipo de mi empresa (para el Admin del cliente)
create or replace function public.mi_equipo()
returns table (id uuid, nombre text, email text, rol text, activo boolean, empresas bigint, enviados_mes bigint, clientes bigint, creado timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre, u.email::text, p.rol, p.activo,
         (select count(*) from public.prospectos x where x.owner_id = p.id),
         (select count(*) from public.interacciones i where i.owner_id = p.id and i.tipo = 'enviado' and i.created_at >= date_trunc('month', now())),
         (select count(*) from public.prospectos x where x.owner_id = p.id and x.estado = 'cliente'),
         p.created_at
    from public.perfiles p join auth.users u on u.id = p.id
   where coalesce(p.empresa_id, p.id) = public.mi_tenant()
   order by p.created_at
$$;

create or replace function public.equipo_actualizar(p_id uuid, p_rol text default null, p_activo boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare yo public.perfiles;
begin
  select * into yo from public.perfiles where id = (select auth.uid());
  if yo.rol <> 'admin' and not yo.es_admin then raise exception 'Sólo el admin de tu empresa puede cambiar esto'; end if;
  if not public.mismo_equipo(p_id) then raise exception 'Esa persona no es de tu equipo'; end if;
  if p_id = yo.id and (p_rol = 'vendedor' or p_activo = false) then raise exception 'No te podés quitar el rol de admin ni desactivar a vos mismo'; end if;
  update public.perfiles set rol = coalesce(p_rol, rol), activo = coalesce(p_activo, activo) where id = p_id;
end $$;

-- ---------- Tablero: sólo lo propio, con los estados nuevos ----------
create or replace function public.tablero()
returns jsonb language sql stable set search_path = 'public' as $$
  with perf as (select * from perfiles where id = (select auth.uid())),
  hoy as (
    select date_trunc('day', now() at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza'))
           at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza') as inicio,
           (now() at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza'))::date as dia
  ),
  mios as (select * from prospectos where owner_id = (select auth.uid())),
  est as (select estado, count(*) c from mios group by estado),
  contactados as (select count(distinct prospecto_id) c from interacciones where tipo = 'enviado' and owner_id = (select auth.uid()))
  select jsonb_build_object(
    'por_estado', coalesce((select jsonb_object_agg(estado, c) from est), '{}'::jsonb),
    'total', (select count(*) from mios),
    'enviados_hoy', (select count(*) from interacciones, hoy where owner_id = (select auth.uid()) and tipo = 'enviado' and canal is distinct from 'email' and created_at >= hoy.inicio),
    'limite_diario', coalesce((select limite_diario from perf), 15),
    'email', public.limite_email((select auth.uid())),
    'seguimientos_vencidos', (select count(*) from mios where estado = 'contactado' and proximo_seguimiento <= (select dia from hoy)),
    'contactados', (select c from contactados),
    'respondieron', (select count(*) from mios where estado in ('respondio', 'reunion', 'propuesta', 'cliente')
                       and id in (select prospecto_id from interacciones where tipo = 'enviado')),
    'clientes', (select count(*) from mios where estado = 'cliente'),
    'envios_7_dias', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d::date, 'envios', (
               select count(*) from interacciones i
                where i.owner_id = (select auth.uid()) and i.tipo = 'enviado'
                  and (i.created_at at time zone coalesce((select zona_horaria from perf), 'America/Argentina/Mendoza'))::date = d::date))
             order by d)
        from generate_series((select dia from hoy) - 6, (select dia from hoy), interval '1 day') d), '[]'::jsonb)
  )
$$;
