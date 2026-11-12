// Lógica de mails sin red: la firma la pone el sistema, el idioma sale del país y el pedido de baja
// no se dispara por una frase suelta. Casos raros a propósito.
import { describe, expect, it } from 'vitest';
import { conFirma, PIDE_BAJA, SIN_COMPLETAR } from '../../../supabase/functions/_shared/correo.ts';
import { idiomaDe, sinVoseoEn } from '../../../supabase/functions/_shared/redactar.ts';

const FIRMA = 'Vincenzo Dallape\nSTOKA\n261 555-1234';

describe('la firma la pone el sistema', () => {
  it('un mail sin firma la recibe al final', () => {
    expect(conFirma('Hola Juan,\n\n¿Lo vemos el martes?', FIRMA)).toBe('Hola Juan,\n\n¿Lo vemos el martes?\n\n' + FIRMA);
  });
  it('si ya la tiene, no se duplica (aunque cambien mayúsculas o espacios)', () => {
    const r = conFirma('Hola,\n\nGracias.\n\nvincenzo dallape\nStoka\n261 555-1234  \n', FIRMA);
    expect(r).toBe('Hola,\n\nGracias.\n\n' + FIRMA);
    expect(r.match(/261 555-1234/g)).toHaveLength(1);
  });
  it('si Claude firmó sólo con el nombre, queda la firma completa una sola vez', () => {
    const r = conFirma('Hola,\n\nGracias.\n\nVincenzo Dallape', FIRMA);
    expect(r).toBe('Hola,\n\nGracias.\n\n' + FIRMA);
  });
  it('sin firma configurada no toca nada', () => {
    expect(conFirma('Hola', '')).toBe('Hola');
  });
  it('un cuerpo vacío queda sólo con la firma, sin romper', () => {
    expect(conFirma('', FIRMA).trim()).toBe(FIRMA);
  });
  it('no se come una línea del mensaje que sólo se parece a la firma', () => {
    const r = conFirma('Hola,\n\nTe escribe Vincenzo Dallape de STOKA por el depósito.', FIRMA);
    expect(r).toContain('por el depósito.');
    expect(r.endsWith(FIRMA)).toBe(true);
  });
});

describe('borradores sin completar no salen', () => {
  it('detecta los huecos de las plantillas', () => {
    expect(SIN_COMPLETAR.test('Soy [tu nombre], de [tu estudio]')).toBe(true);
    expect(SIN_COMPLETAR.test('Te paso el presupuesto [COMPLETAR precio]')).toBe(true);
    expect(SIN_COMPLETAR.test('Vi su nota en [Clarín] sobre la ampliación')).toBe(false);
  });
});

describe('idioma del mail: sale del país, no de palabras sueltas', () => {
  it('una calle o ciudad que se llama como un país no cambia el idioma', () => {
    expect(idiomaDe({ zona: 'Mendoza, Argentina', direccion: 'Av. Brasil 450' })).toBe('');
    expect(idiomaDe({ zona: 'Cañada de Gómez, Santa Fe, Argentina' })).toBe('');
    expect(idiomaDe({ zona: 'CABA, Argentina', direccion: 'Estados Unidos 1200' })).toBe('');
  });
  it('Brasil va en portugués y Estados Unidos en inglés', () => {
    expect(idiomaDe({ zona: 'São Paulo, Brasil' })).toBe('portugués de Brasil');
    expect(idiomaDe({ zona: 'Miami, Estados Unidos' })).toBe('inglés');
  });
  it('Chile, México o España van sin voseo; Argentina y Uruguay no cambian', () => {
    expect(sinVoseoEn({ zona: 'Santiago, Chile' })).toBe('chile');
    expect(sinVoseoEn({ zona: 'Monterrey, México' })).toBe('mexico');
    expect(sinVoseoEn({ zona: 'Rosario, Argentina' })).toBe('');
    expect(sinVoseoEn({ zona: 'Montevideo, Uruguay' })).toBe('');
    expect(sinVoseoEn({ zona: '' })).toBe('');
  });
});

describe('pedido de baja', () => {
  it('lo que sí es una baja', () => {
    for (const t of ['Por favor no me escriban más', 'Quiero darme de baja', 'no queremos recibir estos mails', 'unsubscribe', 'No nos manden mas correos'])
      expect(PIDE_BAJA.test(t), t).toBe(true);
  });
  it('lo que NO es una baja (antes los suprimía para siempre)', () => {
    for (const t of ['No me manden la factura a este mail, mándenla a compras@empresa.com', 'No me escriban a esta casilla: usen ventas@empresa.com', 'No nos envíen el catálogo impreso, con el PDF alcanza'])
      expect(PIDE_BAJA.test(t), t).toBe(false);
  });
});
