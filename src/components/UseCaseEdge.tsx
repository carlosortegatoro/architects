import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, type EdgeProps } from '@xyflow/react'
import { PARTICLE_SPEED_MS, ZERO_COPY_DASH_MS } from '../config/animationConfig'
import type { ConnectionEdge } from '../store/diagramStore'
import { useDiagramStore } from '../store/diagramStore'

const NEUTRAL_COLOR = '#94a3b8'
const PARALLEL_OFFSET = 10
const EDGE_GROUP_OFFSET = 24
const ZERO_COPY_DASH_PATTERN = '8 6'

// 8x6 rect centered at origin with the top-right corner cut diagonally.
const CUT_CORNER_RECT_PATH = 'M -4 -3 L 2 -3 L 4 -1 L 4 3 L -4 3 Z'

type Rect = { x: number; y: number; width: number; height: number }

function rectOf(node: { internals: { positionAbsolute: { x: number; y: number } }; measured: { width?: number; height?: number } }): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? 0,
    height: node.measured.height ?? 0,
  }
}

// Floating-edge anchor: draw the straight line between both boxes' centroids,
// and anchor at the point where that line crosses `from`'s border — i.e. the
// intersection with whichever side (or corner ray) faces `to`'s centroid.
function floatingAnchor(from: Rect, to: Rect): { x: number; y: number; position: Position } {
  const fromCenterX = from.x + from.width / 2
  const fromCenterY = from.y + from.height / 2
  const toCenterX = to.x + to.width / 2
  const toCenterY = to.y + to.height / 2
  const dx = toCenterX - fromCenterX
  const dy = toCenterY - fromCenterY

  if (dx === 0 && dy === 0) {
    return { x: fromCenterX, y: fromCenterY, position: Position.Right }
  }

  const halfWidth = from.width / 2
  const halfHeight = from.height / 2
  // Scale factor to reach the box border along the centroid-to-centroid ray:
  // the smaller of "would hit the vertical sides first" vs "horizontal sides first".
  const scale = Math.min(
    dx !== 0 ? halfWidth / Math.abs(dx) : Infinity,
    dy !== 0 ? halfHeight / Math.abs(dy) : Infinity,
  )
  const x = fromCenterX + dx * scale
  const y = fromCenterY + dy * scale
  const position = Math.abs(dx) * halfHeight > Math.abs(dy) * halfWidth
    ? dx > 0 ? Position.Right : Position.Left
    : dy > 0 ? Position.Bottom : Position.Top

  return { x, y, position }
}

export function UseCaseEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ConnectionEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const floatingEdges = useDiagramStore((s) => s.floatingEdges)
  const useCases = useDiagramStore((s) => s.useCases)
  const showEdgeLabels = useDiagramStore((s) => s.showEdgeLabels)
  const presenting = useDiagramStore((s) => s.presenting)
  const hiddenUseCaseIds = useDiagramStore((s) => s.hiddenUseCaseIds)
  const highlightedNodeIds = useDiagramStore((s) => s.highlightedNodeIds)
  const siblingCount = useDiagramStore(
    (s) =>
      s.edges.filter(
        (e) =>
          e.source === source &&
          e.target === target &&
          e.sourceHandle === sourceHandleId &&
          e.targetHandle === targetHandleId,
      ).length,
  )
  const siblingPosition = useDiagramStore((s) => {
    const siblings = s.edges.filter(
      (e) =>
        e.source === source &&
        e.target === target &&
        e.sourceHandle === sourceHandleId &&
        e.targetHandle === targetHandleId,
    )
    const index = siblings.findIndex((e) => e.id === id)
    return index === -1 ? 0 : index
  })
  const useCaseIds = data?.useCaseIds ?? []
  const assigned = useCaseIds
    .map((id) => useCases.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .filter((u) => !presenting || !hiddenUseCaseIds.includes(u.id))

  const groupOffset = (siblingPosition - (siblingCount - 1) / 2) * EDGE_GROUP_OFFSET

  let anchorSourceX = sourceX
  let anchorSourceY = sourceY
  let anchorSourcePosition = sourcePosition
  let anchorTargetX = targetX
  let anchorTargetY = targetY
  let anchorTargetPosition = targetPosition

  if (floatingEdges && sourceHandleId == null && targetHandleId == null && sourceNode && targetNode) {
    const sourceRect = rectOf(sourceNode)
    const targetRect = rectOf(targetNode)
    const sourceAnchor = floatingAnchor(sourceRect, targetRect)
    const targetAnchor = floatingAnchor(targetRect, sourceRect)
    anchorSourceX = sourceAnchor.x
    anchorSourceY = sourceAnchor.y
    anchorSourcePosition = sourceAnchor.position
    anchorTargetX = targetAnchor.x
    anchorTargetY = targetAnchor.y
    anchorTargetPosition = targetAnchor.position
  }

  const [basePath, labelX, labelY] =
    groupOffset === 0
      ? getBezierPath({
          sourceX: anchorSourceX,
          sourceY: anchorSourceY,
          sourcePosition: anchorSourcePosition,
          targetX: anchorTargetX,
          targetY: anchorTargetY,
          targetPosition: anchorTargetPosition,
        })
      : getBezierPath({
          sourceX: anchorSourceX,
          sourceY: anchorSourceY + groupOffset,
          sourcePosition: anchorSourcePosition,
          targetX: anchorTargetX,
          targetY: anchorTargetY + groupOffset,
          targetPosition: anchorTargetPosition,
        })

  const strokes = assigned.length > 0 ? assigned : [null]

  const isHighlighted = presenting && highlightedNodeIds.includes(id)
  const isDimmed = presenting && highlightedNodeIds.length > 0 && !isHighlighted

  return (
    <>
      {strokes.map((useCase, i) => {
        const offset = (i - (strokes.length - 1) / 2) * PARALLEL_OFFSET + groupOffset
        const [path] =
          offset === 0
            ? [basePath]
            : getBezierPath({
                sourceX: anchorSourceX,
                sourceY: anchorSourceY + offset,
                sourcePosition: anchorSourcePosition,
                targetX: anchorTargetX,
                targetY: anchorTargetY + offset,
                targetPosition: anchorTargetPosition,
              })
        const color = useCase?.color ?? NEUTRAL_COLOR
        const isZeroCopy = useCase?.speed === 'zero-copy'
        const animated = useCase != null && useCase.speed !== 'none' && !isZeroCopy
        const durationMs = animated
          ? PARTICLE_SPEED_MS[useCase.speed as Exclude<typeof useCase.speed, 'none' | 'zero-copy'>]
          : 0
        const durationS = durationMs / 1000
        const zeroCopyDurationS = ZERO_COPY_DASH_MS / 1000
        const pathId = `${id}-path-${i}`

        return (
          <g key={pathId}>
            <BaseEdge
              path={path}
              className={`${isZeroCopy ? 'use-case-edge__path--zero-copy' : ''}${isHighlighted ? ' use-case-edge__path--highlighted' : ''}${isDimmed ? ' use-case-edge__path--dimmed' : ''}`.trim()}
              style={{
                stroke: color,
                strokeWidth: selected || isHighlighted ? 3 : 2,
                strokeDasharray: isZeroCopy ? ZERO_COPY_DASH_PATTERN : useCase ? undefined : '6 4',
                animationDuration: isZeroCopy ? `${zeroCopyDurationS}s` : undefined,
              }}
            />
            {animated && (
              <>
                <path id={pathId} d={path} fill="none" stroke="none" />
                {[0, 0.33, 0.66].map((delay) =>
                  useCase?.shape === 'cut-corner-rect' ? (
                    <path key={delay} d={CUT_CORNER_RECT_PATH} fill={color}>
                      <animateMotion
                        dur={`${durationS}s`}
                        begin={`${-delay * durationS}s`}
                        repeatCount="indefinite"
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                      >
                        <mpath href={`#${pathId}`} />
                      </animateMotion>
                    </path>
                  ) : (
                    <circle key={delay} r={3.5} fill={color}>
                      <animateMotion
                        dur={`${durationS}s`}
                        begin={`${-delay * durationS}s`}
                        repeatCount="indefinite"
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                      >
                        <mpath href={`#${pathId}`} />
                      </animateMotion>
                    </circle>
                  ),
                )}
              </>
            )}
          </g>
        )
      })}

      <EdgeLabelRenderer>
        {showEdgeLabels && assigned.length > 0 && (
          <div
            className="use-case-edge__badge"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {assigned.map((u) => (
              <span key={u.id} className="use-case-edge__chip" style={{ background: u.color }}>
                {u.name}
              </span>
            ))}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}
