-- Más datos por empresa: redes, la fuente y qué se buscó. Todo queda guardado en el prospecto.
alter table public.prospectos add column if not exists facebook   text not null default '';
alter table public.prospectos add column if not exists linkedin   text not null default '';
alter table public.prospectos add column if not exists fuente_url text not null default '';

-- Link a Google Maps: si no vino la ficha exacta, una búsqueda por nombre + dirección/zona abre el negocio
create or replace function public.link_maps(p_nombre text, p_direccion text, p_zona text)
returns text language sql immutable set search_path = '' as $$
  select 'https://www.google.com/maps/search/?api=1&query=' ||
         replace(replace(replace(replace(trim(concat_ws(' ', p_nombre, nullif(p_direccion, ''), nullif(p_zona, ''))), '%', '%25'), '&', '%26'), '#', '%23'), ' ', '+')
$$;

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
                                   place_id, notas, fuente, busqueda_id, encaje, puntaje,
                                   facebook, linkedin, fuente_url)
    values (trim(f ->> 'nombre'), coalesce(f ->> 'rubro', ''), coalesce(f ->> 'zona', ''),
            coalesce(f ->> 'direccion', ''), coalesce(f ->> 'telefono', ''), coalesce(f ->> 'email', ''),
            coalesce(f ->> 'instagram', ''), coalesce(f ->> 'que_tiene_hoy', ''), coalesce(f ->> 'web_actual', ''),
            nullif(replace(f ->> 'rating', ',', '.'), '')::numeric,
            nullif(regexp_replace(coalesce(f ->> 'resenas', ''), '\D', '', 'g'), '')::int,
            coalesce(nullif(f ->> 'google_maps_url', ''),
                     public.link_maps(trim(f ->> 'nombre'), coalesce(f ->> 'direccion', ''), coalesce(f ->> 'zona', ''))),
            coalesce(f ->> 'place_id', ''),
            coalesce(f ->> 'notas', ''), origen, p_busqueda, coalesce(f ->> 'encaje', ''),
            case when coalesce(f ->> 'puntaje', '') ~ '^[1-5]$' then (f ->> 'puntaje')::smallint end,
            coalesce(f ->> 'facebook', ''), coalesce(f ->> 'linkedin', ''), coalesce(f ->> 'fuente_url', ''))
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

-- Arreglar lo ya guardado: la fuente sale de las notas a su propia columna, Facebook de la web, zonas mal escritas y link a Maps
update public.prospectos
   set fuente_url = substring(notas from 'Fuente: (https?://\S+)'),
       notas = trim(both E'\n' from regexp_replace(notas, '\n?Fuente: https?://\S+', '', 'g'))
 where fuente_url = '' and notas ~ 'Fuente: https?://';
update public.prospectos set facebook = web_actual where facebook = '' and web_actual ~* 'facebook\.com';
update public.prospectos set zona = 'Neuquén' where zona ~* '^neuqu[eé]n(, mendoza)?$';
update public.busquedas  set zona = 'Neuquén' where zona ~* '^neuqu[eé]n(, mendoza)?$';
update public.prospectos set google_maps_url = public.link_maps(nombre, direccion, zona) where google_maps_url = '';
