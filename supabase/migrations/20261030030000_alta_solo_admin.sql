-- Las cuentas las da de alta sólo el super admin (función admin-usuarios).
-- La empresa y la marca de "alta por admin" viajan en app_metadata, que sólo puede escribir el servidor.
-- Si alguien se registra por su cuenta contra la API de Auth, su perfil nace SIN acceso.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  emp uuid;
  admin_mail boolean := exists (select 1 from public.admins_por_email a where lower(a.email) = lower(new.email));
  por_admin boolean := coalesce((new.raw_app_meta_data ->> 'alta_admin')::boolean, false);
begin
  select e.id into emp from public.empresas e where e.id::text = new.raw_app_meta_data ->> 'empresa_id';
  insert into public.perfiles (id, nombre, email_contacto, es_admin, empresa_id, activo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''), coalesce(new.email, ''),
          admin_mail, emp, admin_mail or por_admin)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

-- Los códigos de invitación ya no sirven para registrarse
update public.codigos_invitacion set activo = false where activo;
