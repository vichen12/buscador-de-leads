-- P6 · Registro de acciones (auditoría). Lo escribe la base con triggers y el servidor; nadie lo edita ni lo borra.
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete set null,
  tenant_id uuid,
  accion text not null,
  detalle text not null default '',
  objeto_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists auditoria_tenant on public.auditoria (tenant_id, created_at desc);
alter table public.auditoria enable row level security;

-- El tenant se completa solo
create or replace function public.auditoria_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tenant_id is null and new.owner_id is not null then new.tenant_id := public.tenant_de(new.owner_id); end if;
  return new;
end $$;
drop trigger if exists auditoria_tenant on public.auditoria;
create trigger auditoria_tenant before insert on public.auditoria for each row execute function public.auditoria_tenant();

-- Lee: el admin de la empresa (todo su equipo), cada uno lo propio, y el super admin todo
drop policy if exists "auditoria leer" on public.auditoria;
create policy "auditoria leer" on public.auditoria for select using (
  owner_id = (select auth.uid())
  or (select public.es_admin())
  or (tenant_id = (select public.mi_tenant()) and exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.rol = 'admin'))
);
grant select on public.auditoria to authenticated;

create or replace function public.auditar(p_accion text, p_detalle text default '', p_objeto uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (owner_id, accion, detalle, objeto_id) values ((select auth.uid()), left(p_accion, 60), left(coalesce(p_detalle, ''), 500), p_objeto)
$$;
revoke all on function public.auditar(text, text, uuid) from public, anon;
grant execute on function public.auditar(text, text, uuid) to authenticated;

-- Triggers sobre lo sensible
create or replace function public.auditar_cambios()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quien uuid := (select auth.uid());
begin
  if tg_table_name = 'prospectos' and tg_op = 'DELETE' then
    insert into public.auditoria (owner_id, accion, detalle, objeto_id) values (coalesce(quien, old.owner_id), 'empresa_borrada', old.nombre, old.id);
  elsif tg_table_name = 'clientes' and tg_op = 'DELETE' then
    insert into public.auditoria (owner_id, accion, detalle, objeto_id) values (coalesce(quien, old.owner_id), 'cliente_borrado', old.nombre, old.id);
  elsif tg_table_name = 'clientes' and tg_op = 'UPDATE' and new.baja_at is not null and old.baja_at is null then
    insert into public.auditoria (owner_id, accion, detalle, objeto_id) values (coalesce(quien, new.owner_id), 'cliente_baja', new.nombre, new.id);
  elsif tg_table_name = 'clientes' and tg_op = 'UPDATE' and (new.acepta_email, new.acepta_whatsapp) is distinct from (old.acepta_email, old.acepta_whatsapp) then
    insert into public.auditoria (owner_id, accion, detalle, objeto_id)
    values (coalesce(quien, new.owner_id), 'cliente_permiso', new.nombre || ': email ' || case when new.acepta_email then 'sí' else 'no' end || ', WhatsApp ' || case when new.acepta_whatsapp then 'sí' else 'no' end || coalesce(' · ' || new.consentimiento_fuente, ''), new.id);
  elsif tg_table_name = 'perfiles' and tg_op = 'UPDATE' and (new.rol is distinct from old.rol or new.activo is distinct from old.activo) then
    insert into public.auditoria (owner_id, accion, detalle, objeto_id)
    values (coalesce(quien, new.id), 'usuario_cambiado', coalesce(new.nombre, '') || ': rol ' || new.rol || case when new.activo then ', activo' else ', desactivado' end, new.id);
  elsif tg_table_name = 'conexiones_correo' and tg_op = 'DELETE' then
    insert into public.auditoria (owner_id, accion, detalle) values (coalesce(quien, old.owner_id), 'casilla_desconectada', old.email);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists auditar on public.prospectos;
create trigger auditar after delete on public.prospectos for each row execute function public.auditar_cambios();
drop trigger if exists auditar on public.clientes;
create trigger auditar after update or delete on public.clientes for each row execute function public.auditar_cambios();
drop trigger if exists auditar on public.perfiles;
create trigger auditar after update on public.perfiles for each row execute function public.auditar_cambios();
drop trigger if exists auditar on public.conexiones_correo;
create trigger auditar after delete on public.conexiones_correo for each row execute function public.auditar_cambios();
