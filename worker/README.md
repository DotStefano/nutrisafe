# Intermediario de USDA FoodData Central

La búsqueda de alimentos de la pestaña Nutri-Score usa la API de USDA, que necesita una clave.
Si la clave va dentro de la app, cualquiera puede leerla en el código público y gastar su límite.
Este pequeño servidor (un *Worker* de Cloudflare, gratuito) guarda la clave como secreto y hace la búsqueda en nombre de la app.

Qué hace `usda-proxy.js`:

- Solo acepta peticiones desde `https://dotstefano.github.io` (otras webs reciben un error 403).
- Solo permite buscar (`POST /search` con `{"query": "..."}`); nada más de la API.
- Guarda cada búsqueda en caché una semana: la misma palabra no gasta consultas de la clave.
- Devuelve solo los campos y nutrientes que usa la app (respuesta unas 20 veces más ligera).

## Publicarlo desde el panel de Cloudflare (sin instalar nada)

1. Pide una clave nueva de USDA en https://api.data.gov/signup/ (la anterior ya es pública en el historial de GitHub).
2. Crea una cuenta gratuita en https://dash.cloudflare.com/sign-up.
3. En el panel: **Compute (Workers)** → **Workers & Pages** → **Create** → **Create Worker**, llámalo `nutrisafe-usda` y pulsa **Deploy**.
4. Pulsa **Edit code**, borra el código de ejemplo, pega el contenido de `usda-proxy.js` y pulsa **Deploy**.
5. En **Settings** → **Variables and Secrets** → **Add**: tipo **Secret**, nombre `USDA_KEY`, valor = tu clave nueva. Guarda.
6. Copia la dirección del Worker (algo como `https://nutrisafe-usda.TU-NOMBRE.workers.dev`) y pon esa dirección en `USDA_PROXY` en `template.html`.

## O con la línea de comandos

```sh
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put USDA_KEY
```
