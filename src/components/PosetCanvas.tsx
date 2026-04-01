import { useMemo, useRef, type PointerEvent } from 'react'

import type { Edge } from '../lib/posetToPreferences'

type PosetNode = {
  id: number
  x: number
  y: number
}

type DragState = {
  id: number
  startX: number
  startY: number
  moved: boolean
}

type PosetCanvasProps = {
  nodes: PosetNode[]
  edges: Edge[]
  selectedNodeId: number | null
  hoveredEdgeKey: string | null
  onNodeClick: (nodeId: number) => void
  onNodeMove: (nodeId: number, position: { x: number; y: number }) => void
  onBackgroundClick: () => void
  onEdgeHover: (edgeKey: string | null) => void
  onEdgeClick: (edge: Edge) => void
}

const VIEWBOX = { width: 100, height: 60 }
const NODE_RADIUS = 4
const DRAG_THRESHOLD = 0.2

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const toSvgPoint = (event: PointerEvent<SVGSVGElement>) => {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * VIEWBOX.width
  const y = ((event.clientY - rect.top) / rect.height) * VIEWBOX.height
  return { x, y }
}

export default function PosetCanvas({
  nodes,
  edges,
  selectedNodeId,
  hoveredEdgeKey,
  onNodeClick,
  onNodeMove,
  onBackgroundClick,
  onEdgeHover,
  onEdgeClick,
}: PosetCanvasProps) {
  const dragState = useRef<DragState | null>(null)

  const edgeLines = useMemo(() => {
    return edges.map((edge) => {
      const fromNode = nodes.find((node) => node.id === edge.from)
      const toNode = nodes.find((node) => node.id === edge.to)
      if (!fromNode || !toNode) return null

      const dx = toNode.x - fromNode.x
      const dy = toNode.y - fromNode.y
      const dist = Math.hypot(dx, dy) || 1
      const ux = dx / dist
      const uy = dy / dist

      const startX = fromNode.x + ux * NODE_RADIUS
      const startY = fromNode.y + uy * NODE_RADIUS
      const endX = toNode.x - ux * NODE_RADIUS
      const endY = toNode.y - uy * NODE_RADIUS

      const highlight = selectedNodeId === edge.from || selectedNodeId === edge.to

      const midX = (startX + endX) / 2
      const midY = (startY + endY) / 2

      return {
        key: `${edge.from}-${edge.to}`,
        edge,
        startX,
        startY,
        endX,
        endY,
        midX,
        midY,
        highlight,
      }
    })
  }, [edges, nodes, selectedNodeId])

  const handlePointerDown = (
    event: PointerEvent<SVGCircleElement>,
    nodeId: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const { x, y } = toSvgPoint(event)
    dragState.current = { id: nodeId, startX: x, startY: y, moved: false }
  }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragState.current) return
    event.preventDefault()
    const { id, startX, startY } = dragState.current
    const { x, y } = toSvgPoint(event)
    const moved = Math.hypot(x - startX, y - startY)
    if (moved > DRAG_THRESHOLD) {
      dragState.current.moved = true
    }
    if (dragState.current.moved) {
      onNodeMove(id, {
        x: clamp(x, NODE_RADIUS, VIEWBOX.width - NODE_RADIUS),
        y: clamp(y, NODE_RADIUS, VIEWBOX.height - NODE_RADIUS),
      })
    }
  }

  const handlePointerUp = (
    event: PointerEvent<SVGCircleElement>,
    nodeId: number,
  ) => {
    event.stopPropagation()
    event.currentTarget.releasePointerCapture(event.pointerId)
    const state = dragState.current
    if (!state) return
    dragState.current = null
    if (!state.moved) {
      onNodeClick(nodeId)
    }
  }

  return (
    <svg
      className="poset-svg"
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      onPointerMove={handlePointerMove}
      onPointerDown={(event) => {
        event.preventDefault()
        if (event.target === event.currentTarget) {
          onBackgroundClick()
        }
      }}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(31,36,40,0.7)" />
        </marker>
      </defs>

      {edgeLines.map((edge) =>
        edge ? (
          <g key={edge.key}>
            <line
              x1={edge.startX}
              y1={edge.startY}
              x2={edge.endX}
              y2={edge.endY}
              markerEnd="url(#arrow)"
              className={`edge-line${edge.highlight ? ' highlight' : ''}`}
            />
            <line
              x1={edge.startX}
              y1={edge.startY}
              x2={edge.endX}
              y2={edge.endY}
              className="edge-hotspot"
              onPointerEnter={() => onEdgeHover(edge.key)}
              onPointerLeave={() => onEdgeHover(null)}
              onClick={() => onEdgeClick(edge.edge)}
            />
            {hoveredEdgeKey === edge.key ? (
              <g className="edge-tooltip">
                <rect
                  x={edge.midX - 9}
                  y={edge.midY - 3}
                  width={18}
                  height={6}
                  rx={1.5}
                />
                <text x={edge.midX} y={edge.midY + 0.5} textAnchor="middle">
                  remove
                </text>
              </g>
            ) : null}
          </g>
        ) : null,
      )}

      {nodes.map((node) => (
        <g
          key={node.id}
          className={`node${selectedNodeId === node.id ? ' selected' : ''}`}
        >
          <circle
            cx={node.x}
            cy={node.y}
            r={NODE_RADIUS}
            onPointerDown={(event) => handlePointerDown(event, node.id)}
            onPointerUp={(event) => handlePointerUp(event, node.id)}
          />
          <text x={node.x} y={node.y + 0.6} textAnchor="middle">
            r{node.id}
          </text>
        </g>
      ))}
    </svg>
  )
}

export type { PosetNode }
