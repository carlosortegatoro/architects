import dns from 'node:dns'
import pg from 'pg'

const { Pool } = pg

// RDS hostnames often resolve with an IPv6 address first; on networks without
// working IPv6 routing, Node's internal dns.lookup() (which pg calls with no
// family option) waits for that dead connection attempt to time out before
// retrying with IPv4 — adding tens of seconds to every new pooled connection.
// This reorders getaddrinfo results process-wide so IPv4 is tried first.
dns.setDefaultResultOrder('ipv4first')

// Heroku Postgres (backed by RDS) requires TLS even for local connections and
// terminates it with a cert not in Node's default CA bundle; rejectUnauthorized:
// false is Heroku's documented pattern for their managed Postgres — the
// connection is still encrypted, just not chain-verified. Only skip TLS for an
// actual local database.
const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
})
