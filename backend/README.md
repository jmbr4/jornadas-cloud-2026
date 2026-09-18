# backend — Lambdas de Quiz Arena

Once funciones Lambda en TypeScript detrás de API Gateway (HTTP API,
payload 2.0). Sin dependencias de runtime: todo lo que hace falta está en el
runtime de Node de Lambda.

## Arrancar en local

El proyecto tiene un único `package.json`, en la raíz. Desde allí:

```bash
npm install
npm run dev:api    # empaqueta y levanta la API en http://localhost:3000
npm run build:api  # solo empaquetar
npm run typecheck  # comprueba backend y frontend a la vez
```

`scripts/local.mjs` imita a API Gateway: traduce cada petición HTTP al evento
de Lambda y llama al handler. Sirve para probar el backend entero sin desplegar
nada y para ver, al lado, qué parte del trabajo hace API Gateway.

Lee el `.env` de la raíz (vía `node --env-file-if-exists`), el mismo del que
sale la configuración del frontend. Para que el frontend hable con esta API:

```
VITE_API_BASE_URL=http://localhost:3000
```

## Rutas

| Método | Ruta | Función | Sesión |
| --- | --- | --- | --- |
| POST | `/auth/magic-link` | `auth-magic-link` | no |
| POST | `/auth/verify` | `auth-verify` | no |
| GET | `/me` | `me` | sí |
| GET | `/sets` | `sets-list` | sí |
| POST | `/sets/{setId}/questions` | `sets-create-question` | sí |
| POST | `/sets/{setId}/attempts` | `attempts-start` | sí |
| POST | `/attempts/{attemptId}/answers` | `attempts-answer` | sí |
| POST | `/attempts/{attemptId}/finish` | `attempts-finish` | sí |
| GET | `/leaderboard?scope=all\|{setId}` | `leaderboard-get` | sí |

La lista viva está en `functions.json`, que consume el build y consumirá la
plantilla de infraestructura.

## Estructura

```
src/
  domain/       Lógica pura, sin E/S: tipos, puntuación, clasificación.
  lib/          Cimientos: config, respuestas HTTP, sesiones, log, métricas.
  repository/   EL PUERTO de persistencia + la implementación en memoria.
  services/     Operaciones que combinan repositorio y dominio.
  handlers/     Un fichero por ruta. Solo validan, orquestan y responden.
scripts/        Empaquetado (esbuild) y servidor local.
functions.json  Ruta -> función -> fichero de entrada.
```

La regla: los handlers no saben de base de datos y el dominio no sabe de HTTP.

## Decisiones que conviene no deshacer

**Nada público se deriva del correo.** El nombre y el handle los elige la
persona la primera vez que entra (`POST /me/profile`). Sacarlos de la dirección
—`marta.ruiz@…` → `@martaruiz`— publicaría en el leaderboard quién es cada
uno. Cuando alguien aún no ha elegido, aparece como «Sin nombre»; nunca se cae
de vuelta al correo.

El handle es único, y lo garantiza el mismo mecanismo que el correo: un ítem
puntero escrito en una transacción con `attribute_not_exists`. Se normaliza a
minúsculas sin acentos antes de comparar, así que `MartaR` y `martar` no pueden
coexistir.

**Las preguntas viajan sin la respuesta correcta.** `QuestionRecord` tiene
`correct` y `why`; `Question` no. Todo lo que sale hacia el navegador pasa por
`toPublicQuestion`, que los quita. Si se devolviera la pregunta entera, el quiz
se resolvería desde las herramientas de desarrollo.

**Los puntos los calcula el servidor.** `domain/scoring.ts` es la única fuente.
El cliente manda qué eligió y cuánto tardó, y su tiempo se acota con el que ha
medido el propio servidor.

> Limitación conocida: el tope está cerrado por arriba, no por abajo. Como las
> preguntas se entregan todas al empezar la partida, un cliente manipulado
> puede declarar 0 segundos y llevarse el bonus máximo. Cerrarlo exige que el
> servidor sepa cuándo empieza cada pregunta. Está anotado en
> `handlers/attempts/answer.ts`.

**La administración la decide el servidor.** `requireAdmin` compara el correo
del token de sesión contra la lista que guarda Secrets Manager, y el token va
firmado con HMAC: si
se cambia el correo dentro, la firma deja de cuadrar y la sesión se rechaza.
El `isAdmin` que recibe el navegador sale de ahí, no de ninguna lista del
cliente; esconder el enlace del panel es comodidad, lo que protege es el 403.

Además, el atajo del modo taller **nunca** se aplica a una cuenta de
administración: para esas direcciones el enlace viaja solo por correo, así que
sin acceso al buzón no se entra aunque `RETURN_MAGIC_LINK_TOKEN` esté activo.

**Todo pasa por `QuizRepository`.** Ningún handler conoce el almacén: detrás
hay memoria o DynamoDB según `REPOSITORY`. El modelo de datos y el porqué de
cada decisión, en `../db/README.md`.

## Métricas sin llamar a CloudWatch (EMF)

`lib/metrics.ts` publica métricas escribiendo una línea de log. Nada más.

```jsonc
{
  "_aws": {
    "Timestamp": 1758108775155,
    "CloudWatchMetrics": [{
      "Namespace": "QuizArena",
      "Dimensions": [["route"], []],          // por ruta, y el total
      "Metrics": [{ "Name": "Latency", "Unit": "Milliseconds" },
                  { "Name": "Faults",  "Unit": "Count" }]
    }]
  },
  "level": "info", "message": "request",
  "requestId": "ed80bdc1-…", "status": 200,   // propiedades: contexto
  "route": "POST /auth/magic-link",           // dimensión
  "Latency": 1, "Faults": 0                   // los números
}
```

Eso es **EMF**, *embedded metric format*. Es la versión de producción del
ejemplo que se enseña en la clase 3 (*Escala y protege*): el mismo `_aws`, el
mismo namespace y la misma advertencia sobre la cardinalidad de las dimensiones,
puesta donde se usa de verdad. CloudWatch lee el log group, ve el
nodo `_aws` y crea las métricas por su cuenta. La Lambda no llama a
`PutMetricData`, así que no hay petición de red dentro del handler, no hay
latencia añadida, no hay nada que pueda fallar y **no hace falta ningún
permiso nuevo**: `logs:PutLogEvents` ya lo tiene toda función.

Lo importante es que el número y su explicación van en el mismo evento. Cuando
`Latency` hace un pico a las 10:42, la misma línea dice qué `requestId` fue,
qué ruta y qué usuario. Con `PutMetricData` tendrías el pico en un sitio y el
motivo en otro, y alguien tendría que cruzarlos a mano.

### Qué se mide

| Métrica | Unidad | Dimensión | Dónde |
| --- | --- | --- | --- |
| `Latency` | ms | `route` | `lib/http.ts` |
| `Faults` | 0/1 | `route` | `lib/http.ts` |
| `AnswerAccuracy` | 0/100 | `setId` | `handlers/attempts/answer.ts` |
| `AnswerSeconds` | s | `setId` | `handlers/attempts/answer.ts` |
| `AttemptScore` | puntos | `setId` | `handlers/attempts/finish.ts` |
| `AttemptAccuracy` | % | `setId` | `handlers/attempts/finish.ts` |
| `AttemptSeconds` | s | `setId` | `handlers/attempts/finish.ts` |
| `MagicLinksIssued` | 1 | — | `handlers/auth/requestMagicLink.ts` |
| `MailFailures` | 0/1 | — | `handlers/auth/requestMagicLink.ts` |

Todas se publican además sin dimensión (`total: true`), que es la línea
agregada del panel.

### Tres reglas que salen de esta tabla

**Lo que tiene pocos valores va como dimensión; lo demás, como propiedad.**
Cada combinación (métrica × conjunto de dimensiones) es una métrica
personalizada, y se factura. `route` tiene once valores y `setId` tres. Si
`requestId` o `userId` fueran dimensiones, cada visita crearía una métrica
nueva y la factura crecería con el tráfico. Van como propiedades, donde Logs
Insights los sigue encontrando y no cuestan por cardinalidad.

**Un contador es casi siempre una métrica de más.** No hay `Requests`: el
número de peticiones es el `SampleCount` de `Latency`. Medir cuánto tarda algo
ya cuenta cuántas veces pasó. Lo mismo con las partidas terminadas, que son el
`SampleCount` de `AttemptScore`.

**Un porcentaje es la media de algo que vale 100 o 0.** `AnswerAccuracy` no
calcula ninguna proporción: escribe 100 si se acertó y 0 si no. El estadístico
`Average` de CloudWatch hace el resto, y al estar dimensionada por `setId`
contesta gratis a «¿qué set se les atraganta?».

Hay un corolario incómodo: **una métrica que solo se escribe cuando algo falla
no sirve para alarmar.** `Faults` y `MailFailures` se emiten siempre, con 0 o
con 1. Si solo se escribieran al fallar, la alarma pasaría la vida en
`INSUFFICIENT_DATA` y nadie sabría si es que no falla nada o es que se ha
dejado de medir.

### Qué cuesta

Con once rutas y tres sets salen unas **46 métricas personalizadas**: 0,30 $
por métrica y mes en el primer tramo, es decir ~14 $/mes si esto emitiera sin
parar. CloudWatch las prorratea por horas y solo cobra las que reciben datos,
así que un taller de tres días son céntimos — pero el número de arriba es el
que hay que tener en la cabeza antes de añadir una dimensión «que estaría
bien tener».

### Verlo sin desplegar

```bash
npm run dev:api
curl -s -X POST localhost:3000/auth/magic-link \
  -H 'content-type: application/json' -d '{"email":"tu@correo.com"}'
```

La línea EMF sale por la consola tal cual. En local no la lee nadie: es solo
un log. `METRICS_ENABLED=false` la silencia si molesta.

Ya en AWS, para cruzar la métrica con su contexto:

```
fields @timestamp, route, status, Latency, requestId
| filter ispresent(Latency) and Latency > 1000
| sort Latency desc
```

## Empaquetado

```bash
npm run build:api
# backend/dist/functions/<nombre>/index.mjs  -> handler: index.handler
# backend/dist/local/handlers.mjs            -> bundle del servidor local
```

Los bundles no van minificados a propósito: se leen en clase.

## Pendiente

- Enviar el correo con SES en `handlers/auth/requestMagicLink.ts` y apagar
  `RETURN_MAGIC_LINK_TOKEN`.
- Mover `requireSession` a un Lambda authorizer de API Gateway, para que la
  sesión se valide una vez y no en cada función.
- `POST /sets/{setId}/questions` debería exigir rol de administrador.
- Rol IAM por función, con permiso solo sobre lo que cada una toca.
