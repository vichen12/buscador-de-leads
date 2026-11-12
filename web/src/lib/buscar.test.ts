// Prueba la función de búsqueda (supabase/functions/_shared/buscar.ts) sin red: Claude, Google Places
// y la base son de mentira. Cubre la fuente elegida, la falta de clave de Maps, el tope de tiempo y
// que una búsqueda descuente UNA sola unidad del cupo.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscar } from '../../../supabase/functions/_shared/buscar.ts';

type Dic = Record<string, any>;

/** Base de mentira: cualquier consulta encadenada devuelve vacío; anota inserts por tabla. */
function baseFalsa(datos: Record<string, Dic[]> = {}, opciones: { fallaGuardar?: boolean } = {}) {
  const inserts: Record<string, Dic[]> = {};
  const consulta = (tabla: string) => {
    let filas: Dic[] | null = null;
    const q: Dic = {};
    for (const m of ['select', 'in', 'eq', 'order', 'limit', 'update', 'neq', 'not', 'or', 'contains'])
      q[m] = () => q;
    q.insert = (f: Dic | Dic[]) => {
      (inserts[tabla] ??= []).push(...(Array.isArray(f) ? f : [f]));
      filas = Array.isArray(f) ? f : [f];
      return q;
    };
    q.upsert = (f: Dic[]) => {
      if (opciones.fallaGuardar) { q.then = (ok: (v: unknown) => void) => ok({ data: null, error: { message: 'no se pudo' } }); return q; }
      filas = f.map((x, i) => ({ ...x, id: `h${i}`, estado: 'por_revisar' }));
      return q;
    };
    q.maybeSingle = q.single = () => {
      const r = { data: tabla === 'busquedas' ? { id: 'b1' } : null, error: null };
      return Promise.resolve(r);
    };
    q.then = (ok: (v: unknown) => void) => ok({ data: filas ?? datos[tabla] ?? [], error: null });
    return q;
  };
  const db = { from: consulta, rpc: async () => ({ data: { usados: 0, limite: 100 }, error: null }) };
  return { db, inserts };
}

type Respuestas = { sitio?: string; web?: Dic[]; hangVerificar?: boolean; hangFichas?: boolean; alColgar?: () => void };
/** fetch de mentira: Anthropic (con y sin búsqueda web) y Google Places */
function redFalsa(r: Respuestas = {}) {
  const llamadas = { web: 0, places: 0, fichas: 0, verificar: 0, textos: [] as string[], sitio: '', modelosWeb: [] as string[] };
  const fetchFalso = vi.fn(async (url: string, init: Dic) => {
    const body = JSON.parse(init.body);
    if (url.includes('places.googleapis.com')) {
      llamadas.places++;
      if (r.hangFichas) r.alColgar?.(); // el reloj salta antes de que termine la búsqueda web
      return new Response(JSON.stringify({ places: [
        { id: 'p1', displayName: { text: `Depósito Maps ${llamadas.places}` }, nationalPhoneNumber: '261 555 000' + llamadas.places, businessStatus: 'OPERATIONAL', formattedAddress: 'Calle 1, Mendoza', ...(r.sitio ? { websiteUri: r.sitio } : {}) },
      ] }));
    }
    const texto: string = body.messages[0].content;
    llamadas.textos.push(texto);
    let salida = '';
    let usage: Dic = { input_tokens: 100, output_tokens: 50 };
    if (body.tools) {
      llamadas.web++;
      llamadas.modelosWeb.push(body.model);
      usage = { ...usage, server_tool_use: { web_search_requests: 3 } };
      salida = '```json\n' + JSON.stringify(r.web ?? [{ nombre: `Empresa Web ${llamadas.web}`, telefono: `261 400 00${llamadas.web}`, tipo: 'distribuidora' }]) + '\n```';
    } else if (texto.includes('fichas de Google Maps')) {
      llamadas.fichas++;
      if (r.hangFichas) { r.alColgar?.(); return new Promise<Response>(() => {}); }
      salida = JSON.stringify({ items: [{ i: 0, entra: true, puntaje: 4, que_es: 'depósito', encaje: 'tiene stock' }] });
    } else if (texto.includes('no_entran')) {
      llamadas.verificar++;
      if (r.hangVerificar) { r.alColgar?.(); return new Promise<Response>(() => {}); }
      salida = JSON.stringify({ no_entran: [] });
    }
    return new Response(JSON.stringify({ content: [{ type: 'text', text: salida }], usage, stop_reason: 'end_turn' }));
  });
  vi.stubGlobal('fetch', fetchFalso);
  return llamadas;
}

const brief = { interpretacion: 'distribuidoras con depósito', buscar: ['distribuidora'], incluir: ['distribuidoras'], excluir: [] };
async function correr(body: Dic, { places = 'AIza-falsa', datos = {}, fallaGuardar = false }: { places?: string; datos?: Record<string, Dic[]>; fallaGuardar?: boolean } = {}) {
  const { db, inserts } = baseFalsa(datos, { fallaGuardar });
  const usuario = { supabase: db, user: { id: 'u1' } };
  const claves: Dic = { anthropic: 'sk-ant-falsa', google_places: places };
  const res = await buscar(new Request('http://x', { method: 'POST', body: JSON.stringify({ rubro: 'distribuidoras', zona: 'Mendoza, Argentina', cantidad: 10, brief, ...body }) }), {
    clienteDelUsuario: async () => usuario,
    claveServicio: async (n: string) => claves[n] ?? '',
    json: (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s }),
    admin: () => db,
  });
  return { status: res.status, data: (await res.json()) as Dic, inserts };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('búsqueda: fuente elegida', () => {
  it('«claude» no consulta Google Maps', async () => {
    const red = redFalsa();
    const { status, data } = await correr({ fuente: 'claude' });
    expect(status).toBe(200);
    expect(red.places).toBe(0);
    expect(red.web).toBeGreaterThan(0);
    expect(data.diagnostico.maps).toBe('no_pedido');
  });

  it('«maps» no corre las búsquedas web de Claude', async () => {
    const red = redFalsa();
    const { status, data, inserts } = await correr({ fuente: 'maps' });
    expect(status).toBe(200);
    expect(red.web).toBe(0);
    expect(red.places).toBeGreaterThan(0);
    expect(data.diagnostico.web).toEqual([]);
    expect(data.resultados.length).toBeGreaterThan(0);
    expect(inserts.consumo_uso).toEqual(expect.arrayContaining([expect.objectContaining({ servicio: 'google_places', unidad: 'consultas' })]));
  });

  it('«ambas» (por defecto) usa las dos', async () => {
    const red = redFalsa();
    await correr({});
    expect(red.places).toBeGreaterThan(0);
    expect(red.web).toBeGreaterThan(0);
  });

  it('«maps» sin clave de Google Places: error claro y no descuenta cupo', async () => {
    const red = redFalsa();
    const { status, data, inserts } = await correr({ fuente: 'maps' }, { places: '' });
    expect(status).toBe(400);
    expect(data.codigo).toBe('SIN_CLAVE_MAPS');
    expect(data.error).toMatch(/Google Places/);
    expect(red.places + red.web).toBe(0);
    expect(inserts.chat_uso).toBeUndefined();
  });

  it('«ambas» sin clave de Maps sigue sólo con Claude', async () => {
    const red = redFalsa();
    const { status, data } = await correr({ fuente: 'ambas' }, { places: '' });
    expect(status).toBe(200);
    expect(red.web).toBeGreaterThan(0);
    expect(data.diagnostico.maps).toBe('sin_clave');
  });
});

describe('búsqueda: consumo', () => {
  it('una búsqueda con resultados es UNA fila de cupo con tokens reales, modelo y búsquedas web', async () => {
    redFalsa();
    const { inserts } = await correr({ fuente: 'claude' });
    expect(inserts.chat_uso).toHaveLength(1);
    expect(inserts.chat_uso[0]).toMatchObject({ funcion: 'prospecta_buscar', modelo: 'claude-haiku-5-5' });
    expect(inserts.chat_uso[0].tokens_in).toBeGreaterThan(0);
    expect(inserts.chat_uso[0].busquedas_web).toBeGreaterThan(0);
  });

  it('una búsqueda sin resultados descuenta 1, no 2', async () => {
    redFalsa({ web: [] });
    const { status, data, inserts } = await correr({ fuente: 'claude' });
    expect(status).toBe(200);
    expect(data.resultados).toEqual([]);
    expect(inserts.chat_uso).toHaveLength(1);
  });
});

describe('búsqueda: tope de tiempo', () => {
  /** Reloj que salta: cuando Claude se cuelga, hace de cuenta que ya pasaron `ms` desde que empezó el pedido */
  function relojQueSalta(ms: number) {
    const real = Date.now.bind(Date);
    const t0 = real();
    let salto = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => real() + salto);
    return () => { salto = ms - (real() - t0); };
  }

  it('si la segunda revisión no llega antes de los 125 s, devuelve lo encontrado con aviso', async () => {
    const saltar = relojQueSalta(124_000);
    redFalsa({ hangVerificar: true, alColgar: saltar });
    const { status, data } = await correr({ fuente: 'claude' });
    expect(status).toBe(200);
    expect(data.resultados.length).toBeGreaterThan(0);
    expect(data.aviso).toMatch(/segunda revisión/);
  }, 10_000);

  it('si Claude no termina de leer las fichas de Maps a tiempo, sigue sin ellas', async () => {
    const saltar = relojQueSalta(109_500);
    redFalsa({ hangFichas: true, alColgar: saltar });
    const { status, data } = await correr({ fuente: 'ambas' });
    expect(status).toBe(200);
    expect(String(data.diagnostico.maps)).toMatch(/tardó demasiado/);
    expect(data.resultados.length).toBeGreaterThan(0); // las de la web
  }, 10_000);
});

describe('los dos mundos: mi negocio y búsqueda libre', () => {
  const datos = {
    busquedas: [{ id: 'b-libre' }],
    prospectos: [
      { nombre: 'Cliente Bueno SA', rubro: 'distribuidora', estado: 'cliente', calificacion: 3, busqueda_id: 'b-negocio' },
      { nombre: 'Peluquería Libre', rubro: 'peluquería', estado: 'cliente', calificacion: 3, busqueda_id: 'b-libre' },
      { nombre: 'Kiosco Marcado', rubro: 'kiosco', estado: 'cliente', calificacion: 3, libre: true },
    ],
  };

  it('lo que se sumó en una búsqueda libre no entra en lo que aprende mi negocio', async () => {
    const red = redFalsa();
    const { status } = await correr({ fuente: 'claude', brief: undefined }, { datos });
    expect(status).toBe(200);
    const todo = red.textos.join(' | ');
    expect(todo).toContain('Cliente Bueno SA');
    expect(todo).not.toContain('Peluquería Libre');
    expect(todo).not.toContain('Kiosco Marcado');
  });

  it('la búsqueda libre no usa lo aprendido ni habla de «clientes que comprarían»', async () => {
    const red = redFalsa();
    const { status, data } = await correr({ fuente: 'claude', libre: true }, { datos });
    expect(status).toBe(200);
    expect(data.libre).toBe(true);
    const todo = red.textos.join(' | ');
    expect(todo).not.toContain('Cliente Bueno SA');
    expect(todo).not.toContain('COMPRARÍAN');
    expect(todo).toContain('EXACTAMENTE lo que pidió');
  });

  it('pedido concreto en mi negocio: no se desvía una búsqueda a «parecidas a las que ya te sirven»', async () => {
    const red = redFalsa();
    await correr({ fuente: 'claude', cantidad: 20 }, { datos });
    expect(red.textos.join(' | ')).not.toContain('Enfoque: empresas PARECIDAS');
  });

  it('pedido general en mi negocio: ahí sí busca parecidas', async () => {
    const red = redFalsa();
    await correr({ fuente: 'claude', cantidad: 20, brief: { ...brief, especifica: false } }, { datos });
    expect(red.textos.join(' | ')).toContain('Enfoque: empresas PARECIDAS');
  });
});

describe('«sin página web»', () => {
  it('escrito en el pedido activa el filtro solo, y las fichas de Maps con sitio propio no se evalúan', async () => {
    const red = redFalsa({ sitio: 'https://www.empresa-con-web.com.ar' });
    const { status, data } = await correr({ fuente: 'maps', libre: true, rubro: 'comercios que no tengan página web' });
    expect(status).toBe(200);
    expect(red.places).toBeGreaterThan(0);
    expect(red.fichas).toBe(0);
    expect(data.resultados).toHaveLength(0);
  });

  it('una ficha que sólo tiene Instagram sí entra', async () => {
    const red = redFalsa({ sitio: 'https://www.instagram.com/elcomercio/' });
    const { data } = await correr({ fuente: 'maps', libre: true, filtros: [{ id: 'sin_web', titulo: 'Sin página web' }] });
    expect(red.fichas).toBeGreaterThan(0);
    expect(data.resultados.length).toBeGreaterThan(0);
  });
});

describe('si no se puede guardar en Por revisar', () => {
  it('muestra igual lo que encontró y avisa (antes decía que no había encontrado nada)', async () => {
    redFalsa();
    const { status, data } = await correr({ fuente: 'claude' }, { fallaGuardar: true });
    expect(status).toBe(200);
    expect(data.resultados.length).toBeGreaterThan(0);
    expect(data.aviso).toContain('no se pudieron guardar');
  });
});

describe('con qué se busca (créditos)', () => {
  it('rápida: 1 crédito', async () => {
    redFalsa();
    const { data, inserts } = await correr({ fuente: 'claude' });
    expect(data.creditos).toBe(1);
    expect(inserts.chat_uso).toHaveLength(1);
  });
  it('máxima: busca con el modelo más potente y descuenta 5 créditos', async () => {
    const red = redFalsa();
    const { data, inserts } = await correr({ fuente: 'claude', calidad: 'maxima' });
    expect(red.modelosWeb.length).toBeGreaterThan(0);
    expect(red.modelosWeb.every((m: string) => m === 'claude-opus-5-5')).toBe(true);
    expect(data.creditos).toBe(5);
    expect(inserts.chat_uso).toHaveLength(5);
  });
  it('una calidad inventada cae en rápida', async () => {
    redFalsa();
    const { data } = await correr({ fuente: 'claude', calidad: 'gratis-total' });
    expect(data.calidad).toBe('rapida');
  });
});
