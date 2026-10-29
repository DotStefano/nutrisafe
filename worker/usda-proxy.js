// Intermediario de NutriSafe para USDA FoodData Central (Cloudflare Worker).
// Guarda la clave de USDA como secreto (USDA_KEY), de modo que no aparece en el código público de la app.
// Solo acepta peticiones desde la web de NutriSafe, solo hace búsquedas y guarda en caché cada búsqueda una semana.

const ALLOWED_ORIGINS = ['https://dotstefano.github.io'];
const DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
// Nutrientes que usa la calculadora: energía (kcal y kJ), grasas, saturadas, azúcares, sodio, fibra y proteínas
const NUTRIENTS = new Set(['208', '957', '958', '268', '204', '606', '269', '269.3', '307', '291', '203']);
const CACHE_SECONDS = 7 * 24 * 3600;

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) || (env.ALLOW_LOCALHOST === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return json({ error: 'origin' }, 403, cors);
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/search') return json({ error: 'not_found' }, 404, cors);
    if (!env.USDA_KEY) return json({ error: 'missing_key' }, 500, cors);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400, cors); }
    const query = String((body && body.query) || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100);
    if (query.length < 2) return json({ error: 'short_query' }, 400, cors);

    // Caché por búsqueda: la misma palabra no vuelve a gastar consultas de la clave durante una semana
    const cache = caches.default;
    const cacheKey = new Request('https://nutrisafe-cache.invalid/search?q=' + encodeURIComponent(query));
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v));
      r.headers.set('X-Cache', 'HIT');
      return r;
    }

    const base = env.USDA_BASE || 'https://api.nal.usda.gov';
    let up;
    try {
      up = await fetch(`${base}/fdc/v1/foods/search?api_key=${encodeURIComponent(env.USDA_KEY)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, dataType: DATA_TYPES, pageSize: 50 }),
      });
    } catch (e) { return json({ error: 'upstream' }, 502, cors); }
    if (up.status === 429) return json({ error: 'limit' }, 429, cors);
    if (!up.ok) return json({ error: 'upstream', status: up.status }, 502, cors);

    const data = await up.json();
    // Respuesta reducida: solo los campos y nutrientes que usa la app (unas 20 veces más ligera)
    const foods = (data.foods || []).map(f => ({
      fdcId: f.fdcId, description: f.description, dataType: f.dataType, foodCategory: f.foodCategory,
      foodNutrients: (f.foodNutrients || []).filter(n => NUTRIENTS.has(String(n.nutrientNumber)))
        .map(n => ({ nutrientNumber: String(n.nutrientNumber), value: n.value, unitName: n.unitName })),
    }));
    const res = json({ totalHits: data.totalHits || 0, foods }, 200, { ...cors, 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, 'X-Cache': 'MISS' });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
