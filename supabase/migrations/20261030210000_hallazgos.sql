-- Bandeja "Por revisar": lo que trae la búsqueda cae acá. La persona lo pasa en limpio a su lista
-- (prospectos) o lo marca como "No sirve". Las descartadas quedan guardadas para que ninguna
-- búsqueda futura (suya o de su equipo) las vuelva a traer.
create table if not exists public.hallazgos (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  busqueda_id     uuid references public.busquedas (id) on delete set null,
  nombre          text not null check (length(trim(nombre)) > 0),
  rubro           text not null default '',
  zona            text not null default '',
  direccion       text not null default '',
  telefono        text not null default '',
  email           text not null default '',
  web             text not null default '',
  que_tiene_hoy   text not null default '',
  google_maps_url text not null default '',
  instagram       text not null default '',
  facebook        text not null default '',
  linkedin        text not null default '',
  fuente_url      text not null default '',
  rating          numeric(2, 1),
  resenas         int,
  encaje          text not null default '',
  puntaje         smallint check (puntaje between 1 and 5),
  nota            text not null default '',
  estado          text not null default 'por_revisar' check (estado in ('por_revisar', 'aprobado', 'descartado')),
  motivo          text not null default '',
  prospecto_id    uuid references public.prospectos (id) on delete set null,
  clave_nombre    text generated always as (public.clave_texto(nombre)) stored,
  telefono_norm   text generated always as (public.normalizar_telefono(telefono)) stored,
  created_at      timestamptz not null default now(),
  revisado_at     timestamptz
);
create unique index if not exists hallazgos_nombre_unico on public.hallazgos (owner_id, clave_nombre);
create index if not exists hallazgos_owner_estado on public.hallazgos (owner_id, estado, created_at desc);
create index if not exists hallazgos_busqueda on public.hallazgos (busqueda_id);

alter table public.hallazgos enable row level security;
create policy hallazgos_propios on public.hallazgos for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.hallazgos to authenticated;

-- Pasar en limpio: copia a prospectos (con la misma deduplicación) y marca el hallazgo como aprobado
create or replace function public.aprobar_hallazgos(p_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  h public.hallazgos;
  r jsonb;
  nuevos int := 0;
  ya int := 0;
begin
  for h in select * from public.hallazgos where id = any(p_ids) and estado <> 'aprobado' loop
    r := public.importar_con_detalle(jsonb_build_array(jsonb_build_object(
      'nombre', h.nombre, 'rubro', h.rubro, 'zona', h.zona, 'direccion', h.direccion, 'telefono', h.telefono,
      'email', h.email, 'instagram', h.instagram, 'facebook', h.facebook, 'linkedin', h.linkedin,
      'que_tiene_hoy', h.que_tiene_hoy, 'web_actual', h.web, 'google_maps_url', h.google_maps_url,
      'fuente_url', h.fuente_url, 'rating', coalesce(h.rating::text, ''), 'resenas', coalesce(h.resenas::text, ''),
      'notas', h.nota, 'encaje', h.encaje, 'puntaje', coalesce(h.puntaje::text, ''))), 'busqueda_ia', h.busqueda_id) -> 0;
    if r ->> 'estado' = 'nuevo' then nuevos := nuevos + 1; else ya := ya + 1; end if;
    update public.hallazgos set estado = 'aprobado', revisado_at = now(), prospecto_id = nullif(r ->> 'id', '')::uuid where id = h.id;
  end loop;
  return jsonb_build_object('nuevos', nuevos, 'ya_estaban', ya);
end $$;
grant execute on function public.aprobar_hallazgos(uuid[]) to authenticated;

-- Lo de hoy que vino de la búsqueda y todavía no se tocó pasa a la bandeja para revisarlo
with movidos as (
  insert into public.hallazgos (owner_id, busqueda_id, nombre, rubro, zona, direccion, telefono, email, web, que_tiene_hoy,
                                google_maps_url, instagram, facebook, linkedin, fuente_url, rating, resenas, encaje, puntaje, nota, created_at)
  select p.owner_id, p.busqueda_id, p.nombre, p.rubro, p.zona, p.direccion, p.telefono, p.email, p.web_actual, p.que_tiene_hoy,
         p.google_maps_url, p.instagram, p.facebook, p.linkedin, p.fuente_url, p.rating, p.resenas, p.encaje, p.puntaje, p.notas, p.created_at
    from public.prospectos p
   where p.fuente = 'busqueda_ia' and p.estado = 'pendiente'
     and not exists (select 1 from public.mensajes m where m.prospecto_id = p.id)
     and not exists (select 1 from public.interacciones i where i.prospecto_id = p.id)
  on conflict do nothing
  returning owner_id, clave_nombre
)
delete from public.prospectos p using movidos m
 where p.owner_id = m.owner_id and public.clave_texto(p.nombre) = m.clave_nombre
   and p.fuente = 'busqueda_ia' and p.estado = 'pendiente';
