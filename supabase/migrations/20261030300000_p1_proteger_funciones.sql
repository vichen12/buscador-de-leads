-- Sólo el propio usuario (o el servidor) puede consultar su supresión y su límite
create or replace function public.motivo_supresion(p_owner uuid, p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select case when s.email is not null then 'Pidió no recibir más mensajes (' || s.email || ')'
              else 'Todo el dominio @' || s.dominio || ' pidió no recibir más mensajes' end
    from public.supresion s
   where (p_owner = (select auth.uid()) or coalesce((select auth.role()), '') = 'service_role')
     and s.tenant_id = public.tenant_de(p_owner)
     and (s.email = lower(trim(p_email)) or s.dominio = lower(split_part(trim(p_email), '@', 2)))
   order by (s.email is not null) desc
   limit 1
$$;

create or replace function public.mi_motivo_supresion(p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select public.motivo_supresion((select auth.uid()), p_email)
$$;

do $$ begin
  execute (select replace(pg_get_functiondef('public.limite_email(uuid)'::regprocedure),
    'select * into c from public.conexiones_correo where owner_id = p_owner;',
    'if p_owner is distinct from (select auth.uid()) and coalesce((select auth.role()), '''') <> ''service_role'' then return null; end if;
  select * into c from public.conexiones_correo where owner_id = p_owner;'));
end $$;
revoke execute on function public.limite_email(uuid) from anon;
revoke execute on function public.motivo_supresion(uuid, text) from anon;
