# Quiz Arena

Aplicación de quizzes cronometrados sobre AWS, JavaScript y arquitectura.

Es el **proyecto de ejemplo de las Jornadas Cloud 2026**: no es una demo que se
enseña acabada, sino el hilo conductor de los tres días. Se empieza con un
frontend que funciona solo y se termina con una aplicación desplegada, con
backend, base de datos, dominio propio, correo y observabilidad. Cada decisión
está comentada en el código y explicada en el README de su carpeta, para que el
repositorio se pueda leer sin haber estado en la sala.

```
frontend/   Vue 3 + TypeScript (Vite). El diseño Nocturne, implementado.
backend/    Once Lambdas en TypeScript tras API Gateway.
infra/      CDK: S3 + CloudFront, API Gateway + Lambda y la tabla.
db/         El modelo de datos de DynamoDB.
```

Un solo proyecto: `package.json`, `node_modules` y `.env` están en la raíz.
Las tres carpetas son código, no paquetes; cada una tiene su README para poder
enseñarla por separado.

## Las clases

Las tres sesiones de **Tutorial AWS · Despliegue Cloud** (Betta Tech) están
grabadas y son públicas. Cada una levanta una capa de esta misma aplicación,
así que se pueden seguir con el repositorio delante. Los apuntes de cada día se
descargan [aquí](https://www.commitacademy.io/sp/jornadas-cloud-eg?utm_source=CLOUD_AWS_EG).

### [1 · Del cloud a tu primera web en AWS](https://youtube.com/live/nCVXVgEI1ng?feature=share)

*Despliegue completo de una web estática con Amazon S3 y CloudFront.*

Qué es el cloud y qué es AWS, servicios frente a recursos, regiones y zonas de
disponibilidad, el modelo de responsabilidad compartida y IaaS/PaaS/SaaS. Luego
el tutorial: bucket privado con *Block all public access*, distribución de
CloudFront, **OAC** para que solo ella lea el origen, caché e invalidaciones, y
un primer vistazo a la factura con AWS Budgets.

→ En el repo: `infra/lib/web-stack.ts` y la sección del día 1 en `infra/README.md`.

### [2 · Serverless en acción](https://youtube.com/live/bmgZZXFJisE?feature=share)

*Despliegue completo de un backend serverless con Lambda, API Gateway y DynamoDB.*

Qué significa serverless de verdad y qué sigues administrando tú, una Lambda por
endpoint frente a un backend desplegado como unidad, API Gateway como integración
proxy, eventos que no vienen de una petición HTTP (notificaciones de S3,
EventBridge Scheduler) y el cambio de mentalidad de DynamoDB: **se empieza por
los patrones de acceso**, no por las entidades.

→ En el repo: `backend/` (once Lambdas, una por ruta) y `db/README.md` (el modelo
de datos y el porqué de cada clave).

### [3 · Escala y protege](https://youtube.com/live/FPxn4taI-6w?feature=share)

*Observabilidad, permisos y control de costes.*

Tres preguntas sobre una aplicación ya desplegada: **qué está pasando**
(CloudWatch Logs, log groups y retención, Logs Insights, métricas de Lambda,
métricas de negocio con **EMF** y alarmas que alguien pueda atender), **quién
puede hacer qué** (IAM: principal, acción, recurso y condición; denegación por
defecto y mínimo privilegio; política de confianza frente a políticas de
permisos) y **cuánto cuesta** (FinOps: Cost Explorer, etiquetas de asignación de
costes y AWS Budgets).

→ En el repo: `backend/src/lib/metrics.ts`, el panel y la alarma de
`infra/lib/api-stack.ts`, los roles por función de `backend/functions.json` y
`infra/lib/tagging.ts`.

> **Las clases van por consola; este repositorio va con CDK.** Es deliberado y
> no se contradicen: en clase se hacen los clics para entender qué pieza resuelve
> qué problema, y aquí están esas mismas decisiones escritas en código para poder
> repetirlas. El día 2 lo dice con todas las letras — *«tener un JSON de rutas no
> sustituye a todo ese proyecto»*. Si vienes de la clase, lee primero el README de
> cada carpeta y después el stack.

## Los apuntes y el examen

Las Jornadas terminan con un **examen final**, y quien lo supera recibe un
**certificado de aprovechamiento**.

> ### 📋 [Consigue los apuntes y preséntate al examen](https://www.commitacademy.io/sp/jornadas-cloud-eg?utm_source=CLOUD_AWS_EG)
>
> Desde ahí se descargan los apuntes de los tres días y se accede al examen.

Los apuntes son el material de referencia: cada clase tiene el suyo, con el
recorrido completo y los enlaces a la documentación oficial de AWS en la que se
apoya. Este repositorio es la otra mitad — las mismas decisiones, pero
comentadas en el sitio exacto en el que se aplican, incluidas las que se tomaron
mal a propósito para poder enseñar por qué (`infra/README.md`, sección
*Simplificaciones conscientes*).

En el examen entra lo que se ve en las tres clases: los servicios, las
decisiones de arquitectura y el porqué de cada una. **CDK no entra**: se enseña
en el día 2 como una puerta a lo que viene después, y es lo que sostiene este
repositorio, pero no se pregunta.

Y sí, la ironía es deliberada: el proyecto con el que se aprende es una
aplicación de exámenes tipo test.

## Arrancar

```bash
npm install
cp .env.example .env

npm run dev:api   # API en  http://localhost:3000
npm run dev       # web en  http://localhost:5173
```

Para entrar: cualquier correo → *Enviar enlace de acceso* → *Abrir el enlace
(demo)*. Ese botón es el atajo mientras no hay correo real; con SES
configurado desaparece y el enlace llega a la bandeja. Cómo activarlo, en
`infra/README.md`.

Con `VITE_API_BASE_URL` vacío el frontend usa su propio mock y funciona solo,
sin backend — que es como se da el día 1. Con `/api` habla con las Lambdas, y
ese mismo valor vale desplegado: en local hace de proxy Vite, y en AWS
CloudFront. El prefijo se quita en los dos casos antes de llegar a la API.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Vite, con el frontend en `frontend/` |
| `npm run dev:api` | empaqueta las Lambdas y levanta la API local |
| `npm run build` | las dos cosas |
| `npm run build:web` | estático en `frontend/dist/` (lo que va a S3) |
| `npm run build:api` | bundles en `backend/dist/functions/` |
| `npm run typecheck` | frontend, backend, infra y `vite.config.ts` de una vez |
| `npm run deploy:web` | compila y despliega el frontend (día 1) |
| `npm run deploy:all` | despliega los tres stacks juntos (día 2) |
| `npm run seed` | carga el contenido (sets y preguntas) en la tabla |
| `npm run seed -- --demo` | añade jugadores de relleno para el leaderboard |
| `npm run db:reset` | borra usuarios y partidas, conserva el contenido |
| `npm run verify:mail` | estado de las identidades de SES |
| `npm run destroy` | borra todo de la cuenta |

## Las dos fronteras del proyecto

Todo el diseño se apoya en dos interfaces. Las dos existen para que se pueda
sustituir lo que hay detrás sin tocar lo que hay delante.

| Interfaz | Separa | Hoy | Después |
| --- | --- | --- | --- |
| `frontend/src/services/api.ts` | UI ↔ origen de datos | mock en memoria | `HttpApi` contra API Gateway |
| `backend/src/repository/index.ts` | Lambdas ↔ persistencia | `MemoryRepository` | `DynamoRepository` (`db/`) |

Cambiar de un lado a otro es una variable de entorno: `VITE_API_BASE_URL` en el
frontend, `REPOSITORY` en el backend.

## El taller, paso a paso

Lo que se hace en cada sesión, para poder repetirlo sin volver a ver el vídeo.

**Día 1 — el frontend en S3 + CloudFront.** `npm run deploy:web`. Bucket
privado con OAC (no *static website hosting*), *custom error responses*
403/404 → `/index.html` con 200 porque es una SPA con history mode, y caché
larga para `/assets/*` (llevan hash) frente a `no-cache` para `index.html`.
Todo en `infra/lib/web-stack.ts`.

> Aplicad el esquema de tags **este día**. Los *cost allocation tags* hay que
> activarlos en Billing y tardan en torno a 24 h en aparecer en Cost Explorer:
> si se etiqueta el día 3, el informe de costes sale vacío.

**Día 2 — el backend.** `npm run deploy:all && npm run seed`. API Gateway +
nueve Lambdas + una tabla de DynamoDB, con la API colgada de la misma
distribución bajo `/api/*`: mismo origen, cero CORS, y el frontend solo
necesita `VITE_API_BASE_URL=/api`.

> Antes de desplegar la tabla, merece la pena desplegar la API con
> `REPOSITORY=memory` y probar a entrar: falla, porque cada Lambda tiene su
> propia memoria y el enlace que emite una no lo ve la otra. Es la demostración
> en vivo de por qué hace falta una base de datos, y dura treinta segundos.

El modelo de datos y las decisiones detrás de él, en `db/README.md`.

**Día 3 — observabilidad, permisos y costes.** Ya viene preparado: el esquema
de tags se aplica al App entero (`infra/lib/tagging.ts`), cada log group está
declarado con retención de 7 días, y tanto las Lambdas como el stage de API
Gateway escriben en JSON estructurado, que es lo que hace útil a Logs Insights.
El mínimo privilegio de IAM sale del campo `access` de `backend/functions.json`:
la función que solo lee no puede escribir, y se ve rol por rol en la consola.
Detalle en `infra/README.md`.

> La línea de log con la que cierra cada petición **es además la métrica**:
> lleva un nodo `_aws` (EMF) y CloudWatch extrae de ahí `Latency`, `Faults`,
> los aciertos por set y los fallos de correo, sin que ninguna Lambda llame a
> CloudWatch ni necesite un permiso nuevo. El despliegue deja un panel
> (`DashboardUrl` en los outputs) que está vacío hasta que alguien juega: se
> proyecta, se juega una partida y aparecen los puntos. El porqué de cada
> decisión —qué va como dimensión, qué va como propiedad y cuánto cuesta
> equivocarse— en `backend/README.md`.

## Origen del diseño

El frontend viene de un diseño de Claude Design sobre el sistema **Nocturne**.
`frontend/src/assets/nocturne.css` es ese sistema tal cual; no se edita a mano.

## Antes de abrirlo a usuarios

| | Qué | Estado |
| --- | --- | --- |
| 🔴 | **`returnMagicLinkToken=false`**. Con él activo, la API devolvía el token de acceso a quien lo pidiera: cualquiera entraba como cualquiera. | hecho |
| 🔴 | **Acceso de producción en SES**. En sandbox solo reciben correo las direcciones verificadas. | resuelto enviando desde la cuenta que ya lo tiene (`-c mailSenderRoleArn=`) |
| 🟠 | **Panel de administración cerrado.** La lista vive en Secrets Manager, no en las variables de la Lambda, y se comprueba en el servidor sobre el token firmado. El atajo del modo taller nunca se aplica a esas cuentas. | hecho |
| 🟠 | **Techo de peticiones** en API Gateway, para que nadie use la API como cañón de correo. | hecho |
| 🟠 | **Tabla en `RETAIN` con point-in-time recovery**. | hecho (`-c destroyOnRemove=false`) |
| 🟡 | **`SESSION_SECRET` en Secrets Manager**, generado por AWS y leído en ejecución. | hecho |
| 🟡 | **Dominio propio** con certificado de ACM. | hecho (`-c domainName=` + `-c certificateArn=`) |
| 🟡 | **El cronómetro lo lleva el servidor**, no el navegador. | hecho |

Comando de despliegue completo:

```bash
npm run build
npx cdk deploy --all -c withApi=true \
  -c mailFrom=hola@tudominio.com \
  -c appUrl=https://quiz.tudominio.com \
  -c adminEmails=tu@correo.com \
  -c destroyOnRemove=false \
  -c domainName=quiz.tudominio.com \
  -c certificateArn=arn:aws:acm:us-east-1:...:certificate/... \
  -c mailSenderRoleArn=arn:aws:iam::<cuenta-ses>:role/QuizArenaSesSender \\
  -c returnMagicLinkToken=false
```

La lista de administradores **no** se pasa por la línea de comandos: iría a
parar a la plantilla de CloudFormation. El stack crea el secreto vacío —con un
valor aleatorio que no se parece a ningún correo, así que nadie administra— y
la lista se pone una vez:

```bash
aws secretsmanager put-secret-value \
  --secret-id QuizArena-taller-Api/admin-emails \
  --secret-string 'tu@correo.com,otro@correo.com'
```

Los cambios entran solos en unos cinco minutos, sin redesplegar.

El certificado se emite aparte, en **us-east-1** (CloudFront no acepta otra
región) y con validación por DNS. No se crea desde CDK por lo mismo que las
identidades de SES: esperar a que alguien publique un registro DNS bloquearía
el despliegue.

## Privacidad de los jugadores

El leaderboard es público para quien entra, así que no puede enseñar el correo
de nadie. Por eso el nombre y el handle **los elige la persona** en su primer
acceso y no se derivan de la dirección. El correo solo vuelve en `/me` y en
`/auth/verify`, que son las respuestas a ti mismo.

## Cuidar la reputación de envío

Desde que el correo sale por la cuenta que ya envía correo de negocio, sus
rebotes y quejas son los mismos. SES suspende cuentas que pasan del 5 % de
rebotes, así que conviene:

- **Vigilar** las métricas `Bounce` y `Complaint` de CloudWatch en la cuenta
  que envía, no en la de la aplicación.
- **No enviar a direcciones inventadas.** El formulario acepta cualquier cosa
  que parezca un correo, y cada dirección falsa es un rebote. La lista de
  supresión de la cuenta ya filtra repeticiones, pero no el primer intento.
- **Separarlo** si esto crece o se abre a desconocidos: una cuenta propia con
  su producción aísla la reputación del negocio de la del taller.
