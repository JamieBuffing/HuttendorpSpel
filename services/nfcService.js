const EventEmitter = require('events')

class NfcService extends EventEmitter {
  start() {
    console.log('[NFC] Lokale NFC service uitgeschakeld/niet aanwezig.')
  }
}

module.exports = new NfcService()
