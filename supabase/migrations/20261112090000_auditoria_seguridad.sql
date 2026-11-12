-- Auditoría del 12/11/2026 · arreglos de seguridad y dos errores de la base.
-- Se puede correr más de una vez (todo es «create or replace» / «drop if exists»).

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- S1 (CRÍTICO). Cualquier usuario podía hacerse super admin: la política «perfil propio» era
-- «for all», así que dejaba BORRAR la fila propia y volver a INSERTARLA con es_admin = true o con la
-- empresa de otro (el trigger que protege esas columnas solo corre en UPDATE).
-- Ahora el perfil propio solo se puede leer y editar; las altas y bajas las hace el servidor.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "perfil propio" on public.perfiles;
drop policy if exists "perfil leer" on public.perfiles;
drop policy if exists "perfil editar" on public.perfiles;
create policy "perfil leer" on public.perfiles for select
  using (id = (select auth.uid()));
create policy "perfil editar" on public.perfiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, delete, truncate on public.perfiles from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- S3 (ALTO). Un vendedor podía ponerse rol = 'admin' de su empresa (y de ahí desactivar al admin o
-- pedir la contraseña nueva de un compañero). El rol, los modos y el token del formulario ya no se
-- cambian con un UPDATE directo: solo por las funciones del servidor (equipo_actualizar,
-- configurar_modos, mi_token_formulario), que siguen andando igual.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.proteger_es_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.es_admin := old.es_admin;
    new.codigo_invitacion := old.codigo_invitacion;
    new.empresa_id := old.empresa_id;
    new.activo := old.activo;
    new.rol := old.rol;
    new.modos := old.modos;
    new.token_formulario := old.token_formulario;
    if not coalesce((select p.es_admin from public.perfiles p where p.id = (select auth.uid())), false) then
      new.limite_chat := old.limite_chat;
    end if;
  end if;
  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- E3. El equipo no veía las empresas de los compañeros: la política buscaba a los compañeros en
-- «perfiles», donde cada uno solo ve su propia fila. Ahora usa mismo_equipo(), como el resto.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "prospectos del equipo (leer)" on public.prospectos;
create policy "prospectos del equipo (leer)" on public.prospectos for select
  using ((select public.acceso_activo())
         and (owner_id = (select auth.uid()) or (select public.mismo_equipo(owner_id))));

drop policy if exists "interacciones del equipo (leer)" on public.interacciones;
create policy "interacciones del equipo (leer)" on public.interacciones for select
  using ((select public.acceso_activo())
         and (owner_id = (select auth.uid()) or (select public.mismo_equipo(owner_id))));

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- S8. Al sumar un hallazgo, la descripción se copiaba a CUALQUIER prospecto_id (también de otra
-- empresa, si se conocía el id). Ahora solo a un prospecto del mismo dueño.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.hallazgo_copiar_descripcion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.prospecto_id is not null and new.descripcion is not null
     and (old.prospecto_id is distinct from new.prospecto_id) then
    update public.prospectos set descripcion = new.descripcion
     where id = new.prospecto_id and owner_id = new.owner_id and descripcion is null;
  end if;
  return new;
end $$;
revoke execute on function public.hallazgo_copiar_descripcion() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- E1. El formulario público fallaba («No pudimos mandar tu mensaje») cuando la persona dejaba solo
-- el teléfono o solo el mail (se guardaba NULL en columnas que no lo aceptan), o cuando el teléfono o
-- el nombre coincidían con una empresa que ya estaba en la lista. Ahora guarda '' y, si la empresa ya
-- existe, suma el mensaje a esa.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.recibir_lead(p_token text, p_nombre text, p_empresa text, p_email text, p_telefono text, p_mensaje text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  dueno uuid; pid uuid; hoy int;
  e text := lower(trim(coalesce(p_email, '')));
  tel text := left(trim(coalesce(p_telefono, '')), 40);
  tel_dig text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  nombre_emp text;
begin
  if length(coalesce(p_token, '')) < 30 then return jsonb_build_object('ok', false); end if;
  select id into dueno from public.perfiles where token_formulario = p_token and activo;
  if dueno is null then return jsonb_build_object('ok', false); end if;
  if e <> '' and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Email inválido'); end if;
  if e = '' and length(tel_dig) < 6 then return jsonb_build_object('ok', false, 'error', 'Dejá un email o un teléfono'); end if;
  -- Freno anti-spam: hasta 100 mensajes por día por cuenta (empresas nuevas o ya conocidas)
  select count(*) into hoy from public.interacciones
   where owner_id = dueno and tipo = 'nota' and detalle like 'Mensaje del formulario:%' and created_at >= now() - interval '1 day';
  if hoy >= 100 then return jsonb_build_object('ok', false, 'error', 'Probá más tarde'); end if;
  nombre_emp := left(coalesce(nullif(trim(p_empresa), ''), nullif(trim(p_nombre), ''), nullif(e, ''), 'Contacto web'), 160);
  if e <> '' then select id into pid from public.prospectos where owner_id = dueno and lower(email) = e limit 1; end if;
  if pid is null then
    begin
      insert into public.prospectos (owner_id, nombre, email, telefono, fuente, estado, notas)
      values (dueno, nombre_emp, e, tel, 'formulario', 'respondio',
              'Llegó por el formulario de tu web' || case when coalesce(trim(p_nombre), '') <> '' then ' · ' || left(trim(p_nombre), 120) else '' end)
      returning id into pid;
    exception when unique_violation then
      -- Ya está en la lista (mismo teléfono, o mismo nombre): el mensaje se suma a esa empresa
      select id into pid from public.prospectos
       where owner_id = dueno
         and ((length(tel_dig) >= 6 and regexp_replace(telefono, '\D', '', 'g') = tel_dig) or lower(nombre) = lower(nombre_emp))
       order by created_at desc limit 1;
    end;
  end if;
  if pid is null then return jsonb_build_object('ok', false, 'error', 'Probá más tarde'); end if;
  if coalesce(trim(p_nombre), '') <> '' then
    insert into public.contactos (owner_id, prospecto_id, nombre, email, telefono)
    select dueno, pid, left(trim(p_nombre), 120), e, tel
     where not exists (select 1 from public.contactos c where c.prospecto_id = pid and lower(c.nombre) = lower(trim(p_nombre)));
  end if;
  insert into public.interacciones (owner_id, prospecto_id, tipo, detalle) values (dueno, pid, 'nota', 'Mensaje del formulario: ' || left(coalesce(p_mensaje, ''), 1500));
  insert into public.tareas (owner_id, prospecto_id, tipo, titulo, texto, vence, origen)
  values (dueno, pid, case when e <> '' then 'email' else 'llamar' end, 'Responder a ' || nombre_emp || ' (escribió desde tu web)', left(coalesce(p_mensaje, ''), 1500), current_date, 'manual');
  insert into public.notificaciones (para, tipo, texto, link) values (dueno, 'lead', nombre_emp || ' te escribió desde tu web', '/prospectos/' || pid);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.recibir_lead(text, text, text, text, text, text) from public;
grant execute on function public.recibir_lead(text, text, text, text, text, text) to anon, authenticated;
