import type { DiagramFile } from '../../src/types.js'

export type DocumentSnapshot = { name: string; content: DiagramFile }
export type DocumentHistory = { past: DocumentSnapshot[]; future: DocumentSnapshot[] }
const LIMIT = 50

export function recordChange(history: DocumentHistory, before: DocumentSnapshot): DocumentHistory {
  return { past: [...history.past, before].slice(-LIMIT), future: [] }
}

export function traverseHistory(history: DocumentHistory, current: DocumentSnapshot, action: 'undo' | 'redo') {
  const from = action === 'undo' ? history.past : history.future
  const target = from.at(-1)
  if (!target) throw new Error(`Nothing to ${action}`)
  return {
    target,
    history: action === 'undo'
      ? { past: history.past.slice(0, -1), future: [...history.future, current].slice(-LIMIT) }
      : { past: [...history.past, current].slice(-LIMIT), future: history.future.slice(0, -1) },
  }
}
