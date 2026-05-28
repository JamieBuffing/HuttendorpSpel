const { ObjectId } = require('mongodb')
const { getDb } = require('../../modules/mongodb/server/client')

const POST_IDS = Array.from({ length: 20 }, (_, index) => `p${String(index + 1).padStart(2, '0')}`)
const DEFAULT_GAME_NAME = 'Standaard spel'

async function db() {
  return getDb()
}

function requireLogin(req, res, next) {
  if (req.session?.isAdminLoggedIn) return next()
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`)
}

function normalizeAnswer(value) {
  return String(value || '').trim()
}

function isCorrectNormal(question, selectedAnswer) {
  const answer = question.answers?.find((item) => item.key === selectedAnswer)
  return Boolean(answer?.isCorrect)
}

function isCorrectFinal(question, givenAnswer) {
  return normalizeAnswer(givenAnswer).toLowerCase() === normalizeAnswer(question.correctAnswer).toLowerCase()
}

function objectIdOrNull(value) {
  if (!value) return null
  if (value instanceof ObjectId) return value

  try {
    return new ObjectId(value)
  } catch (error) {
    return null
  }
}

function asObjectId(value) {
  return objectIdOrNull(value)
}

async function ensureCurrentGame() {
  const database = await db()
  const games = database.collection('games')
  const now = new Date()

  let currentGame = await games.findOne({ isCurrent: true, isActive: { $ne: false } })

  if (!currentGame) {
    currentGame = await games.findOne({ isActive: { $ne: false } }, { sort: { createdAt: 1 } })

    if (!currentGame) {
      const result = await games.insertOne({
        name: DEFAULT_GAME_NAME,
        isCurrent: true,
        isActive: true,
        createdAt: now,
        updatedAt: now
      })

      currentGame = await games.findOne({ _id: result.insertedId })
    } else {
      await games.updateOne(
        { _id: currentGame._id },
        { $set: { isCurrent: true, isActive: true, updatedAt: now } }
      )
      currentGame = await games.findOne({ _id: currentGame._id })
    }
  }

  await games.updateMany(
    { _id: { $ne: currentGame._id }, isCurrent: true },
    { $set: { isCurrent: false, updatedAt: now } }
  )

  await Promise.all([
    database.collection('teams').updateMany(
      { gameId: { $exists: false } },
      { $set: { gameId: currentGame._id, updatedAt: now } }
    ),
    database.collection('questions').updateMany(
      { gameId: { $exists: false } },
      { $set: { gameId: currentGame._id, updatedAt: now } }
    )
  ])

  return currentGame
}

async function getGameContext() {
  const database = await db()
  const currentGame = await ensureCurrentGame()
  const games = await database.collection('games')
    .find({ isActive: { $ne: false } })
    .sort({ createdAt: 1, name: 1 })
    .toArray()

  return { currentGame, games }
}

async function getCurrentGameId() {
  const currentGame = await ensureCurrentGame()
  return currentGame._id
}

async function setCurrentGame(gameId) {
  const database = await db()
  const cleanGameId = asObjectId(gameId)
  if (!cleanGameId) return null

  const game = await database.collection('games').findOne({
    _id: cleanGameId,
    isActive: { $ne: false }
  })

  if (!game) return null

  const now = new Date()
  await database.collection('games').updateMany({}, { $set: { isCurrent: false, updatedAt: now } })
  await database.collection('games').updateOne(
    { _id: game._id },
    { $set: { isCurrent: true, isActive: true, updatedAt: now } }
  )

  await Promise.all([
    database.collection('teams').updateMany(
      { gameId: { $exists: false } },
      { $set: { gameId: game._id, updatedAt: now } }
    ),
    database.collection('questions').updateMany(
      { gameId: { $exists: false } },
      { $set: { gameId: game._id, updatedAt: now } }
    )
  ])

  return database.collection('games').findOne({ _id: game._id })
}

async function createGame(name) {
  const database = await db()
  const cleanName = String(name || '').trim()
  if (!cleanName) return null

  const now = new Date()
  const result = await database.collection('games').insertOne({
    name: cleanName,
    isCurrent: false,
    isActive: true,
    createdAt: now,
    updatedAt: now
  })

  return database.collection('games').findOne({ _id: result.insertedId })
}

async function gameFilter(extra = {}, gameId = null) {
  const resolvedGameId = asObjectId(gameId) || await getCurrentGameId()
  return { ...extra, gameId: resolvedGameId }
}

async function getFirstAvailablePostId(currentQuestionId = null, gameId = null) {
  const database = await db()
  const filter = await gameFilter({
    type: 'normal',
    isActive: { $ne: false },
    postId: { $exists: true, $ne: null }
  }, gameId)

  const cleanCurrentQuestionId = asObjectId(currentQuestionId)
  if (cleanCurrentQuestionId) filter._id = { $ne: cleanCurrentQuestionId }

  const questions = await database.collection('questions').find(filter).project({ postId: 1 }).toArray()
  const used = new Set(questions.map((question) => question.postId))
  return POST_IDS.find((postId) => !used.has(postId)) || null
}

async function recalculateTeamPoints(teamId) {
  const database = await db()
  const cleanTeamId = asObjectId(teamId)
  if (!cleanTeamId) return null

  const team = await database.collection('teams').findOne({ _id: cleanTeamId })
  if (!team) return null

  const totalPoints = (team.questionProgress || []).reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0)
  await database.collection('teams').updateOne(
    { _id: team._id },
    { $set: { totalPoints, updatedAt: new Date() } }
  )
  return totalPoints
}

async function saveAnswerFromEsp({ postId, cardId, teamId, answer, allowOverwrite = false }) {
  const database = await db()
  const currentGame = await ensureCurrentGame()
  const gameId = currentGame._id

  const cleanPostId = String(postId || '').trim().toLowerCase()
  const cleanCardId = String(cardId || teamId || '').trim().toUpperCase()
  const selectedAnswer = String(answer || '').trim().toUpperCase()

  if (!cleanPostId) return { ok: false, error: 'postId ontbreekt' }
  if (!cleanCardId) return { ok: false, error: 'teamId/cardId ontbreekt' }
  if (!['R', 'G', 'B'].includes(selectedAnswer)) return { ok: false, error: 'Ongeldig antwoord' }

  const [team, question] = await Promise.all([
    database.collection('teams').findOne({ gameId, cardId: cleanCardId, isActive: { $ne: false } }),
    database.collection('questions').findOne({ gameId, postId: cleanPostId, type: 'normal', isActive: { $ne: false } })
  ])

  if (!team) return { ok: false, error: 'Team niet gevonden', gameId: String(gameId), gameName: currentGame.name, postId: cleanPostId, cardId: cleanCardId, answer: selectedAnswer }
  if (!question) return { ok: false, error: 'Vraag/post niet gevonden', gameId: String(gameId), gameName: currentGame.name, postId: cleanPostId, cardId: cleanCardId, answer: selectedAnswer }

  const existingProgress = (team.questionProgress || []).find((item) => {
    return item.type === 'normal' && String(item.questionId) === String(question._id)
  })

  if (existingProgress && !allowOverwrite) {
    return {
      ok: false,
      error: 'Vraag al beantwoord',
      alreadyAnswered: true,
      gameId: String(gameId),
      gameName: currentGame.name,
      postId: cleanPostId,
      teamId: cleanCardId,
      cardId: cleanCardId,
      answer: selectedAnswer,
      teamName: team.name,
      questionTitle: question.title,
      existingAnswer: existingProgress.selectedAnswer || null,
      answeredAt: existingProgress.answeredAt || null
    }
  }

  const isCorrect = isCorrectNormal(question, selectedAnswer)
  const pointsEarned = isCorrect ? Number(question.points || 0) : 0

  const progressItem = {
    questionId: question._id,
    gameId,
    type: 'normal',
    postId: cleanPostId,
    selectedAnswer,
    isCorrect,
    pointsEarned,
    hintViews: 3,
    answeredAt: new Date()
  }

  if (existingProgress) {
    await database.collection('teams').updateOne(
      { _id: team._id, gameId },
      { $pull: { questionProgress: { questionId: question._id } } }
    )
  }

  await database.collection('teams').updateOne(
    { _id: team._id, gameId },
    {
      $push: { questionProgress: progressItem },
      $set: { updatedAt: new Date() }
    }
  )

  const totalPoints = await recalculateTeamPoints(team._id)

  return {
    ok: true,
    alreadyAnswered: false,
    gameId: String(gameId),
    gameName: currentGame.name,
    postId: cleanPostId,
    teamId: cleanCardId,
    cardId: cleanCardId,
    answer: selectedAnswer,
    teamName: team.name,
    questionTitle: question.title,
    isCorrect,
    pointsEarned,
    totalPoints
  }
}

async function buildLeaderboard() {
  const database = await db()
  const gameId = await getCurrentGameId()
  const [teams, requiredFinalQuestions] = await Promise.all([
    database.collection('teams').find({ gameId, isActive: { $ne: false } }).toArray(),
    database.collection('questions').find({ gameId, type: 'final', requiredForLeaderboard: true, isActive: { $ne: false } }).project({ _id: 1 }).toArray()
  ])

  const requiredIds = requiredFinalQuestions.map((question) => String(question._id))

  return teams.map((team) => {
    const progress = team.questionProgress || []
    const hasRequiredFinalQuestions = requiredIds.length > 0
    const finalQuestionsCorrect = hasRequiredFinalQuestions && requiredIds.every((questionId) => {
      return progress.some((item) => String(item.questionId) === questionId && item.type === 'final' && item.isCorrect === true)
    })

    return {
      ...team,
      finalQuestionsCorrect,
      hasRequiredFinalQuestions
    }
  }).sort((a, b) => {
    if (a.finalQuestionsCorrect !== b.finalQuestionsCorrect) {
      return Number(b.finalQuestionsCorrect) - Number(a.finalQuestionsCorrect)
    }
    return Number(b.totalPoints || 0) - Number(a.totalPoints || 0)
  })
}

async function buildLeidingOverview() {
  const database = await db()
  const gameId = await getCurrentGameId()

  const [questions, teams] = await Promise.all([
    database.collection('questions').find({ gameId, type: 'normal', isActive: { $ne: false } }).sort({ postId: 1 }).toArray(),
    database.collection('teams').find({ gameId, isActive: { $ne: false } }).sort({ name: 1 }).toArray()
  ])

  const totalTeams = teams.length
  const totalQuestions = questions.length
  const totalPossibleAnswers = totalQuestions * totalTeams

  const questionIds = new Set(questions.map((question) => String(question._id)))

  const normalProgressItems = teams.flatMap((team) => {
    return (team.questionProgress || [])
      .filter((item) => item.type === 'normal' && questionIds.has(String(item.questionId)))
      .map((item) => ({ team, progress: item }))
  })

  const answeredTotal = normalProgressItems.length

  const answeredCountsPerTeam = teams.map((team) => {
    const answeredCount = (team.questionProgress || []).filter((item) => {
      return item.type === 'normal' && questionIds.has(String(item.questionId))
    }).length

    return {
      team,
      answeredCount
    }
  })

  const fastestTeam = answeredCountsPerTeam
    .slice()
    .sort((a, b) => b.answeredCount - a.answeredCount || String(a.team.name).localeCompare(String(b.team.name)))[0] || null

  const slowestTeam = answeredCountsPerTeam
    .slice()
    .sort((a, b) => a.answeredCount - b.answeredCount || String(a.team.name).localeCompare(String(b.team.name)))[0] || null

  const answerDates = normalProgressItems
    .map((item) => item.progress.answeredAt ? new Date(item.progress.answeredAt) : null)
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b)

  const firstAnswerAt = answerDates[0] || null
  const lastAnswerAt = answerDates[answerDates.length - 1] || null
  const now = new Date()

  let gameTimeMs = 0
  let gameTimeIsRunning = false

  if (firstAnswerAt && lastAnswerAt) {
    const msSinceLastAnswer = now - lastAnswerAt
    const tenMinutesMs = 10 * 60 * 1000

    if (msSinceLastAnswer <= tenMinutesMs) {
      gameTimeMs = now - firstAnswerAt
      gameTimeIsRunning = true
    } else {
      gameTimeMs = lastAnswerAt - firstAnswerAt
    }
  }

  const rows = questions.map((question) => {
    const teamRows = teams.map((team) => {
      const progress = (team.questionProgress || []).find((item) => String(item.questionId) === String(question._id) && item.type === 'normal')

      return {
        team,
        progress: progress || null,
        answer: progress?.selectedAnswer || '-',
        isCorrect: progress?.isCorrect === true,
        pointsEarned: Number(progress?.pointsEarned || 0),
        answeredAt: progress?.answeredAt || null
      }
    })

    const answeredRows = teamRows.filter((row) => row.progress)
    const counts = {
      R: answeredRows.filter((row) => row.answer === 'R').length,
      G: answeredRows.filter((row) => row.answer === 'G').length,
      B: answeredRows.filter((row) => row.answer === 'B').length
    }

    return {
      question,
      totalTeams,
      answeredCount: answeredRows.length,
      counts,
      totalAnswers: answeredRows.length,
      teamRows
    }
  })

  return {
    stats: {
      answeredTotal,
      totalPossibleAnswers,
      totalQuestions,
      totalTeams,
      fastestTeam,
      slowestTeam,
      firstAnswerAt,
      lastAnswerAt,
      gameTimeMs,
      gameTimeIsRunning
    },
    rows
  }
}

module.exports = {
  POST_IDS,
  db,
  requireLogin,
  ensureCurrentGame,
  getGameContext,
  getCurrentGameId,
  setCurrentGame,
  createGame,
  gameFilter,
  getFirstAvailablePostId,
  recalculateTeamPoints,
  saveAnswerFromEsp,
  buildLeaderboard,
  buildLeidingOverview,
  isCorrectNormal,
  isCorrectFinal,
  objectIdOrNull,
  normalizeAnswer
}
