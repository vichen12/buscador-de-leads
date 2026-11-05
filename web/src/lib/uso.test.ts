import { describe, expect, it, vi } from 'vitest';
import {
  anotarChatUso,
  anotarPlaces,
  anotarSinCupo,
  filaChatUso,
  hayUso,
  nuevoUso,
  sumarTokens,
  sumarUso,
} from '../../../supabase/functions/_shared/uso.ts';

/** Cliente de mentira: anota lo que recibe por tabla. `error` simula una base con error y `tira` una caída. */
function dbFalsa({ error = null, tira = false, sinColumnas = false }: { error?: unknown; tira?: boolean; sinColumnas?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const consumo: Record<string, unknown>[] = [];
  const db = {
    from: (tabla: string) => ({
      insert: async (fila: Record<string, unknown>) => {
        if (tira) throw new Error('sin red');
        // Base sin la migración: chat_uso rechaza las columnas nuevas
        if (sinColumnas && tabla === 'chat_uso' && 'funcion' in fila) return { error: { code: 'PGRST204' } };
        (tabla === 'chat_uso' ? inserts : consumo).push(fila);
        return { error };
      },
    }),
  };
  return { db, inserts, rpcs: consumo };
}

describe('uso de Prospecta', () => {
  it('suma tokens por modelo y las búsquedas web de la respuesta real', () => {
    const u = nuevoUso();
    sumarUso(u, 'claude-haiku-5-5', {
      input_tokens: 100,
      output_tokens: 20,
      server_tool_use: { web_search_requests: 3 },
    });
    sumarUso(u, 'claude-haiku-5-5', { input_tokens: 1, output_tokens: 1 });
    expect(u.por['claude-haiku-5-5']).toEqual({ in: 101, out: 21 });
    expect(u.busquedasWeb).toBe(3);
  });

  it('una respuesta sin usage no rompe ni suma', () => {
    const u = nuevoUso();
    sumarUso(u, 'm', undefined);
    expect(hayUso(u)).toBe(false);
  });

  it('con un solo modelo la fila lleva el modelo y no el reparto', () => {
    const u = nuevoUso();
    sumarTokens(u, 'claude-haiku-5-5', 10, 5);
    expect(filaChatUso('o', 'prospecta_redactar', u)).toEqual({
      owner_id: 'o',
      funcion: 'prospecta_redactar',
      tokens_in: 10,
      tokens_out: 5,
      modelo: 'claude-haiku-5-5',
      por_modelo: null,
      busquedas_web: 0,
    });
  });

  it('con dos modelos es UNA sola fila de cupo, con el total y el reparto', () => {
    const u = nuevoUso();
    sumarTokens(u, 'barato', 100, 10);
    sumarTokens(u, 'caro', 1000, 100);
    const f = filaChatUso('o', 'prospecta_buscar', u);
    expect(f).toMatchObject({ tokens_in: 1100, tokens_out: 110, modelo: 'caro' });
    expect(f.por_modelo).toEqual([
      { modelo: 'caro', in: 1000, out: 100 },
      { modelo: 'barato', in: 100, out: 10 },
    ]);
  });

  it('un modelo que no gastó nada no aparece en el reparto', () => {
    const u = nuevoUso();
    sumarTokens(u, 'a', 5, 5);
    sumarTokens(u, 'b', 0, 0);
    expect(filaChatUso('o', 'x', u)).toMatchObject({ modelo: 'a', por_modelo: null });
  });

  it('sin tokens guarda el modelo que se iba a usar: la fila de cupo no se pierde', async () => {
    const { db, inserts } = dbFalsa();
    await anotarChatUso(db, 'o', 'prospecta_redactar', nuevoUso(), 'claude-haiku-5-5');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tokens_in: 0, modelo: 'claude-haiku-5-5' });
  });

  it('anotar deja el uso en cero: lo que siga no se cuenta dos veces', async () => {
    const { db, inserts, rpcs } = dbFalsa();
    const u = nuevoUso();
    sumarTokens(u, 'm', 10, 5);
    await anotarChatUso(db, 'o', 'prospecta_guion', u);
    await anotarSinCupo(db, { funcion: 'prospecta_guion', usuario: 'o', uso: u });
    expect(inserts).toHaveLength(1);
    expect(rpcs).toHaveLength(0);
  });

  it('lo que no descuenta cupo va al registro común, nunca a chat_uso', async () => {
    const { db, inserts, rpcs } = dbFalsa();
    const u = nuevoUso();
    sumarUso(u, 'a', {
      input_tokens: 10,
      output_tokens: 5,
      server_tool_use: { web_search_requests: 2 },
    });
    sumarTokens(u, 'b', 1, 1);
    await anotarSinCupo(db, { funcion: 'prospecta_reescribir', usuario: 'o', uso: u });
    expect(inserts).toHaveLength(0);
    expect(rpcs).toHaveLength(2);
    expect(rpcs[0]).toMatchObject({
      servicio: 'claude',
      funcion: 'prospecta_reescribir',
      modelo: 'a',
      tokens_entrada: 10,
      busquedas_web: 2,
      usuario: 'o',
    });
    expect(rpcs[1]).toMatchObject({ modelo: 'b', busquedas_web: 0 });
  });

  it('Google Places: cuenta las que contestó bien y no anota si no hubo ninguna', async () => {
    const { db, rpcs } = dbFalsa();
    await anotarPlaces(db, { funcion: 'prospecta_buscar', usuario: 'o', consultas: 0 });
    expect(rpcs).toHaveLength(0);
    await anotarPlaces(db, { funcion: 'prospecta_buscar', usuario: 'o', consultas: 8, fallidas: 1 });
    expect(rpcs[0]).toMatchObject({ servicio: 'google_places', unidades: 8, unidad: 'consultas' });
    expect(rpcs[1]).toMatchObject({ unidades: 0, ok: false });
  });

  it('si la base falla o tira, nunca rompe y queda el log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const u = () => {
      const x = nuevoUso();
      sumarTokens(x, 'm', 1, 1);
      return x;
    };
    for (const opc of [{ tira: true }, { error: { code: '42501' } }]) {
      const { db } = dbFalsa(opc);
      await expect(anotarChatUso(db, 'o', 'f', u())).resolves.toBeUndefined();
      await expect(
        anotarSinCupo(db, { funcion: 'f', usuario: 'o', uso: u() })
      ).resolves.toBeUndefined();
      await expect(
        anotarPlaces(db, { funcion: 'f', usuario: 'o', consultas: 1 })
      ).resolves.toBeUndefined();
    }
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('sin la migración nueva igual descuenta el cupo (fila básica)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db, inserts } = dbFalsa({ sinColumnas: true });
    const u = nuevoUso();
    sumarTokens(u, 'm', 7, 3);
    await anotarChatUso(db, 'o', 'prospecta_buscar', u);
    expect(inserts).toEqual([{ owner_id: 'o', tokens_in: 7, tokens_out: 3 }]);
    log.mockRestore();
  });

  it('búsquedas web sin tokens no se pierden en el registro común', async () => {
    const { db, rpcs } = dbFalsa();
    const u = nuevoUso();
    u.busquedasWeb = 4;
    await anotarSinCupo(db, { funcion: 'prospecta_buscar', usuario: 'o', uso: u });
    expect(rpcs).toEqual([expect.objectContaining({ busquedas_web: 4, modelo: null })]);
  });
});
