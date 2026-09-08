type EmailContent = {
  subject: string
  text: string
  html: string
}

function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production') throw new Error('APP_BASE_URL is not set')
  return 'http://localhost:5173'
}

function actionUrl(path: string, token: string): string {
  return `${appBaseUrl()}${path}#token=${encodeURIComponent(token)}`
}

function emailLayout(title: string, body: string, buttonLabel: string, url: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
          <tr><td>
            <h1 style="font-size:22px;margin:0 0 16px">${title}</h1>
            <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${body}</p>
            <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:8px">${buttonLabel}</a></p>
            <p style="font-size:12px;line-height:1.5;color:#64748b;margin:0">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${url}</span></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

export function verificationEmail(token: string): EmailContent {
  const url = actionUrl('/verify-email', token)
  return {
    subject: 'Verify your Architecture Editor account',
    text: `Verify your Architecture Editor account by opening this link:\n\n${url}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`,
    html: emailLayout(
      'Verify your email',
      'Confirm your email address to activate your Architecture Editor account. This link expires in 24 hours.',
      'Verify email',
      url,
    ),
  }
}

export function passwordResetEmail(token: string): EmailContent {
  const url = actionUrl('/reset-password', token)
  return {
    subject: 'Reset your Architecture Editor password',
    text: `Reset your Architecture Editor password by opening this link:\n\n${url}\n\nThis link expires in 30 minutes. If you did not request a password reset, you can ignore this email.`,
    html: emailLayout(
      'Reset your password',
      'Use the button below to choose a new Architecture Editor password. This link expires in 30 minutes.',
      'Reset password',
      url,
    ),
  }
}
