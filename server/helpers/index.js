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
  buildLeaderboard,
  isCorrectNormal,
  isCorrectFinal,
  objectIdOrNull,
  normalizeAnswer
}
