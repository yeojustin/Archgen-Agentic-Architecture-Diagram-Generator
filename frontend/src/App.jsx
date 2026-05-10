import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, addEdge, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { marked } from 'marked';
import { toPng } from 'html-to-image';
import ArchNode from './ArchNode';
import './App.css';

marked.setOptions({ breaks: true, gfm: true });

const NODE_W = 260, NODE_H = 80, GRID = 25;
const nodeTypes = { arch: ArchNode };

const TEMPLATES = {
  full: {
    label: '🏗️ Full Architecture',
    desc: 'Cloud infra, databases, APIs, frontend',
    prompt: 'Design a complete cloud architecture for:',
    suggestions: ['E-commerce platform', 'SaaS analytics dashboard', 'Real-time chat app', 'Video streaming service'],
  },
  agent: {
    label: '🤖 Agent Workflow',
    desc: 'LLM agents, tools, orchestration',
    prompt: 'Design an agentic AI workflow for:',
    suggestions: ['RAG chatbot with memory', 'Automated code reviewer', 'Research & report agent', 'Customer support agent'],
  },
};

const ARROW = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#F97316' };
const EDGE_STYLE = { stroke: '#F97316', strokeWidth: 2 };

function downloadFile(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

function layoutGraph(rawNodes, rawEdges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 120, ranksep: 160, marginx: 40, marginy: 40 });
  rawNodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: rawNodes.map((n) => {
      const p = g.node(n.id);
      return { ...n, position: { x: Math.round((p.x - NODE_W / 2) / GRID) * GRID, y: Math.round((p.y - NODE_H / 2) / GRID) * GRID } };
    }),
    edges: rawEdges,
  };
}

function graphToFlow(graph) {
  if (!graph?.nodes) return { nodes: [], edges: [] };
  const rn = graph.nodes.map((n) => ({ id: n.id, type: 'arch', data: { label: n.label, type: n.type }, position: { x: 0, y: 0 } }));
  const re = (graph.edges || []).map((e, i) => ({ id: `e-${e.source}-${e.target}-${i}`, source: e.source, target: e.target, type: 'smoothstep', animated: true, markerEnd: ARROW, style: EDGE_STYLE }));
  return layoutGraph(rn, re);
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatPos, setChatPos] = useState({ right: 24, bottom: 24 });
  const [chatSize, setChatSize] = useState({ width: 420, height: 520 });
  const [versions, setVersions] = useState([]); // [{v, blueprint, xml, timestamp}]
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);
  const canvasRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatRef = useRef(null);
  const dragState = useRef(null);
  const { fitView } = useReactFlow();

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setShowKeyInput(false);
  };

  const onConnect = useCallback(
    (p) => setEdges((eds) => addEdge({ ...p, type: 'smoothstep', animated: true, markerEnd: ARROW, style: EDGE_STYLE }, eds)),
    [setEdges]
  );

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const hasBlueprint = latestVersion?.blueprint;
  const hasXml = latestVersion?.xml;

  /* ── Draggable chat ── */
  const onDragStart = useCallback((e) => {
    e.preventDefault();
    const rect = chatRef.current.getBoundingClientRect();
    dragState.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    const onMove = (ev) => {
      setChatPos({ left: ev.clientX - dragState.current.offsetX, top: ev.clientY - dragState.current.offsetY, right: 'auto', bottom: 'auto' });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  /* ── Resizable chat (top-left corner) ── */
  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = chatSize.width, startH = chatSize.height;
    const onMove = (ev) => {
      const dw = startX - ev.clientX;
      const dh = startY - ev.clientY;
      setChatSize({ width: Math.max(320, startW + dw), height: Math.max(300, startH + dh) });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [chatSize]);

  /* ── Send ── */
  const sendMessage = async (overrideMsg) => {
    const raw = overrideMsg || input.trim();
    if (!raw || loading) return;
    setInput('');
    const tpl = TEMPLATES[template];
    const fullPrompt = tpl ? `${tpl.prompt} ${raw}` : raw;
    setMessages((prev) => [...prev, { role: 'user', text: raw }]);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullPrompt, api_key: apiKey }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      if (data.structured_graph) {
        const { nodes: n, edges: e } = graphToFlow(data.structured_graph);
        setNodes(n); setEdges(e);
        setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 150);
      }

      const vNum = versions.length + 1;
      setVersions((prev) => [...prev, {
        v: vNum,
        xml: data.drawio_xml || '',
        blueprint: data.blueprint || '',
        timestamp: new Date().toLocaleTimeString(),
      }]);

      const aiText = data.blueprint || data.agent_response || 'Done.';
      setMessages((prev) => [...prev, { role: 'ai', text: aiText }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ ${err.message}` }]);
    } finally { setLoading(false); }
  };

  /* ── Exports ── */
  const vLabel = latestVersion ? `v${latestVersion.v}` : '';

  const exportPng = () => {
    const vp = canvasRef.current?.querySelector('.react-flow__viewport');
    if (!vp) return alert('Generate a diagram first.');
    toPng(vp, { backgroundColor: '#FAFAFA', pixelRatio: 2 }).then((url) =>
      fetch(url).then((r) => r.blob()).then((b) => downloadFile(b, `archgen-diagram-${vLabel}.png`, 'image/png'))
    );
  };

  const exportXml = () => {
    if (!hasXml) return alert('Generate a diagram first.');
    downloadFile(latestVersion.xml, `archgen-diagram-${vLabel}.drawio`, 'application/xml');
  };

  const exportPdf = () => {
    if (!hasBlueprint) return;
    const html = marked.parse(latestVersion.blueprint);
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>ArchGen Blueprint ${vLabel}</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #111827; line-height: 1.7; }
        h1, h2, h3 { color: #EA580C; margin: 20px 0 8px; }
        h1 { font-size: 24px; border-bottom: 2px solid #FED7AA; padding-bottom: 8px; }
        h2 { font-size: 18px; } code { background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
        pre { background: #F3F4F6; padding: 16px; border-radius: 8px; overflow-x: auto; }
        ul, ol { padding-left: 24px; } strong { color: #EA580C; }
        @media print { body { margin: 20px; } }
      </style></head><body><p style="color:#9CA3AF;font-size:12px;">ArchGen Blueprint — ${vLabel} — ${latestVersion.timestamp}</p>${html}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const isEmpty = nodes.length === 0;

  return (
    <div className="app-layout">
      <div className="canvas-area" ref={canvasRef}>
        <div className="toolbar floating">
          <span className="logo">⬡ ArchGen</span>
          <div className="divider" />
          <button onClick={exportPng} disabled={isEmpty} className={isEmpty ? 'disabled' : ''}>
            <span className="btn-icon">⬇ PNG</span><span className="btn-sub">Diagram Image</span>
          </button>
          <button onClick={exportXml} disabled={!hasXml} className={!hasXml ? 'disabled' : ''}>
            <span className="btn-icon">⬇ XML</span><span className="btn-sub">Draw.io {vLabel}</span>
          </button>
          <button onClick={exportPdf} disabled={!hasBlueprint} className={!hasBlueprint ? 'disabled' : ''}>
            <span className="btn-icon">⬇ PDF</span><span className="btn-sub">Blueprint {hasBlueprint ? vLabel : '—'}</span>
          </button>
          {versions.length > 0 && (<><div className="divider" /><span className="version-badge">{vLabel}</span></>)}
        </div>

        {isEmpty && !template && (
          <div className="empty-canvas"><h2>ArchGen</h2><p>AI-powered diagram generator</p></div>
        )}

        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes} snapToGrid snapGrid={[GRID, GRID]} fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'smoothstep', markerEnd: ARROW }}
        >
          <Background variant="lines" gap={GRID} size={0.5} color="#E5E7EB" />
          <Controls position="bottom-left" />
          {!isEmpty && <MiniMap nodeColor={() => '#F97316'} maskColor="rgba(255,255,255,0.7)" style={{ background: '#fff', border: '1px solid #E5E7EB' }} />}
        </ReactFlow>
      </div>

      {!chatOpen && <button className="chat-toggle" onClick={() => setChatOpen(true)}>💬</button>}

      {chatOpen && (
        <div className="chat-float" ref={chatRef} style={{ right: chatPos.right, bottom: chatPos.bottom, left: chatPos.left, top: chatPos.top, width: chatSize.width, height: chatSize.height }}>
          <div className="resize-handle" onMouseDown={onResizeStart} />
          <div className="chat-header" onMouseDown={onDragStart} style={{ cursor: 'grab' }}>
            <div className="dot" /><span>ArchGen Chat</span>
            <button className="chat-close" onClick={() => setChatOpen(false)}>✕</button>
          </div>

          <div className="chat-messages">
            {showKeyInput && (
              <div className="key-input-step">
                <p className="picker-title">🔒 Step 0 — Welcome to ArchGen</p>
                <p className="tpl-desc" style={{ marginBottom: '12px' }}>
                  To get started, please enter your <strong>Gemini API Key</strong>. 
                  This allows the app to generate diagrams using your own quota.
                </p>
                
                <div className="key-input-box">
                  <input
                    type="password"
                    placeholder="Enter your sk-..."
                    value={apiKey === 'app_default' ? '' : apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && apiKey && saveApiKey(apiKey)}
                  />
                  <button onClick={() => apiKey && saveApiKey(apiKey)} disabled={!apiKey}>Start</button>
                </div>

                {window.location.hostname === 'localhost' && (
                  <button 
                    className="skip-btn" 
                    style={{ marginTop: '12px', width: '100%', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)', padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px' }}
                    onClick={() => saveApiKey('app_default')}
                  >
                    🛠️ Local Dev: Use System Default (ADC/Env)
                  </button>
                )}

                <p className="tpl-desc" style={{ marginTop: '16px', fontSize: '11px', opacity: 0.8 }}>
                  <strong>Security:</strong> Your key is stored only in your browser. 
                  It is sent directly to the API for each request and never saved on our servers.
                </p>
              </div>
            )}

            {!showKeyInput && !template && (
              <div className="template-picker">
                <p className="picker-title">Step 1 — Choose diagram type</p>
                {Object.entries(TEMPLATES).map(([key, tpl]) => (
                  <button key={key} className="template-btn" onClick={() => setTemplate(key)}>
                    <span className="tpl-label">{tpl.label}</span>
                    <span className="tpl-desc">{tpl.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {template && messages.length === 0 && !loading && (
              <div className="suggestions">
                <p className="picker-title">Step 2 — What are you building?</p>
                <div className="suggestion-chips">
                  {TEMPLATES[template].suggestions.map((s) => (
                    <button key={s} className="chip" onClick={() => sendMessage(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === 'ai' ? <div className="markdown-body" dangerouslySetInnerHTML={{ __html: marked.parse(m.text) }} /> : m.text}
              </div>
            ))}
            {loading && <div className="chat-msg ai"><div className="loading-dots"><span /><span /><span /></div></div>}
            <div ref={chatEndRef} />
          </div>

          {!showKeyInput && template && (
            <div className="chat-input-area">
              <div className="chat-input-controls">
                <button className="settings-btn" onClick={() => setShowKeyInput(true)}>🔑</button>
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={TEMPLATES[template]?.desc || 'Describe…'} disabled={loading} />
                <button onClick={() => sendMessage()} disabled={loading || !input.trim()}>Send</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
