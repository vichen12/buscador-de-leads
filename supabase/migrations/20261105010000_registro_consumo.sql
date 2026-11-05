-- Registro de consumo real (tokens, modelo, búsquedas web y consultas a Google Places).
-- No cambia cómo se cuenta el cupo: cupo_chat sigue contando FILAS de chat_uso.
-- Se puede correr más de una vez.

-- 1) chat_uso: qué función gastó, con qué modelo y cuántas búsquedas web hizo Claude
alter table public.chat_uso add column if not exists funcion text;
alter table public.chat_uso add column if not exists modelo text;
alter table public.chat_uso add column if not exists por_modelo jsonb;
alter table public.chat_uso add column if not exists busquedas_web int not null default 0;

-- 2) consumo_uso: lo que NO descuenta cupo (interpretar, preguntar, clasificar, Google Places, fallas)
create table if not exists public.consumo_uso (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  servicio        text not null check (servicio in ('claude', 'google_places')),
  funcion         text not null,
  modelo          text,
  tokens_entrada  int not null default 0,
  tokens_salida   int not null default 0,
  busquedas_web   int not null default 0,
  unidades        int not null default 0,
  unidad          text,
  ok              boolean not null default true,
  usuario         uuid references auth.users (id) on delete set null
);
create index if not exists consumo_uso_fecha on public.consumo_uso (created_at desc);
create index if not exists consumo_uso_usuario on public.consumo_uso (usuario, created_at desc);

-- Sólo lo escriben y leen las funciones del servidor (service role): sin políticas para el navegador
alter table public.consumo_uso enable row level security;
revoke all on public.consumo_uso from anon, authenticated;
grant select, insert on public.consumo_uso to service_role;
