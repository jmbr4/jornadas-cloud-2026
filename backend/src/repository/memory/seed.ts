import type { QuestionRecord, ScoreRecord, SetRecord, UserRecord } from '../../domain/types.js'

/**
 * Datos de arranque. Son los mismos del diseño, pero aquí viven del lado del
 * servidor: fíjate en que `correct` y `why` están en este fichero y no en el
 * frontend. Esa es la diferencia entre la demo y la aplicación real.
 */

const now = '2026-01-01T00:00:00.000Z'

export const SEED_SETS: SetRecord[] = [
  {
    id: 'aws',
    order: 1,
    category: 'AWS',
    level: 'Media',
    title: 'AWS Essentials',
    blurb: 'Almacenamiento, red y cómputo: lo que se pregunta en toda entrevista de cloud.',
    secondsPerQuestion: 20,
    status: 'Publicado',
    attempts: 0,
  },
  {
    id: 'js',
    order: 2,
    category: 'JavaScript',
    level: 'Difícil',
    title: 'Async y event loop',
    blurb: 'Microtareas, orden de ejecución y las trampas clásicas del runtime.',
    secondsPerQuestion: 20,
    status: 'Publicado',
    attempts: 0,
  },
  {
    id: 'arch',
    order: 3,
    category: 'Arquitectura',
    level: 'Media',
    title: 'Sistemas distribuidos',
    blurb: 'Colas, caché, despliegues y las decisiones que se pagan en producción.',
    secondsPerQuestion: 20,
    status: 'Publicado',
    attempts: 0,
  },
]

export const SEED_QUESTIONS: QuestionRecord[] = [
  {
    id: 'aws-1', setId: 'aws', tag: 'S3', createdAt: now,
    text: '¿Qué servicio de AWS ofrece almacenamiento de objetos con 99,999999999 % de durabilidad?',
    options: ['Amazon EBS', 'Amazon S3', 'Amazon EFS', 'Amazon FSx'],
    correct: 1,
    why: 'S3 replica cada objeto en varias zonas de disponibilidad; EBS y EFS son almacenamiento de bloque y de ficheros.',
  },
  {
    id: 'aws-2', setId: 'aws', tag: 'VPC', createdAt: now,
    text: 'En una VPC, ¿qué recurso permite a instancias de una subred privada iniciar conexiones a internet sin aceptar entrantes?',
    options: ['Internet Gateway', 'NAT Gateway', 'VPC Peering', 'Transit Gateway'],
    correct: 1,
    why: 'El NAT Gateway hace salida enmascarada; un Internet Gateway expondría la subred en ambos sentidos.',
  },
  {
    id: 'aws-3', setId: 'aws', tag: 'Lambda', createdAt: now,
    text: '¿Cuál es el tiempo máximo de ejecución de una función Lambda?',
    options: ['30 segundos', '5 minutos', '15 minutos', '60 minutos'],
    correct: 2,
    why: '900 segundos. Para cargas más largas: Step Functions, Fargate o Batch.',
  },
  {
    id: 'aws-4', setId: 'aws', tag: 'EC2', createdAt: now,
    text: 'Para un job de procesamiento por lotes tolerante a interrupciones, ¿qué modelo de compra sale más barato?',
    options: ['Spot Instances', 'Reserved Instances', 'On-Demand', 'Dedicated Hosts'],
    correct: 0,
    why: 'Spot usa capacidad sobrante hasta un 90 % más barata, a cambio de poder ser reclamada con 2 minutos de aviso.',
  },
  {
    id: 'aws-5', setId: 'aws', tag: 'IAM', createdAt: now,
    text: 'Dada esta política adjunta al rol, ¿qué ocurre al hacer s3:DeleteObject sobre logs/enero.json?',
    code: '{\n  "Version": "2012-10-17",\n  "Statement": [\n    { "Effect": "Allow", "Action": "s3:*", "Resource": "arn:aws:s3:::acme/*" },\n    { "Effect": "Deny",  "Action": "s3:Delete*", "Resource": "arn:aws:s3:::acme/logs/*" }\n  ]\n}',
    options: [
      'Se permite: el Allow es más específico',
      'Se deniega: un Deny explícito siempre gana',
      'Depende del orden de los statements',
      'Error de evaluación por conflicto',
    ],
    correct: 1,
    why: 'En IAM un Deny explícito prevalece sobre cualquier Allow, sin importar el orden ni la especificidad.',
  },

  {
    id: 'js-1', setId: 'js', tag: 'Event loop', createdAt: now,
    text: '¿Qué imprime este fragmento?',
    code: 'console.log("A");\nsetTimeout(() => console.log("B"), 0);\nPromise.resolve().then(() => console.log("C"));\nconsole.log("D");',
    options: ['A B C D', 'A D C B', 'A D B C', 'A C D B'],
    correct: 1,
    why: 'Síncrono primero (A, D), luego la cola de microtareas (C) y por último los macrotasks del timer (B).',
  },
  {
    id: 'js-2', setId: 'js', tag: 'Tipos', createdAt: now,
    text: '¿Cuál es el resultado de typeof NaN?',
    options: ['"number"', '"NaN"', '"undefined"', '"object"'],
    correct: 0,
    why: 'NaN es un valor del tipo Number: representa un número no representable, no la ausencia de número.',
  },
  {
    id: 'js-3', setId: 'js', tag: 'Promesas', createdAt: now,
    text: 'Tres llamadas en paralelo y una falla. ¿Qué método te devuelve el resultado de todas igualmente?',
    options: ['Promise.all', 'Promise.race', 'Promise.allSettled', 'Promise.any'],
    correct: 2,
    why: 'allSettled nunca rechaza: devuelve un array de {status, value|reason} por cada promesa.',
  },
  {
    id: 'js-4', setId: 'js', tag: 'Colecciones', createdAt: now,
    text: '¿Qué devuelve [...new Set([1, 2, 2, 3, 3, 3])].length?',
    options: ['6', '3', '2', '1'],
    correct: 1,
    why: 'Set descarta duplicados por igualdad SameValueZero: quedan 1, 2 y 3.',
  },
  {
    id: 'js-5', setId: 'js', tag: 'Closures', createdAt: now,
    text: '¿Qué imprime el bucle?',
    code: 'for (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}',
    options: ['0 1 2', '3 3 3', '2 2 2', 'undefined ×3'],
    correct: 1,
    why: 'var tiene ámbito de función: los tres callbacks comparten la misma i, que ya vale 3. Con let saldría 0 1 2.',
  },

  {
    id: 'arch-1', setId: 'arch', tag: 'Mensajería', createdAt: now,
    text: 'Un consumidor de cola puede recibir el mismo mensaje dos veces. ¿Qué propiedad debe tener el handler?',
    options: ['Idempotencia', 'Atomicidad', 'Linealizabilidad', 'Transaccionalidad'],
    correct: 0,
    why: 'Con entrega at-least-once el handler debe poder ejecutarse varias veces con el mismo efecto final.',
  },
  {
    id: 'arch-2', setId: 'arch', tag: 'CAP', createdAt: now,
    text: 'Durante una partición de red, un sistema que sigue aceptando escrituras en ambos lados está eligiendo…',
    options: ['Consistencia', 'Disponibilidad', 'Durabilidad', 'Aislamiento'],
    correct: 1,
    why: 'Es un sistema AP: prioriza responder aunque las réplicas divergan y haya que reconciliar después.',
  },
  {
    id: 'arch-3', setId: 'arch', tag: 'Caché', createdAt: now,
    text: '¿Qué patrón de caché escribe en el almacén y deja que la caché se llene en el siguiente fallo de lectura?',
    options: ['Write-through', 'Write-behind', 'Cache-aside', 'Read-replica'],
    correct: 2,
    why: 'Cache-aside (lazy loading): la aplicación consulta la caché, y solo al fallar lee el origen y la puebla.',
  },
  {
    id: 'arch-4', setId: 'arch', tag: 'Despliegue', createdAt: now,
    text: 'Quieres poder revertir una release en segundos apuntando el tráfico al entorno anterior. ¿Qué estrategia es?',
    options: ['Rolling update', 'Blue/green', 'Canary', 'Feature flag'],
    correct: 1,
    why: 'Blue/green mantiene dos entornos completos y el rollback es un cambio de enrutado.',
  },
  {
    id: 'arch-5', setId: 'arch', tag: 'Resiliencia', createdAt: now,
    text: 'Reintentos simultáneos de miles de clientes tumban el servicio al recuperarse. ¿Qué técnica lo evita?',
    options: ['Backoff exponencial con jitter', 'Reintento inmediato', 'Timeout más largo', 'Más réplicas de lectura'],
    correct: 0,
    why: 'El jitter desincroniza los reintentos y evita la estampida (thundering herd) al restablecerse el servicio.',
  },
]

/**
 * Jugadores de relleno.
 *
 * Son inventados: sirven para que el leaderboard tenga con quién competir
 * mientras se desarrolla. En la base de datos real solo entran si se pide
 * explícitamente (`npm run seed -- --demo`).
 */
const RIVALS: [string, string, number[], number[], number[]][] = [
  ['Lucía Ferrán', '@lferran', [1180, 1240, 1090], [4.1, 5.2, 4.8], [96, 92, 90]],
  ['Diego Osorio', '@dosorio', [1210, 980, 1150], [3.8, 6.4, 5.1], [98, 84, 90]],
  ['Ana Belmonte', '@anabel', [1040, 1190, 1120], [5.4, 4.6, 4.9], [90, 94, 92]],
  ['Kenji Aoki', '@kaoki', [990, 1130, 1010], [5.9, 5.0, 6.2], [88, 92, 86]],
  ['Tomás Iriarte', '@tiriarte', [960, 890, 1040], [6.1, 6.8, 5.7], [86, 82, 88]],
  ['Sara Pons', '@spons', [1090, 1020, 930], [4.9, 5.8, 6.6], [92, 88, 84]],
  ['Iván Quesada', '@ivanq', [780, 1060, 980], [8.0, 5.3, 6.0], [74, 90, 86]],
  ['Noor Haddad', '@nhaddad', [1140, 870, 1070], [4.4, 7.0, 5.5], [94, 80, 88]],
  ['Pau Serra', '@pserra', [900, 950, 860], [6.6, 6.2, 7.1], [84, 86, 80]],
  ['Elena Vidal', '@evidal', [1070, 1010, 1180], [5.1, 5.6, 4.5], [90, 88, 94]],
  ['Hugo Bernal', '@hbernal', [700, 820, 910], [8.6, 7.4, 6.9], [70, 78, 84]],
]

export const SEED_USERS: UserRecord[] = RIVALS.map(([name, handle]) => ({
  id: `u-${handle.slice(1)}`,
  email: `${handle.slice(1)}@quizarena.dev`,
  name,
  handle,
  createdAt: now,
}))

export const SEED_SCORES: ScoreRecord[] = RIVALS.flatMap(([, handle, points, avg, acc]) =>
  SEED_SETS.flatMap((set, i) =>
    (points[i] ?? 0) > 0
      ? [
          {
            userId: `u-${handle.slice(1)}`,
            setId: set.id,
            points: points[i] as number,
            averageSeconds: avg[i] as number,
            accuracy: acc[i] as number,
            updatedAt: now,
          },
        ]
      : [],
  ),
)
