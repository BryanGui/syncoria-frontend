import { useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import type {
  AdminProviderAuditERModel,
  AdminProviderAuditERTable,
} from '../api/adminTenantAudits'
import '@xyflow/react/dist/style.css'

const NODE_WIDTH = 292
const NODE_GAP_X = 76
const NODE_GAP_Y = 76
const GRID_COLUMNS = 3

type RawERNodeData = {
  table: AdminProviderAuditERTable
}
type RawERNode = Node<RawERNodeData, 'rawErTable'>

function RawERTableNode({ data, selected }: NodeProps<RawERNode>) {
  const { table } = data
  return (
    <article
      aria-label={`Table ${table.name}`}
      className={selected ? 'raw-er-node raw-er-node--selected' : 'raw-er-node'}
    >
      <Handle id="incoming" position={Position.Left} type="target" />
      <header className="raw-er-node__header">
        <strong>{table.name}</strong>
        <span>{table.source_name}</span>
      </header>
      <div className="raw-er-node__columns">
        {table.columns.map((column) => (
          <div className="raw-er-node__column" key={`${column.position ?? 'unknown'}-${column.name}-${column.external_field_id ?? ''}`}>
            <span>{column.name}</span>
            <small>{column.postgres_type}</small>
            <em>{column.provider_type}</em>
          </div>
        ))}
      </div>
      {table.primary_key.length > 0 ? (
        <div className="raw-er-node__constraints">
          <strong>PK observée</strong>
          <span>{table.primary_key.join(', ')}</span>
        </div>
      ) : null}
      {table.foreign_keys.length > 0 ? (
        <div className="raw-er-node__constraints">
          <strong>FK observées</strong>
          {table.foreign_keys.map((foreignKey) => (
            <span key={`${foreignKey.source_column}-${foreignKey.target_table}-${foreignKey.target_column}`}>
              {foreignKey.source_column} → {foreignKey.target_table}.{foreignKey.target_column}
            </span>
          ))}
        </div>
      ) : null}
      <Handle id="outgoing" position={Position.Right} type="source" />
    </article>
  )
}

const nodeTypes = { rawErTable: RawERTableNode }

function buildNodes(model: AdminProviderAuditERModel): RawERNode[] {
  return model.tables.map((table, index) => {
    const column = index % GRID_COLUMNS
    const row = Math.floor(index / GRID_COLUMNS)
    return {
      id: table.name,
      type: 'rawErTable',
      position: {
        x: column * (NODE_WIDTH + NODE_GAP_X),
        y: row * (NODE_GAP_Y + 220),
      },
      data: { table },
    }
  })
}

function buildEdges(model: AdminProviderAuditERModel): Edge[] {
  const tables = new Set(model.tables.map((table) => table.name))
  return model.relationships.flatMap((relationship, index) => {
    if (relationship.target_table === null || !tables.has(relationship.target_table)
      || !tables.has(relationship.source_table)) return []
    return [{
      id: `raw-relation-${index}`,
      source: relationship.source_table,
      sourceHandle: 'outgoing',
      target: relationship.target_table,
      targetHandle: 'incoming',
      label: `${relationship.source_column} · cardinality: unknown`,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#657d8b' },
      style: { stroke: '#657d8b', strokeWidth: 1.5 },
      labelStyle: { fill: '#405966', fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
    }]
  })
}

function ERDiagramCanvas({ model }: { model: AdminProviderAuditERModel }) {
  const { fitView } = useReactFlow()
  const nodes = useMemo(() => buildNodes(model), [model])
  const edges = useMemo(() => buildEdges(model), [model])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const selectedTable = model.tables.find((table) => table.name === selectedNodeId) ?? null
  const unresolvedRelations = model.relationships.filter((relationship) => relationship.target_table === null)

  return (
    <div aria-label="Diagramme ER brut" className="raw-er-diagram">
      <div className="raw-er-diagram__canvas">
        <ReactFlow
          className="raw-er-diagram__flow"
          edges={edges}
          fitView
          maxZoom={1.6}
          minZoom={0.25}
          nodes={nodes}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          nodesDraggable={false}
          onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          proOptions={{ hideAttribution: true }}
          elementsSelectable
        >
          <Background color="#dce5e9" gap={24} size={1} />
          <Controls aria-label="Contrôles du diagramme" showInteractive={false} />
          <MiniMap
            maskColor="rgba(235, 241, 243, .72)"
            nodeColor="#9ab4c0"
            pannable
            zoomable
          />
          <Panel position="top-right">
            <button
              className="raw-er-diagram__fit"
              onClick={() => fitView({ duration: 220, padding: 0.2 })}
              type="button"
            >
              Recentrer
            </button>
          </Panel>
        </ReactFlow>
      </div>
      {selectedTable ? (
        <aside aria-label={`Détails de ${selectedTable.name}`} className="raw-er-details">
          <div>
            <p className="tenant-audit__eyebrow">Table sélectionnée</p>
            <h5>{selectedTable.name}</h5>
            <p>{selectedTable.source_name}</p>
          </div>
          <dl>
            <div><dt>Colonnes</dt><dd>{selectedTable.columns.length}</dd></div>
            <div><dt>Source technique</dt><dd>{selectedTable.external_source_id}</dd></div>
          </dl>
          <ul>
            {selectedTable.columns.map((column) => (
              <li key={`${column.position ?? 'unknown'}-${column.name}-${column.external_field_id ?? ''}`}>
                <strong>{column.name}</strong>
                <span>{column.provider_type} · {column.postgres_type}</span>
              </li>
            ))}
          </ul>
          {selectedTable.primary_key.length > 0 ? <p><strong>PK observée :</strong> {selectedTable.primary_key.join(', ')}</p> : null}
          {selectedTable.foreign_keys.length > 0 ? <p><strong>FK observées :</strong> {selectedTable.foreign_keys.length}</p> : null}
        </aside>
      ) : null}
      {unresolvedRelations.length > 0 ? (
        <div className="raw-er-diagram__unresolved" role="status">
          <strong>Relations observées à cible non résolue</strong>
          <ul>
            {unresolvedRelations.map((relationship, index) => (
              <li key={`${relationship.source_table}-${relationship.source_column}-${index}`}>
                {relationship.source_table}.{relationship.source_column} · cardinality: unknown
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function RawAuditERDiagram({ model }: { model: AdminProviderAuditERModel }) {
  return (
    <ReactFlowProvider>
      <ERDiagramCanvas model={model} />
    </ReactFlowProvider>
  )
}
