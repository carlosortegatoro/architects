import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

// Heroku Postgres (backed by RDS) requires TLS even for local connections and
// terminates it with a cert not in Node's default CA bundle; rejectUnauthorized:
// false is Heroku's documented pattern for their managed Postgres — the
// connection is still encrypted, just not chain-verified. Only skip TLS for an
// actual local database.
const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
})

async function main() {
  await pool.query('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')

  const applied = new Set((await pool.query('SELECT name FROM _migrations')).rows.map((r) => r.name))
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`Applied ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  console.log('Migrations up to date.')
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
