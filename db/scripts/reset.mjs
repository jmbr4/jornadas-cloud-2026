/**
 * Limpieza de la tabla.
 *
 * Por defecto borra las PERSONAS y todo lo suyo — usuarios, punteros de email,
 * enlaces pendientes, partidas y marcas — y pone a cero los contadores de
 * intentos de cada set. Conserva el contenido: los sets y sus preguntas.
 *
 *   npm run db:reset             -> deja el contenido, borra a la gente
 *   npm run db:reset -- --all    -> vacía la tabla entera
 *   npm run db:reset -- --dry    -> solo dice qué borraría
 *
 * Pide confirmación salvo que se pase --yes.
 */
import { createInterface } from 'node:readline/promises'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation'

const STACK = process.env.DATA_STACK ?? 'QuizArena-taller-Data'
const all = process.argv.includes('--all')
const dry = process.argv.includes('--dry')
const assumeYes = process.argv.includes('--yes')

/** Lo que se considera "gente y su actividad". */
const PEOPLE = new Set(['USER', 'EMAIL', 'LINK', 'ATTEMPT', 'SCORE'])

const tableName = process.env.TABLE_NAME || (await tableFromStack(STACK))
if (!tableName) {
  console.error(`No encuentro la tabla. Pasa TABLE_NAME o despliega ${STACK}.`)
  process.exit(1)
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}))

// Un Scan es lo correcto aquí: hay que recorrer la tabla entera precisamente
// porque el criterio no es una clave. Es una tarea de mantenimiento, no una
// consulta de la aplicación.
const items = []
let cursor
do {
  const page = await doc.send(
    new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'PK, SK, entity',
      ExclusiveStartKey: cursor,
    }),
  )
  items.push(...(page.Items ?? []))
  cursor = page.LastEvaluatedKey
} while (cursor)

const doomed = all ? items : items.filter((item) => PEOPLE.has(item.entity))
const kept = items.length - doomed.length

const byEntity = doomed.reduce((acc, item) => {
  acc[item.entity ?? '?'] = (acc[item.entity ?? '?'] ?? 0) + 1
  return acc
}, {})

console.log(`Tabla: ${tableName}`)
console.log(`Se borrarían ${doomed.length} ítems (se conservan ${kept}):`)
for (const [entity, n] of Object.entries(byEntity).sort()) {
  console.log(`  ${entity.padEnd(10)} ${n}`)
}
if (!all) console.log('  + los contadores de intentos de cada set vuelven a 0')

if (dry) process.exit(0)
if (doomed.length === 0) {
  console.log('Nada que borrar.')
  process.exit(0)
}

if (!assumeYes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('\n¿Seguir? Esto no se puede deshacer [escribe "si"]: ')
  rl.close()
  if (answer.trim().toLowerCase() !== 'si') {
    console.log('Cancelado.')
    process.exit(0)
  }
}

for (const chunk of chunks(doomed, 25)) {
  let pending = chunk.map((item) => ({ DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } }))
  for (let attempt = 0; pending.length > 0 && attempt < 5; attempt++) {
    const { UnprocessedItems } = await doc.send(
      new BatchWriteCommand({ RequestItems: { [tableName]: pending } }),
    )
    pending = UnprocessedItems?.[tableName] ?? []
  }
  if (pending.length > 0) {
    console.error(`Quedaron ${pending.length} ítems sin borrar.`)
    process.exit(1)
  }
}

if (!all) {
  const sets = items.filter((item) => item.entity === 'SET')
  await Promise.all(
    sets.map((set) =>
      doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: set.PK, SK: set.SK },
          UpdateExpression: 'SET attempts = :zero',
          ExpressionAttributeValues: { ':zero': 0 },
        }),
      ),
    ),
  )
  console.log(`Contadores de ${sets.length} sets puestos a 0.`)
}

console.log(`Borrados ${doomed.length} ítems.`)

async function tableFromStack(stackName) {
  try {
    const cfn = new CloudFormationClient({})
    const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: stackName }))
    return Stacks?.[0]?.Outputs?.find((o) => o.OutputKey?.startsWith('TableName'))?.OutputValue
  } catch {
    return undefined
  }
}

function* chunks(list, size) {
  for (let i = 0; i < list.length; i += size) yield list.slice(i, i + size)
}
