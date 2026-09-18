/**
 * Servidor local que imita a API Gateway (HTTP API, payload 2.0).
 *
 * Traduce cada petición HTTP a un evento de Lambda, llama al handler que toca
 * y devuelve su respuesta. Sirve para probar el backend entero sin desplegar
 * nada — y para ver, al lado, qué parte del trabajo hace API Gateway.
 *
 *   npm run build && npm run local
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { functions } = JSON.parse(await readFile(join(root, 'functions.json'), 'utf8'))

let handlers
try {
  handlers = await import(join(root, 'dist/local/handlers.mjs'))
} catch {
  console.error('Falta el bundle local. Ejecuta primero: npm run build')
  process.exit(1)
}

const port = Number(process.env.PORT ?? 3000)

const routes = functions.map((fn) => ({
  ...fn,
  handler: handlers[fn.name.replace(/-([a-z])/g, (_, l) => l.toUpperCase())],
  matcher: toMatcher(fn.path),
}))

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`)

  // CORS: en AWS lo resuelve API Gateway (o no hace falta, si la API va
  // detrás de la misma distribución de CloudFront que el frontend).
  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-headers', 'authorization,content-type')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  if (request.method === 'OPTIONS') return end(response, 204, null)

  const match = routes
    .map((route) => ({ route, params: route.matcher(request.method, url.pathname) }))
    .find(({ params }) => params !== null)

  if (!match) return end(response, 404, { message: `Sin ruta para ${request.method} ${url.pathname}` })

  const body = await readBody(request)
  const event = {
    version: '2.0',
    routeKey: `${match.route.method} ${match.route.path}`,
    rawPath: url.pathname,
    rawQueryString: url.searchParams.toString(),
    headers: Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value.join(',') : (value ?? ''),
      ]),
    ),
    queryStringParameters: Object.fromEntries(url.searchParams),
    pathParameters: match.params,
    body: body || undefined,
    isBase64Encoded: false,
    requestContext: {
      requestId: randomUUID(),
      http: { method: request.method, path: url.pathname },
    },
  }

  try {
    const result = await match.route.handler(event)
    response.writeHead(result.statusCode ?? 200, result.headers ?? {})
    response.end(result.body ?? '')
  } catch (error) {
    console.error(error)
    end(response, 500, { message: 'Error interno.' })
  }
}).listen(port, () => {
  console.log(`API local en http://localhost:${port}`)
  for (const route of routes) console.log(`  ${route.method.padEnd(4)} ${route.path}`)
})

/** "/sets/{setId}/attempts" -> función que extrae { setId } si la ruta encaja. */
function toMatcher(path) {
  const names = []
  const pattern = new RegExp(
    '^' +
      path.replace(/\{([^}]+)\}/g, (_, name) => {
        names.push(name)
        return '([^/]+)'
      }) +
      '$',
  )

  return (method, pathname) => {
    const found = pattern.exec(pathname)
    if (!found) return null
    return Object.fromEntries(names.map((name, i) => [name, found[i + 1]]))
  }
}

function readBody(request) {
  return new Promise((resolve) => {
    let data = ''
    request.on('data', (chunk) => (data += chunk))
    request.on('end', () => resolve(data))
  })
}

function end(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(payload === null ? '' : JSON.stringify(payload))
}
