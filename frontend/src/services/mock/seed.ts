import type { Level } from '../../types'

/** Pregunta completa "del lado servidor": incluye la respuesta correcta. */
export interface SeedQuestion {
  id: string
  tag: string
  text: string
  code?: string
  options: string[]
  correct: number
  why: string
}

export interface SeedSet {
  id: string
  category: string
  level: Level
  title: string
  blurb: string
  best: string | null
  attempts: number
  questions: SeedQuestion[]
}

export interface SeedPlayer {
  id: string
  name: string
  handle: string
  /** Puntos por set, en el orden de SEED_SETS. */
  points: number[]
  /** Tiempo medio por set (segundos). 0 = no jugado. */
  avg: number[]
  /** Precisión por set (%). 0 = no jugado. */
  acc: number[]
  isMe?: boolean
}

export const SEED_SETS: SeedSet[] = [
  {
    id: 'aws',
    category: 'AWS',
    level: 'Media',
    title: 'AWS Essentials',
    blurb: 'Almacenamiento, red y cómputo: lo que se pregunta en toda entrevista de cloud.',
    best: '820 pts · #12',
    attempts: 641,
    questions: [
      {
        id: 'aws-1',
        tag: 'S3',
        text: '¿Qué servicio de AWS ofrece almacenamiento de objetos con 99,999999999 % de durabilidad?',
        options: ['Amazon EBS', 'Amazon S3', 'Amazon EFS', 'Amazon FSx'],
        correct: 1,
        why: 'S3 replica cada objeto en varias zonas de disponibilidad; EBS y EFS son almacenamiento de bloque y de ficheros.',
      },
      {
        id: 'aws-2',
        tag: 'VPC',
        text: 'En una VPC, ¿qué recurso permite a instancias de una subred privada iniciar conexiones a internet sin aceptar entrantes?',
        options: ['Internet Gateway', 'NAT Gateway', 'VPC Peering', 'Transit Gateway'],
        correct: 1,
        why: 'El NAT Gateway hace salida enmascarada; un Internet Gateway expondría la subred en ambos sentidos.',
      },
      {
        id: 'aws-3',
        tag: 'Lambda',
        text: '¿Cuál es el tiempo máximo de ejecución de una función Lambda?',
        options: ['30 segundos', '5 minutos', '15 minutos', '60 minutos'],
        correct: 2,
        why: '900 segundos. Para cargas más largas: Step Functions, Fargate o Batch.',
      },
      {
        id: 'aws-4',
        tag: 'EC2',
        text: 'Para un job de procesamiento por lotes tolerante a interrupciones, ¿qué modelo de compra sale más barato?',
        options: ['Spot Instances', 'Reserved Instances', 'On-Demand', 'Dedicated Hosts'],
        correct: 0,
        why: 'Spot usa capacidad sobrante hasta un 90 % más barata, a cambio de poder ser reclamada con 2 minutos de aviso.',
      },
      {
        id: 'aws-5',
        tag: 'IAM',
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
    ],
  },
  {
    id: 'js',
    category: 'JavaScript',
    level: 'Difícil',
    title: 'Async y event loop',
    blurb: 'Microtareas, orden de ejecución y las trampas clásicas del runtime.',
    best: '640 pts · #31',
    attempts: 513,
    questions: [
      {
        id: 'js-1',
        tag: 'Event loop',
        text: '¿Qué imprime este fragmento?',
        code: 'console.log("A");\nsetTimeout(() => console.log("B"), 0);\nPromise.resolve().then(() => console.log("C"));\nconsole.log("D");',
        options: ['A B C D', 'A D C B', 'A D B C', 'A C D B'],
        correct: 1,
        why: 'Síncrono primero (A, D), luego la cola de microtareas (C) y por último los macrotasks del timer (B).',
      },
      {
        id: 'js-2',
        tag: 'Tipos',
        text: '¿Cuál es el resultado de typeof NaN?',
        options: ['"number"', '"NaN"', '"undefined"', '"object"'],
        correct: 0,
        why: 'NaN es un valor del tipo Number: representa un número no representable, no la ausencia de número.',
      },
      {
        id: 'js-3',
        tag: 'Promesas',
        text: 'Tres llamadas en paralelo y una falla. ¿Qué método te devuelve el resultado de todas igualmente?',
        options: ['Promise.all', 'Promise.race', 'Promise.allSettled', 'Promise.any'],
        correct: 2,
        why: 'allSettled nunca rechaza: devuelve un array de {status, value|reason} por cada promesa.',
      },
      {
        id: 'js-4',
        tag: 'Colecciones',
        text: '¿Qué devuelve [...new Set([1, 2, 2, 3, 3, 3])].length?',
        options: ['6', '3', '2', '1'],
        correct: 1,
        why: 'Set descarta duplicados por igualdad SameValueZero: quedan 1, 2 y 3.',
      },
      {
        id: 'js-5',
        tag: 'Closures',
        text: '¿Qué imprime el bucle?',
        code: 'for (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}',
        options: ['0 1 2', '3 3 3', '2 2 2', 'undefined ×3'],
        correct: 1,
        why: 'var tiene ámbito de función: los tres callbacks comparten la misma i, que ya vale 3. Con let saldría 0 1 2.',
      },
    ],
  },
  {
    id: 'arch',
    category: 'Arquitectura',
    level: 'Media',
    title: 'Sistemas distribuidos',
    blurb: 'Colas, caché, despliegues y las decisiones que se pagan en producción.',
    best: null,
    attempts: 402,
    questions: [
      {
        id: 'arch-1',
        tag: 'Mensajería',
        text: 'Un consumidor de cola puede recibir el mismo mensaje dos veces. ¿Qué propiedad debe tener el handler?',
        options: ['Idempotencia', 'Atomicidad', 'Linealizabilidad', 'Transaccionalidad'],
        correct: 0,
        why: 'Con entrega at-least-once el handler debe poder ejecutarse varias veces con el mismo efecto final.',
      },
      {
        id: 'arch-2',
        tag: 'CAP',
        text: 'Durante una partición de red, un sistema que sigue aceptando escrituras en ambos lados está eligiendo…',
        options: ['Consistencia', 'Disponibilidad', 'Durabilidad', 'Aislamiento'],
        correct: 1,
        why: 'Es un sistema AP: prioriza responder aunque las réplicas divergan y haya que reconciliar después.',
      },
      {
        id: 'arch-3',
        tag: 'Caché',
        text: '¿Qué patrón de caché escribe en el almacén y deja que la caché se llene en el siguiente fallo de lectura?',
        options: ['Write-through', 'Write-behind', 'Cache-aside', 'Read-replica'],
        correct: 2,
        why: 'Cache-aside (lazy loading): la aplicación consulta la caché, y solo al fallar lee el origen y la puebla.',
      },
      {
        id: 'arch-4',
        tag: 'Despliegue',
        text: 'Quieres poder revertir una release en segundos apuntando el tráfico al entorno anterior. ¿Qué estrategia es?',
        options: ['Rolling update', 'Blue/green', 'Canary', 'Feature flag'],
        correct: 1,
        why: 'Blue/green mantiene dos entornos completos y el rollback es un cambio de enrutado.',
      },
      {
        id: 'arch-5',
        tag: 'Resiliencia',
        text: 'Reintentos simultáneos de miles de clientes tumban el servicio al recuperarse. ¿Qué técnica lo evita?',
        options: ['Backoff exponencial con jitter', 'Reintento inmediato', 'Timeout más largo', 'Más réplicas de lectura'],
        correct: 0,
        why: 'El jitter desincroniza los reintentos y evita la estampida (thundering herd) al restablecerse el servicio.',
      },
    ],
  },
]

export const SEED_PLAYERS: SeedPlayer[] = [
  { id: 'u-lferran', name: 'Lucía Ferrán', handle: '@lferran', points: [1180, 1240, 1090], avg: [4.1, 5.2, 4.8], acc: [96, 92, 90] },
  { id: 'u-dosorio', name: 'Diego Osorio', handle: '@dosorio', points: [1210, 980, 1150], avg: [3.8, 6.4, 5.1], acc: [98, 84, 90] },
  { id: 'u-anabel', name: 'Ana Belmonte', handle: '@anabel', points: [1040, 1190, 1120], avg: [5.4, 4.6, 4.9], acc: [90, 94, 92] },
  { id: 'u-kaoki', name: 'Kenji Aoki', handle: '@kaoki', points: [990, 1130, 1010], avg: [5.9, 5.0, 6.2], acc: [88, 92, 86] },
  { id: 'u-mruiz', name: 'Marta Ruiz', handle: '@mruiz', points: [820, 640, 0], avg: [7.2, 8.1, 0], acc: [80, 68, 0], isMe: true },
  { id: 'u-tiriarte', name: 'Tomás Iriarte', handle: '@tiriarte', points: [960, 890, 1040], avg: [6.1, 6.8, 5.7], acc: [86, 82, 88] },
  { id: 'u-spons', name: 'Sara Pons', handle: '@spons', points: [1090, 1020, 930], avg: [4.9, 5.8, 6.6], acc: [92, 88, 84] },
  { id: 'u-ivanq', name: 'Iván Quesada', handle: '@ivanq', points: [780, 1060, 980], avg: [8.0, 5.3, 6.0], acc: [74, 90, 86] },
  { id: 'u-nhaddad', name: 'Noor Haddad', handle: '@nhaddad', points: [1140, 870, 1070], avg: [4.4, 7.0, 5.5], acc: [94, 80, 88] },
  { id: 'u-pserra', name: 'Pau Serra', handle: '@pserra', points: [900, 950, 860], avg: [6.6, 6.2, 7.1], acc: [84, 86, 80] },
  { id: 'u-evidal', name: 'Elena Vidal', handle: '@evidal', points: [1070, 1010, 1180], avg: [5.1, 5.6, 4.5], acc: [90, 88, 94] },
  { id: 'u-hbernal', name: 'Hugo Bernal', handle: '@hbernal', points: [700, 820, 910], avg: [8.6, 7.4, 6.9], acc: [70, 78, 84] },
]

export const SEED_SCOPES = [
  { id: 'all', label: 'Global' },
  { id: 'aws', label: 'AWS' },
  { id: 'js', label: 'JavaScript' },
  { id: 'arch', label: 'Arquitectura' },
]
