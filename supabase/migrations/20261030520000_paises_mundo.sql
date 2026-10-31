-- Las cuentas pueden vender en países fuera de Latinoamérica (Europa, Norteamérica, resto del mundo)
alter table public.perfiles drop constraint if exists perfiles_paises_check;
alter table public.perfiles add constraint perfiles_paises_check check (paises <@ array['AR','CL','UY','PY','BO','PE','CO','EC','VE','MX','GT','SV','HN','NI','CR','PA','DO','PR','BR','US','CA','ES','PT','IT','FR','DE','GB','IE','NL','BE','CH','AT','SE','PL','AU','NZ','AE','IL','ZA','JP','IN']::text[] and cardinality(paises) <= 40);
