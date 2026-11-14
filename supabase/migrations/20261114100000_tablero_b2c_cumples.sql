-- Tablero B2C: «cumplen esta semana» funcionaba mal del 25 al 31 de diciembre (comparaba '1228'
-- con '0104'), y se suma «bajas» para que «sin permiso» no las cuente. Se cambia sólo esa parte de
-- la función que ya existe; si no encuentra el texto, no toca nada y avisa.
do $$
declare def text; nuevo text;
begin
  select pg_get_functiondef('public.tablero_b2c()'::regprocedure) into def;
  nuevo := replace(def,
    $v$and to_char(cumpleanos, 'MMDD') between to_char(current_date, 'MMDD') and to_char(current_date + 7, 'MMDD')),$v$,
    $n$and exists (select 1 from generate_series(0, 7) d where to_char(current_date + d, 'MMDD') = to_char(cumpleanos, 'MMDD'))),
    'bajas', (select count(*) from mios where baja_at is not null),$n$);
  if nuevo <> def then execute nuevo; else raise notice 'tablero_b2c(): no se encontró la línea de cumpleaños (¿ya estaba corregida?)'; end if;
end $$;
