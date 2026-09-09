import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useDiagramStore, type SystemNode } from '../store/diagramStore'
import { AnnotationNode } from './AnnotationNode'
import { GroupNode } from './GroupNode'
import { InfoCardNode } from './InfoCardNode'
import { SystemBoxNode } from './SystemBoxNode'
import { UseCaseEdge } from './UseCaseEdge'
import { NodeShapeControls, type NodeShapeMenuPosition } from './NodeShapeControls'
import { getNodeShape } from '../utils/nodeShape'

const nodeTypes = {
  systemBox: SystemBoxNode,
  group: GroupNode,
  annotation: AnnotationNode,
  infoCard: InfoCardNode,
}
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
  const particlesPaused = useDiagramStore((s) => s.particlesPaused)
  const hiddenUseCaseIds = useDiagramStore((s) => s.hiddenUseCaseIds)
  const findGroupAt = useDiagramStore((s) => s.findGroupAt)
  const setDropTargetGroup = useDiagramStore((s) => s.setDropTargetGroup)
  const setHighlightedNodes = useDiagramStore((s) => s.setHighlightedNodes)
  const toggleHighlightedNode = useDiagramStore((s) => s.toggleHighlightedNode)
  const clearHighlight = useDiagramStore((s) => s.clearHighlight)
  const selectNode = useDiagramStore((s) => s.selectNode)
  const [shapeMenu, setShapeMenu] = useState<NodeShapeMenuPosition | null>(null)
  const closeShapeMenu = useCallback(() => setShapeMenu(null), [])
  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined

  useEffect(() => {
    if (!interactive) closeShapeMenu()
  }, [interactive, closeShapeMenu])

  const onNodeContextMenu: NodeMouseHandler<SystemNode> = useCallback((event, node) => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return
    if (getNodeShape(node) === null) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (!bounds) return
    selectNode(node.id)
    setShapeMenu({ nodeId: node.id, x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }, [selectNode])

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

    const groupHasVisibleChild = new Map<string, boolean>()
    for (const node of nodes) {
      if (node.parentId === undefined) continue
      if (nodeHasVisibleUseCase.get(node.id) === true) {
        groupHasVisibleChild.set(node.parentId, true)
      }
    }

    return nodes.map((node) => {
      const isGroupHiddenByOwnEdges =
        node.type === 'group'
          ? hiddenByDirectEdges.get(node.id) === true && !groupHasVisibleChild.get(node.id)
          : hiddenByDirectEdges.get(node.id) === true
      const shouldHide =
        isGroupHiddenByOwnEdges ||
        (node.parentId !== undefined && hiddenByDirectEdges.get(node.parentId) === true && !groupHasVisibleChild.get(node.parentId))
      return shouldHide ? { ...node, hidden: true } : node
    })
  }, [nodes, edges, presenting, hiddenUseCaseIds])

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (e, edge) => {
      if (interactive) {
        setSelectedEdge(edge.id)
        return
      }
      if (!presenting) return
      if (e.metaKey || e.ctrlKey) toggleHighlightedNode(edge.id)
      else setHighlightedNodes([edge.id])
    },
    [setSelectedEdge, interactive, presenting, setHighlightedNodes, toggleHighlightedNode],
  )

  const onNodeClick: NodeMouseHandler = useCallback(
    (e, node) => {
      if (!presenting) return
      if (e.metaKey || e.ctrlKey) toggleHighlightedNode(node.id)
      else setHighlightedNodes([node.id])
    },
    [presenting, setHighlightedNodes, toggleHighlightedNode],
  )

  const onPaneClick = useCallback(() => {
    setSelectedEdge(null)
    if (presenting) clearHighlight()
  }, [setSelectedEdge, presenting, clearHighlight])

  const onNodeDrag: OnNodeDrag<SystemNode> = useCallback(
    (_, node) => {
      setDropTargetGroup(findGroupAt(node.id, node.position))
    },
    [findGroupAt, setDropTargetGroup],
  )

  const onNodeDragStop: OnNodeDrag<SystemNode> = useCallback(() => {
    setDropTargetGroup(null)
  }, [setDropTargetGroup])

  const defaultEdgeOptions = useMemo(() => ({ type: 'useCase' }), [])

  useEffect(() => {
    const svgs = wrapperRef.current?.querySelectorAll('svg') ?? []
    let warned = false
    svgs.forEach((svg) => {
      if (typeof svg.pauseAnimations !== 'function' || typeof svg.unpauseAnimations !== 'function') {
        if (particlesPaused && !warned) {
          console.warn('pauseAnimations() not supported in this browser — particle pause has no effect.')
          warned = true
        }
        return
      }
      if (particlesPaused) svg.pauseAnimations()
      else svg.unpauseAnimations()
    })
  }, [particlesPaused])

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
        onNodeClick={onNodeClick}
        onNodeContextMenu={interactive ? onNodeContextMenu : undefined}
        onPaneClick={onPaneClick}
        onMoveStart={closeShapeMenu}
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
      {interactive && (
        <NodeShapeControls
          node={selectedNode}
          menu={shapeMenu}
          containerRef={wrapperRef}
          onOpen={setShapeMenu}
          onClose={closeShapeMenu}
        />
      )}
    </div>
  )
}
