require('dotenv').config({ quiet: true })

const app = require('./app')
const os = require('os')

console.log('\x1b[34m -----   Huttendorp spel   ----- \x1b[0m')
console.log('\x1b[32m Back-end start op \x1b[0m')

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return null
}

module.exports = app

if (process.env.VERCEL !== '1') {
  app.listen(1188, '0.0.0.0', () => {
    const ip = getLocalIP()

    console.log('\x1b[32m Front-end start op \x1b[0m')
    const mode = (process.env.NODE_ENV || 'development').toLowerCase()
    console.log(`\x1b[31m ${mode === 'production' ? 'Production' : 'Development'} \x1b[0m`)

    const RESET = '\x1b[0m'
    const BORDER = '\x1b[34m'
    const TOP = '\x1b[40m'
    const VERCEL = '\x1b[42m'
    const LEFT = '\x1b[44m'
    const RIGHT = '\x1b[45m'
    const colWidth = 50

    const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '')
    const center = (text, width) => {
      const cleanLen = stripAnsi(text).length
      const space = Math.max(0, width - cleanLen)
      const leftPad = Math.floor(space / 2)
      const rightPad = space - leftPad
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad)
    }

    const CH = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', t: '┬', b: '┴', l: '├', r: '┤', c: '┼' }

    const topBorder = () =>
      console.log(BORDER + CH.tl + CH.h.repeat(colWidth) + CH.t + CH.h.repeat(colWidth) + CH.tr + RESET)
    const midBorder = () =>
      console.log(BORDER + CH.l + CH.h.repeat(colWidth) + CH.c + CH.h.repeat(colWidth) + CH.r + RESET)
    const bottomBorder = () =>
      console.log(BORDER + CH.bl + CH.h.repeat(colWidth) + CH.b + CH.h.repeat(colWidth) + CH.br + RESET)

    const row = (leftText, rightText) => {
      console.log(
        BORDER +
          CH.v +
          RESET +
          LEFT +
          center(leftText, colWidth) +
          RESET +
          BORDER +
          CH.v +
          RESET +
          RIGHT +
          center(rightText, colWidth) +
          RESET +
          BORDER +
          CH.v +
          RESET
      )
    }

    const span2 = (text) => {
      const totalWidth = colWidth * 2 + 1
      console.log(BORDER + CH.v + RESET + TOP + center(text, totalWidth) + RESET + BORDER + CH.v + RESET)
    }

    const span3 = (text) => {
      const totalWidth = colWidth * 2 + 1
      console.log(BORDER + CH.v + RESET + VERCEL + center(text, totalWidth) + RESET + BORDER + CH.v + RESET)
    }

    topBorder()
    span2('Netwerkadressen')
    midBorder()
    span3(process.env.SITE_URL || 'SITE_URL niet ingesteld')
    midBorder()
    row('Lokaal', 'Binnen het netwerk | login werkt niet')
    midBorder()
    row('→ http://localhost:1188', ip ? `http://${ip}:1188` : 'IP niet gevonden')
    bottomBorder()

    console.log('\x1b[32m App is opgestart! \x1b[0m')
  })
}
