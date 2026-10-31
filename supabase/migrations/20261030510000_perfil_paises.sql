-- Además del país principal (el de la zona horaria), la cuenta puede vender en otros países
alter table public.perfiles add column if not exists paises text[] not null default '{}'
  check (paises <@ array['AR','CL','UY','PY','BO','PE','CO','EC','MX','BR','VE','CR','PA','GT','DO','ES','US']::text[]);
