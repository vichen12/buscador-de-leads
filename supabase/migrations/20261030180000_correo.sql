-- Correo conectado por usuario (SMTP para enviar, IMAP para leer respuestas).
-- La contraseña de aplicación se guarda cifrada en Vault; el navegador nunca la puede leer.
create table if not exists public.conexiones_correo (
  owner_id        uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  nombre_remitente text not null default '',
  smtp_host       text not null,
  smtp_puerto     int  not null default 465,
  imap_host       text not null default '',
  imap_puerto     int  not null default 993,
  secreto_id      uuid,                      -- vault.secrets.id
  leer_respuestas boolean not null default true,
  ultimo_uid      bigint not null default 0,  -- último mensaje revisado en INBOX
  uid_validez     bigint not null default 0,
  ultima_revision timestamptz,
  ultimo_error    text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger conexiones_correo_updated before update on public.conexiones_correo
  for each row execute function public.tocar_updated_at();
alter table public.conexiones_correo enable row level security;
-- El navegador sólo puede leer (sin el secreto: está en Vault). Escribe sólo la función "correo".
create policy "correo propio (leer)" on public.conexiones_correo for select to authenticated
  using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.conexiones_correo from authenticated, anon;

-- Guardar / leer / borrar la contraseña en Vault (sólo service role)
create or replace function public.correo_guardar_secreto(p_owner uuid, p_valor text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select secreto_id into sid from public.conexiones_correo where owner_id = p_owner;
  if sid is not null then
    perform vault.update_secret(sid, p_valor);
    return sid;
  end if;
  return vault.create_secret(p_valor, 'correo_' || p_owner::text, 'Contraseña de aplicación del correo de un usuario de Prospecta');
end $$;

create or replace function public.correo_leer_secreto(p_owner uuid)
returns text language sql security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s
    join public.conexiones_correo c on c.secreto_id = s.id
   where c.owner_id = p_owner
$$;

create or replace function public.correo_borrar(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select secreto_id into sid from public.conexiones_correo where owner_id = p_owner;
  delete from public.conexiones_correo where owner_id = p_owner;
  if sid is not null then delete from vault.secrets where id = sid; end if;
end $$;

revoke execute on function public.correo_guardar_secreto(uuid, text) from public, anon, authenticated;
revoke execute on function public.correo_leer_secreto(uuid) from public, anon, authenticated;
revoke execute on function public.correo_borrar(uuid) from public, anon, authenticated;
grant execute on function public.correo_guardar_secreto(uuid, text) to service_role;
grant execute on function public.correo_leer_secreto(uuid) to service_role;
grant execute on function public.correo_borrar(uuid) to service_role;
