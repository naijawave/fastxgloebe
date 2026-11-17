'use strict';
/**
 * Email sender for fastxgloebe verification / password-reset codes.
 *
 * LIVE mode (production): set OTP_MODE=live plus BREVO_API_KEY and
 * BREVO_SENDER_EMAIL. Codes are sent through the Brevo REST API and land
 * in the customer's real email inbox/app. The code is NEVER returned in
 * the API response in live mode.
 *
 * DEV mode (OTP_MODE is anything else, or no Brevo key): the code is
 * printed to the server log and returned in the API response as
 * `dev_code` so local development and automated tests can complete the
 * flow. NEVER run production in dev mode — customers would not receive
 * a real email.
 */
const OTP_LIVE = () => String(process.env.OTP_MODE || '').toLowerCase() === 'live' && !!process.env.BREVO_API_KEY;

async function sendCodeEmail(to, code, purpose) {
  const isReset = purpose === 'reset';
  const subject = isReset
    ? 'fastxgloebe — your password reset code'
    : 'fastxgloebe — verify your email';
  const intro = isReset
    ? 'You asked to reset your fastxgloebe password. Use this code to set a new password:'
    : 'Welcome to fastxgloebe. Use this code to verify your email and finish creating your account:';
  const text = `${intro}\n\n${code}\n\nThis code expires in 15 minutes. If you did not request it, ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#0a2540;margin:0 0 12px">fastxgloebe</h2>
    <p>${intro}</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0a2540">${code}</p>
    <p style="color:#5c6b7a">This code expires in 15 minutes. If you did not request it, ignore this email.</p>
  </div>`;

  if (OTP_LIVE()) {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_SENDER_EMAIL || 'info@fastxgloebe.com', name: 'fastxgloebe' },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Email service rejected the send (${resp.status}): ${body.slice(0, 200)}`);
    }
    return { live: true };
  }

  console.log(`[fastxgloebe] DEV MODE email code for ${to} (${purpose}): ${code} — set OTP_MODE=live + BREVO_API_KEY in production so codes land in real inboxes.`);
  return { live: false, dev_code: code };
}

module.exports = { sendCodeEmail, OTP_LIVE };
