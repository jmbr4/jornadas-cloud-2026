# infra — despliegue con CDK

Tres stacks, repartidos por los días del taller:

| Stack | Qué crea | Día |
| --- | --- | --- |
| `QuizArena-taller-Web` | S3 privado + CloudFront con OAC | 1 |
| `QuizArena-taller-Data` | La tabla única de DynamoDB | 2 |
| `QuizArena-taller-Api` | HTTP API + 11 Lambdas, sus log groups y el panel | 2 |

Los datos van en un stack aparte del cómputo a propósito: las Lambdas se
redespliegan muchas veces al día y la tabla tiene que sobrevivir a eso.

El día 2, el stack web añade además un comportamiento `/api/*` que apunta a la
API: mismo origen para todo y, por tanto, cero CORS.

## Antes de nada

```bash
aws configure                      # o AWS_PROFILE / SSO
npx cdk bootstrap                  # una vez por cuenta y región
export SESSION_SECRET=$(openssl rand -base64 32)
```

`cdk bootstrap` crea el bucket y los roles que CDK necesita para subir
artefactos. Se hace una sola vez.

## Día 1 — el frontend

```bash
npm run deploy:web
```

Compila el frontend y despliega el stack web. Al acabar imprime `SiteUrl`.

`SESSION_SECRET` se exige también aquí, aunque el día 1 no haya backend: así no
existe la posibilidad de desplegar las Lambdas de autenticación firmando con un
valor de relleno.

Sin `VITE_API_BASE_URL` el frontend va contra su mock, así que el día 1 la
aplicación se ve y se juega entera sin backend.

## Día 2 — la API

```bash
echo "VITE_API_BASE_URL=/api" >> .env      # mismo origen
npm run deploy:all
npm run seed                               # datos de partida en la tabla
```

`deploy:all` compila las dos partes y despliega con `-c withApi=true`: crea la
API y añade el `/api/*` a la distribución. El orden lo garantiza
`web.addDependency(api)`.

> Si antes quieres enseñar por qué hace falta la base de datos, despliega la
> API con `REPOSITORY=memory` e intenta entrar: `/auth/magic-link` emite el
> enlace y `/auth/verify` lo rechaza, porque son dos Lambdas distintas y cada
> una tiene su propia memoria. El log lo dice con todas las letras.

## Correo de verdad con SES

Sin configurar nada, `POST /auth/magic-link` devuelve el token en la respuesta
(`RETURN_MAGIC_LINK_TOKEN=true`) y se entra pulsando *Abrir el enlace (demo)*.
Para que llegue un correo de verdad hacen falta tres pasos.

### 1. Dar de alta las identidades

```bash
npm run verify:mail -- hola@tudominio.com
```

Crea en SES la dirección y su dominio, y te dice qué falta por hacer. Es
idempotente: si ya existen, solo informa del estado.

> **Por qué esto no está en el stack de CDK.** `AWS::SES::EmailIdentity` deja
> el despliegue en `CREATE_IN_PROGRESS` hasta que la identidad queda
> verificada — es decir, hasta que una persona abre un correo o publica unos
> registros DNS. Dentro del stack de la API, cada despliegue quedaría rehén de
> esa acción humana, y al agotarse el plazo CloudFormation revierte. Verificar
> un remitente es un alta que se hace una vez; redesplegar Lambdas es algo de
> todos los días. No pertenecen al mismo ciclo de vida.

### 2. Completar la verificación

**La dirección.** AWS manda un correo a `hola@tudominio.com` con el asunto
*"Amazon Web Services – Email Address Verification"*. Hay que abrirlo y pulsar
el enlace. Con eso ya se puede enviar.

**El dominio** (recomendado, y lo que decide si el correo llega a la bandeja o
a spam). El comando de arriba imprime tres registros:

```
<token>._domainkey.tudominio.com   CNAME   <token>.dkim.amazonses.com
```

Publícalos en el DNS del dominio. SES los comprueba solo; suele tardar entre
unos minutos y unas horas según el proveedor de DNS.

Sin DKIM, el correo sale sin firma alineada con el dominio y los filtros lo
tratan con recelo. Con DKIM, SES firma cada envío.

Verificar el **dominio** autoriza a enviar desde cualquier buzón suyo, así que
con eso basta: la identidad de la dirección suelta pasa a ser redundante.

Conviene mirar también dos registros del dominio antes de dar por bueno el
envío:

- **`_dmarc`** — con `p=none` nada se rechaza. Con `p=quarantine` o `p=reject`,
  un correo que no alinee DKIM o SPF acaba en spam o se descarta.
- **SPF** (`v=spf1` en el TXT de la raíz) — si el dominio ya tiene uno, añade
  `include:amazonses.com`. Si **no** tiene ninguno, piénsalo antes de crearlo:
  pasar de «sin política» a una política explícita puede tirar el correo que ya
  sale por otros proveedores si te dejas alguno fuera. Con DKIM verificado y
  `p=none`, el envío ya pasa DMARC sin tocar SPF.

Para comprobar cómo va, el mismo comando:

```bash
npm run verify:mail -- hola@tudominio.com
```

> No uses una dirección de Gmail, Outlook o similar como remitente: esos
> dominios publican una política DMARC estricta y no puedes publicar DKIM en su
> DNS, así que el correo será rechazado o marcado como spam. El remitente tiene
> que ser un dominio que controles.

Las identidades son **por región**. Verifica en la misma en la que despliegas.

### 3. Salir del sandbox

Hay dos caminos. El segundo es el que sirve si ya tenéis otra cuenta con
producción.

#### 3a. Pedir producción en esta misma cuenta

Toda cuenta nueva de SES empieza en el sandbox: solo se puede escribir a
direcciones **también verificadas**, con un tope de 200 correos al día.

Para un taller pequeño puede bastar — verificas el correo de cada asistente.
Para que entre cualquiera, pide acceso de producción en la consola de SES
(*Account dashboard → Request production access*). **Suele tardar en torno a 24
horas, así que pídelo el primer día**, no la mañana del día 2.

#### 3b. Enviar desde otra cuenta que ya tenga producción

Si tenéis una cuenta que ya envía correo de verdad, se puede aprovechar. Pero
**no vale con autorizar su identidad**: el sandbox va con las credenciales que
hacen la llamada, no con el dueño del remitente. Autorizar la identidad ajena
(`PutEmailIdentityPolicy` + `FromEmailAddressIdentityArn`) deja que uses su
dirección, pero sigue enviando tu cuenta, con su sandbox y su cuota.

Lo que sí funciona es **asumir un rol** en la otra cuenta: entonces la llamada
la hace esa cuenta.

En la cuenta que tiene producción, un rol que solo puede enviar desde una
dirección concreta:

```bash
aws iam create-role --role-name QuizArenaSesSender \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::<cuenta-app>:root"},
      "Action":"sts:AssumeRole",
      "Condition":{"StringEquals":{
        "aws:PrincipalArn":"arn:aws:iam::<cuenta-app>:role/QuizArena-taller-Api-mailer"}}
    }]}'
```

El principal es la cuenta y la **condición** fija el rol exacto. Se hace así
porque IAM rechaza un principal que todavía no existe, pero no valida las
condiciones: queda igual de estrecho y se puede crear antes de desplegar.

La política del rol acota además el remitente, para que una cuenta comprometida
no pueda escribir como cualquier buzón del dominio:

```json
{ "Effect": "Allow", "Action": "ses:SendEmail",
  "Resource": "arn:aws:ses:<región>:<cuenta-ses>:identity/<dominio>",
  "Condition": { "StringEquals": { "ses:FromAddress": "hola@<dominio>" } } }
```

Y al desplegar:

```bash
npx cdk deploy --all -c withApi=true \
  -c mailFrom=hola@tudominio.com \
  -c mailSenderRoleArn=arn:aws:iam::<cuenta-ses>:role/QuizArenaSesSender \
  -c appUrl=https://quiz.tudominio.com
```

La Lambda solo recibe permiso de `sts:AssumeRole`; el permiso de SES vive en la
política del rol de la otra cuenta.

> **Lo que se hereda además del acceso de producción.** Los rebotes y las
> quejas cuentan contra la reputación de la cuenta que envía. Si esa cuenta
> sostiene correo de negocio, el de esta aplicación comparte su historial.

### 4. Desplegar apuntando al remitente

```bash
npm run build
npx cdk deploy --all -c withApi=true \
  -c mailFrom=hola@tudominio.com \
  -c appUrl=https://dxxxxxxxx.cloudfront.net
```

- `mailFrom` activa el envío y concede el permiso. Solo la Lambda
  `auth-magic-link` recibe `ses:SendEmail`, y acotado a esa identidad:
  ninguna otra función puede enviar correo en tu nombre.
- `appUrl` es la base del enlace que va en el correo. Se pasa a mano y no se
  lee del stack web a propósito: ese stack ya depende de este para enrutar
  `/api/*`, y pedirle a cambio su URL cerraría un ciclo entre ambos.

**Mientras la verificación no esté completa no pasa nada**: el envío falla, se
registra en el log, y el token de demostración sigue funcionando, así que nadie
se queda fuera. Cuando compruebes que los correos llegan, apaga la red de
seguridad:

```bash
npx cdk deploy --all -c withApi=true \
  -c mailFrom=hola@tudominio.com \
  -c appUrl=https://dxxxxxxxx.cloudfront.net \
  -c returnMagicLinkToken=false
```

A partir de ahí, un fallo de SES **sí** devuelve error — que es lo correcto,
porque ya no hay otra forma de entrar. El botón *Abrir el enlace (demo)*
desaparece solo del frontend cuando el token deja de llegar.

### Si no llega el correo

```bash
npm run verify:mail -- hola@tudominio.com     # estado de las identidades
aws logs tail /aws/lambda/QuizArena-taller-Api-auth-magic-link --since 10m
```

`Email address is not verified` nombra la identidad que falla. Si la que
aparece es el **destinatario**, el problema es el sandbox, no el remitente.

## Día 3 — qué está ya preparado

**Tags.** `infra/lib/tagging.ts` aplica `Project`, `Environment`, `Owner`,
`CostCenter` y `ManagedBy` a todo el App, así que los hereda cada recurso.
Se cambian con contexto:

```bash
npx cdk deploy --all -c owner=maria -c costCenter=I+D
```

> Para verlos en Cost Explorer hay que activarlos en **Billing → Cost
> allocation tags**, y tardan en torno a 24 h en empezar a desglosar. Hacedlo
> el día 1 o el día 3 no habrá nada que enseñar.

**Logs.** Cada Lambda tiene su log group declarado en la plantilla, con
retención de 7 días. Si se dejara que Lambda los creara sola, no caducarían
nunca y seguirían costando después del taller. El stage de API Gateway escribe
además logs de acceso en JSON, que cuentan lo que pasó en la puerta (404, 403,
límites) aunque no llegara a ejecutarse ninguna función.

**Métricas.** Las Lambdas publican métricas en CloudWatch **sin llamar a
CloudWatch**: escriben una línea de log con un nodo `_aws` (EMF, *embedded
metric format*) y CloudWatch las extrae del log group. No hay llamada de red
en el handler ni permiso de IAM que conceder — `logs:PutLogEvents` ya lo
tienen. Qué se mide y por qué, en `backend/README.md`.

El stack no crea ninguna métrica, porque no puede: una métrica de EMF no
existe hasta que alguien la emite. Lo que sí crea es cómo mirarlas.

- **El panel** `QuizArena-taller-Api-panel`. Sale en los outputs del
  despliegue como `DashboardUrl`. **Aparece vacío hasta que alguien juega**, y
  eso es parte de la demostración: se abre, se juega una partida en el
  proyector y en dos o tres minutos aparecen los puntos.
- **Las gráficas por set usan `SEARCH`**, no una lista de sets escrita a mano:
  los sets los carga `npm run seed` *después* de desplegar, así que la
  plantilla no puede conocerlos. `SEARCH` resuelve al pintar y recoge también
  los que se añadan mañana.
- **Una alarma**, `QuizArena-taller-Api-correo-no-sale`, sobre `MailFailures`.
  Es la que importa: si SES deja de enviar, nadie puede entrar y la API sigue
  respondiendo 200 tan contenta. Va con `treatMissingData: NOT_BREACHING`
  porque la métrica se emite con 0 en cada petición: un hueco significa que no
  ha entrado nadie, no que esté roto.

La alarma **no tiene acción** a propósito: suscribir un correo a un tema de
SNS exige que alguien confirme desde su bandeja, y eso no cabe dentro de un
`cdk deploy`. En clase se ve el paso a `ALARM` en la consola; en producción,
ahí iría un `addAlarmAction(new SnsAction(topic))`.

Para verla saltar sin romper nada, basta desplegar con un remitente que no
esté verificado y pedir un enlace: el envío falla, `MailFailures` se va a 1 y
la alarma cambia en unos cinco minutos.

> Las métricas personalizadas son la parte cara de CloudWatch, y la que se
> dispara sin querer: **cada combinación de métrica y dimensiones cuenta como
> una**. Aquí son unas 46 (0,30 $ cada una al mes, prorrateadas por horas y
> solo mientras reciben datos). Poner `userId` como dimensión crearía una
> métrica por persona. Ese es el ejercicio de coste del día 3, y se ve solo:
> **Billing → Cost Explorer**, filtrando por el servicio CloudWatch.

**Coste.** `PriceClass_100` (solo Norteamérica y Europa) y Lambdas en ARM64
(Graviton), en torno a un 20 % más baratas que x86 a igual rendimiento.

## Recoger la mesa

```bash
npm run destroy
```

El bucket se vacía y se borra solo (`destroyOnRemove: true`, pensado para un
taller — en producción sería `RETAIN`). Borrar la distribución de CloudFront
tarda unos 15 minutos: es normal, no está colgado.

## Cómo está montado

```
infra/
  bin/quiz-arena.ts   Define los stacks y lee el contexto.
  lib/web-stack.ts    S3 + CloudFront (+ el /api/* opcional).
  lib/api-stack.ts    HTTP API + Lambdas, generadas desde functions.json.
  lib/tagging.ts      El esquema de etiquetas.
cdk.json              Comando del app y feature flags.
```

El stack de la API **no tiene las rutas escritas a mano**: recorre
`backend/functions.json`, el mismo fichero que usa el empaquetado. Añadir una
ruta es añadir una línea ahí, y aparecen a la vez el bundle, la Lambda y la
ruta de API Gateway.

## Simplificaciones conscientes

Cosas que en un sistema real se harían de otra manera, anotadas para no
confundir el atajo con la buena práctica:

- **`SESSION_SECRET` va como variable de entorno de la Lambda.** No está en el
  repositorio (se pasa al desplegar), pero sí es visible en la consola de
  Lambda. Lo correcto: Secrets Manager y leerlo en el arranque en frío.
- **La sesión se valida dentro de cada handler.** Debería ser un Lambda
  authorizer de API Gateway, para validarla una vez y no nueve.
- **`POST /sets/{setId}/questions` solo exige sesión**, no rol de
  administrador.
- **Cada rol tiene el acceso mínimo a la tabla**: las funciones que solo leen
  no pueden escribir. Sale del campo `access` de `backend/functions.json`, y se
  ve rol por rol en la consola de IAM.
