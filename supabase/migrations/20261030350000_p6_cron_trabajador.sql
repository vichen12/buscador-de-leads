create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Secreto para que el cron llame al trabajador (se genera acá y nunca sale de la base)
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'trabajador_secreto', 'Lo usa pg_cron para llamar al trabajador de Prospecta')
 where not exists (select 1 from vault.secrets where name = 'trabajador_secreto');

create or replace function public.secreto_trabajador()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'trabajador_secreto'
$$;
revoke execute on function public.secreto_trabajador() from public, anon, authenticated;
grant execute on function public.secreto_trabajador() to service_role;

-- Cada minuto: cola de envíos, secuencias y lectura de casillas (función "correo", modo trabajador)
select cron.unschedule(jobid) from cron.job where jobname = 'prospecta-trabajador';
select cron.schedule('prospecta-trabajador', '* * * * *', $cron$
  select net.http_post(
    url := 'https://yggpzstnntjwcxayhcfp.supabase.co/functions/v1/correo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-trabajador', public.secreto_trabajador()),
    body := '{"modo":"trabajar"}'::jsonb,
    timeout_milliseconds := 150000)
$cron$);
