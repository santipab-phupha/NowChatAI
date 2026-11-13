import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUp, Bookmark, BookmarkCheck, Calculator, Check, Clock3, FilePenLine, FileSearch, FlaskConical, MessageSquare, MessagesSquare, PiggyBank, RefreshCw, Sparkles, Ticket, TriangleAlert, Wallet, WandSparkles } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { Welcome, WelcomeLayout } from './Welcome';
import LiveChat from './LiveChat';

type Thread = 'trip' | 'savings';
type Panel = 'impact' | 'evidence' | 'history';
type Node = 'price' | 'total' | 'budget' | 'savings';
type Snapshot = 'baseline' | 'current';
type Followup = { question: string; answer: string };
type State = {
  thread: Thread; tracked: Thread[]; checked: boolean; view: Snapshot;
  tab: Panel; node: Node; draft: boolean; followups: Partial<Record<Thread, Followup>>;
};
const initial: State = { thread: 'trip', tracked: ['trip', 'savings'], checked: false, view: 'baseline', tab: 'impact', node: 'price', draft: false, followups: {} };
const storageKey = 'freshsignal-react-demo-v1';
const sampleCurrent = 'In this example, the ticket price increased to 350 THB and the trip total is 550 THB. Save 55 THB per day to reach that amount in 10 days.';
const sampleBaseline = 'In the initial example, the trip costs 400 THB. Save 40 THB per day for 10 days. Select Check for changes to see the impact.';
function restoreFollowups(raw: unknown): State['followups'] {
  if (!raw || typeof raw !== 'object') return {};
  const result: State['followups'] = {};
  for (const thread of ['trip', 'savings'] as const) {
    const entry = (raw as Partial<Record<Thread, Followup>>)[thread];
    if (!entry || typeof entry.question !== 'string' || typeof entry.answer !== 'string') continue;
    // Prior versions stored a canned response in Thai; retain the user's question.
    const oldSample = /[\u0E00-\u0E7F]/.test(entry.answer);
    const answer = oldSample && entry.answer.includes('550') ? sampleCurrent
      : oldSample && entry.answer.includes('400') ? sampleBaseline : entry.answer;
    result[thread] = { question: entry.question, answer };
  }
  return result;
}
function loadState(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || saved.version !== 1) return initial;
    return {
      thread: saved.thread === 'savings' ? 'savings' : 'trip',
      tracked: Array.isArray(saved.tracked) ? [...new Set<Thread>((saved.tracked as unknown[]).filter((x): x is Thread => x === 'trip' || x === 'savings'))] : initial.tracked,
      checked: saved.checked === true,
      view: saved.view === 'current' && saved.checked ? 'current' : 'baseline',
      tab: ['impact', 'evidence', 'history'].includes(saved.tab) ? saved.tab : 'impact',
      node: ['price', 'total', 'budget', 'savings'].includes(saved.node) ? saved.node : 'price',
      draft: saved.draft === true,
      followups: restoreFollowups(saved.followups),
    };
  } catch { return initial; }
}
const icons = { price: Ticket, total: Calculator, budget: Wallet, savings: PiggyBank };
const names: Record<Node, string> = { price: 'Ticket price', total: 'Trip cost per person', budget: '500 THB budget', savings: '10-day savings plan' };
const baselineValues: Record<Node, string> = { price: '200 THB', total: '400 THB', budget: '100 THB left', savings: '40 THB / day' };
const currentValues: Record<Node, string> = { price: '200 → 350 THB', total: '400 → 550 THB', budget: '50 THB over', savings: '40 → 55 THB / day' };
const baselineTags: Record<Node, string> = { price: 'Tracked fact', total: 'Sum of 3 items', budget: 'Original plan', savings: 'Linked to another chat' };
const currentTags: Record<Node, string> = { price: 'Sample price increased by 150', total: 'Recalculated: +150', budget: 'Plan needs review', savings: 'Savings target changed' };
const details: Record<Node, [string, string, string]> = {
  price: ['Ticket price', 'The original answer used the initial sample evidence of 200 THB per ticket.', 'The new sample evidence lists 350 THB instead of 200 THB for the same general admission ticket per person.'],
  total: ['Trip cost per person', '200 + 100 + 100 = 400 THB, based on the ticket price and the assumed transport and food costs.', '350 + 100 + 100 = 550 THB, an increase of 150 THB. Transport and food assumptions remain unchanged.'],
  budget: ['Plan with a 500 THB budget', 'The original total of 400 THB was 100 THB under budget.', 'The new total of 550 THB is 50 THB over budget, so the original plan needs review.'],
  savings: ['Answer in the “Savings plan” chat', 'This chat uses the same trip plan: 400 THB divided by 10 days is 40 THB per day.', 'The original answer used a 400 THB trip cost. At 550 THB over 10 days, the new target is 55 THB per day.'],
};

function SourceCard({ current }: { current?: boolean }) {
  return <div className={'fs-source' + (current ? ' fs-source-new' : '')}>
    <div className="fs-source-head"><h3>{current ? 'Evidence from recheck' : 'Evidence used in the answer'}</h3><span>{current ? 'Check 2' : 'Check 1'}</span></div>
    <div className="fs-source-price">{current ? '350' : '200'} THB / person</div>
    <blockquote>{current ? '“General admission ticket price updated to 350 THB per person.”' : '“General admission ticket: 200 THB per person.”'}</blockquote>
    <dl><dt>Source</dt><dd>{current ? 'Updated sample ticket page' : 'Sample amusement park ticket page'}</dd><dt>Saved in demo</dt><dd>Nov {current ? '19' : '12'} · 09:00</dd><dt>{current ? 'Scope' : 'Type'}</dt><dd>{current ? 'General admission · THB/person' : 'Fictional data'}</dd></dl>
  </div>;
}

export default function App() {
  const [screen, setScreen] = useState<'welcome' | 'live' | 'demo'>('welcome');
  const [state, setState] = useState<State>(loadState);
  const [input, setInput] = useState('');
  const [activity, setActivity] = useState('Select “Check for changes” to explore the example');
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ ...state, version: 1 })); } catch { /* Demo remains usable without storage. */ } }, [state]);
  const update = (patch: Partial<State>) => setState(previous => ({ ...previous, ...patch }));
  const trip = state.thread === 'trip';
  const tracked = state.tracked.includes(state.thread);
  const hasAny = state.tracked.length > 0;
  const changed = state.checked && state.view === 'current';
  const selected = state.node === 'savings' && !state.tracked.includes('savings') ? 'total' : state.node;
  const followup = state.followups[state.thread];
  function toggleTrack() {
    setState(previous => ({ ...previous, tracked: previous.tracked.includes(previous.thread) ? previous.tracked.filter(t => t !== previous.thread) : [...previous.tracked, previous.thread], draft: false }));
    setActivity(tracked ? 'Stopped tracking this answer · The original is still saved' : 'Added this answer to your tracked items');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim(); if (!question) return;
    const answer = state.checked ? sampleCurrent : sampleBaseline;
    update({ followups: { ...state.followups, [state.thread]: { question, answer } } }); setInput('');
    setActivity('Sample response only · No message was sent to an AI');
  }
  if (screen !== 'demo') return (
    <WelcomeLayout view={screen} onHome={() => setScreen('welcome')}>
      {screen === 'welcome'
        ? <Welcome onContinue={() => setScreen('live')} />
        : <LiveChat embedded onBack={() => setScreen('welcome')} onOpenDemo={() => setScreen('demo')} />}
    </WelcomeLayout>
  );
  return <div id="freshsignal-one-page" data-focus="balanced" data-density="comfortable"><div className="fs-shell">
    <header className="fs-topbar"><div className="fs-brand"><span className="fs-brandmark"><BrandMark /></span> NowChatAI</div><div className="fs-topmeta"><button type="button" className="fs-button" onClick={() => setScreen('welcome')}>Back to welcome</button><span>Keep the answers you rely on.</span><span className="fs-sample"><FlaskConical size={16} /> Sample data</span><span className="fs-avatar">ST</span></div></header>
    <div className="fs-layout">
      <nav className="fs-sidebar" aria-label="Chat history"><div className="fs-eyebrow">Conversations</div>
        {(['trip', 'savings'] as Thread[]).map(t => { const Icon = t === 'trip' ? MessagesSquare : PiggyBank; return <button key={t} type="button" className="fs-thread" aria-current={state.thread === t} onClick={() => { update({ thread: t, draft: false }); setActivity('Chat opened · Original message preserved'); }}><Icon size={16} /><span>{t === 'trip' ? 'Amusement park trip' : 'Savings plan'}<small>{state.tracked.includes(t) ? (state.checked ? 'Needs review' : 'Answer tracked') : 'Not tracked'}</small></span></button>; })}
        <div className="fs-sidebar-note"><strong>Only what you choose</strong>Tracked answers keep their evidence so you can check again later.</div>
      </nav>
      <section className="fs-chat" aria-label="Saved conversation">
        <div className="fs-chat-header"><div className="fs-eyebrow">YOUR CONVERSATION</div><h1>{trip ? 'Amusement park trip on a 500 THB budget' : 'Saving for this trip'}</h1><p>Saved on Nov 12 · Original answer always preserved</p></div>
        <div className="fs-conversation">
          <div className="fs-user-message">{trip ? 'Help me plan an amusement park trip with a budget of 500 THB per person.' : 'How much should I save each day for the saved trip plan over 10 days?'}</div>
          <article className="fs-message"><div className="fs-assistant-label"><Sparkles size={16} /> NowChatAI <span className="fs-small">· Saved answer</span></div>
            {trip ? <><p>The trip fits your budget. Based on the information available when you planned it, here is the cost per person.</p><div className="fs-costs"><div className="fs-cost-row"><span>Park ticket <sup>1</sup></span><span data-fact="ticket" className={tracked && state.checked ? 'fs-changed-fact' : ''}>200 THB</span></div><div className="fs-cost-row"><span>Transport</span><span>100 THB</span></div><div className="fs-cost-row"><span>Food</span><span>100 THB</span></div><div className="fs-cost-row"><span>Total per person</span><span>400 THB</span></div></div><p>That leaves 100 THB in your budget.</p><p className="fs-small">① Sample evidence · Transport and food costs are assumptions</p></> : <><p>Using your saved trip plan, the total is 400 THB and you have 10 days.</p><div className="fs-costs"><div className="fs-cost-row"><span>Trip savings goal</span><span>400 THB</span></div><div className="fs-cost-row"><span>Time to save</span><span>10 days</span></div><div className="fs-cost-row"><span>Save per day</span><span>40 THB</span></div></div><p>This covers the cost in the original plan.</p><p className="fs-small">Based on your saved amusement park trip plan</p></>}
            <div className="fs-message-actions"><button type="button" className="fs-button fs-track" aria-pressed={tracked} onClick={toggleTrack}>{tracked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{tracked ? 'Tracking' : 'Track this answer'}</button><span className="fs-small">{tracked ? (state.checked ? 'Related information has changed' : 'Original evidence saved') : 'This answer is not tracked'}</span></div>
            {tracked && state.checked && <div className="fs-inline-alert"><TriangleAlert size={16} /><button type="button" onClick={() => update({ view: 'current', tab: 'impact', node: trip ? 'budget' : 'savings' })}>Information used in this answer has changed. View impact</button></div>}
          </article>
          {state.draft && state.checked && tracked && <article className="fs-draft"><div className="fs-assistant-label"><FilePenLine size={16} /> Updated draft <span className="fs-small">· Does not replace the original</span></div><p>{trip ? 'The new sample evidence gives a total of 550 THB: 350 for the ticket, 100 for transport and 100 for food. That is 50 THB over budget. Consider adjusting the budget or finding alternatives.' : 'With the updated sample total of 550 THB, save 55 THB per day for 10 days instead of 40 THB. Review the trip budget too.'}</p><div className="fs-message-actions"><button className="fs-button" onClick={() => update({ draft: false })}>Keep the original for now</button></div></article>}
          {followup && <div><div className="fs-user-message">{followup.question}</div><article className="fs-message" style={{ marginTop: 15 }}><div className="fs-assistant-label"><Sparkles size={16} /> Sample response</div><p>{followup.answer}</p></article></div>}
        </div>
        <form className="fs-composer" onSubmit={submit}><div className="fs-composer-box"><textarea rows={2} aria-label="Ask a follow-up about this plan" placeholder="Ask a follow-up about this plan…" maxLength={240} value={input} onChange={e => setInput(e.target.value)} /><button className="fs-button fs-primary" type="submit" aria-label="Show sample response"><ArrowUp size={16} /></button></div><p className="fs-small">Try the chat with sample responses · No live AI call</p></form>
      </section>
      <aside className="fs-impact" aria-label="Dependencies and evidence">
        <div className="fs-impact-heading"><h2>What this answer depends on</h2><span className="fs-tracked-count">{state.tracked.length} tracked</span></div>
        <div className="fs-tabs" role="tablist" aria-label="Answer details">{(['impact', 'evidence', 'history'] as Panel[]).map(tab => <button key={tab} type="button" className="fs-tab" id={`fs-${tab}-tab`} role="tab" aria-controls={`fs-${tab}-panel`} aria-selected={state.tab === tab} onClick={() => update({ tab })}>{tab === 'impact' ? 'Impact' : tab === 'evidence' ? 'Evidence' : 'History'}</button>)}</div>
        <div className="fs-status-line" data-alert={changed && hasAny}><Clock3 size={16} /><span>{!hasAny ? 'No answers tracked yet' : changed ? `1 change · ${state.tracked.length} answer(s) to review` : state.checked ? 'Viewing the original · A newer check is available' : 'Original check · Information used in the answer'}</span></div>
        <button type="button" className="fs-button fs-primary fs-full-button" style={{ margin: '0 0 13px' }} disabled={!hasAny} onClick={() => { setActivity(state.checked ? 'Sample data checked again · No further changes' : `Sample event: Ticket price changed, affecting ${state.tracked.length} tracked answer(s)`); update({ checked: true, view: 'current', tab: 'impact', node: 'price' }); }}><RefreshCw size={16} />{state.checked ? 'Check again' : 'Check for changes'}</button>
        {!hasAny && <div className="fs-empty"><Bookmark size={16} /><p>Track an answer in the chat<br />to save evidence and see dependencies.</p></div>}
        {hasAny && state.tab === 'impact' && <div id="fs-impact-panel" role="tabpanel" aria-labelledby="fs-impact-tab">
          <div className="fs-graph" role="group" aria-label="Dependencies from ticket price to total, budget, and savings"><svg className="fs-edges" viewBox="0 0 400 350" preserveAspectRatio="none" aria-hidden="true"><path className={'fs-edge' + (changed ? ' fs-active' : '')} d="M200 94 L200 130" /><path className={'fs-edge' + (changed ? ' fs-active' : '')} d="M200 215 L200 234 L94 234 L94 253" />{state.tracked.includes('savings') && <path className={'fs-edge' + (changed ? ' fs-active' : '')} d="M200 234 L306 234 L306 253" />}</svg>
            {(['price', 'total', 'budget', 'savings'] as Node[]).filter(n => n !== 'savings' || state.tracked.includes('savings')).map(n => { const Icon = icons[n]; return <button key={n} type="button" className={`fs-node fs-node-${n}`} data-state={changed ? (n === 'price' ? 'changed' : 'review') : 'baseline'} aria-pressed={selected === n} onClick={() => update({ node: n })}><span className="fs-node-title"><Icon size={16} /> {names[n]}</span><span className="fs-node-value">{(changed ? currentValues : baselineValues)[n]}</span><span className="fs-node-tag">{(changed ? currentTags : baselineTags)[n]}</span></button>; })}
          </div>
          <div className="fs-selected-detail" aria-live="polite"><h3>{details[selected][0]}</h3><p>{details[selected][changed ? 2 : 1]}</p><div className="fs-detail-actions"><button type="button" className="fs-button" onClick={() => update({ tab: 'evidence' })}><FileSearch size={16} /> View evidence</button><button type="button" className="fs-button" onClick={() => update({ thread: selected === 'savings' ? 'savings' : 'trip', draft: false })}><MessageSquare size={16} /> Go to original chat</button></div></div>
          <div className="fs-unchanged"><Check size={16} /><span>Transport and food remain at the original assumed 100 THB each.</span></div>
          {changed && tracked && <button type="button" className="fs-button fs-full-button" onClick={() => { update({ thread: selected === 'savings' ? 'savings' : state.thread, draft: true }); setActivity('Updated draft shown from sample data · Original answer preserved'); }}><WandSparkles size={16} /> View updated draft</button>}
        </div>}
        {hasAny && state.tab === 'evidence' && <div id="fs-evidence-panel" role="tabpanel" aria-labelledby="fs-evidence-tab"><SourceCard />{state.checked && <SourceCard current />}<p className="fs-note">Both evidence records are fictional and shown for this demo.</p></div>}
        {hasAny && state.tab === 'history' && <div id="fs-history-panel" role="tabpanel" aria-labelledby="fs-history-tab"><ol className="fs-history"><li><button type="button" aria-pressed={state.view === 'baseline'} onClick={() => update({ view: 'baseline', tab: 'impact' })}><small>Nov 12 · 09:00</small><strong>Original check — saved with the answer</strong><span>Ticket 200 · Total 400 · Save 40/day</span></button></li>{state.checked && <li><button type="button" aria-pressed={state.view === 'current'} onClick={() => update({ view: 'current', tab: 'impact' })}><small>Nov 19 · 09:00 · Hypothetical date</small><strong>Recheck — 1 change</strong><span>Ticket 350 · Total 550 · Save 55/day</span></button></li>}</ol><p className="fs-note" style={{ marginTop: 14 }}>Choose a check to view its graph. The original chat answer is preserved.</p></div>}
      </aside>
    </div><footer className="fs-footer"><span aria-live="polite">{activity}</span><span>Prototype concept · No API calls</span></footer>
  </div></div>;
}
