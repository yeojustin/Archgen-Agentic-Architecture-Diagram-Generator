import { useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

const TYPE_COLORS = {
  frontend: '#0891B2',
  backend: '#7C3AED',
  database: '#D97706',
  storage: '#059669',
  network: '#2563EB',
  ai: '#DB2777',
  security: '#DC2626',
  monitoring: '#EA580C',
  queue: '#0D9488',
  cache: '#9333EA',
};

const TYPE_ICONS = {
  frontend: '🖥',
  backend: '⚙️',
  database: '🗄',
  storage: '📦',
  network: '🌐',
  ai: '🤖',
  security: '🔒',
  monitoring: '📊',
  queue: '📬',
  cache: '⚡',
};

export default function ArchNode({ id, data }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const inputRef = useRef(null);
  const color = TYPE_COLORS[data.type] || '#6C63FF';
  const icon = TYPE_ICONS[data.type] || '◆';

  useEffect(() => { setLabel(data.label); }, [data.label]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (label.trim() && label !== data.label) {
      data.onLabelChange?.(id, label.trim());
    }
  }, [label, data, id]);

  return (
    <div
      className="arch-node"
      style={{ '--node-color': color }}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <div className="node-icon">{icon}</div>
        <div className="node-info">
          {editing ? (
            <input
              ref={inputRef}
              className="node-edit-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
            />
          ) : (
            <span className="node-label">{label}</span>
          )}
          <span className="node-type">{data.type || 'component'}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
