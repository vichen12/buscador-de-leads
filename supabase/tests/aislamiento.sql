-- Prueba de aislamiento entre cuentas (RLS). Correr en el SQL editor reemplazando los dos ids por usuarios de empresas distintas.
-- Cada fila tiene que mostrar SOLO lo de su empresa; nunca la suma de las dos. Todo se deshace al final (rollback).
-- Además: select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;  → tiene que dar vacío.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<USUARIO_A>","role":"authenticated"}', true);
create temp table r as select 'A' u, (select count(*) from prospectos) prospectos, (select count(*) from interacciones) interacciones,
  (select count(*) from mensajes) mensajes, (select count(*) from respuestas) respuestas, (select count(*) from clientes) clientes,
  (select count(*) from auditoria) auditoria, (select count(*) from perfiles) perfiles, (select count(*) from conexiones_correo) casillas;
select set_config('request.jwt.claims', '{"sub":"<USUARIO_B>","role":"authenticated"}', true);
insert into r select 'B', (select count(*) from prospectos), (select count(*) from interacciones), (select count(*) from mensajes),
  (select count(*) from respuestas), (select count(*) from clientes), (select count(*) from auditoria), (select count(*) from perfiles), (select count(*) from conexiones_correo);
select * from r;
rollback;
-- Última corrida (30/10/2026): A vio 1 empresa y su casilla; B vio sus 12 empresas. Sin cruces. Todas las tablas públicas tienen RLS.
