-- Supabase Auth guarda app_metadata en un UPDATE posterior al INSERT del usuario:
-- el perfil se activa y se asigna a su empresa también cuando llega ese UPDATE.
create or replace function public.sincronizar_alta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare emp uuid;
begin
  if coalesce((new.raw_app_meta_data ->> 'alta_admin')::boolean, false) then
    select e.id into emp from public.empresas e where e.id::text = new.raw_app_meta_data ->> 'empresa_id';
    update public.perfiles
       set activo = true,
           empresa_id = coalesce(emp, empresa_id),
           nombre = case when nombre = '' then coalesce(new.raw_user_meta_data ->> 'nombre', '') else nombre end
     where id = new.id
       and (not activo or empresa_id is distinct from coalesce(emp, empresa_id));
  end if;
  return new;
end $$;
revoke execute on function public.sincronizar_alta() from public, anon, authenticated;

drop trigger if exists al_actualizar_alta on auth.users;
create trigger al_actualizar_alta after update of raw_app_meta_data on auth.users
  for each row execute function public.sincronizar_alta();

-- Reparar las cuentas creadas por el admin que quedaron sin acceso
update public.perfiles p
   set activo = true,
       empresa_id = coalesce((select e.id from public.empresas e where e.id::text = u.raw_app_meta_data ->> 'empresa_id'), p.empresa_id),
       nombre = case when p.nombre = '' then coalesce(u.raw_user_meta_data ->> 'nombre', '') else p.nombre end
  from auth.users u
 where u.id = p.id and coalesce((u.raw_app_meta_data ->> 'alta_admin')::boolean, false) and not p.activo;
