-- Prioridad 2 (y base de la 6.1): secuencias automáticas, tareas, bandeja de respuestas y cola de envíos en el servidor

-- ---------- Secuencias ----------
create table if not exists public.secuencias (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.mi_tenant(),
  owner_id    uuid references auth.users on delete set null default auth.uid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  descripcion text not null default '',
  por_defecto boolean not null default false,
  -- [{ dia: 0, tipo: 'email'|'llamada'|'whatsapp'|'linkedin_visita'|'linkedin_conexion'|'linkedin_mensaje', como: 'claude'|'plantilla', asunto, cuerpo, indicacion }]
  pasos       jsonb not null default '[]'::jsonb,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists secuencias_tenant on public.secuencias (tenant_id);
drop trigger if exists secuencias_updated on public.secuencias;
create trigger secuencias_updated before update on public.secuencias for each row execute function public.tocar_updated_at();
alter table public.secuencias enable row level security;
drop policy if exists "secuencias del equipo" on public.secuencias;
create policy "secuencias del equipo" on public.secuencias for all
  using (tenant_id = (select public.mi_tenant()) and (select public.acceso_activo()))
  with check (tenant_id = (select public.mi_tenant()) and (select public.acceso_activo()));

create table if not exists public.inscripciones (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users on delete cascade default auth.uid(),
  prospecto_id  uuid not null references public.prospectos on delete cascade,
  secuencia_id  uuid not null references public.secuencias on delete cascade,
  paso          int not null default 0,
  estado        text not null default 'activa' check (estado in ('activa', 'pausada', 'terminada', 'frenada')),
  motivo        text not null default '',
  inicio        timestamptz not null default now(),
  proximo_at    timestamptz not null default now(),
  hilo_id       text,
  asunto_hilo   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists inscripcion_activa_unica on public.inscripciones (prospecto_id) where estado in ('activa', 'pausada');
create index if not exists inscripciones_pendientes on public.inscripciones (proximo_at) where estado = 'activa';
drop trigger if exists inscripciones_updated on public.inscripciones;
create trigger inscripciones_updated before update on public.inscripciones for each row execute function public.tocar_updated_at();
alter table public.inscripciones enable row level security;
drop policy if exists "inscripciones propias" on public.inscripciones;
create policy "inscripciones propias" on public.inscripciones for all
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo())
              and exists (select 1 from public.prospectos p where p.id = prospecto_id and p.owner_id = (select auth.uid())));

-- ---------- Tareas (llamar, WhatsApp, LinkedIn, recordatorios) ----------
create table if not exists public.tareas (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users on delete cascade default auth.uid(),
  prospecto_id   uuid references public.prospectos on delete cascade,
  tipo           text not null default 'otra' check (tipo in ('llamar', 'whatsapp', 'email', 'linkedin_visita', 'linkedin_conexion', 'linkedin_mensaje', 'reunion', 'otra')),
  titulo         text not null,
  texto          text not null default '',
  vence          date not null default current_date,
  hecha_at       timestamptz,
  inscripcion_id uuid references public.inscripciones on delete set null,
  origen         text not null default 'manual' check (origen in ('manual', 'secuencia', 'respuesta', 'ia')),
  created_at     timestamptz not null default now()
);
create index if not exists tareas_pendientes on public.tareas (owner_id, vence) where hecha_at is null;
alter table public.tareas enable row level security;
drop policy if exists "tareas propias" on public.tareas;
create policy "tareas propias" on public.tareas for all
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));

-- ---------- Respuestas recibidas (bandeja) ----------
create table if not exists public.respuestas (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users on delete cascade,
  prospecto_id    uuid references public.prospectos on delete cascade,
  de              text not null default '',
  asunto          text not null default '',
  texto           text not null default '',
  recibida_at     timestamptz not null default now(),
  message_id      text,
  en_respuesta_a  text,
  clasificacion   text check (clasificacion in ('interesado', 'pide_info', 'reunion', 'no_interesado', 'derivar', 'fuera_oficina', 'baja', 'rebote', 'otro')),
  motivo          text not null default '',
  datos           jsonb not null default '{}'::jsonb,
  leida           boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index if not exists respuestas_unicas on public.respuestas (owner_id, message_id) where message_id is not null;
create index if not exists respuestas_bandeja on public.respuestas (owner_id, recibida_at desc);
alter table public.respuestas enable row level security;
drop policy if exists "respuestas propias (leer)" on public.respuestas;
create policy "respuestas propias (leer)" on public.respuestas for select using (owner_id = (select auth.uid()) and (select public.acceso_activo()));
drop policy if exists "respuestas propias (marcar)" on public.respuestas;
create policy "respuestas propias (marcar)" on public.respuestas for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------- Cola de envíos (el servidor manda; se puede cerrar la pestaña) ----------
create table if not exists public.lotes_envio (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users on delete cascade default auth.uid(),
  nombre        text not null default '',
  estado        text not null default 'activo' check (estado in ('activo', 'pausado', 'cancelado', 'terminado')),
  motivo_pausa  text not null default '',
  asunto_b      text,
  created_at    timestamptz not null default now(),
  terminado_at  timestamptz
);
alter table public.lotes_envio enable row level security;
drop policy if exists "lotes propios" on public.lotes_envio;
create policy "lotes propios" on public.lotes_envio for all
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));

create table if not exists public.envios_cola (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users on delete cascade default auth.uid(),
  prospecto_id   uuid not null references public.prospectos on delete cascade,
  mensaje_id     uuid references public.mensajes on delete set null,
  inscripcion_id uuid references public.inscripciones on delete set null,
  lote_id        uuid references public.lotes_envio on delete cascade,
  asunto         text not null default '',
  cuerpo         text not null default '',
  adjuntos       uuid[] not null default '{}',
  hilo           text,
  variante       text check (variante in ('a', 'b')),
  estado         text not null default 'en_cola' check (estado in ('en_cola', 'enviando', 'enviado', 'fallido', 'cancelado')),
  intentos       int not null default 0,
  proximo_at     timestamptz not null default now(),
  error          text not null default '',
  message_id     text,
  enviado_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists cola_pendiente on public.envios_cola (owner_id, proximo_at) where estado = 'en_cola';
create index if not exists cola_lote on public.envios_cola (lote_id);
-- Idempotencia: un mismo borrador no se puede encolar dos veces mientras esté pendiente o enviado
create unique index if not exists cola_mensaje_unico on public.envios_cola (mensaje_id) where mensaje_id is not null and estado in ('en_cola', 'enviando', 'enviado');
alter table public.envios_cola enable row level security;
drop policy if exists "cola propia (leer)" on public.envios_cola;
create policy "cola propia (leer)" on public.envios_cola for select using (owner_id = (select auth.uid()) and (select public.acceso_activo()));
drop policy if exists "cola propia (encolar)" on public.envios_cola;
create policy "cola propia (encolar)" on public.envios_cola for insert
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()) and estado = 'en_cola'
              and exists (select 1 from public.prospectos p where p.id = prospecto_id and p.owner_id = (select auth.uid())));
drop policy if exists "cola propia (cancelar)" on public.envios_cola;
create policy "cola propia (cancelar)" on public.envios_cola for update
  using (owner_id = (select auth.uid()) and estado = 'en_cola') with check (owner_id = (select auth.uid()) and estado in ('en_cola', 'cancelado'));

-- Toma de a un envío pendiente por usuario, sin que dos trabajadores agarren el mismo.
-- Un envío que quedó "enviando" más de 10 minutos (el trabajador se cortó) NO se reintenta: puede haber salido,
-- y un mismo mail nunca tiene que salir dos veces. Queda como fallido para que la persona decida.
create or replace function public.tomar_envios(p_max int default 20)
returns setof public.envios_cola language plpgsql security definer set search_path = '' as $$
declare o uuid; fila public.envios_cola;
begin
  update public.envios_cola set estado = 'fallido', error = 'Se cortó mientras se enviaba: revisá en tu carpeta Enviados si salió antes de reintentar'
   where estado = 'enviando' and proximo_at < now() - interval '10 minutes';
  for o in select distinct x.owner_id from public.envios_cola x where x.estado = 'en_cola' and x.proximo_at <= now() limit p_max loop
    select x.* into fila from public.envios_cola x
      left join public.lotes_envio l on l.id = x.lote_id
     where x.owner_id = o and x.estado = 'en_cola' and x.proximo_at <= now() and coalesce(l.estado, 'activo') = 'activo'
     order by x.proximo_at, x.created_at
     limit 1 for update of x skip locked;
    if fila.id is not null then
      update public.envios_cola set estado = 'enviando', intentos = intentos + 1, proximo_at = now() where id = fila.id returning * into fila;
      return next fila;
    end if;
    fila := null;
  end loop;
end $$;
revoke execute on function public.tomar_envios(int) from public, anon, authenticated;

-- ---------- Frenar secuencias solas ----------
create or replace function public.frenar_secuencias(p_prospecto uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.inscripciones set estado = 'frenada', motivo = p_motivo
   where prospecto_id = p_prospecto and estado in ('activa', 'pausada');
  update public.envios_cola set estado = 'cancelado', error = p_motivo
   where prospecto_id = p_prospecto and estado = 'en_cola' and inscripcion_id is not null;
end $$;
revoke execute on function public.frenar_secuencias(uuid, text) from public, anon, authenticated;

create or replace function public.al_interaccion_frena()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo in ('respuesta', 'rebote', 'baja') then
    perform public.frenar_secuencias(new.prospecto_id,
      case new.tipo when 'respuesta' then 'Respondió' when 'rebote' then 'El mail rebotó' else 'Pidió la baja' end);
  end if;
  return new;
end $$;
drop trigger if exists interacciones_frena on public.interacciones;
create trigger interacciones_frena after insert on public.interacciones for each row execute function public.al_interaccion_frena();

create or replace function public.al_estado_frena()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado is distinct from old.estado and new.estado::text in ('cliente', 'no_interesado', 'no_contactar', 'perdido') then
    perform public.frenar_secuencias(new.id, 'Pasó a ' || new.estado::text);
  end if;
  return new;
end $$;
drop trigger if exists prospectos_frena on public.prospectos;
create trigger prospectos_frena after update of estado on public.prospectos for each row execute function public.al_estado_frena();

-- ---------- Secuencia por defecto (lista para usar) ----------
create or replace function public.secuencia_por_defecto()
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := public.mi_tenant(); s uuid;
begin
  select id into s from public.secuencias where tenant_id = t and por_defecto order by created_at limit 1;
  if s is null then
    insert into public.secuencias (tenant_id, owner_id, nombre, descripcion, por_defecto, pasos) values (t, (select auth.uid()),
      'Prospección en frío (recomendada)', 'Mail inicial, dos seguimientos y un mensaje de cierre. Se frena sola si responden.', true,
      '[{"dia":0,"tipo":"email","como":"claude","indicacion":"Mail inicial: presentate y contá en concreto cómo lo que vendés le sirve a esta empresa."},
        {"dia":3,"tipo":"email","como":"claude","indicacion":"Seguimiento 1: corto (2 a 4 oraciones), en el mismo hilo, con otro ángulo de valor. Sin reproches por no responder."},
        {"dia":7,"tipo":"whatsapp","como":"claude","indicacion":"Seguimiento 2 por WhatsApp: muy corto, cercano, retomando el mail."},
        {"dia":14,"tipo":"email","como":"claude","indicacion":"Mensaje de cierre: avisá con amabilidad que no vas a insistir más y dejá la puerta abierta."}]'::jsonb)
    returning id into s;
  end if;
  return s;
end $$;

-- Inscribir empresas en una secuencia (salta las que no se pueden contactar o ya están en una)
create or replace function public.inscribir_en_secuencia(p_secuencia uuid, p_prospectos uuid[], p_desde_paso int default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sec public.secuencias; n int := 0; saltadas int := 0; pid uuid; p public.prospectos; dia0 int;
begin
  select * into sec from public.secuencias where id = p_secuencia and tenant_id = public.mi_tenant();
  if sec.id is null then raise exception 'No encontré la secuencia'; end if;
  dia0 := coalesce((sec.pasos -> p_desde_paso ->> 'dia')::int, 0);
  foreach pid in array p_prospectos loop
    select * into p from public.prospectos where id = pid and owner_id = (select auth.uid());
    if p.id is null or p.estado::text in ('no_interesado', 'no_contactar', 'cliente', 'perdido')
       or exists (select 1 from public.inscripciones i where i.prospecto_id = pid and i.estado in ('activa', 'pausada')) then
      saltadas := saltadas + 1; continue;
    end if;
    insert into public.inscripciones (owner_id, prospecto_id, secuencia_id, paso, inicio, proximo_at)
      values ((select auth.uid()), pid, sec.id, p_desde_paso, now() - make_interval(days => dia0), now());
    n := n + 1;
  end loop;
  return jsonb_build_object('inscriptas', n, 'saltadas', saltadas);
end $$;

-- Contadores para el menú
create or replace function public.contadores()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'respuestas_sin_leer', (select count(*) from public.respuestas where owner_id = (select auth.uid()) and not leida),
    'tareas_hoy', (select count(*) from public.tareas where owner_id = (select auth.uid()) and hecha_at is null and vence <= current_date),
    'cola', (select count(*) from public.envios_cola where owner_id = (select auth.uid()) and estado in ('en_cola', 'enviando')))
$$;
