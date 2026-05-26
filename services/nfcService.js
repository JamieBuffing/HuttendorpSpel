const EventEmitter = require('events')

class NfcService extends EventEmitter {
  start() {
    return false
  }

  stop() {
    return false
  }
}

module.exports = new NfcService()
