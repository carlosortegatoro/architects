import type { ParticleSpeed } from '../types'

// Duration in milliseconds for a particle to travel the full length of a connection.
export const PARTICLE_SPEED_MS: Record<Exclude<ParticleSpeed, 'none' | 'zero-copy'>, number> = {
  'real-time': 600,
  'near-real-time': 2000,
  batch: 6000,
}

// Duration in milliseconds for one full dash-pattern cycle on zero-copy connections.
export const ZERO_COPY_DASH_MS = 1200
