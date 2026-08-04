import { useShallow } from 'zustand/react/shallow'
import { useDiagramStore, type AlignMode, type DistributeMode } from '../store/diagramStore'
import {
  AlignLeftIcon, AlignHCenterIcon, AlignRightIcon,
  AlignTopIcon, AlignVMiddleIcon, AlignBottomIcon,
  DistributeHorizontalIcon, DistributeVerticalIcon, DistributeGridIcon,
} from './Icon'

const ALIGN_BUTTONS: { mode: AlignMode; icon: JSX.Element; title: string }[] = [
  { mode: 'left', icon: <AlignLeftIcon />, title: 'Align left' },
  { mode: 'hcenter', icon: <AlignHCenterIcon />, title: 'Align center' },
  { mode: 'right', icon: <AlignRightIcon />, title: 'Align right' },
  { mode: 'top', icon: <AlignTopIcon />, title: 'Align top' },
  { mode: 'vmiddle', icon: <AlignVMiddleIcon />, title: 'Align middle' },
  { mode: 'bottom', icon: <AlignBottomIcon />, title: 'Align bottom' },
]

const DISTRIBUTE_BUTTONS: { mode: DistributeMode; icon: JSX.Element; title: string }[] = [
  { mode: 'horizontal', icon: <DistributeHorizontalIcon />, title: 'Distribute horizontally' },
  { mode: 'vertical', icon: <DistributeVerticalIcon />, title: 'Distribute vertically' },
  { mode: 'grid', icon: <DistributeGridIcon />, title: 'Distribute as grid' },
]

export function AlignmentToolbar() {
  const selectedIds = useDiagramStore(
    useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)),
  )
  const alignNodes = useDiagramStore((s) => s.alignNodes)
  const distributeNodes = useDiagramStore((s) => s.distributeNodes)

  if (selectedIds.length < 2) return null

  return (
    <div className="alignment-toolbar">
      {ALIGN_BUTTONS.map(({ mode, icon, title }) => (
        <button key={mode} className="alignment-toolbar__btn" title={title} onClick={() => alignNodes(selectedIds, mode)}>
          {icon}
        </button>
      ))}
      {selectedIds.length >= 3 && (
        <>
          <div className="toolbar__divider" />
          {DISTRIBUTE_BUTTONS.map(({ mode, icon, title }) => (
            <button key={mode} className="alignment-toolbar__btn" title={title} onClick={() => distributeNodes(selectedIds, mode)}>
              {icon}
            </button>
          ))}
        </>
      )}
    </div>
  )
}
