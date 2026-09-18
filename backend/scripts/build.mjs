/**
 * Empaqueta cada handler en su propio bundle, listo para subir a Lambda.
 *
 *   dist/functions/<nombre>/index.mjs   -> handler = "index.handler"
 *   dist/local/handlers.mjs             -> bundle único para el servidor local
 *
 * El bundle local mete todos los handlers en un mismo grafo de módulos, así
 * comparten la instancia de MemoryRepository. En AWS cada función es un
 * proceso aparte y NO comparten memoria: por eso hace falta una base de datos.
 */
import { readFile, rm, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import * as esbuild from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { functions } = JSON.parse(await readFile(join(root, 'functions.json'), 'utf8'))

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Sin minificar: estos bundles se leen en clase, y además hace que las
  // trazas de CloudWatch ya sean legibles sin sourcemap.
  minify: false,
  logLevel: 'warning',
  // El AWS SDK v3 se publica en CommonJS y usa require() por dentro. Al
  // empaquetarlo como ESM, esbuild sustituye ese require por un error
  // ("Dynamic require of node:https is not supported") que solo aparece al
  // ejecutar en Lambda. El banner reconstruye un require real a partir de
  // import.meta.url, que es la forma estándar de mezclar ambos mundos.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
}

await rm(join(root, 'dist'), { recursive: true, force: true })
await mkdir(join(root, 'dist'), { recursive: true })

// --- Un bundle por función ---
await Promise.all(
  functions.map((fn) =>
    esbuild.build({
      ...shared,
      entryPoints: [join(root, fn.entry)],
      outfile: join(root, 'dist/functions', fn.name, 'index.mjs'),
      // Sin sourcemap: pesaría más que el propio bundle y Lambda solo lo usa
      // con --enable-source-maps, que cuesta arranque en frío en cada llamada.
      sourcemap: false,
    }),
  ),
)

// --- Bundle único para el servidor local ---
const barrel = functions
  .map((fn) => `export { handler as ${camel(fn.name)} } from '${toImport(fn.entry)}'`)
  .join('\n')

await esbuild.build({
  ...shared,
  stdin: { contents: barrel, resolveDir: root, sourcefile: 'handlers.ts', loader: 'ts' },
  outfile: join(root, 'dist/local/handlers.mjs'),
  // En local sí interesa, para depurar contra el fuente.
  sourcemap: true,
})

console.log(`Empaquetadas ${functions.length} funciones en backend/dist/functions/`)

function camel(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function toImport(entry) {
  return './' + entry.replace(/\.ts$/, '.js')
}
