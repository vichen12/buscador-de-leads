-- Asistente IA (chat con Claude) con límite diario de consultas por usuario.

-- Nuevo valor configurable: límite diario por defecto del asistente
alter table public.config_claves drop constraint if exists config_claves_nombre_check;
alter table public.config_claves add constraint config_claves_nombre_check
  check (nombre in ('anthropic', 'google_places', 'modelo_ia', 'limite_chat'));

-- Límite propio de un usuario (null = usa el general)
alter table public.perfiles add column if not exists limite_chat int check (limite_chat is null or limite_chat between 0 and 1000);

create table if not exists public.chat_conversaciones (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo     text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_conv_owner on public.chat_conversaciones (owner_id, updated_at desc);

create table if not exists public.chat_mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.chat_conversaciones (id) on delete cascade,
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rol             text not null check (rol in ('user', 'assistant')),
  contenido       text not null,
  adjunto         text,
  created_at      timestamptz not null default now()
);
create index if not exists chat_msj_conv on public.chat_mensajes (conversacion_id, created_at);
create index if not exists chat_msj_owner on public.chat_mensajes (owner_id);

-- Registro de uso: lo escribe sólo el servidor y no se borra al borrar conversaciones,
-- así el cupo diario no se puede "resetear" desde el navegador.
create table if not exists public.chat_uso (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  tokens_in  int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chat_uso_owner on public.chat_uso (owner_id, created_at desc);

alter table public.chat_conversaciones enable row level security;
alter table public.chat_mensajes enable row level security;
alter table public.chat_uso enable row level security;

create policy "conversaciones propias" on public.chat_conversaciones for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));
-- Los mensajes se leen desde el navegador pero sólo los escribe el servidor
create policy "mensajes propios (lectura)" on public.chat_mensajes for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()));
create policy "uso propio (lectura)" on public.chat_uso for select to authenticated
  using (owner_id = (select auth.uid()));

-- Cupo del asistente para un usuario (hoy, en hora de Mendoza)
create or replace function public.cupo_chat(p_usuario uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with lim as (
    select coalesce(p.limite_chat,
                    (select nullif(c.valor, '')::int from public.config_claves c where c.nombre = 'limite_chat'),
                    30) as limite,
           coalesce(p.zona_horaria, 'America/Argentina/Mendoza') as tz
      from public.perfiles p where p.id = p_usuario
  )
  select jsonb_build_object(
    'limite', lim.limite,
    'usados', (select count(*) from public.chat_uso u
                where u.owner_id = p_usuario
                  and u.created_at >= date_trunc('day', now() at time zone lim.tz) at time zone lim.tz))
    from lim
$$;
revoke execute on function public.cupo_chat(uuid) from public, anon, authenticated;
grant execute on function public.cupo_chat(uuid) to service_role;

-- Versión para el navegador: sólo el propio cupo
create or replace function public.mi_cupo_chat()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.cupo_chat((select auth.uid()))
$$;
revoke execute on function public.mi_cupo_chat() from public, anon;
grant execute on function public.mi_cupo_chat() to authenticated;

-- Super admin: uso del asistente por usuario y cambio de límite
create or replace function public.admin_uso_chat()
returns table (id uuid, limite_propio int, limite int, usados_hoy bigint, usados_mes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select p.id, p.limite_chat,
         (public.cupo_chat(p.id) ->> 'limite')::int,
         (public.cupo_chat(p.id) ->> 'usados')::bigint,
         (select count(*) from public.chat_uso u where u.owner_id = p.id and u.created_at >= date_trunc('month', now()))
    from public.perfiles p;
end $$;
revoke execute on function public.admin_uso_chat() from public, anon;
grant execute on function public.admin_uso_chat() to authenticated;

create or replace function public.admin_limite_chat(p_id uuid, p_limite int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  update public.perfiles set limite_chat = p_limite where id = p_id;
end $$;
revoke execute on function public.admin_limite_chat(uuid, int) from public, anon;
grant execute on function public.admin_limite_chat(uuid, int) to authenticated;

-- El límite propio sólo lo cambia el super admin
create or replace function public.proteger_es_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.es_admin := old.es_admin;
    new.codigo_invitacion := old.codigo_invitacion;
    new.empresa_id := old.empresa_id;
    new.activo := old.activo;
    if not coalesce((select p.es_admin from public.perfiles p where p.id = (select auth.uid())), false) then
      new.limite_chat := old.limite_chat;
    end if;
  end if;
  return new;
end $$;

-- El panel también muestra el límite general del asistente (valor completo, no es secreto)
create or replace function public.admin_estado_claves()
returns table (nombre text, configurada boolean, final text, actualizado timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select n.nombre, c.valor is not null,
         case when c.nombre in ('modelo_ia', 'limite_chat') then c.valor else right(c.valor, 4) end, c.actualizado
    from (values ('anthropic'), ('google_places'), ('modelo_ia'), ('limite_chat')) n (nombre)
    left join public.config_claves c on c.nombre = n.nombre;
end $$;
