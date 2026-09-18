# frontend — la aplicación Vue

Frontend en Vue 3 + TypeScript del diseño *Quiz Arena* (sistema de diseño **Nocturne**).
Sets de preguntas cronometradas sobre AWS, JavaScript y arquitectura, con leaderboard
y panel de alta de contenido.

Pensado como base para un taller de AWS: hoy funciona entero contra un backend
simulado en memoria, y el backend real se enchufa cambiando una variable de entorno.

## Arrancar

El proyecto tiene un único `package.json`, en la raíz. Todos los comandos se
lanzan desde allí:

```bash
npm install
npm run dev        # http://localhost:5173
npm run build:web  # estático en frontend/dist/
npm run preview    # servir frontend/dist/ en local
npm run typecheck  # comprueba frontend, backend y vite.config a la vez
```

Sin `VITE_API_BASE_URL` la app usa su mock y funciona sola: en la pantalla de
acceso escribe cualquier correo, pulsa **Enviar enlace de acceso** y luego
**Abrir el enlace (demo)**.

## Cómo está montado

```
src/
  assets/nocturne.css   Sistema de diseño (tokens, ramps, componentes). No tocar a mano.
  assets/app.css        Capa de aplicación: todo sale de las variables de Nocturne.
  types/                Modelo de dominio compartido por mock y backend.
  config.ts             Variables de entorno y reglas del juego.
  services/
    api.ts              CONTRATO: la interfaz QuizArenaApi.
    mock/               Implementación en memoria (seed.ts = datos del diseño).
    http/httpApi.ts     Implementación contra el backend real.
    index.ts            Elige una u otra según VITE_API_BASE_URL.
  stores/               Pinia: auth, catalog, game, leaderboard.
  views/                Una vista por pantalla del diseño.
  components/           Piezas reutilizables (cabecera, tarjeta de set, opción, podio).
  router/               Rutas + guard de sesión.
```

La configuración de Vite (`vite.config.ts`) está en la raíz y apunta aquí con
`root: 'frontend'`; las variables `VITE_*` se leen del `.env` de la raíz.

### La frontera con el backend

Ningún componente ni store sabe de dónde vienen los datos: todos hablan con
`api`, que implementa `QuizArenaApi` (`src/services/api.ts`). Hay dos
implementaciones y `src/services/index.ts` decide cuál se usa:

| `VITE_API_BASE_URL` | Implementación | Para qué |
| --- | --- | --- |
| vacío | `MockApi` | desarrollo del frontend, demo sin infraestructura |
| con valor | `HttpApi` | backend real |

Dos decisiones que conviene mantener cuando llegue el backend:

1. **Las preguntas viajan sin la respuesta correcta.** `Question` no tiene el
   campo `correct`; la corrección y los puntos los calcula el servidor en
   `submitAnswer`. Así no se puede hacer trampa leyendo la respuesta desde el
   navegador.
2. **La puntuación la calcula el servidor.** El cliente solo manda la opción
   elegida y los segundos consumidos.

### Endpoints que espera `HttpApi`

```
POST /auth/magic-link      { email }            -> { sentTo, expiresInMinutes }
POST /auth/verify          { token }            -> { user, sessionToken }
GET  /me                                        -> User
GET  /sets                                      -> QuizSet[]
POST /sets/:id/attempts                         -> Attempt
POST /attempts/:id/answers { questionId, choice, elapsedSeconds } -> AnswerResult
POST /attempts/:id/finish                       -> AttemptSummary
GET  /leaderboard?scope=all|<setId>             -> Leaderboard
POST /sets/:id/questions   { text, options, correct, level, seconds } -> QuizSet
```

Las respuestas van autenticadas con `Authorization: Bearer <sessionToken>`.
Las formas exactas de cada objeto están en `src/types/index.ts`.

Para cambiar rutas o cabeceras, se toca solo `src/services/http/httpApi.ts`.

## Desplegar

`npm run build:web` deja un estático en `frontend/dist/` — sirve tal cual desde S3 +
CloudFront, Amplify Hosting o cualquier hosting estático.

Al ser una SPA con `createWebHistory`, el hosting debe devolver `index.html`
para cualquier ruta que no sea un fichero (en CloudFront: *custom error
response* 403/404 → `/index.html` con código 200).
