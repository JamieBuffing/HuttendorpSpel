const EventEmitter = require('events')

class NfcService extends EventEmitter {
  start() {
    // Stub voor deployments/lokale dev zonder USB NFC bridge.
    // De browser/ESP32 endpoints blijven gewoon werken.
    return false
  }

  stop() {
    return false
  }
}

module.exports = new NfcService()
