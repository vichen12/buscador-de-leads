-- Búsquedas en segundo plano: siguen en el servidor aunque la persona cierre la pestaña o cambie de
-- pantalla. La web consulta el estado de la fila hasta que termina. Se puede correr más de una vez.
alter table public.busquedas add column if not exists estado text not null default 'lista';
alter table public.busquedas add column if not exists resultado jsonb;
alter table public.busquedas add column if not exists terminada_at timestamptz;
-- (Una búsqueda que quedó «buscando» más de 10 minutos la web la da por cortada.)
