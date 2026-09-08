import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowedEmailAddress } from '../../shared/emailPolicy.js'

test('email policy allows Salesforce accounts and the dedicated Gmail test account', () => {
  assert.equal(isAllowedEmailAddress('user@salesforce.com'), true)
  assert.equal(isAllowedEmailAddress(' CarlosOrtegaToro@GMAIL.com '), true)
})

test('email policy rejects other external accounts and lookalike domains', () => {
  assert.equal(isAllowedEmailAddress('another-user@gmail.com'), false)
  assert.equal(isAllowedEmailAddress('user@salesforce.com.example.org'), false)
})
