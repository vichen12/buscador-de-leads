-- Historial de búsquedas con IA y guardado automático de resultados.
create table if not exists public.busquedas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rubro       text not null default '',
  zona        text not null default '',
  pedido      text not null default '',
  requisitos  jsonb not null default '{}'::jsonb,
  cantidad    int  not null default 0,
  encontrados int  not null default 0,
  guardados   int  not null default 0,
  ya_estaban  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists busquedas_owner on public.busquedas (owner_id, created_at desc);
alter table public.busquedas enable row level security;
create policy "busquedas propias (leer)" on public.busquedas for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.acceso_activo()));
create policy "busquedas propias (borrar)" on public.busquedas for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.prospectos add column if not exists busqueda_id uuid references public.busquedas (id) on delete set null;
create index if not exists prospectos_busqueda on public.prospectos (busqueda_id) where busqueda_id is not null;

-- Igual que importar_prospectos, pero devuelve qué pasó con cada fila y el id del prospecto
-- (el nuevo, o el que ya existía), para poder mostrar y enlazar cada resultado.
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
                                   place_id, notas, fuente, busqueda_id)
    values (trim(f ->> 'nombre'), coalesce(f ->> 'rubro', ''), coalesce(f ->> 'zona', ''),
            coalesce(f ->> 'direccion', ''), coalesce(f ->> 'telefono', ''), coalesce(f ->> 'email', ''),
            coalesce(f ->> 'instagram', ''), coalesce(f ->> 'que_tiene_hoy', ''), coalesce(f ->> 'web_actual', ''),
            nullif(replace(f ->> 'rating', ',', '.'), '')::numeric,
            nullif(regexp_replace(coalesce(f ->> 'resenas', ''), '\D', '', 'g'), '')::int,
            coalesce(f ->> 'google_maps_url', ''), coalesce(f ->> 'place_id', ''),
            coalesce(f ->> 'notas', ''), origen, p_busqueda)
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
revoke execute on function public.importar_con_detalle(jsonb, text, uuid) from public, anon;
grant execute on function public.importar_con_detalle(jsonb, text, uuid) to authenticated;

-- Modelos por tarea (búsqueda y resúmenes pueden usar un modelo más barato)
alter table public.config_claves drop constraint config_claves_nombre_check;
alter table public.config_claves add constraint config_claves_nombre_check
  check (nombre = any (array['anthropic','google_places','modelo_ia','limite_chat','modelo_busqueda','modelo_resumen']));
