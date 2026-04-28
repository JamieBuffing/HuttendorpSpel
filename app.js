const express = require('express')
const path = require('path')
const session = require('express-session')
const MongoStore = require('connect-mongo').default

const app = express()

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET ontbreekt in .env')
}

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI ontbreekt in .env')
}

app.disable('x-powered-by')

app.set('view engine', 'ejs')
app.set('views', [
  path.join(__dirname, 'views'),
  path.join(__dirname, 'modules')
])

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}))

app.use((req, res, next) => {
  res.locals.googleUser = req.session.googleUser || null
  res.locals.microsoftUser = req.session.microsoftUser || null
  res.locals.user = req.session.googleUser || req.session.microsoftUser || null
  res.locals.isAdminLoggedIn = Boolean(req.session.isAdminLoggedIn)
  res.locals.isGoogleLoggedIn = Boolean(req.session.googleUser)
  res.locals.isMicrosoftLoggedIn = Boolean(req.session.microsoftUser)
  res.locals.cookieConsent = req.session?.cookieConsent || 'unknown'
  next()
})

app.use('/base', express.static(path.join(__dirname, 'base')))
app.use(express.static(path.join(__dirname, 'public')))

// MODULE_IMPORTS
const vercelblob = require('./modules/vercelblob'); 
const mongodb = require('./modules/mongodb');

const modules = [
  // MODULE_ROUTES
  vercelblob,
  mongodb,
]

modules.forEach((mod) => {
  if (mod.publicPath) {
    app.use(mod.path + '/static', express.static(mod.publicPath))
  }

  app.use(mod.path, mod.router)
})

const pageRoutes = require('./server/pages/pages')
const postRoutes = require('./server/post')

app.use(pageRoutes)
app.use(postRoutes)

module.exports = app
