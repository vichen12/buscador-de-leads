-- Endurecimiento: las funciones internas (triggers) no se pueden llamar por la API, y las de usuario sólo con sesión.
-- Quedan públicas (anon) sólo las que usan las páginas sin login: baja, datos legales, formulario web y pedido de acceso.
-- Importante: a "authenticated" se le mantiene exactamente el permiso que ya tenía (no se le da a funciones de servidor
-- como correo_leer_secreto o secreto_trabajador).
do $$
declare f record; tenia boolean;
  -- (es_admin, acceso_activo, mi_tenant, mismo_equipo y tenant_de se usan en políticas de RLS, que también evalúa anon)
  publicas text[] := array['confirmar_baja', 'info_baja', 'datos_legales', 'recibir_lead', 'solicitar_acceso', 'es_admin', 'acceso_activo', 'mi_tenant', 'mismo_equipo', 'tenant_de'];
  triggers text[] := array['al_cambiar_propuesta', 'al_comentar', 'al_estado_frena', 'al_interaccion_frena', 'al_suprimir', 'auditar_cambios',
                           'auditoria_tenant', 'campana_envio_permitido', 'clientes_normalizar', 'tocar_updated_at', 'prospecto_normalizar',
                           'al_cambiar_estado', 'al_registrar_interaccion', 'al_cambiar_email', 'rls_equipo'];
begin
  for f in select p.oid, p.oid::regprocedure as firma, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef loop
    if f.proname = any(publicas) then continue; end if;
    tenia := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', f.firma);
    if f.proname = any(triggers) then
      execute format('revoke execute on function %s from authenticated', f.firma);
    elsif tenia then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end $$;
