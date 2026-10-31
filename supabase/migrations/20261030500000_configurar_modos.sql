-- Elegir qué vende la cuenta: sólo a empresas (B2B), sólo a consumidores (B2C) o las dos.
-- Si la persona es de una empresa, lo define el admin y vale para todo el equipo. Pendiente de decisión: limitarlo por plan.
create or replace function public.configurar_modos(p_modos text[], p_modo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare yo public.perfiles; m text[];
begin
  select array_agg(distinct x order by x) into m from unnest(p_modos) x where x in ('b2b', 'b2c');
  if m is null or cardinality(m) = 0 then raise exception 'Elegí al menos un tipo de venta'; end if;
  select * into yo from public.perfiles where id = (select auth.uid());
  if yo.empresa_id is not null and yo.rol <> 'admin' and not yo.es_admin then
    raise exception 'Lo define el admin de tu empresa';
  end if;
  update public.perfiles set modos = m,
         modo = case when modo = any(m) then modo else m[1] end
   where (yo.empresa_id is not null and empresa_id = yo.empresa_id) or id = yo.id;
  if p_modo is not null and p_modo = any(m) then update public.perfiles set modo = p_modo where id = yo.id; end if;
end $$;
revoke all on function public.configurar_modos(text[], text) from public, anon;
grant execute on function public.configurar_modos(text[], text) to authenticated;
