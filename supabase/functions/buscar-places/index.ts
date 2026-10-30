// Busca negocios en Google Places API (New) por rubro + zona y marca cuáles NO
// tienen web propia (web vacía, o Instagram/Facebook/Fresha/AgendaPro/directorio...).
// Devuelve candidatos para revisar; NO los guarda: el usuario elige cuáles importar.
// Usa la API oficial (no scraping). La key va como secreto: GOOGLE_PLACES_API_KEY.
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { clasificarWeb, instagramDe } from '../_shared/clasificar.js'

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.googleMapsUri', 'places.businessStatus',
  'places.rating', 'places.userRatingCount', 'places.primaryTypeDisplayName', 'nextPageToken',
].join(',')

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    await clienteDelUsuario(req) // sólo usuarios logueados
    const key = await claveServicio('google_places')
    if (!key) return json({ error: 'Falta la clave de Google Places (GOOGLE_PLACES_API_KEY): cargala en Super admin → Claves.' }, 400)

    const { rubro, zona, paginas = 1, min_resenas = 0, incluir_con_web = false } = await req.json()
    if (!rubro || !zona) return json({ error: 'Indicá rubro y zona' }, 400)

    const resultados = []
    let pageToken: string | undefined
    let llamadas = 0
    for (let i = 0; i < Math.min(Number(paginas) || 1, 3); i++) {
      const body: Record<string, unknown> = { textQuery: `${rubro} en ${zona}`, languageCode: 'es', regionCode: 'AR', pageSize: 20 }
      if (pageToken) body.pageToken = pageToken
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify(body),
      })
      llamadas++
      if (!r.ok) return json({ error: `Google Places ${r.status}: ${(await r.text()).slice(0, 300)}` }, 502)
      const data = await r.json()
      for (const p of data.places ?? []) {
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue
        if ((p.userRatingCount ?? 0) < min_resenas) continue
        const web = p.websiteUri ?? ''
        const { esProspecto, queTiene } = clasificarWeb(web)
        if (!esProspecto && !incluir_con_web) continue
        resultados.push({
          place_id: p.id,
          nombre: p.displayName?.text ?? '',
          rubro: p.primaryTypeDisplayName?.text || rubro,
          zona,
          direccion: p.formattedAddress ?? '',
          telefono: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? '',
          instagram: instagramDe(web),
          que_tiene_hoy: queTiene,
          web_actual: queTiene === 'Sin web' ? '' : web,
          rating: p.rating ?? null,
          resenas: p.userRatingCount ?? null,
          google_maps_url: p.googleMapsUri ?? '',
          es_prospecto: esProspecto,
        })
      }
      pageToken = data.nextPageToken
      if (!pageToken) break
      await new Promise(r => setTimeout(r, 1500)) // el token tarda en activarse
    }
    return json({ resultados, llamadas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, msg === 'NO_AUTH' ? 401 : 500)
  }
})
