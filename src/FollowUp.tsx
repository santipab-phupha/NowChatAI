import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Clock3, ExternalLink, GitBranch, RefreshCw, Sparkles, X } from 'lucide-react';
import './FollowUp.css';

type Source = { id: number; title: string; url: string };
export type FollowUpOffer = { question: string; answer: string; sources: Source[] };
type NodeStatus = 'baseline' | 'changed' | 'unchanged' | 'uncertain' | 'affected';
type GraphNode = { id: string; label: string; kind: 'fact' | 'step'; baseline: string; detail: string; status: NodeStatus; sourceIds: number[] };
type Graph = { title: string; nodes: GraphNode[]; edges: { from: string; to: string }[]; checkedAt: string | null; sources: Source[]; originalSources?: Source[] };
type Tracked = FollowUpOffer & { graph: Graph; createdAt: string };
const storageKey = 'nowchat-followup-v1';
const interval = 60 * 60 * 1000;

function loadTracked(): Tracked | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || typeof saved.question !== 'string' || typeof saved.answer !== 'string' || typeof saved.createdAt !== 'string' || !saved.graph || !Array.isArray(saved.graph.nodes) || !Array.isArray(saved.graph.edges)) return null;
    return saved as Tracked;
  } catch { return null; }
}

function safeUrl(value: string): string | null {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

function formatFactTimestamp(value: string | undefined): { date: string; time: string } | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date),
  };
}

function splitLabel(label: string) {
  const words = label.split(/\s+/).flatMap(word => word.match(/.{1,14}/gu) || []); const lines: string[] = []; let line = '';
  for (const word of words) { if ((line + ' ' + word).trim().length > 14 && line) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); }
  if (line) lines.push(line);
  if (lines.length > 4) return [...lines.slice(0, 3), `${lines[3].slice(0, 13)}…`];
  return lines;
}

const statusLabels: Record<NodeStatus, string> = {
  baseline: 'Saved detail', changed: 'Changed', unchanged: 'No change found', uncertain: 'Needs review', affected: 'May be affected',
};

function checkSummary(graph: Graph) {
  if (!graph.checkedAt) return { tone: 'baseline', title: 'Not checked yet', detail: 'Your original plan is saved. Check for updates when you’re ready.' };
  const changed = graph.nodes.filter(node => node.kind === 'fact' && node.status === 'changed').length;
  const affected = graph.nodes.filter(node => node.kind === 'step' && node.status === 'affected').length;
  const uncertain = graph.nodes.filter(node => node.status === 'uncertain').length;
  if (changed) return { tone: 'changed', title: `${changed} ${changed === 1 ? 'change' : 'changes'} found`, detail: [affected ? `${affected} ${affected === 1 ? 'step may' : 'steps may'} be affected` : '', uncertain ? `${uncertain} ${uncertain === 1 ? 'detail needs' : 'details need'} review` : ''].filter(Boolean).join(' · ') || 'Select a circle to review the change.' };
  if (uncertain) return { tone: 'uncertain', title: 'Needs review', detail: 'Some details could not be verified. Select a circle to see more.' };
  if (graph.nodes.every(node => node.status === 'unchanged')) return { tone: 'unchanged', title: 'No changes found', detail: 'No differences were found in this check. Review the sources for details.' };
  return { tone: 'uncertain', title: 'Check complete', detail: 'Select a circle to review its status and evidence.' };
}

function orderedNodes(graph: Graph): GraphNode[] {
  const pending = [...graph.nodes]; const ordered: GraphNode[] = [];
  while (pending.length) {
    const ready = pending.findIndex(node => !graph.edges.some(edge => edge.to === node.id && pending.some(other => other.id === edge.from)));
    ordered.push(...pending.splice(ready < 0 ? 0 : ready, 1));
  }
  return ordered;
}

function GraphView({ graph, createdAt, selected, onSelect }: { graph: Graph; createdAt: string; selected: string; onSelect: (id: string) => void }) {
  const nodes = orderedNodes(graph);
  const width = Math.max(700, nodes.length * 230);
  const positions = nodes.map((_, index) => ({ x: width * (index + 1) / (nodes.length + 1), y: 145 }));
  const checked = !!graph.checkedAt;
  const factTime = formatFactTimestamp(graph.checkedAt || createdAt);
  const factTimeLabel = checked ? 'Last checked' : 'Saved';
  return <div className="follow-graph-scroll"><svg className="follow-graph" style={{ minWidth: `${width}px` }} viewBox={`0 0 ${width} 275`} role="group" aria-label="Connected facts and plan steps from left to right">
    <defs><marker id="follow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
    {graph.edges.map((edge, index) => {
      const from = nodes.findIndex(node => node.id === edge.from); const to = nodes.findIndex(node => node.id === edge.to);
      if (from < 0 || to < 0 || from === to) return null;
      const a = positions[from], b = positions[to], direction = Math.sign(b.x - a.x);
      const impacted = nodes[from].status === 'changed' || nodes[to].status === 'affected';
      const path = Math.abs(to - from) === 1
        ? `M ${a.x + direction * 71} ${a.y} L ${b.x - direction * 76} ${b.y}`
        : `M ${a.x} ${a.y - 71} C ${a.x} ${10 + index * 4}, ${b.x} ${10 + index * 4}, ${b.x} ${b.y - 76}`;
      return <path className={'follow-edge' + (impacted ? ' follow-edge--impact' : '')} fill="none" key={`${edge.from}-${edge.to}-${index}`} d={path} markerEnd="url(#follow-arrow)" />;
    })}
    {nodes.map((node, index) => <g key={node.id} transform={`translate(${positions[index].x} ${positions[index].y})`} className={`follow-node follow-node--${node.status}${selected === node.id ? ' is-selected' : ''}`} role="button" tabIndex={0} aria-pressed={selected === node.id} aria-label={`${node.label}, ${statusLabels[node.status]}${node.kind === 'fact' ? `, ${factTimeLabel}: ${factTime ? `${factTime.date}, ${factTime.time}` : 'time unavailable'}` : ''}. Show details`} onClick={() => onSelect(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } }}>
      <title>{node.label}</title>
      <circle className="follow-node-glow" r="70" /><circle className="follow-node-circle" r="64" />
      <text className="follow-node-type" textAnchor="middle" y={-36}>{node.kind === 'fact' ? 'FACT' : 'PLAN STEP'}</text>
      <text className="follow-node-label" textAnchor="middle" y={-14}>{splitLabel(node.label).map((line, lineIndex) => <tspan key={lineIndex} x="0" dy={lineIndex === 0 ? 0 : 16}>{line}</tspan>)}</text>
      {node.kind === 'fact' && <text className="follow-node-timestamp" textAnchor="middle" aria-hidden="true"><tspan x="0" y="91">{factTimeLabel}{factTime ? ` · ${factTime.date}` : ''}</tspan><tspan x="0" y="108">{factTime?.time || 'Time unavailable'}</tspan></text>}
    </g>)}
  </svg></div>;
}

export default function FollowUp({ offer, visible, onActivate, onOfferClose }: { offer: FollowUpOffer | null; visible: boolean; onActivate: () => void; onOfferClose: () => void }) {
  const [tracked, setTracked] = useState<Tracked | null>(loadTracked);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const lastAttemptRef = useRef(0);
  const cardRef = useRef<HTMLElement>(null);
  const revealNewCard = useRef(false);
  const promptRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => {
    if (!offer) return;
    setError('');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    promptRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); onOfferClose(); return; }
      if (event.key !== 'Tab') return;
      const items = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []);
      if (!items.length) { event.preventDefault(); return; }
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && (index === -1 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [!!offer]);
  useLayoutEffect(() => {
    if (!tracked || !visible || !revealNewCard.current || !cardRef.current) return;
    revealNewCard.current = false;
    cardRef.current.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [tracked?.createdAt, visible]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => { try { if (tracked) localStorage.setItem(storageKey, JSON.stringify(tracked)); else localStorage.removeItem(storageKey); } catch { setError('Unable to save this follow-up in your browser.'); } }, [tracked]);

  async function request(body: object, controller: AbortController): Promise<Graph> {
    const response = await fetch('/api/followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const result: unknown = await response.json();
    if (!response.ok || !result || typeof result !== 'object' || !('graph' in result)) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Could not update this follow-up. Please try again.');
    return result.graph as Graph;
  }

  async function startFollowing() {
    if (!offer || requestRef.current) return;
    const controller = new AbortController(); requestRef.current = controller; setBusy(true); setError('');
    try {
      const graph = await request({ action: 'create', ...offer }, controller);
      revealNewCard.current = true;
      setTracked({ ...offer, graph, createdAt: new Date().toISOString() }); setSelected(graph.nodes[0]?.id || ''); onActivate(); onOfferClose();
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not create follow-up.'); }
    finally { requestRef.current = null; setBusy(false); }
  }

  async function checkNow(entry: Tracked) {
    if (requestRef.current) return;
    const controller = new AbortController(); requestRef.current = controller; lastAttemptRef.current = Date.now(); setBusy(true); setError('');
    try {
      const graph = await request({ action: 'check', question: entry.question, answer: entry.answer, graph: entry.graph }, controller);
      setTracked(current => current?.createdAt === entry.createdAt ? { ...current, graph } : current);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not check for changes.'); }
    finally { requestRef.current = null; setBusy(false); }
  }

  useEffect(() => {
    if (!tracked || !visible) return;
    const tick = () => {
      const last = Date.parse(tracked.graph.checkedAt || tracked.createdAt);
      if (Number.isFinite(last) && Date.now() - last >= interval && Date.now() - lastAttemptRef.current >= 300_000 && !requestRef.current) void checkNow(tracked);
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [tracked, visible]);

  useEffect(() => { if (!visible && !offer) requestRef.current?.abort(); }, [visible]);

  function stopFollowing() {
    if (!window.confirm('Stop following this plan and remove its saved follow-up from this browser?')) return;
    requestRef.current?.abort(); setTracked(null); setSelected(''); setError('');
  }

  const current = tracked?.graph.nodes.find(node => node.id === selected) || tracked?.graph.nodes[0];
  const nodeSources = current?.sourceIds?.flatMap(id => tracked?.graph.sources.filter(source => source.id === id) || []) || [];
  const summary = tracked ? checkSummary(tracked.graph) : null;
  return <>
    {tracked && visible && summary && <section ref={cardRef} className="follow-card" aria-label="Follow up">
      <header className="follow-header">
        <div><h2>Follow UP</h2><p>{tracked.graph.title}</p></div>
        <button type="button" className="follow-check" disabled={busy} onClick={() => void checkNow(tracked)}><RefreshCw size={15} className={busy ? 'follow-spinning' : ''} aria-hidden="true" /> {busy ? 'Checking…' : 'Check now'}</button>
      </header>
      <div className={`follow-status follow-status--${summary.tone}`} role="status">
        <span className="follow-dot" aria-hidden="true" />
        <div><strong>{busy ? 'Checking for updates…' : summary.title}</strong><p>{busy ? 'Looking for current evidence.' : summary.detail}</p></div>
      </div>
      <div className="follow-map-heading"><div><h3><GitBranch size={17} aria-hidden="true" /> How your plan connects</h3><p>Select a circle to see its details.</p></div></div>
      <GraphView graph={tracked.graph} createdAt={tracked.createdAt} selected={current?.id || ''} onSelect={setSelected} />
      {current && <div className={`follow-detail follow-detail--${current.status}`} aria-live="polite">
        <div><div className="follow-detail-top"><span className="follow-detail-label">{current.kind === 'fact' ? 'Tracked detail' : 'Plan step'}</span><span className={`follow-detail-status follow-detail-status--${current.status}`}>{statusLabels[current.status]}</span></div><h3>{current.label}</h3><p>{current.detail}</p>{current.status !== 'baseline' && current.baseline && <p className="follow-original"><strong>Original:</strong> {current.baseline}</p>}</div>
        {nodeSources.length > 0 && <div className="follow-evidence"><strong className="follow-evidence-heading">Evidence from this check</strong>{nodeSources.map(source => { const url = safeUrl(source.url); return url ? <a key={source.id} href={url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title} <ExternalLink size={13} aria-hidden="true" /></a> : null; })}</div>}
      </div>}
      {!!tracked.graph.originalSources?.length && <details className="follow-original-sources"><summary>Search results from the original answer ({tracked.graph.originalSources.length})</summary><div className="follow-evidence">{tracked.graph.originalSources.map(source => { const url = safeUrl(source.url); return url ? <a key={`${source.id}-${url}`} href={url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title} <ExternalLink size={13} aria-hidden="true" /></a> : null; })}</div></details>}
      <p className="follow-caveat">AI assesses changes and possible impacts. Check the evidence before relying on them.</p>
      <footer className="follow-footer"><div><span>Checks hourly while this follow-up is open · Uses API credits</span></div><button type="button" onClick={stopFollowing} disabled={busy}>Stop following</button></footer>
    </section>}
    {!offer && error && <p className="follow-error" role="alert">{error}</p>}
    {offer && createPortal(<div className="follow-modal-backdrop"><div ref={modalRef} className="follow-modal" role="dialog" aria-modal="true" aria-labelledby="follow-modal-title" aria-describedby="follow-modal-desc"><button type="button" className="follow-modal-close" onClick={onOfferClose} aria-label="Close" disabled={busy}><X size={17} /></button><span className="follow-modal-icon"><Sparkles size={20} /></span><div className="follow-modal-eyebrow">KEEP YOUR PLAN CURRENT</div><h2 id="follow-modal-title">Follow this plan?</h2><p id="follow-modal-desc">Keep an eye on changing details and see which parts of your plan may be affected.</p><div className="follow-modal-note"><Clock3 size={15} /><span>Checks hourly while this follow-up is open. Your plan is saved in this browser; checks use API credits.{tracked ? ' This replaces your current follow-up.' : ''}</span></div>{error && <p className="follow-error" role="alert">{error}</p>}<div className="follow-modal-actions"><button ref={promptRef} type="button" className="follow-modal-primary" onClick={() => void startFollowing()} disabled={busy}>{busy ? 'Creating follow-up…' : 'Yes, follow this plan'} <ArrowRight size={15} /></button><button type="button" className="follow-modal-secondary" onClick={onOfferClose} disabled={busy}>Not now</button></div></div></div>, document.body)}
  </>;
}
