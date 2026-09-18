/**
 * Carga inicial de la tabla.
 *
 * Por defecto carga solo el CONTENIDO real: los sets y sus preguntas. Los
 * jugadores de relleno y sus marcas son datos inventados y solo entran con
 * `--demo`, para tener con quién competir mientras se desarrolla.
 *
 *   npm run seed            -> sets y preguntas
 *   npm run seed -- --demo  -> además, 11 jugadores y sus marcas
 *
 *
 * Reutiliza los mismos datos semilla que usa el repositorio en memoria
 * (`backend/src/repository/memory/seed.ts`) y el mismo mapa de claves
 * (`db/src/keys.ts`), importándolos directamente: Node 22 ejecuta TypeScript,
 * así que no hay que duplicar ni los datos ni las claves.
 *
 *   TABLE_NAME=<tabla> node db/scripts/seed.mjs
 *
 * Sin TABLE_NAME lo busca en la salida del stack de datos.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation'

import {
  SEED_SETS,
  SEED_QUESTIONS,
  SEED_USERS,
  SEED_SCORES,
} from '../../backend/src/repository/memory/seed.ts'
import { keys, gsi1ForScore } from '../src/keys.ts'

const STACK = process.env.DATA_STACK ?? 'QuizArena-taller-Data'
const withDemo = process.argv.includes('--demo')

const tableName = process.env.TABLE_NAME || (await tableFromStack(STACK))
if (!tableName) {
  console.error(`No encuentro la tabla. Pasa TABLE_NAME o despliega ${STACK}.`)
  process.exit(1)
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

const items = [
  ...SEED_SETS.map((set) => ({ ...keys.set(set.id), entity: 'SET', ...set })),

  ...SEED_QUESTIONS.map((question) => ({
    ...keys.question(question.setId, question.id),
    entity: 'QUESTION',
    ...question,
  })),

  // --- Solo con --demo: jugadores inventados ---

  // Cada usuario son dos ítems: el perfil y el puntero desde su email.
  ...(withDemo
    ? SEED_USERS.flatMap((user) => [
        { ...keys.user(user.id), entity: 'USER', ...user },
        { ...keys.email(user.email), entity: 'EMAIL', userId: user.id },
      ])
    : []),

  // Las marcas llevan los atributos del índice: sin ellos no aparecerían en
  // GSI1 y el leaderboard saldría vacío.
  ...(withDemo
    ? SEED_SCORES.map((score) => ({
        ...keys.score(score.setId, score.userId),
        entity: 'SCORE',
        ...score,
        ...gsi1ForScore(score.setId, score.points),
      }))
    : []),
]

console.log(`Cargando ${items.length} ítems en ${tableName}…`)

// BatchWrite admite 25 por llamada.
for (const chunk of chunks(items, 25)) {
  let pending = chunk.map((Item) => ({ PutRequest: { Item } }))

  // BatchWrite puede devolver escrituras sin procesar si se pasa de
  // capacidad: hay que reintentarlas, no darlas por hechas.
  for (let attempt = 0; pending.length > 0 && attempt < 5; attempt++) {
    const { UnprocessedItems } = await doc.send(
      new BatchWriteCommand({ RequestItems: { [tableName]: pending } }),
    )
    pending = UnprocessedItems?.[tableName] ?? []
    if (pending.length > 0) await wait(2 ** attempt * 100)
  }

  if (pending.length > 0) {
    console.error(`Quedaron ${pending.length} ítems sin escribir.`)
    process.exit(1)
  }
}

console.log(
  `Listo: ${SEED_SETS.length} sets y ${SEED_QUESTIONS.length} preguntas` +
    (withDemo ? `, más ${SEED_USERS.length} jugadores de relleno.` : '.'),
)

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
