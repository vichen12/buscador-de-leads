-- Separar los dos mundos: lo que se buscó «para mi negocio» y lo que se buscó «libre».
-- Hasta ahora la marca vivía sólo en busquedas.requisitos->libre: la bandeja «Por revisar», la lista y
-- lo que el sistema aprende mezclaban todo. Ahora cada empresa encontrada y cada prospecto llevan su
-- marca. Se puede correr más de una vez. No borra nada.

-- 1) Las columnas (default constante: no reescribe las tablas)
alter table public.hallazgos  add column if not exists libre boolean not null default false;
alter table public.prospectos add column if not exists libre boolean not null default false;

-- 2) Lo que ya existe se marca según la búsqueda de la que vino
update public.hallazgos h set libre = true
  from public.busquedas b
 where b.id = h.busqueda_id and b.requisitos @> '{"libre": true}'::jsonb and not h.libre;

-- (sin tocar updated_at: ordena lo que el sistema aprende)
alter table public.prospectos disable trigger prospectos_updated;
update public.prospectos p set libre = true
  from public.busquedas b
 where b.id = p.busqueda_id and b.requisitos @> '{"libre": true}'::jsonb and not p.libre;
alter table public.prospectos enable trigger prospectos_updated;

-- 3) Al guardar una empresa encontrada, la base le pone la marca de su búsqueda (no depende del navegador)
create or replace function public.hallazgo_marcar_libre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.busqueda_id is not null then
    new.libre := coalesce((select b.requisitos @> '{"libre": true}'::jsonb
                             from public.busquedas b
                            where b.id = new.busqueda_id and b.owner_id = new.owner_id), false);
  end if;
  return new;
end $$;
revoke execute on function public.hallazgo_marcar_libre() from public, anon, authenticated;
drop trigger if exists hallazgo_marcar_libre on public.hallazgos;
create trigger hallazgo_marcar_libre before insert on public.hallazgos
  for each row execute function public.hallazgo_marcar_libre();

-- 4) Al sumar a la lista, el prospecto hereda de dónde vino. De paso:
--    · si la empresa YA estaba en la lista (mismo teléfono o mismo nombre y dirección), ya no se le pisan
--      las razones ni las novedades con las de otra empresa;
--    · dos pedidos a la vez no procesan la misma fila dos veces.
create or replace function public.aprobar_hallazgos(p_ids uuid[])
returns jsonb language plpgsql set search_path = 'public' as $$
declare
  h public.hallazgos; r jsonb; pid uuid; nuevo boolean; nuevos int := 0; ya int := 0;
begin
  for h in select * from public.hallazgos where id = any(p_ids) and estado <> 'aprobado' for update loop
    r := public.importar_con_detalle(jsonb_build_array(jsonb_build_object(
      'nombre', h.nombre, 'rubro', h.rubro, 'zona', h.zona, 'direccion', h.direccion, 'telefono', h.telefono,
      'email', h.email, 'instagram', h.instagram, 'facebook', h.facebook, 'linkedin', h.linkedin,
      'que_tiene_hoy', h.que_tiene_hoy, 'web_actual', h.web, 'google_maps_url', h.google_maps_url,
      'fuente_url', h.fuente_url, 'rating', coalesce(h.rating::text, ''), 'resenas', coalesce(h.resenas::text, ''),
      'notas', h.nota, 'encaje', h.encaje, 'puntaje', coalesce(h.puntaje::text, ''))), 'busqueda_ia', h.busqueda_id) -> 0;
    pid := nullif(r ->> 'id', '')::uuid;
    nuevo := (r ->> 'estado' = 'nuevo');
    if nuevo then nuevos := nuevos + 1; else ya := ya + 1; end if;
    if pid is not null then
      update public.prospectos set
        -- nueva: hereda la marca. Ya estaba: si alguna vez vino de «mi negocio», sigue siendo de mi negocio
        libre   = case when nuevo then h.libre else libre and h.libre end,
        razones = case when nuevo or coalesce(razones, '{}'::jsonb) = '{}'::jsonb then coalesce(nullif(h.razones, '{}'::jsonb), razones) else razones end,
        senales = case when nuevo or coalesce(senales, '') = '' then coalesce(nullif(h.senales, ''), senales) else senales end
      where id = pid;
      if coalesce(h.decisor ->> 'nombre', '') <> '' and not exists (select 1 from public.contactos c where c.prospecto_id = pid and lower(c.nombre) = lower(h.decisor ->> 'nombre')) then
        insert into public.contactos (owner_id, prospecto_id, nombre, cargo, email, linkedin, fuente)
          values (h.owner_id, pid, h.decisor ->> 'nombre', coalesce(h.decisor ->> 'cargo', ''), coalesce(h.decisor ->> 'email', ''), coalesce(h.decisor ->> 'linkedin', ''), coalesce(nullif(h.decisor ->> 'fuente', ''), 'Encontrado al buscar'));
      end if;
    end if;
    update public.hallazgos set estado = 'aprobado', revisado_at = now(), prospecto_id = pid where id = h.id;
  end loop;
  return jsonb_build_object('nuevos', nuevos, 'ya_estaban', ya);
end $$;
