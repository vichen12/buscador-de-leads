-- Arreglo: el trigger de auditoría evaluaba columnas de otra tabla (new.baja_at en perfiles) y rompía los UPDATE.
-- Ahora cada tabla tiene su propio bloque.
create or replace function public.auditar_cambios()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quien uuid := (select auth.uid());
begin
  if tg_table_name = 'prospectos' then
    if tg_op = 'DELETE' then
      insert into public.auditoria (owner_id, accion, detalle, objeto_id) values (coalesce(quien, old.owner_id), 'empresa_borrada', old.nombre, old.id);
    end if;
  elsif tg_table_name = 'clientes' then
    if tg_op = 'DELETE' then
      insert into public.auditoria (owner_id, accion, detalle, objeto_id) values (coalesce(quien, old.owner_id), 'cliente_borrado', old.nombre, old.id);
    elsif new.baja_at is not null and old.baja_at is null then
      insert into public.auditoria (owner_id, accion, detalle, objeto_id) values (coalesce(quien, new.owner_id), 'cliente_baja', new.nombre, new.id);
    elsif (new.acepta_email, new.acepta_whatsapp) is distinct from (old.acepta_email, old.acepta_whatsapp) then
      insert into public.auditoria (owner_id, accion, detalle, objeto_id)
      values (coalesce(quien, new.owner_id), 'cliente_permiso', new.nombre || ': email ' || case when new.acepta_email then 'sí' else 'no' end || ', WhatsApp ' || case when new.acepta_whatsapp then 'sí' else 'no' end || coalesce(' · ' || new.consentimiento_fuente, ''), new.id);
    end if;
  elsif tg_table_name = 'perfiles' then
    if new.rol is distinct from old.rol or new.activo is distinct from old.activo then
      insert into public.auditoria (owner_id, accion, detalle, objeto_id)
      values (coalesce(quien, new.id), 'usuario_cambiado', coalesce(new.nombre, '') || ': rol ' || new.rol || case when new.activo then ', activo' else ', desactivado' end, new.id);
    end if;
  elsif tg_table_name = 'conexiones_correo' then
    if tg_op = 'DELETE' then
      insert into public.auditoria (owner_id, accion, detalle) values (coalesce(quien, old.owner_id), 'casilla_desconectada', old.email);
    end if;
  end if;
  return coalesce(new, old);
end $$;
