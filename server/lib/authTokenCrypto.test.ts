import assert from 'node:assert/strict'
import test from 'node:test'
import { generateAuthToken, hashAuthToken } from './authTokenCrypto.js'

test('auth tokens are URL-safe, random, and sufficiently long', () => {
  const first = generateAuthToken()
  const second = generateAuthToken()

  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.match(second, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first, second)
})

test('auth tokens are hashed with SHA-256', () => {
  assert.equal(hashAuthToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
