const { NFC } = require('nfc-pcsc')
const EventEmitter = require('events')

class NfcService extends EventEmitter {
  constructor() {
    super()
    this.nfc = null
    this.hasStarted = false
    this.lastUid = ''
    this.lastUidAt = 0
  }

  start() {
    if (this.hasStarted) return
    this.hasStarted = true

    try {
      this.nfc = new NFC()

      this.nfc.on('reader', (reader) => {
        console.log('Reader connected')

        reader.on('card', (card) => {
          const uid = String(card?.uid || '').trim().toUpperCase()
          if (!uid) return

          const now = Date.now()
          if (uid === this.lastUid && now - this.lastUidAt < 1000) return

          this.lastUid = uid
          this.lastUidAt = now

          console.log(`Card detected: ${uid}`)
          this.emit('card', { uid, reader: reader.name, at: now })
        })

        reader.on('error', (error) => {
          console.error(`[NFC] Reader error (${reader.name}):`, error?.message || error)
        })

        reader.on('end', () => {
          console.log(`[NFC] Reader disconnected: ${reader.name}`)
        })
      })

      this.nfc.on('error', (error) => {
        console.error('[NFC] Service error:', error?.message || error)
      })
    } catch (error) {
      console.error('[NFC] Failed to start NFC service:', error?.message || error)
    }
  }
}

module.exports = new NfcService()
