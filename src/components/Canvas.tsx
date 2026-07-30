import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type EdgeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useDiagramStore, type SystemNode } from '../store/diagramStore'
import { GroupNode } from './GroupNode'
import { SystemBoxNode } from './SystemBoxNode'
import { UseCaseEdge } from './UseCaseEdge'

const nodeTypes = { systemBox: SystemBoxNode, group: GroupNode }
const edgeTypes = { useCase: UseCaseEdge }

type CanvasProps = {
  interactive?: boolean
}

function PresentationAutoFit({ presenting }: { presenting: boolean }) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (presenting) fitView({ duration: 300 })
  }, [presenting, fitView])

  return null
}

export function Canvas({ interactive = true }: CanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const nodes = useDiagramStore((s) => s.nodes)
  const edges = useDiagramStore((s) => s.edges)
  const onNodesChange = useDiagramStore((s) => s.onNodesChange)
  const onEdgesChange = useDiagramStore((s) => s.onEdgesChange)
  const onConnect = useDiagramStore((s) => s.onConnect)
  const onReconnect = useDiagramStore((s) => s.onReconnect)
  const setSelectedEdge = useDiagramStore((s) => s.setSelectedEdge)
  const presenting = useDiagramStore((s) => s.presenting)
  const hiddenUseCaseIds = useDiagramStore((s) => s.hiddenUseCaseIds)
  const findGroupAt = useDiagramStore((s) => s.findGroupAt)
  const setDropTargetGroup = useDiagramStore((s) => s.setDropTargetGroup)

  const visibleEdges = useMemo(() => {
    if (!presenting || hiddenUseCaseIds.length === 0) return edges

    return edges.filter((edge) => {
      const useCaseIds = edge.data?.useCaseIds ?? []
      if (useCaseIds.length === 0) return true
      return useCaseIds.some((uid) => !hiddenUseCaseIds.includes(uid))
    })
  }, [edges, presenting, hiddenUseCaseIds])

  const visibleNodes = useMemo(() => {
    if (!presenting || hiddenUseCaseIds.length === 0) return nodes

    const nodeHasVisibleUseCase = new Map<string, boolean>()
    const nodeHasAnyUseCase = new Map<string, boolean>()

    for (const edge of edges) {
      const useCaseIds = edge.data?.useCaseIds ?? []
      if (useCaseIds.length === 0) continue
      const hasVisible = useCaseIds.some((uid) => !hiddenUseCaseIds.includes(uid))
      for (const nodeId of [edge.source, edge.target]) {
        nodeHasAnyUseCase.set(nodeId, true)
        if (hasVisible) nodeHasVisibleUseCase.set(nodeId, true)
      }
    }

    const hiddenByDirectEdges = new Map<string, boolean>()
    for (const node of nodes) {
      hiddenByDirectEdges.set(
        node.id,
        nodeHasAnyUseCase.get(node.id) === true && !nodeHasVisibleUseCase.get(node.id),
      )
    }

    return nodes.map((node) => {
      const shouldHide =
        hiddenByDirectEdges.get(node.id) === true ||
        (node.parentId !== undefined && hiddenByDirectEdges.get(node.parentId) === true)
      return shouldHide ? { ...node, hidden: true } : node
    })
  }, [nodes, edges, presenting, hiddenUseCaseIds])

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_, edge) => interactive && setSelectedEdge(edge.id),
    [setSelectedEdge, interactive],
  )

  const onPaneClick = useCallback(() => setSelectedEdge(null), [setSelectedEdge])

  const onNodeDrag: OnNodeDrag<SystemNode> = useCallback(
    (_, node) => {
      if (node.type === 'group') return
      setDropTargetGroup(findGroupAt(node.id, node.position))
    },
    [findGroupAt, setDropTargetGroup],
  )

  const onNodeDragStop: OnNodeDrag<SystemNode> = useCallback(() => {
    setDropTargetGroup(null)
  }, [setDropTargetGroup])

  const defaultEdgeOptions = useMemo(() => ({ type: 'useCase' }), [])

  return (
    <div className="canvas" ref={wrapperRef}>
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={interactive ? onNodesChange : undefined}
        onEdgesChange={interactive ? onEdgesChange : undefined}
        onConnect={interactive ? onConnect : undefined}
        onReconnect={interactive ? onReconnect : undefined}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDrag={interactive ? onNodeDrag : undefined}
        onNodeDragStop={interactive ? onNodeDragStop : undefined}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        elementsSelectable={interactive}
        selectionOnDrag={false}
        multiSelectionKeyCode="Shift"
        fitView
      >
        <PresentationAutoFit presenting={presenting} />
        <Background />
        <Controls showInteractive={interactive} />
        {interactive && <MiniMap pannable zoomable />}
      </ReactFlow>
    </div>
  )
}
