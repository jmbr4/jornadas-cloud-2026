/** Configuración de las Lambdas. Todo llega por variables de entorno. */

export const config = {
  /** Secreto HMAC para firmar sesiones. Solo se usa en local. */
  sessionSecret: process.env.SESSION_SECRET ?? '',
  /** En AWS el secreto se lee de aquí, no del entorno. */
  sessionSecretArn: process.env.SESSION_SECRET_ARN ?? '',
  /** Validez de la sesión, en horas. */
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  /** Validez del enlace mágico, en minutos. */
  magicLinkMinutes: Number(process.env.MAGIC_LINK_MINUTES ?? 15),
  /**
   * Cuántas posiciones devuelve la API del leaderboard.
   *
   * La interfaz enseña el podio y nueve filas más; con 25 sobra margen. El
   * puesto propio y el total de jugadores viajan aparte, así que recortar
   * aquí no oculta información: evita resolver cientos de nombres que nadie
   * va a ver.
   */
  leaderboardSize: Number(process.env.LEADERBOARD_SIZE ?? 25),
  /** Segundos por pregunta cuando el set no dice otra cosa. */
  secondsPerQuestion: Number(process.env.SECONDS_PER_QUESTION ?? 20),
  /** Bonus máximo por velocidad. */
  speedBonusMax: Number(process.env.SPEED_BONUS_MAX ?? 80),
  /**
   * Modo taller: `POST /auth/magic-link` devuelve el token en la respuesta en
   * vez de mandarlo por correo. Evita depender de SES en sandbox.
   * NUNCA activar fuera de un entorno de prácticas.
   */
  returnMagicLinkToken: process.env.RETURN_MAGIC_LINK_TOKEN === 'true',
  /**
   * Remitente verificado en SES. Vacío = no se envían correos (y entonces
   * hace falta RETURN_MAGIC_LINK_TOKEN para poder entrar).
   */
  mailFrom: process.env.MAIL_FROM ?? '',
  /**
   * Correos con permiso de administración, separados por comas. Solo se usa
   * en local; en AWS la lista vive en Secrets Manager.
   *
   * Es una lista de configuración y no un campo de la base de datos a
   * propósito: así no hay ningún camino por el que la aplicación pueda
   * concederse permisos a sí misma.
   */
  adminEmails: process.env.ADMIN_EMAILS ?? '',
  /** En AWS, la lista de administradores se lee de aquí. */
  adminEmailsArn: process.env.ADMIN_EMAILS_ARN ?? '',
  /**
   * Rol a asumir en otra cuenta para enviar el correo.
   *
   * El sandbox de SES va con las credenciales que hacen la llamada, no con el
   * dueño del remitente: autorizar una identidad ajena no basta. Asumiendo un
   * rol en la cuenta que ya tiene acceso de producción, la llamada la hace esa
   * cuenta y son su cuota y su estado los que aplican.
   *
   * Vacío = se envía con las credenciales de la propia Lambda.
   */
  mailSenderRoleArn: process.env.MAIL_SENDER_ROLE_ARN ?? '',
  /** Región donde está verificada la identidad del remitente. */
  mailRegion: process.env.MAIL_REGION ?? process.env.AWS_REGION ?? 'eu-west-1',
  /** Base pública del sitio, para construir el enlace del correo. */
  appUrl: (process.env.APP_URL ?? '').replace(/\/$/, ''),
  /** Qué implementación del repositorio se usa. */
  repository: (process.env.REPOSITORY ?? 'memory') as 'memory' | 'dynamodb',
  /** Tabla única de DynamoDB. La inyecta CDK en cada Lambda. */
  tableName: process.env.TABLE_NAME ?? '',
}
