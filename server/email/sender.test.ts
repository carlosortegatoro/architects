import assert from 'node:assert/strict'
import test from 'node:test'
import { emailSender } from './sender.js'

test('Mailgun sender uses the EU API and disables tracking for auth links', async () => {
  const previousEnv = {
    APP_BASE_URL: process.env.APP_BASE_URL,
    MAILGUN_API_KEY: process.env.MAILGUN_API_KEY,
    MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN,
    MAILGUN_REGION: process.env.MAILGUN_REGION,
    EMAIL_FROM: process.env.EMAIL_FROM,
  }
  const previousFetch = globalThis.fetch
  const previousConsoleInfo = console.info
  let logArguments: unknown[] | undefined

  process.env.APP_BASE_URL = 'https://architectures.example.com'
  process.env.MAILGUN_API_KEY = 'test-api-key'
  process.env.MAILGUN_DOMAIN = 'mail.example.com'
  process.env.MAILGUN_REGION = 'eu'
  process.env.EMAIL_FROM = 'Architecture Editor <auth@example.com>'

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://api.eu.mailgun.net/v3/mail.example.com/messages')
    assert.equal(init?.method, 'POST')
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from('api:test-api-key').toString('base64')}`,
    )

    const form = init?.body as FormData
    assert.equal(form.get('to'), 'user@salesforce.com')
    assert.equal(form.get('from'), 'Architecture Editor <auth@example.com>')
    assert.equal(form.get('o:tracking'), 'no')
    assert.equal(form.get('o:tracking-clicks'), 'no')
    assert.equal(form.get('o:tracking-opens'), 'no')
    assert.match(String(form.get('html')), /#token=safe-token/)
    return new Response('{"id":"queued"}', { status: 200 })
  }
  console.info = (...args: unknown[]) => {
    logArguments = args
  }

  try {
    await emailSender.sendVerificationEmail('user@salesforce.com', 'safe-token')
    assert.deepEqual(logArguments, [
      '[email] Mailgun accepted message',
      {
        kind: 'verification',
        recipient: 'u***@salesforce.com',
        status: 200,
        messageId: 'queued',
      },
    ])
  } finally {
    globalThis.fetch = previousFetch
    console.info = previousConsoleInfo
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
