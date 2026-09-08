import { passwordResetEmail, verificationEmail } from './templates.js'

type MailgunContent = {
  subject: string
  text: string
  html: string
}

type EmailKind = 'verification' | 'password_reset'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function mailgunBaseUrl(): string {
  if (process.env.MAILGUN_API_BASE_URL) return process.env.MAILGUN_API_BASE_URL.replace(/\/$/, '')
  return process.env.MAILGUN_REGION?.toLowerCase() === 'eu'
    ? 'https://api.eu.mailgun.net'
    : 'https://api.mailgun.net'
}

function maskedRecipient(email: string): string {
  const separator = email.lastIndexOf('@')
  if (separator <= 0) return '[redacted]'
  return `${email.slice(0, 1)}***@${email.slice(separator + 1)}`
}

function mailgunMessageId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { id?: unknown }
    return typeof parsed.id === 'string' ? parsed.id : undefined
  } catch {
    return undefined
  }
}

async function sendEmail(kind: EmailKind, to: string, content: MailgunContent): Promise<void> {
  const apiKey = requiredEnv('MAILGUN_API_KEY')
  const domain = requiredEnv('MAILGUN_DOMAIN')
  const from = process.env.EMAIL_FROM?.trim() || `Architecture Editor <postmaster@${domain}>`
  const form = new FormData()
  form.set('from', from)
  form.set('to', to)
  form.set('subject', content.subject)
  form.set('text', content.text)
  form.set('html', content.html)
  form.set('o:tag', 'authentication')
  form.set('o:tracking', 'no')
  form.set('o:tracking-clicks', 'no')
  form.set('o:tracking-opens', 'no')

  const response = await fetch(`${mailgunBaseUrl()}/v3/${encodeURIComponent(domain)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
    },
    body: form,
  })

  const responseBody = await response.text()
  if (!response.ok) {
    const detail = responseBody.slice(0, 300)
    throw new Error(`Mailgun rejected the email (${response.status}): ${detail}`)
  }

  console.info('[email] Mailgun accepted message', {
    kind,
    recipient: maskedRecipient(to),
    status: response.status,
    messageId: mailgunMessageId(responseBody) ?? 'not-returned',
  })
}

export const emailSender = {
  sendVerificationEmail(email: string, token: string) {
    return sendEmail('verification', email, verificationEmail(token))
  },

  sendPasswordResetEmail(email: string, token: string) {
    return sendEmail('password_reset', email, passwordResetEmail(token))
  },
}
