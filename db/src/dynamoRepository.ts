import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type {
  AttemptAnswerRecord,
  AttemptRecord,
  MagicLinkRecord,
  QuestionRecord,
  ScoreRecord,
  SetRecord,
  UserRecord,
} from '../../backend/src/domain/types.js'
import { RepositoryError, type QuizRepository } from '../../backend/src/repository/index.js'
import { GSI1, gsi1ForScore, keys } from './keys.js'

/** Los errores de condición no son fallos: son la condición haciendo su trabajo. */
const isConditionFailed = (error: unknown) =>
  error instanceof Error &&
  (error.name === 'ConditionalCheckFailedException' ||
    error.name === 'TransactionCanceledException')

/**
 * Implementación de `QuizRepository` sobre una tabla única de DynamoDB.
 *
 * El cliente se crea una vez por contenedor de Lambda (lo instancia
 * `repository/factory.ts`, que lo cachea), no una vez por petición.
 */
export class DynamoRepository implements QuizRepository {
  private readonly doc: DynamoDBDocumentClient
  private readonly table: string

  constructor(table: string) {
    if (!table) throw new RepositoryError('Falta el nombre de la tabla (TABLE_NAME).')
    this.table = table
    this.doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    })
  }

  // -------------------------------------------------------------------------
  // Usuarios
  // -------------------------------------------------------------------------

  async getUser(userId: string): Promise<UserRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: keys.user(userId) }),
    )
    return Item ? toUser(Item) : null
  }

  /**
   * Varios perfiles en una sola llamada.
   *
   * `BatchGetItem` admite 100 claves por petición, así que se trocea. Es la
   * diferencia entre una llamada y cientos: antes el leaderboard hacía un
   * `GetItem` por jugador.
   *
   * DynamoDB puede devolver claves «sin procesar» si se pasa de capacidad;
   * se reintentan con espera creciente en vez de darlas por inexistentes,
   * que es el error silencioso clásico de esta API.
   */
  async getUsers(userIds: string[]): Promise<UserRecord[]> {
    const unique = [...new Set(userIds)]
    if (unique.length === 0) return []

    const found: UserRecord[] = []

    for (let i = 0; i < unique.length; i += 100) {
      let batch = unique.slice(i, i + 100).map((id) => keys.user(id))

      for (let attempt = 0; batch.length > 0 && attempt < 5; attempt++) {
        const { Responses, UnprocessedKeys } = await this.doc.send(
          new BatchGetCommand({ RequestItems: { [this.table]: { Keys: batch } } }),
        )
        found.push(...(Responses?.[this.table] ?? []).map(toUser))

        batch = (UnprocessedKeys?.[this.table]?.Keys ?? []) as typeof batch
        if (batch.length > 0) await wait(2 ** attempt * 50)
      }
    }

    return found
  }

  /**
   * El email no es la clave del usuario. En vez de un GSI, se guarda un ítem
   * puntero `EMAIL#<email> -> userId`: dos lecturas por clave en lugar de un
   * índice que habría que mantener y pagar. Además, ese ítem es lo que hace
   * posible garantizar que un email es único (ver `createUser`).
   */
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: keys.email(email) }),
    )
    const userId = Item?.['userId'] as string | undefined
    return userId ? this.getUser(userId) : null
  }

  /**
   * Perfil y puntero de email se escriben en una transacción, y el puntero
   * lleva `attribute_not_exists`: si dos peticiones intentan dar de alta el
   * mismo correo a la vez, solo una gana y la otra no deja nada a medias.
   */
  async createUser(user: UserRecord): Promise<UserRecord> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: { ...keys.user(user.id), entity: 'USER', ...user },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { ...keys.email(user.email), entity: 'EMAIL', userId: user.id },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      )
      return user
    } catch (error) {
      if (isConditionFailed(error)) {
        const existing = await this.findUserByEmail(user.email)
        if (existing) return existing
      }
      throw new RepositoryError('No se ha podido crear el usuario.', { cause: error })
    }
  }

  async findUserByHandle(handle: string): Promise<UserRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: keys.handle(handle) }),
    )
    const userId = Item?.['userId'] as string | undefined
    return userId ? this.getUser(userId) : null
  }

  /**
   * Reserva el handle y lo guarda en el perfil, en una sola transacción.
   *
   * El ítem puntero lleva `attribute_not_exists`, así que si dos personas
   * eligen el mismo handle a la vez solo una gana y la otra no deja el perfil
   * a medias. Es el mismo mecanismo que hace único el correo.
   *
   * Cambiar de handle dejaría huérfano el puntero anterior; hoy el perfil se
   * fija una vez y no se edita, así que no hace falta liberarlo.
   */
  async saveProfile(userId: string, name: string, handle: string): Promise<UserRecord | null> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: { ...keys.handle(handle), entity: 'HANDLE', userId },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Update: {
                TableName: this.table,
                Key: keys.user(userId),
                UpdateExpression: 'SET #n = :name, handle = :handle',
                ConditionExpression: 'attribute_exists(PK)',
                ExpressionAttributeNames: { '#n': 'name' },
                ExpressionAttributeValues: { ':name': name, ':handle': handle },
              },
            },
          ],
        }),
      )
      return this.getUser(userId)
    } catch (error) {
      // El handle ya era de otra persona: colisión esperable, no un fallo.
      if (isConditionFailed(error)) return null
      throw new RepositoryError('No se ha podido guardar el perfil.', { cause: error })
    }
  }

  // -------------------------------------------------------------------------
  // Enlaces mágicos
  // -------------------------------------------------------------------------

  async saveMagicLink(link: MagicLinkRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...keys.link(link.token),
          entity: 'LINK',
          ...link,
          // TTL: DynamoDB borra el ítem solo cuando caduca. Gratis, y evita
          // acumular enlaces muertos que se pagarían para siempre.
          expiresAtEpoch: Math.floor(new Date(link.expiresAt).getTime() / 1000),
        },
      }),
    )
  }

  /**
   * Canjear un enlace es la operación que más cuidado pide: tiene que ser
   * atómica, porque dos peticiones con el mismo token no pueden crear dos
   * sesiones. Se resuelve con un UpdateItem condicionado en vez de un
   * leer-comprobar-escribir, que tendría una ventana de carrera.
   *
   * La caducidad se comprueba aquí explícitamente además del TTL: el borrado
   * por TTL es perezoso y puede tardar hasta 48 h, así que un enlace caducado
   * puede seguir en la tabla.
   */
  async consumeMagicLink(token: string): Promise<MagicLinkRecord | null> {
    const now = new Date()
    try {
      const { Attributes } = await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: keys.link(token),
          UpdateExpression: 'SET consumedAt = :now',
          ConditionExpression:
            'attribute_exists(PK) AND attribute_not_exists(consumedAt) AND expiresAtEpoch > :epoch',
          ExpressionAttributeValues: {
            ':now': now.toISOString(),
            ':epoch': Math.floor(now.getTime() / 1000),
          },
          ReturnValues: 'ALL_NEW',
        }),
      )
      return Attributes ? toMagicLink(Attributes) : null
    } catch (error) {
      // No existe, ya se usó o caducó: para quien llama es el mismo caso.
      if (isConditionFailed(error)) return null
      throw new RepositoryError('No se ha podido canjear el enlace.', { cause: error })
    }
  }

  // -------------------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------------------

  async listSets(): Promise<SetRecord[]> {
    const { Items } = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': keys.setsPartition },
      }),
    )
    // La Query los devuelve ordenados por sort key (el id); el orden de
    // presentación es un atributo, así que se aplica aquí. Son tres ítems.
    return (Items ?? []).map(toSet).sort((a, b) => a.order - b.order)
  }

  async getSet(setId: string): Promise<SetRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: keys.set(setId) }),
    )
    return Item ? toSet(Item) : null
  }

  /** ADD suma en el servidor: no hay que leer el valor antes. */
  async incrementSetAttempts(setId: string): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: keys.set(setId),
        UpdateExpression: 'ADD attempts :one',
        ExpressionAttributeValues: { ':one': 1 },
      }),
    )
  }

  // -------------------------------------------------------------------------
  // Preguntas
  // -------------------------------------------------------------------------

  /**
   * Una Query a la partición del set trae todas sus preguntas.
   *
   * El orden se decide aquí y no en la clave: la sort key es `QUESTION#<id>`
   * para que `getQuestion` sea un GetItem directo, y eso ordena por id, no por
   * fecha. Con unas pocas decenas de preguntas por set, ordenar en memoria
   * sale más barato que la lectura extra que costaría meter la fecha en la
   * clave.
   */
  async listQuestions(setId: string): Promise<QuestionRecord[]> {
    const { Items } = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': keys.questionsPartition(setId),
          ':prefix': keys.questionPrefix,
        },
      }),
    )
    return (Items ?? [])
      .map(toQuestion)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }

  async getQuestion(setId: string, questionId: string): Promise<QuestionRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: keys.question(setId, questionId) }),
    )
    return Item ? toQuestion(Item) : null
  }

  async addQuestion(question: QuestionRecord): Promise<QuestionRecord> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...keys.question(question.setId, question.id),
          entity: 'QUESTION',
          ...question,
        },
      }),
    )
    return question
  }

  // -------------------------------------------------------------------------
  // Intentos
  // -------------------------------------------------------------------------

  async createAttempt(attempt: AttemptRecord): Promise<AttemptRecord> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...keys.attempt(attempt.id), entity: 'ATTEMPT', ...attempt },
      }),
    )
    return attempt
  }

  async getAttempt(attemptId: string): Promise<AttemptRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: keys.attempt(attemptId) }),
    )
    return Item ? toAttempt(Item) : null
  }

  /**
   * Sella la hora de inicio de la pregunta en curso.
   *
   * La condición impide sellar sobre una partida cerrada: si no, se podría
   * reabrir el cronómetro después de terminar.
   */
  async openQuestion(attemptId: string, at: string): Promise<AttemptRecord> {
    try {
      const { Attributes } = await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: keys.attempt(attemptId),
          UpdateExpression: 'SET questionStartedAt = :at',
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(finishedAt)',
          ExpressionAttributeValues: { ':at': at },
          ReturnValues: 'ALL_NEW',
        }),
      )
      if (!Attributes) throw new RepositoryError(`Intento ${attemptId} no encontrado`)
      return toAttempt(Attributes)
    } catch (error) {
      if (isConditionFailed(error)) {
        throw new RepositoryError('La partida no existe o ya está cerrada.')
      }
      throw error
    }
  }

  /**
   * Las respuestas van dentro del ítem del intento: son cinco, se leen siempre
   * juntas y así la partida entera es una sola lectura.
   *
   * `list_append` las añade en el servidor, sin leer-modificar-escribir, de
   * modo que dos respuestas simultáneas no se pisan. La condición impide
   * además seguir respondiendo a una partida ya cerrada.
   */
  async appendAnswer(attemptId: string, answer: AttemptAnswerRecord): Promise<AttemptRecord> {
    try {
      const { Attributes } = await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: keys.attempt(attemptId),
          UpdateExpression:
            'SET answers = list_append(if_not_exists(answers, :empty), :answer) ADD score :points, hits :hit',
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(finishedAt)',
          ExpressionAttributeValues: {
            ':empty': [],
            ':answer': [answer],
            ':points': answer.points,
            ':hit': answer.correct ? 1 : 0,
          },
          ReturnValues: 'ALL_NEW',
        }),
      )
      if (!Attributes) throw new RepositoryError(`Intento ${attemptId} no encontrado`)
      return toAttempt(Attributes)
    } catch (error) {
      if (isConditionFailed(error)) {
        throw new RepositoryError('La partida no existe o ya está cerrada.')
      }
      throw error
    }
  }

  /**
   * `if_not_exists` conserva la marca de cierre original, así que repetir la
   * llamada devuelve lo mismo y no vuelve a puntuar. Idempotente por
   * construcción, sin comprobar nada antes.
   */
  async finishAttempt(attemptId: string): Promise<AttemptRecord> {
    const { Attributes } = await this.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: keys.attempt(attemptId),
        UpdateExpression: 'SET finishedAt = if_not_exists(finishedAt, :now)',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
        ReturnValues: 'ALL_NEW',
      }),
    )
    if (!Attributes) throw new RepositoryError(`Intento ${attemptId} no encontrado`)
    return toAttempt(Attributes)
  }

  // -------------------------------------------------------------------------
  // Marcas y leaderboard
  // -------------------------------------------------------------------------

  /**
   * Lee por GSI1, que ordena las marcas por puntos de mayor a menor — eso es
   * exactamente lo que la tabla base no puede dar, porque allí la sort key es
   * el usuario.
   *
   * Sin `setId` se consulta cada set y se concatena. El ámbito global es una
   * SUMA por usuario, y eso DynamoDB no lo sabe hacer: la agregación la hace
   * `domain/leaderboard.ts`. Es correcto con estos volúmenes y deja de serlo
   * cuando las marcas no quepan cómodamente en memoria; a partir de ahí toca
   * mantener un ítem TOTAL por usuario y ordenarlo en el índice.
   */
  async listScores(setId?: string): Promise<ScoreRecord[]> {
    if (setId) return this.scoresOf(setId)

    const sets = await this.listSets()
    const perSet = await Promise.all(sets.map((set) => this.scoresOf(set.id)))
    return perSet.flat()
  }

  private async scoresOf(setId: string): Promise<ScoreRecord[]> {
    const { Items } = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI1,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': keys.scoresPartition(setId) },
        // De mayor a menor puntuación.
        ScanIndexForward: false,
      }),
    )
    return (Items ?? []).map(toScore)
  }

  async getScore(userId: string, setId: string): Promise<ScoreRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: keys.score(setId, userId) }),
    )
    return Item ? toScore(Item) : null
  }

  /**
   * "Guardar solo si mejora" es una condición, no un if en el código: entre
   * leer la marca anterior y escribir la nueva podría colarse otra partida.
   * Si la condición no se cumple, no se escribe nada y no es un error.
   */
  async saveBestScore(score: ScoreRecord): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: keys.score(score.setId, score.userId),
          UpdateExpression:
            'SET points = :points, averageSeconds = :avg, accuracy = :acc, updatedAt = :now, ' +
            'userId = :userId, setId = :setId, entity = :entity, GSI1PK = :gsi1pk, GSI1SK = :points',
          ConditionExpression: 'attribute_not_exists(points) OR points < :points',
          ExpressionAttributeValues: {
            ':points': score.points,
            ':avg': score.averageSeconds,
            ':acc': score.accuracy,
            ':now': score.updatedAt,
            ':userId': score.userId,
            ':setId': score.setId,
            ':entity': 'SCORE',
            ':gsi1pk': gsi1ForScore(score.setId, score.points).GSI1PK,
          },
        }),
      )
    } catch (error) {
      // La marca anterior era mejor: no hay nada que hacer.
      if (isConditionFailed(error)) return
      throw new RepositoryError('No se ha podido guardar la marca.', { cause: error })
    }
  }
}

// ---------------------------------------------------------------------------
// De ítem de DynamoDB a registro de dominio. Quitan PK/SK y los atributos de
// índice, que son detalle de almacenamiento y no parte del modelo.
// ---------------------------------------------------------------------------

type Item = Record<string, unknown>

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const toUser = (item: Item): UserRecord => ({
  id: item['id'] as string,
  email: item['email'] as string,
  ...(item['name'] ? { name: item['name'] as string } : {}),
  ...(item['handle'] ? { handle: item['handle'] as string } : {}),
  createdAt: item['createdAt'] as string,
})

const toMagicLink = (item: Item): MagicLinkRecord => ({
  token: item['token'] as string,
  email: item['email'] as string,
  expiresAt: item['expiresAt'] as string,
  ...(item['consumedAt'] ? { consumedAt: item['consumedAt'] as string } : {}),
})

const toSet = (item: Item): SetRecord => ({
  id: item['id'] as string,
  order: Number(item['order'] ?? 0),
  category: item['category'] as string,
  level: item['level'] as SetRecord['level'],
  title: item['title'] as string,
  blurb: item['blurb'] as string,
  secondsPerQuestion: Number(item['secondsPerQuestion']),
  status: item['status'] as SetRecord['status'],
  attempts: Number(item['attempts'] ?? 0),
})

const toQuestion = (item: Item): QuestionRecord => ({
  id: item['id'] as string,
  setId: item['setId'] as string,
  tag: item['tag'] as string,
  text: item['text'] as string,
  ...(item['code'] ? { code: item['code'] as string } : {}),
  options: item['options'] as string[],
  correct: Number(item['correct']),
  why: item['why'] as string,
  createdAt: item['createdAt'] as string,
})

const toAttempt = (item: Item): AttemptRecord => ({
  id: item['id'] as string,
  userId: item['userId'] as string,
  setId: item['setId'] as string,
  questionIds: (item['questionIds'] ?? []) as string[],
  secondsPerQuestion: Number(item['secondsPerQuestion']),
  answers: ((item['answers'] ?? []) as AttemptAnswerRecord[]).map((answer) => ({
    ...answer,
    points: Number(answer.points),
    elapsedSeconds: Number(answer.elapsedSeconds),
  })),
  startedAt: item['startedAt'] as string,
  questionStartedAt: (item['questionStartedAt'] ?? item['startedAt']) as string,
  ...(item['finishedAt'] ? { finishedAt: item['finishedAt'] as string } : {}),
  score: Number(item['score'] ?? 0),
  hits: Number(item['hits'] ?? 0),
})

const toScore = (item: Item): ScoreRecord => ({
  userId: item['userId'] as string,
  setId: item['setId'] as string,
  points: Number(item['points']),
  averageSeconds: Number(item['averageSeconds']),
  accuracy: Number(item['accuracy']),
  updatedAt: item['updatedAt'] as string,
})
