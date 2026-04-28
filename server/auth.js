function isLoggedIn(req) {
  return Boolean(req.session && req.session.isAdminLoggedIn)
}

function requireLogin(req, res, next) {
  if (isLoggedIn(req)) return next()

  const nextUrl = encodeURIComponent(req.originalUrl || '/')
  return res.redirect(`/login?next=${nextUrl}`)
}

module.exports = {
  isLoggedIn,
  requireLogin
}
