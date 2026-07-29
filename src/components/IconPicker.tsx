import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PRESET_LOGOS, resolveIconSrc } from '../config/presetLogos'

type IconPickerProps = {
  icon?: string
  onChange: (icon: string) => void
  triggerClassName: string
  placeholderClassName: string
}

export function IconPicker({ icon, onChange, triggerClassName, placeholderClassName }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false)
        setUrlOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick, { capture: true })
    return () => document.removeEventListener('mousedown', onDocClick, { capture: true })
  }, [open])

  useEffect(() => {
    const menu = menuRef.current
    if (!open || !menu) return
    function onWheel(e: WheelEvent) {
      e.stopPropagation()
    }
    menu.addEventListener('wheel', onWheel, { capture: true })
    return () => menu.removeEventListener('wheel', onWheel, { capture: true })
  }, [open])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      onChange(reader.result as string)
      setOpen(false)
    }
    reader.readAsDataURL(file)
  }

  function handleUrlSubmit() {
    if (!urlValue.trim()) return
    onChange(urlValue.trim())
    setUrlValue('')
    setUrlOpen(false)
    setOpen(false)
  }

  return (
    <div className="icon-picker nodrag" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName} nodrag`}
        onClick={() => setOpen((o) => !o)}
        title="Choose logo"
      >
        {icon ? <img src={resolveIconSrc(icon)} alt="" /> : <span className={placeholderClassName}>+</span>}
      </button>

      {open &&
        createPortal(
          <div
            className="icon-picker__menu nodrag"
            ref={menuRef}
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          >
            <div className="icon-picker__title">Set the logo</div>

          {urlOpen ? (
            <div className="icon-picker__url-row">
              <input
                autoFocus
                className="entity-list__input"
                placeholder="https://…"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUrlSubmit()
                  if (e.key === 'Escape') setUrlOpen(false)
                }}
              />
              <button type="button" className="btn" onClick={handleUrlSubmit}>
                Use
              </button>
            </div>
          ) : (
            <div className="icon-picker__grid">
              <button
                type="button"
                className="icon-picker__preset"
                title="Upload from PC"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="icon-picker__preset-icon">⬆</span>
                <span>Upload from PC</span>
              </button>
              <button
                type="button"
                className="icon-picker__preset"
                title="From URL"
                onClick={() => setUrlOpen(true)}
              >
                <span className="icon-picker__preset-icon">🔗</span>
                <span>From URL</span>
              </button>
              <button
                type="button"
                className="icon-picker__preset"
                title="Blank"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                <span className="icon-picker__preset-icon">🚫</span>
                <span>Blank</span>
              </button>
              {PRESET_LOGOS.map((logo) => (
                <button
                  key={logo.src}
                  type="button"
                  className="icon-picker__preset"
                  title={logo.name}
                  onClick={() => {
                    onChange(logo.icon)
                    setOpen(false)
                  }}
                >
                  <img src={logo.src} alt={logo.name} />
                  <span>{logo.name}</span>
                </button>
              ))}
            </div>
          )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
