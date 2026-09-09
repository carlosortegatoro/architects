import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { NodeShape } from '../types'
import { useDiagramStore, type SystemNode } from '../store/diagramStore'
import { getNodeShape } from '../utils/nodeShape'
import { ChevronDownIcon, InfoCardIcon, NoteIcon, ShapeFullIcon, ShapeLogoOnlyIcon, ShapeTextOnlyIcon } from './Icon'

const SHAPES = [
  { value: 'full', label: 'Full box', icon: <ShapeFullIcon /> },
  { value: 'logoOnly', label: 'Logo only', icon: <ShapeLogoOnlyIcon /> },
  { value: 'textOnly', label: 'Text only', icon: <ShapeTextOnlyIcon /> },
  { value: 'infoCard', label: 'Information card', icon: <InfoCardIcon /> },
  { value: 'annotation', label: 'Annotation', icon: <NoteIcon /> },
] satisfies Array<{ value: NodeShape; label: string; icon: JSX.Element }>

export type NodeShapeMenuPosition = { nodeId: string; x: number; y: number }

type Props = {
  node: SystemNode | undefined
  menu: NodeShapeMenuPosition | null
  containerRef: RefObject<HTMLDivElement>
  onOpen: (position: NodeShapeMenuPosition) => void
  onClose: () => void
}

export function NodeShapeControls({ node, menu, containerRef, onOpen, onClose }: Props) {
  const changeNodeShape = useDiagramStore((s) => s.changeNodeShape)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const currentShape = node ? getNodeShape(node) : null
  const isOpen = Boolean(menu && node?.id === menu.nodeId && currentShape)

  useEffect(() => {
    if (menu && !isOpen) onClose()
  }, [menu, isOpen, onClose])

  useLayoutEffect(() => {
    if (!isOpen || !menu || !menuRef.current || !containerRef.current) return
    const bounds = containerRef.current.getBoundingClientRect()
    const popup = menuRef.current.getBoundingClientRect()
    setPosition({
      x: Math.max(8, Math.min(menu.x, bounds.width - popup.width - 8)),
      y: Math.max(8, Math.min(menu.y, bounds.height - popup.height - 8)),
    })
    menuRef.current.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
  }, [isOpen, menu, containerRef])

  useEffect(() => {
    if (!isOpen) return
    function dismissOutside(event: PointerEvent) {
      const target = event.target as globalThis.Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) onClose()
    }
    function dismissOnScroll(event: Event) {
      if (!menuRef.current?.contains(event.target as globalThis.Node)) onClose()
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('scroll', dismissOnScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('scroll', dismissOnScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [isOpen, onClose])

  function closeAndFocus() {
    onClose()
    buttonRef.current?.focus()
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeAndFocus()
      return
    }
    if (event.key === 'Tab') {
      onClose()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      // Let the editor's undo/redo shortcut run after closing the selector.
      closeAndFocus()
      return
    }
    // Keep editor-wide shortcuts (for example Delete) out of an open menu.
    event.stopPropagation()
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1
    if (next >= 0) {
      event.preventDefault()
      event.stopPropagation()
      buttons[next]?.focus()
    }
  }

  if (!node || !currentShape) return null

  return (
    <>
      <div className="node-shape-toolbar nodrag nopan">
        <button
          ref={buttonRef}
          type="button"
          className="node-shape-toolbar__button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          onClick={() => {
            if (isOpen) { onClose(); return }
            const button = buttonRef.current?.getBoundingClientRect()
            const container = containerRef.current?.getBoundingClientRect()
            if (button && container) {
              onOpen({ nodeId: node.id, x: button.left - container.left, y: button.bottom - container.top + 6 })
            }
          }}
        >
          {SHAPES.find((shape) => shape.value === currentShape)?.icon}
          Change shape
          <ChevronDownIcon />
        </button>
      </div>
      {isOpen && (
        <div
          id={menuId}
          ref={menuRef}
          className="node-shape-menu nodrag nopan nowheel"
          role="menu"
          aria-label="Change shape"
          style={{ left: position.x, top: position.y }}
          onKeyDown={onMenuKeyDown}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="node-shape-menu__title">Change shape</div>
          {SHAPES.map((shape) => (
            <button
              key={shape.value}
              type="button"
              role="menuitemradio"
              aria-checked={shape.value === currentShape}
              className="node-shape-menu__option"
              onClick={() => {
                changeNodeShape(node.id, shape.value)
                closeAndFocus()
              }}
            >
              {shape.icon}
              <span>{shape.label}</span>
              <span className="node-shape-menu__check" aria-hidden="true">{shape.value === currentShape ? '✓' : ''}</span>
            </button>
          ))}
          <div className="node-shape-menu__hint">Hidden text and logos are kept.</div>
        </div>
      )}
    </>
  )
}
