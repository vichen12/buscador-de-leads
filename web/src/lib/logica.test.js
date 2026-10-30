import { describe, it, expect } from 'vitest'
import { clasificarWeb, instagramDe, normalizarTelefono, numeroWhatsApp, linkWhatsApp } from '@shared/clasificar.js'
import { borradoresPlantilla, claveRubro, nombreCorto } from '@shared/plantillas.js'
import { leerCSV, autoMapeo, aplicarMapeo, marcarDuplicados } from './importar.js'

describe('clasificarWeb', () => {
  it.each([
    ['', true, 'Sin web'],
    ['https://www.instagram.com/barberia_delarosa/?hl=es', true, 'Instagram'],
    ['https://m.facebook.com/vetestrada/', true, 'Facebook'],
    ['https://www.fresha.com/es/a/symi', true, 'Fresha (turnos)'],
    ['https://elaestetica.site.agendapro.com/', true, 'AgendaPro (turnos)'],
    ['https://exovetmendoza.wixsite.com/x', true, 'Sitio gratuito sin dominio propio'],
    ['https://wa.me/message/ABC', true, 'Link de WhatsApp'],
    ['https://linktr.ee/xcellgym', true, 'Linktree / link en bio'],
    ['https://www.google.com/url?sa=t&url=https://www.instagram.com/optica.altomaipu/', true, 'Instagram'],
    ['https://zonestetic.com/', false, 'Dominio propio'],
    ['lapiramideopticas.com', false, 'Dominio propio'],
  ])('%s', (uri, es, que) => {
    expect(clasificarWeb(uri)).toEqual({ esProspecto: es, queTiene: que })
  })
  it('extrae instagram', () => {
    expect(instagramDe('https://instagram.com/moon_tattoo_mza?igsh=x')).toBe('https://www.instagram.com/moon_tattoo_mza/')
    expect(instagramDe('https://www.instagram.com/reel/abc')).toBe('')
  })
})

describe('teléfonos', () => {
  it('normaliza igual que la base', () => {
    expect(normalizarTelefono('0261 15-555-1234')).toBe('2615551234')
    expect(normalizarTelefono('+54 9 261 555-1234')).toBe('2615551234')
    expect(normalizarTelefono('0262215555125')).toBe('2622555125')
  })
  it('WhatsApp sólo para celulares', () => {
    expect(numeroWhatsApp('0261 15-555-1234')).toBe('5492615551234')
    expect(numeroWhatsApp('0261 653-0850')).toBe('5492616530850')
    expect(numeroWhatsApp('0261 497-6856')).toBe('')   // fijo de Mendoza
    expect(numeroWhatsApp('4266323')).toBe('')         // incompleto
    expect(linkWhatsApp('0261 653-0850', 'Hola ¿qué tal?')).toBe('https://wa.me/5492616530850?text=Hola%20%C2%BFqu%C3%A9%20tal%3F')
  })
})

describe('importación', () => {
  const csv = 'Nombre,Rubro,Dirección,Teléfono,Instagram,Link que figura como web en Google,Reseñas Google,Puntaje\n' +
    'Barbería Uno,Barbería,Calle 1,0261 15-555-1234,,https://instagram.com/uno,120,4.8\n' +
    'Barbería Uno (sucursal),Barbería,Calle 9,+54 9 261 555 1234,,,30,4.5\n' +
    'Estética Dos,Estética,San Martín 100,,@estetica.dos,,,\n' +
    'Con Web,Óptica,X 1,0261 600-0000,,https://conweb.com.ar,10,4\n' +
    ',,,,,,,\n'
  it('lee CSV con BOM y descarta filas vacías', () => {
    const { columnas, filas } = leerCSV('﻿' + csv)
    expect(columnas[0]).toBe('Nombre')
    expect(filas).toHaveLength(4)
  })
  it('mapea columnas automáticamente', () => {
    const { columnas } = leerCSV(csv)
    const m = autoMapeo(columnas)
    expect(m).toMatchObject({ nombre: 'Nombre', rubro: 'Rubro', direccion: 'Dirección', telefono: 'Teléfono', instagram: 'Instagram',
      web_actual: 'Link que figura como web en Google', resenas: 'Reseñas Google', rating: 'Puntaje' })
  })
  it('deriva instagram y qué tiene hoy, y marca duplicados', () => {
    const { columnas, filas } = leerCSV(csv)
    const ps = aplicarMapeo(filas, autoMapeo(columnas))
    expect(ps[0].instagram).toBe('https://www.instagram.com/uno/')
    expect(ps[0].que_tiene_hoy).toBe('Instagram')
    expect(ps[2].instagram).toBe('https://www.instagram.com/estetica.dos/')
    const r = marcarDuplicados(ps, [{ nombre: 'ESTÉTICA DOS', direccion: 'San Martin 100', telefono: '' }])
    expect(r.map(x => x._estado)).toEqual(['nuevo', 'duplicado', 'duplicado', 'con_web'])
  })
})

describe('plantillas', () => {
  const base = { nombre: 'BARBERÍA DELAROSA GODOY CRUZ', rubro: 'Barbería', telefono: '0261 360-6058', que_tiene_hoy: 'Instagram', instagram: 'x', resenas: 404 }
  it('arma los tres borradores con firma y rubro', () => {
    const b = borradoresPlantilla(base, { nombre: 'Vincenzo', estudio: 'Estudio X' })
    expect(b.whatsapp).toContain('Vincenzo, de Estudio X')
    expect(b.whatsapp).toContain('Instagram')
    expect(b.whatsapp).toContain('turno')
    expect(b.email.asunto.length).toBeGreaterThan(5)
    expect(b.seguimiento.length).toBeLessThan(260)
    expect(b.whatsapp).not.toMatch(/perd|urgente|últim/i) // nunca por el miedo
  })
  it('varía entre prospectos', () => {
    const textos = new Set(['A', 'B', 'C', 'D', 'E', 'F'].map(n => borradoresPlantilla({ ...base, nombre: 'Barbería ' + n, telefono: n }, {}).whatsapp.replace(/Barbería \w/g, '')))
    expect(textos.size).toBeGreaterThan(1)
  })
  it('detecta rubros y acorta nombres', () => {
    expect(claveRubro('Clínica dental')).toBe('odontologia')
    expect(claveRubro('Cabañas / hostería')).toBe('alojamiento')
    expect(nombreCorto('Facundo Sebastianelli - Hairdressers')).toBe('Facundo Sebastianelli')
    expect(nombreCorto('MOUSTACHE BARBER CLUB')).toBe('Moustache Barber Club')
  })
})
