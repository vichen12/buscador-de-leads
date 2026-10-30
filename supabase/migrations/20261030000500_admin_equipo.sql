-- Rol de administrador (super admin): puede gestionar invitaciones desde la app.
alter table public.perfiles add column if not exists es_admin boolean not null default false;
alter table public.perfiles add column if not exists codigo_invitacion text;

-- Emails que reciben rol admin al registrarse (sin políticas: sólo se edita por SQL)
create table if not exists public.admins_por_email (email text primary key);
alter table public.admins_por_email enable row level security;
insert into public.admins_por_email (email) values ('dallapevincenzo@gmail.com') on conflict do nothing;

create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, email_contacto, es_admin, codigo_invitacion)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''), coalesce(new.email, ''),
          exists (select 1 from public.admins_por_email a where lower(a.email) = lower(new.email)),
          nullif(new.raw_user_meta_data ->> 'codigo', ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

-- Un usuario no puede darse admin a sí mismo
create or replace function public.proteger_es_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.es_admin := old.es_admin;
    new.codigo_invitacion := old.codigo_invitacion;
  end if;
  return new;
end $$;
create trigger perfiles_proteger_admin before update on public.perfiles
  for each row execute function public.proteger_es_admin();

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select es_admin from public.perfiles where id = (select auth.uid())), false)
$$;
revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

create policy "admins leen codigos" on public.codigos_invitacion
  for select to authenticated using ((select public.es_admin()));
create policy "admins crean codigos" on public.codigos_invitacion
  for insert to authenticated with check ((select public.es_admin()));
create policy "admins editan codigos" on public.codigos_invitacion
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create or replace function public.equipo()
returns table (id uuid, nombre text, estudio text, email text, codigo text, es_admin boolean, creado timestamptz,
               prospectos bigint, enviados bigint, clientes bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre, p.estudio, u.email::text, p.codigo_invitacion, p.es_admin, p.created_at,
         (select count(*) from public.prospectos x where x.owner_id = p.id),
         (select count(*) from public.interacciones i where i.owner_id = p.id and i.tipo = 'enviado'),
         (select count(*) from public.prospectos x where x.owner_id = p.id and x.estado = 'cliente')
    from public.perfiles p join auth.users u on u.id = p.id
   where (select public.es_admin())
   order by p.created_at
$$;
revoke execute on function public.equipo() from public, anon;
grant execute on function public.equipo() to authenticated;
