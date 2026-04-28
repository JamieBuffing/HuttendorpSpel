const { Resend } = require('resend');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendMail({ from, to, subject, replyTo, html, cc, bcc }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY ontbreekt in process.env');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const emailPayload = {
    from,
    to,
    subject,
    html
  };

  if (replyTo) emailPayload.replyTo = replyTo;
  if (cc) emailPayload.cc = cc;
  if (bcc) emailPayload.bcc = bcc;

  return resend.emails.send(emailPayload);
}

module.exports = {
  sendMail,
  escapeHtml
};