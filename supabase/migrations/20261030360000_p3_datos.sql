-- Prioridad 3: datos más útiles (decisor, puntaje explicado, teléfonos E.164, deduplicación fuerte y unir duplicados)
create extension if not exists pg_trgm with schema extensions;

alter table public.prospectos add column if not exists nombre_norm text not null default '';
alter table public.prospectos add column if not exists dominio_norm text not null default '';
alter table public.prospectos add column if not exists telefono_e164 text;
alter table public.prospectos add column if not exists telefono_tipo text check (telefono_tipo in ('celular', 'fijo', 'fijo_o_celular'));
alter table public.prospectos add column if not exists razones jsonb not null default '{}'::jsonb; -- { a_favor: [], en_contra: [] }
alter table public.hallazgos add column if not exists decisor jsonb;
alter table public.hallazgos add column if not exists razones jsonb not null default '{}'::jsonb;

-- "Distribuidora Cabañé S.R.L." → "distribuidora cabane"
create or replace function public.nombre_normalizado(t text)
returns text language sql immutable set search_path = '' as $$
  select trim(regexp_replace(regexp_replace(
    translate(lower(coalesce(t, '')), 'áéíóúüñàèìòùâêîôûäëïöç', 'aeiouunaeiouaeiouaeioc'),
    '\m(s\.?\s?a\.?\s?s\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|sociedad an[oó]nima|ltda\.?|inc\.?|llc|s\.?\s?c\.?|y cia\.?|& cia\.?)(\s|$)', ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- "https://www.empresa.com.ar/contacto" → "empresa.com.ar" (las redes y portales no cuentan como dominio propio)
create or replace function public.dominio_normalizado(web text)
returns text language sql immutable set search_path = '' as $$
  select case when d = '' or d ~ '(^|\.)(facebook|instagram|linktr|linkedin|wa|whatsapp|google|goo|wixsite|mercadolibre|business\.site|blogspot|wordpress\.com)\.' then '' else d end
    from (select lower(split_part(regexp_replace(regexp_replace(trim(coalesce(web, '')), '^[a-z]+://', '', 'i'), '^www\.', '', 'i'), '/', 1)) as d) x
$$;

-- E.164 para Argentina (el número local sin 0 ni 15; los celulares llevan +54 9). Otros países: si viene con +, se respeta.
create or replace function public.telefono_e164(t text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(t, ''), '\D', '', 'g'); n text; movil boolean;
begin
  if d = '' then return null; end if;
  if t ~ '^\s*(\+|00)' and d !~ '^(00)?54' then return '+' || regexp_replace(d, '^00', ''); end if;
  n := public.normalizar_telefono(t);
  if length(n) <> 10 then return null; end if;
  movil := d ~ '^(00)?549' or t ~ '(^|\D)0?\d{2,4}\s*[-\s]?\s*15\s*[-\s]?\d' or length(d) = 11 and d ~ '^9';
  return '+54' || case when movil then '9' else '' end || n;
end $$;

create or replace function public.telefono_tipo(t text)
returns text language plpgsql immutable set search_path = '' as $$
declare e text := public.telefono_e164(t);
begin
  if e is null then return null; end if;
  if e ~ '^\+549' then return 'celular'; end if;
  if e ~ '^\+54' then
    -- Sin el 9 ni el 15 no se puede saber: los fijos suelen empezar con 4 después de la característica
    return case when substr(e, 4) ~ '^(11|2\d{2}|3\d{2})4' or substr(e, 4) ~ '^2\d{3}4' then 'fijo' else 'fijo_o_celular' end;
  end if;
  return 'fijo_o_celular';
end $$;

create or replace function public.prospecto_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.nombre_norm := public.nombre_normalizado(new.nombre);
  new.dominio_norm := public.dominio_normalizado(new.web_actual);
  new.telefono_e164 := public.telefono_e164(new.telefono);
  new.telefono_tipo := public.telefono_tipo(new.telefono);
  return new;
end $$;
drop trigger if exists prospectos_normalizar on public.prospectos;
create trigger prospectos_normalizar before insert or update of nombre, web_actual, telefono on public.prospectos
  for each row execute function public.prospecto_normalizar();
-- Completa los datos de las empresas que ya estaban (sin tocar su fecha de actualización)
alter table public.prospectos disable trigger prospectos_updated;
update public.prospectos set nombre_norm = public.nombre_normalizado(nombre), dominio_norm = public.dominio_normalizado(web_actual),
  telefono_e164 = public.telefono_e164(telefono), telefono_tipo = public.telefono_tipo(telefono);
alter table public.prospectos enable trigger prospectos_updated;

create index if not exists prospectos_dominio on public.prospectos (owner_id, dominio_norm) where dominio_norm <> '';
create index if not exists prospectos_nombre_trgm on public.prospectos using gin (nombre_norm extensions.gin_trgm_ops);

-- Posibles duplicados de la persona: mismo dominio, mismo teléfono o nombre casi igual en la misma zona
create or replace function public.posibles_duplicados()
returns table (a uuid, b uuid, nombre_a text, nombre_b text, motivo text)
language sql stable security definer set search_path = '' as $$
  select x.id, y.id, x.nombre, y.nombre,
         case when x.dominio_norm <> '' and x.dominio_norm = y.dominio_norm then 'Misma web (' || x.dominio_norm || ')'
              when x.telefono_norm <> '' and x.telefono_norm = y.telefono_norm then 'Mismo teléfono'
              else 'Nombre casi igual en la misma zona' end
    from public.prospectos x
    join public.prospectos y on y.owner_id = x.owner_id and y.id > x.id
   where x.owner_id = (select auth.uid())
     and ((x.dominio_norm <> '' and x.dominio_norm = y.dominio_norm)
       or (x.telefono_norm <> '' and x.telefono_norm = y.telefono_norm)
       or (x.nombre_norm <> '' and extensions.similarity(x.nombre_norm, y.nombre_norm) >= 0.8
           and lower(coalesce(x.zona, '')) = lower(coalesce(y.zona, ''))))
   limit 200
$$;

-- Unir dos empresas: la que queda se completa con los datos de la otra y se lleva contactos, historial, tareas y respuestas
create or replace function public.unir_prospectos(p_queda uuid, p_sale uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.prospectos; s public.prospectos;
begin
  select * into q from public.prospectos where id = p_queda and owner_id = (select auth.uid());
  select * into s from public.prospectos where id = p_sale and owner_id = (select auth.uid());
  if q.id is null or s.id is null or q.id = s.id then raise exception 'No encontré las dos empresas'; end if;
  update public.prospectos set
    rubro = coalesce(nullif(q.rubro, ''), s.rubro), zona = coalesce(nullif(q.zona, ''), s.zona), direccion = coalesce(nullif(q.direccion, ''), s.direccion),
    email = coalesce(nullif(q.email, ''), s.email), instagram = coalesce(nullif(q.instagram, ''), s.instagram),
    web_actual = coalesce(nullif(q.web_actual, ''), s.web_actual), google_maps_url = coalesce(nullif(q.google_maps_url, ''), s.google_maps_url),
    facebook = coalesce(nullif(q.facebook, ''), s.facebook), linkedin = coalesce(nullif(q.linkedin, ''), s.linkedin),
    fuente_url = coalesce(nullif(q.fuente_url, ''), s.fuente_url), encaje = coalesce(nullif(q.encaje, ''), s.encaje),
    notas = trim(both E'\n' from concat_ws(E'\n', nullif(q.notas, ''), nullif(s.notas, ''))),
    rating = coalesce(q.rating, s.rating), resenas = coalesce(q.resenas, s.resenas), puntaje = greatest(q.puntaje, s.puntaje),
    calificacion = greatest(q.calificacion, s.calificacion), senales = concat_ws(' ', nullif(q.senales, ''), nullif(s.senales, ''))
  where id = q.id;
  if coalesce(q.telefono, '') = '' and coalesce(s.telefono, '') <> '' then
    update public.prospectos set telefono = '' where id = s.id; -- libera el índice único del teléfono
    update public.prospectos set telefono = s.telefono where id = q.id;
  end if;
  update public.contactos set principal = false where prospecto_id = s.id and exists (select 1 from public.contactos c where c.prospecto_id = q.id and c.principal);
  update public.contactos set prospecto_id = q.id where prospecto_id = s.id;
  update public.interacciones set prospecto_id = q.id where prospecto_id = s.id;
  update public.tareas set prospecto_id = q.id where prospecto_id = s.id;
  update public.respuestas set prospecto_id = q.id where prospecto_id = s.id;
  update public.hallazgos set prospecto_id = q.id where prospecto_id = s.id;
  update public.bajas_tokens set prospecto_id = q.id where prospecto_id = s.id;
  update public.envios_cola set estado = 'cancelado', error = 'Empresa unida con otra' where prospecto_id = s.id and estado = 'en_cola';
  update public.inscripciones set estado = 'frenada', motivo = 'Empresa unida con otra' where prospecto_id = s.id and estado in ('activa', 'pausada');
  update public.mensajes m set prospecto_id = q.id where m.prospecto_id = s.id and not exists (select 1 from public.mensajes x where x.prospecto_id = q.id and x.tipo = m.tipo);
  delete from public.prospectos where id = s.id;
  insert into public.interacciones (owner_id, prospecto_id, tipo, detalle) values ((select auth.uid()), q.id, 'nota', 'Se unió con "' || s.nombre || '" (estaba duplicada)');
  return jsonb_build_object('ok', true, 'id', q.id);
end $$;

-- Al sumar una empresa desde "Por revisar": se lleva el puntaje explicado, las novedades y el decisor encontrado
create or replace function public.aprobar_hallazgos(p_ids uuid[])
returns jsonb language plpgsql set search_path = 'public' as $$
declare
  h public.hallazgos; r jsonb; pid uuid; nuevos int := 0; ya int := 0;
begin
  for h in select * from public.hallazgos where id = any(p_ids) and estado <> 'aprobado' loop
    r := public.importar_con_detalle(jsonb_build_array(jsonb_build_object(
      'nombre', h.nombre, 'rubro', h.rubro, 'zona', h.zona, 'direccion', h.direccion, 'telefono', h.telefono,
      'email', h.email, 'instagram', h.instagram, 'facebook', h.facebook, 'linkedin', h.linkedin,
      'que_tiene_hoy', h.que_tiene_hoy, 'web_actual', h.web, 'google_maps_url', h.google_maps_url,
      'fuente_url', h.fuente_url, 'rating', coalesce(h.rating::text, ''), 'resenas', coalesce(h.resenas::text, ''),
      'notas', h.nota, 'encaje', h.encaje, 'puntaje', coalesce(h.puntaje::text, ''))), 'busqueda_ia', h.busqueda_id) -> 0;
    pid := nullif(r ->> 'id', '')::uuid;
    if r ->> 'estado' = 'nuevo' then nuevos := nuevos + 1; else ya := ya + 1; end if;
    if pid is not null then
      update public.prospectos set razones = coalesce(nullif(h.razones, '{}'::jsonb), razones), senales = coalesce(nullif(h.senales, ''), senales) where id = pid;
      if coalesce(h.decisor ->> 'nombre', '') <> '' and not exists (select 1 from public.contactos c where c.prospecto_id = pid and lower(c.nombre) = lower(h.decisor ->> 'nombre')) then
        insert into public.contactos (owner_id, prospecto_id, nombre, cargo, email, linkedin, fuente)
          values (h.owner_id, pid, h.decisor ->> 'nombre', coalesce(h.decisor ->> 'cargo', ''), coalesce(h.decisor ->> 'email', ''), coalesce(h.decisor ->> 'linkedin', ''), coalesce(nullif(h.decisor ->> 'fuente', ''), 'Encontrado al buscar'));
      end if;
    end if;
    update public.hallazgos set estado = 'aprobado', revisado_at = now(), prospecto_id = pid where id = h.id;
  end loop;
  return jsonb_build_object('nuevos', nuevos, 'ya_estaban', ya);
end $$;

-- Ajuste: celular explícito = +54 9… o característica + 15 + número (12 dígitos sin el 0)
create or replace function public.telefono_e164(t text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(t, ''), '\D', '', 'g'); n text; movil boolean;
begin
  if d = '' then return null; end if;
  if t ~ '^\s*(\+|00)' and d !~ '^(00)?54' then return '+' || regexp_replace(d, '^00', ''); end if;
  n := public.normalizar_telefono(t);
  if length(n) <> 10 then return null; end if;
  movil := d ~ '^(00)?549' or length(regexp_replace(d, '^0', '')) = 12 or (length(d) = 11 and d ~ '^9');
  return '+54' || case when movil then '9' else '' end || n;
end $$;
