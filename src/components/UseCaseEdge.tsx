import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { PARTICLE_SPEED_MS, ZERO_COPY_DASH_MS } from '../config/animationConfig'
import type { ConnectionEdge } from '../store/diagramStore'
import { useDiagramStore } from '../store/diagramStore'

const NEUTRAL_COLOR = '#94a3b8'
const PARALLEL_OFFSET = 10
const EDGE_GROUP_OFFSET = 24
const ZERO_COPY_DASH_PATTERN = '8 6'

// 8x6 rect centered at origin with the top-right corner cut diagonally.
const CUT_CORNER_RECT_PATH = 'M -4 -3 L 2 -3 L 4 -1 L 4 3 L -4 3 Z'

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
  const useCases = useDiagramStore((s) => s.useCases)
  const showEdgeLabels = useDiagramStore((s) => s.showEdgeLabels)
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

  const groupOffset = (siblingPosition - (siblingCount - 1) / 2) * EDGE_GROUP_OFFSET

  const [basePath, labelX, labelY] =
    groupOffset === 0
      ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
      : getBezierPath({
          sourceX,
          sourceY: sourceY + groupOffset,
          sourcePosition,
          targetX,
          targetY: targetY + groupOffset,
          targetPosition,
        })

  const strokes = assigned.length > 0 ? assigned : [null]

  return (
    <>
      {strokes.map((useCase, i) => {
        const offset = (i - (strokes.length - 1) / 2) * PARALLEL_OFFSET + groupOffset
        const [path] =
          offset === 0
            ? [basePath]
            : getBezierPath({
                sourceX,
                sourceY: sourceY + offset,
                sourcePosition,
                targetX,
                targetY: targetY + offset,
                targetPosition,
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
              className={isZeroCopy ? 'use-case-edge__path--zero-copy' : undefined}
              style={{
                stroke: color,
                strokeWidth: selected ? 3 : 2,
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
