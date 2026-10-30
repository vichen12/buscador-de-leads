-- Perfil comercial: qué vende cada usuario y a quién. Claude lo convierte en una estrategia de búsqueda
-- (rubros, zonas, filtros y criterios) que el usuario puede editar. Sirve para cualquier tipo de empresa.
create table if not exists public.perfil_comercial (
  owner_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  respuestas  jsonb not null default '{}'::jsonb,   -- el formulario tal cual lo completó
  estrategia  jsonb not null default '{}'::jsonb,   -- lo que armó Claude (y editó la persona)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger perfil_comercial_updated before update on public.perfil_comercial
  for each row execute function public.tocar_updated_at();
alter table public.perfil_comercial enable row level security;
create policy "perfil comercial propio" on public.perfil_comercial for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()))
  with check (owner_id = (select auth.uid()) and (select public.acceso_activo()));

-- Por qué encaja cada prospecto y qué tan bien (1 a 5), según la estrategia
alter table public.prospectos add column if not exists encaje text not null default '';
alter table public.prospectos add column if not exists puntaje smallint check (puntaje between 1 and 5);

create or replace function public.importar_con_detalle(filas jsonb, origen text default 'csv', p_busqueda uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  f jsonb;
  i int := 0;
  nuevo_id uuid;
  existente uuid;
  salida jsonb := '[]'::jsonb;
begin
  for f in select * from jsonb_array_elements(filas) loop
    if coalesce(trim(f ->> 'nombre'), '') = '' then
      salida := salida || jsonb_build_object('i', i, 'estado', 'invalido');
      i := i + 1; continue;
    end if;
    nuevo_id := null;
    insert into public.prospectos (nombre, rubro, zona, direccion, telefono, email, instagram,
                                   que_tiene_hoy, web_actual, rating, resenas, google_maps_url,
                                   place_id, notas, fuente, busqueda_id, encaje, puntaje)
    values (trim(f ->> 'nombre'), coalesce(f ->> 'rubro', ''), coalesce(f ->> 'zona', ''),
            coalesce(f ->> 'direccion', ''), coalesce(f ->> 'telefono', ''), coalesce(f ->> 'email', ''),
            coalesce(f ->> 'instagram', ''), coalesce(f ->> 'que_tiene_hoy', ''), coalesce(f ->> 'web_actual', ''),
            nullif(replace(f ->> 'rating', ',', '.'), '')::numeric,
            nullif(regexp_replace(coalesce(f ->> 'resenas', ''), '\D', '', 'g'), '')::int,
            coalesce(f ->> 'google_maps_url', ''), coalesce(f ->> 'place_id', ''),
            coalesce(f ->> 'notas', ''), origen, p_busqueda, coalesce(f ->> 'encaje', ''),
            case when coalesce(f ->> 'puntaje', '') ~ '^[1-5]$' then (f ->> 'puntaje')::smallint end)
    on conflict do nothing
    returning id into nuevo_id;
    if nuevo_id is not null then
      salida := salida || jsonb_build_object('i', i, 'estado', 'nuevo', 'id', nuevo_id);
    else
      select p.id into existente from public.prospectos p
       where p.owner_id = (select auth.uid())
         and ((public.normalizar_telefono(coalesce(f ->> 'telefono', '')) <> ''
               and p.telefono_norm = public.normalizar_telefono(f ->> 'telefono'))
              or p.clave_nombre_dir = public.clave_texto(trim(f ->> 'nombre')) || '|' || public.clave_texto(coalesce(f ->> 'direccion', '')))
       limit 1;
      salida := salida || jsonb_build_object('i', i, 'estado', 'ya_estaba', 'id', existente);
    end if;
    i := i + 1;
  end loop;
  return salida;
end $$;
