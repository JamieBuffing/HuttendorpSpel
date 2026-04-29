const { ObjectId } = require('mongodb')
const { getDb } = require('../../modules/mongodb/server/client')

const POST_IDS = Array.from({ length: 20 }, (_, index) => `p${String(index + 1).padStart(2, '0')}`)

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

async function getFirstAvailablePostId(currentQuestionId = null) {
  const database = await db()
  const filter = { type: 'normal', isActive: { $ne: false }, postId: { $exists: true, $ne: null } }
  if (currentQuestionId) filter._id = { $ne: new ObjectId(currentQuestionId) }

  const questions = await database.collection('questions').find(filter).project({ postId: 1 }).toArray()
  const used = new Set(questions.map((question) => question.postId))
  return POST_IDS.find((postId) => !used.has(postId)) || null
}

async function recalculateTeamPoints(teamId) {
  const database = await db()
  const team = await database.collection('teams').findOne({ _id: new ObjectId(teamId) })
  if (!team) return null

  const totalPoints = (team.questionProgress || []).reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0)
  await database.collection('teams').updateOne(
    { _id: team._id },
    { $set: { totalPoints, updatedAt: new Date() } }
  )
  return totalPoints
}

async function saveAnswerFromEsp({ postId, cardId, teamId, answer }) {
  const database = await db()

  const cleanPostId = String(postId || '').trim()
  const cleanCardId = String(cardId || teamId || '').trim()
  const selectedAnswer = String(answer || '').trim().toUpperCase()

  if (!cleanPostId) return { ok: false, error: 'postId ontbreekt' }
  if (!cleanCardId) return { ok: false, error: 'teamId/cardId ontbreekt' }
  if (!['R', 'G', 'B'].includes(selectedAnswer)) return { ok: false, error: 'Ongeldig antwoord' }

  const [team, question] = await Promise.all([
    database.collection('teams').findOne({ cardId: cleanCardId, isActive: { $ne: false } }),
    database.collection('questions').findOne({ postId: cleanPostId, type: 'normal', isActive: { $ne: false } })
  ])

  if (!team) return { ok: false, error: 'Team niet gevonden', postId: cleanPostId, cardId: cleanCardId, answer: selectedAnswer }
  if (!question) return { ok: false, error: 'Vraag/post niet gevonden', postId: cleanPostId, cardId: cleanCardId, answer: selectedAnswer }

  const isCorrect = isCorrectNormal(question, selectedAnswer)
  const pointsEarned = isCorrect ? Number(question.points || 0) : 0

  const progressItem = {
    questionId: question._id,
    type: 'normal',
    postId: cleanPostId,
    selectedAnswer,
    isCorrect,
    pointsEarned,
    hintViews: 3, // Standaard aantal hint views
    answeredAt: new Date()
  }

  await database.collection('teams').updateOne(
    { _id: team._id },
    { $pull: { questionProgress: { questionId: question._id } } }
  )

  await database.collection('teams').updateOne(
    { _id: team._id },
    {
      $push: { questionProgress: progressItem },
      $set: { updatedAt: new Date() }
    }
  )

  const totalPoints = await recalculateTeamPoints(team._id)

  return {
    ok: true,
    postId: cleanPostId,
    teamId: cleanCardId,
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
  const [teams, requiredFinalQuestions] = await Promise.all([
    database.collection('teams').find({ isActive: { $ne: false } }).toArray(),
    database.collection('questions').find({ type: 'final', requiredForLeaderboard: true, isActive: { $ne: false } }).project({ _id: 1 }).toArray()
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

  const [questions, teams] = await Promise.all([
    database.collection('questions').find({ type: 'normal', isActive: { $ne: false } }).sort({ postId: 1 }).toArray(),
    database.collection('teams').find({ isActive: { $ne: false } }).sort({ name: 1 }).toArray()
  ])

  const totalTeams = teams.length
  const totalQuestions = questions.length
  const totalPossibleAnswers = totalQuestions * totalTeams

  const normalProgressItems = teams.flatMap((team) => {
    return (team.questionProgress || [])
      .filter((item) => item.type === 'normal')
      .map((item) => ({ team, progress: item }))
  })

  const answeredTotal = normalProgressItems.length

  const answeredCountsPerTeam = teams.map((team) => {
    const answeredCount = (team.questionProgress || []).filter((item) => item.type === 'normal').length

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

function objectIdOrNull(value) {
  try {
    return new ObjectId(value)
  } catch (error) {
    return null
  }
}

module.exports = {
  POST_IDS,
  db,
  requireLogin,
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