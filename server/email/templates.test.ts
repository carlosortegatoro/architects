import assert from 'node:assert/strict'
import test from 'node:test'
import { passwordResetEmail, verificationEmail } from './templates.js'

test('verification links keep the token in the URL fragment', () => {
  const previous = process.env.APP_BASE_URL
  process.env.APP_BASE_URL = 'https://architectures.example.com/'
  try {
    const email = verificationEmail('token/value')
    const expected = 'https://architectures.example.com/verify-email#token=token%2Fvalue'
    assert.match(email.subject, /Verify/)
    assert.ok(email.text.includes(expected))
    assert.ok(email.html.includes(expected))
  } finally {
    if (previous === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = previous
  }
})

test('password reset email documents the 30 minute expiry', () => {
  const previous = process.env.APP_BASE_URL
  process.env.APP_BASE_URL = 'https://architectures.example.com'
  try {
    const email = passwordResetEmail('safe-token')
    assert.ok(email.text.includes('/reset-password#token=safe-token'))
    assert.match(email.text, /30 minutes/)
  } finally {
    if (previous === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = previous
  }
})
