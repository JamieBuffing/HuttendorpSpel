const { EventEmitter } = require('events')

class NfcService extends EventEmitter {
  start() {
    if (process.env.NFC_SERVICE_DEBUG === '1') {
      console.log('[nfcService] Stub gestart')
    }
  }
}

module.exports = new NfcService()
