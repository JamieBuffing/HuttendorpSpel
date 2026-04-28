const { sendMail, escapeHtml } = require('./server/helpers');

module.exports = {
  sendMail,
  escapeHtml,
  key: 'mailer',
  access: {
    type: 'service',
    required: true,
    teamBased: false,
    canDisable: false
}
}