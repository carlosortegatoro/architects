export type ParticleSpeed = 'real-time' | 'near-real-time' | 'batch' | 'zero-copy' | 'none'
export type ParticleShape = 'circle' | 'cut-corner-rect'

export type UseCase = {
  id: string
  name: string
  color: string
  speed: ParticleSpeed
  shape: ParticleShape
}

export type HandleCounts = {
  top: number
  right: number
  bottom: number
  left: number
}

export type SystemNodeData = {
  label: string
  description?: string
  color: string
  icon?: string
  handleCounts?: HandleCounts
  displayMode?: 'full' | 'logoOnly' | 'textOnly'
}

export type GroupNodeData = {
  label: string
  color: string
  icon?: string
  handleCounts?: HandleCounts
}

export type AnnotationNodeData = {
  title: string
  body?: string
  color?: string
  handleCounts?: HandleCounts
}

export type InfoCardNodeData = {
  header: string
  description: string
  color: string
  icon?: string
  handleCounts?: HandleCounts
}

export type ConnectionEdgeData = {
  useCaseIds: string[]
  label?: string
}

export type Scenario = {
  id: string
  name: string
  useCaseIds: string[]
}

export type DiagramFile = {
  version: 1
  nodes: Array<{
    id: string
    type: 'systemBox' | 'group' | 'annotation' | 'infoCard'
    position: { x: number; y: number }
    data: SystemNodeData | GroupNodeData | AnnotationNodeData | InfoCardNodeData
    width?: number
    height?: number
    parentId?: string
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
    data: ConnectionEdgeData
  }>
  useCases: UseCase[]
  showEdgeLabels?: boolean
  floatingEdges?: boolean
  scenarios?: Scenario[]
}
