# db — el modelo de datos

Una tabla única de DynamoDB. Aquí está el porqué de cada decisión; el mapa de
claves ejecutable está en `src/keys.ts` y la implementación en
`src/dynamoRepository.ts`.

```
db/
  src/keys.ts               Cómo se forman PK y SK. La única fuente.
  src/dynamoRepository.ts   QuizRepository sobre DynamoDB.
  scripts/seed.mjs          Carga inicial.
```

## El punto de partida

En DynamoDB el modelo no sale de las entidades: sale de las consultas. El
punto de partida no fue un diagrama, fue la lista de métodos de
`backend/src/repository/index.ts` — 18 patrones de acceso, escritos antes de
tocar la base de datos.

## La tabla

`PK` (partición) + `SK` (ordenación), y un índice.

| PK | SK | Entidad |
| --- | --- | --- |
| `SETS` | `SET#<setId>` | set |
| `SET#<setId>` | `QUESTION#<qid>` | pregunta |
| `USER#<userId>` | `PROFILE` | usuario |
| `EMAIL#<email>` | `USER` | puntero → `userId` |
| `LINK#<token>` | `LINK` | enlace mágico (con TTL) |
| `ATTEMPT#<id>` | `META` | intento, con sus respuestas dentro |
| `SCORES#<setId>` | `USER#<userId>` | mejor marca |

**GSI1** — `GSI1PK = SCORES#<setId>`, `GSI1SK = points` (número).

Fíjate en las dos primeras filas: los **sets** cuelgan de una partición fija
`SETS`, y las **preguntas** de la partición de su set. Así `listSets` y
`listQuestions` son cada una una Query sobre una partición, y no hace falta
ningún Scan.

## Cada patrón, su operación

| # | Método | Operación | Nota |
| --- | --- | --- | --- |
| 1 | `getUser` | GetItem | |
| 2 | `findUserByEmail` | GetItem × 2 | vía el ítem puntero |
| 3 | `createUser` | **TransactWrite** | perfil + puntero, o ninguno |
| 4 | `saveMagicLink` | PutItem | con TTL |
| 5 | `consumeMagicLink` | **UpdateItem condicionado** | de un solo uso, atómico |
| 6 | `listSets` | Query `PK=SETS` | |
| 7 | `getSet` | GetItem | |
| 8 | `incrementSetAttempts` | UpdateItem `ADD` | suma en el servidor |
| 9 | `listQuestions` | Query `PK=SET#<id>` | |
| 10 | `getQuestion` | GetItem | |
| 11 | `addQuestion` | PutItem | |
| 12 | `createAttempt` | PutItem | |
| 13 | `getAttempt` | GetItem | |
| 14 | `appendAnswer` | UpdateItem `list_append` | sin leer-modificar-escribir |
| 15 | `finishAttempt` | UpdateItem `if_not_exists` | idempotente |
| 16 | `listScores` | Query **GSI1** | ordenado por puntos |
| 17 | `getScore` | GetItem | |
| 18 | `saveBestScore` | **UpdateItem condicionado** | solo si mejora |

Ni un Scan en toda la aplicación.

## Las cinco decisiones que importan

### 1. Por qué hay un GSI

En la tabla base, la sort key de una marca es el usuario: `SCORES#aws` +
`USER#u-123`. Perfecto para «dame la marca de este usuario», inútil para «dame
las mejores marcas», porque DynamoDB solo sabe ordenar por la clave de
ordenación, nunca por un atributo suelto.

El índice reordena los mismos datos por puntuación. Es el motivo canónico para
crear un GSI: **una segunda forma de ordenar lo que ya tienes**.

### 2. El email no es la clave, y aun así no hay índice para él

El usuario se identifica por `id`, pero al entrar solo tenemos el correo. En
lugar de un GSI sobre `email`, hay un ítem puntero `EMAIL#<email> → userId`.

Son dos GetItem en vez de una Query sobre un índice — y a cambio, ese ítem es
lo que permite **garantizar que un email es único**: `createUser` lo escribe en
una transacción con `attribute_not_exists`, así que dos altas simultáneas del
mismo correo no pueden ganar las dos. Con un GSI eso no se puede: los índices
son eventualmente consistentes y no admiten condiciones.

### 3. Las condiciones sustituyen a los `if`

Tres operaciones tienen que ser correctas aunque lleguen a la vez:

```
consumeMagicLink   ConditionExpression: attribute_not_exists(consumedAt)
                                        AND expiresAtEpoch > :ahora
finishAttempt      SET finishedAt = if_not_exists(finishedAt, :ahora)
saveBestScore      ConditionExpression: attribute_not_exists(points)
                                        OR points < :nuevo
```

Leer, comprobar en el código y escribir deja una ventana en la que otra
petición se cuela. La condición viaja con la escritura y la evalúa DynamoDB:
no hay ventana. Que la condición falle no es un error — es la condición
funcionando, y el código lo trata como tal.

La caducidad se comprueba **además** del TTL porque el borrado por TTL es
perezoso: puede tardar hasta 48 horas, así que un enlace caducado sigue ahí.
El TTL es para no pagar basura acumulada, no para la lógica.

### 4. Las respuestas van dentro del intento

Son cinco, se leen siempre juntas y nunca por separado: meterlas en el ítem
del intento hace que la partida entera sea una sola lectura. `list_append` las
añade en el servidor, así que dos respuestas simultáneas no se pisan.

El límite es el tamaño de ítem, 400 KB. Con cinco respuestas sobra; si un set
tuviera cientos de preguntas, tocaría sacarlas a ítems hijos.

### 5. El leaderboard global se agrega en la Lambda, en dos tiempos

El ámbito global es la **suma** de las marcas de los tres sets, y DynamoDB no
suma. Se resuelve leyendo las marcas y agregando en
`backend/src/domain/leaderboard.ts`.

Es correcto con estos volúmenes y **deja de serlo** cuando las marcas no quepan
cómodamente en memoria. Cuando llegue ese día, el patrón es mantener un ítem
`TOTAL` por usuario que se actualiza con el incremento en cada partida y que el
índice ordena — una vista materializada: coste constante a cambio de estado
duplicado que puede descuadrarse.

Esa frontera es el ejercicio interesante: **hasta aquí llega lo simple**.

Y hay una separación que sí hubo que hacer ya. Ordenar las marcas solo necesita
números; poner nombres exige leer una ficha por jugador. Al juntarlo todo,
responder «¿en qué puesto voy?» leía los 852 perfiles de la tabla, y `/me`
—que se llama antes de pintar nada— tardaba cuatro segundos de media.

Ahora `rankScores` ordena sin tocar los perfiles, y solo se resuelven los
nombres de las filas que se van a enseñar, con un `BatchGetItem`. La misma
respuesta, de cientos de lecturas a dos.

## Lo que se dejó a medias a propósito

- **`listScores` sin `setId` hace una Query por set.** Con tres sets son tres
  Queries en paralelo. Con trescientos, no.
- **El puesto global se recalcula en cada petición.** Con 800 marcas son cuatro
  Queries; el día que no quepan cómodamente en memoria toca el ítem de totales
  mantenido al escribir.
- **`listQuestions` ordena en memoria.** La sort key es `QUESTION#<id>` para
  que `getQuestion` sea un GetItem directo, y eso ordena por id, no por fecha.
  Con decenas de preguntas por set, ordenar al vuelo sale más barato que la
  lectura extra de meter la fecha en la clave.

## Carga inicial

```bash
npm run seed
```

Reutiliza los mismos datos que el repositorio en memoria y el mismo mapa de
claves, importando los ficheros TypeScript directamente. Nada duplicado.
Busca la tabla en la salida del stack de datos; con `TABLE_NAME=<tabla>` se le
puede indicar otra.

## Cambiar de almacén

`REPOSITORY=memory` o `REPOSITORY=dynamodb`, en
`backend/src/repository/factory.ts`. Ningún handler distingue una cosa de la
otra.
