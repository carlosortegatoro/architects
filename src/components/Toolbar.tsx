import { useRef } from 'react'
import { useDiagramStore } from '../store/diagramStore'
import { downloadDiagram, parseDiagramFile } from '../utils/fileIO'

type ToolbarProps = {
  onPresent: () => void
}

export function Toolbar({ onPresent }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toDiagramFile = useDiagramStore((s) => s.toDiagramFile)
  const loadDiagram = useDiagramStore((s) => s.loadDiagram)
  const clearDiagram = useDiagramStore((s) => s.clearDiagram)

  function handleExport() {
    downloadDiagram(toDiagramFile())
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    try {
      loadDiagram(parseDiagramFile(text))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not import file')
    }
  }

  function handleClear() {
    if (confirm('Clear the current diagram?')) clearDiagram()
  }

  return (
    <div className="toolbar">
      <h1 className="toolbar__title">Architecture Editor</h1>
      <div className="toolbar__actions">
        <button className="btn" onClick={handleExport}>
          Save JSON
        </button>
        <button className="btn" onClick={() => fileInputRef.current?.click()}>
          Load JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImportFile(file)
            e.target.value = ''
          }}
        />
        <button className="btn btn--danger" onClick={handleClear}>
          Clear
        </button>
        <button className="btn btn--primary" onClick={onPresent}>
          Present
        </button>
      </div>
    </div>
  )
}
