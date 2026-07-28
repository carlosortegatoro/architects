import type { DiagramFile } from '../types'

export const STORAGE_KEY = 'architectures.diagram'

export function downloadDiagram(diagram: DiagramFile, filename = 'diagram.json') {
  const blob = new Blob([JSON.stringify(diagram, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function parseDiagramFile(raw: string): DiagramFile {
  const parsed = JSON.parse(raw)
  if (parsed?.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Unrecognized diagram format')
  }
  return parsed as DiagramFile
}

export function saveToLocalStorage(diagram: DiagramFile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram))
}

export function loadFromLocalStorage(): DiagramFile | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return parseDiagramFile(raw)
  } catch {
    return null
  }
}
