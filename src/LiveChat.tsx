import { useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, CalendarClock, Check, ChevronDown, Compass, ExternalLink, Lightbulb, ListChecks, MessageSquare, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BrandMark } from './BrandMark';
import FollowUp, { type FollowUpOffer } from './FollowUp';
import './LiveChat.css';

type Source = { id: number; title: string; url: string; estimatedSourceDate?: string };
type Exchange = { question: string; answer: string; searchStatus: 'searched' | 'not_requested'; sources: Source[]; searchedAt?: string };
type LiveChatProps = { onBack: () => void; onOpenDemo: () => void; embedded?: boolean };
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const reasoningLevels: { value: ReasoningEffort; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'Fastest responses' },
  { value: 'low', label: 'Low', description: 'Quick, everyday questions' },
  { value: 'medium', label: 'Medium', description: 'Balanced speed and depth' },
  { value: 'high', label: 'High', description: 'More depth for harder tasks' },
  { value: 'xhigh', label: 'Extra high', description: 'Careful, detailed analysis' },
  { value: 'max', label: 'Max', description: 'Most time for complex tasks' },
];
const suggestions = [
  { icon: Compass, title: 'Plan something', prompt: 'Help me plan a weekend trip on a budget.' },
  { icon: Lightbulb, title: 'Learn something', prompt: 'Explain a complex idea in a simple way.' },
  { icon: ListChecks, title: 'Think it through', prompt: 'Help me break down a big goal into practical steps.' },
];
const sampleQuestions = [
  { label: 'Museum day', question: 'Plan a day exploring museums in Bangkok. Check their current opening hours and closing days, create an itinerary, and cite your sources.' },
  { label: 'Weekend outdoors', question: 'Plan an outdoor day trip in Chiang Mai for next weekend. Check the latest weather forecast, suggest an indoor backup, and cite your sources.' },
  { label: 'Learn React', question: 'Make a two-week plan for learning to build a React app. Check the latest official React documentation and include practical milestones and sources.' },
];

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function displayCheckedAt(value: unknown): string | null {
  return validTimestamp(value) ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : null;
}

function displayEstimatedSourceDate(value: unknown): string | null {
  if (!validTimestamp(value)) return null;
  // Date-only metadata represents a calendar date, not midnight in the viewer's timezone.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (dateOnly && date.toISOString().slice(0, 10) !== value) return null;
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function citedTableSources(node: unknown, sources: Source[]): Source[] {
  const citedIds = new Set<number>();
  const visit = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '';
    const item = value as { type?: unknown; value?: unknown; tagName?: unknown; properties?: { href?: unknown }; children?: unknown };
    if (item.type === 'text' && typeof item.value === 'string') {
      for (const match of item.value.matchAll(/\[(\d+)\]/g)) citedIds.add(Number(match[1]));
      return item.value;
    }
    const text = Array.isArray(item.children) ? item.children.map(visit).join(' ') : '';
    // A Markdown link such as [1](https://...) has an unbracketed text child.
    // Count it only when its destination matches the numbered returned source.
    if (item.tagName === 'a' && /^\d+$/.test(text.trim()) && typeof item.properties?.href === 'string') {
      const id = Number(text.trim());
      if (sources.some(source => source.id === id && source.url === item.properties?.href)) citedIds.add(id);
    }
    return text;
  };
  visit(node);
  return [...citedIds].flatMap(id => {
    const source = sources.find(item => item.id === id);
    return source ? [source] : [];
  });
}

function safeSources(input: unknown): Source[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item): Source[] => {
    if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.id) || item.id < 1 || typeof item.url !== 'string' || typeof item.title !== 'string') return [];
    try {
      const url = new URL(item.url);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return [];
      return [{ id: item.id, title: item.title.trim() || url.hostname, url: url.href, ...(displayEstimatedSourceDate(item.estimatedSourceDate) ? { estimatedSourceDate: item.estimatedSourceDate as string } : {}) }];
    } catch { return []; }
  });
}

/** Live messages intentionally stay separate from the fictional impact demo. */
export default function LiveChat({ onBack, embedded = false }: LiveChatProps) {
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [followUpOffer, setFollowUpOffer] = useState<FollowUpOffer | null>(null);
  const [followUpVisible, setFollowUpVisible] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('medium');
  const reasoningIndex = reasoningLevels.findIndex(level => level.value === reasoningEffort);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [reasoningPosition, setReasoningPosition] = useState<CSSProperties | null>(null);
  const reasoningMenuId = useId();
  const reasoningTriggerRef = useRef<HTMLButtonElement>(null);
  const reasoningMenuRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const reasoningOptionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedded) composerRef.current?.focus({ preventScroll: true });
  }, [embedded]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (embedded && (messages.length > 0 || pending)) conversationEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [embedded, messages.length, pending]);

  useLayoutEffect(() => {
    if (!reasoningOpen) return;
    const positionMenu = () => {
      const trigger = reasoningTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const width = Math.min(270, viewportWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12));
      const above = rect.top - viewportTop - 20;
      const below = viewportTop + viewportHeight - rect.bottom - 20;
      const openAbove = above >= 260 || above >= below;
      setReasoningPosition({
        position: 'fixed', left, width,
        maxHeight: Math.max(80, Math.min(390, openAbove ? above : below)),
        ...(openAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [reasoningOpen]);

  useEffect(() => {
    if (!reasoningOpen || !reasoningPosition) return;
    reasoningOptionsRef.current[reasoningIndex]?.focus({ preventScroll: true });
  }, [reasoningOpen, !!reasoningPosition]);

  useEffect(() => {
    if (!reasoningOpen) return;
    const dismissOutside = (event: Event) => {
      const target = event.target as Node | null;
      if (!reasoningMenuRef.current?.contains(target) && !reasoningTriggerRef.current?.contains(target)) setReasoningOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [reasoningOpen]);

  function chooseReasoning(value: ReasoningEffort) {
    setReasoningEffort(value);
    setReasoningOpen(false);
    reasoningTriggerRef.current?.focus({ preventScroll: true });
  }

  function handleReasoningKeys(event: KeyboardEvent<HTMLDivElement>) {
    const current = reasoningOptionsRef.current.findIndex(option => option === document.activeElement);
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1) % reasoningLevels.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + reasoningLevels.length) % reasoningLevels.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = reasoningLevels.length - 1;
    else if (event.key === 'Tab') {
      event.preventDefault();
      setReasoningOpen(false);
      if (event.shiftKey) reasoningTriggerRef.current?.focus();
      else if (sendButtonRef.current && !sendButtonRef.current.disabled) sendButtonRef.current.focus();
      else composerRef.current?.focus();
      return;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setReasoningOpen(false);
      reasoningTriggerRef.current?.focus();
      return;
    } else return;
    event.preventDefault();
    reasoningOptionsRef.current[next]?.focus();
  }

  function startNewConversation() {
    if ((messages.length > 0 || prompt.trim()) && !window.confirm('Start a new conversation? Your current chat and draft will be cleared.')) return;
    setMessages([]);
    setFollowUpVisible(false);
    setSelectedSourceIndex(null);
    setPrompt('');
    setError('');
    composerRef.current?.focus();
  }

  async function sendQuestion(input: string, sample = false) {
    const question = input.trim();
    if (!question || pending || requestRef.current) return;
    setReasoningOpen(false);
    setPending(true);
    setError('');
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const history = messages.slice(-4).flatMap(({ question: previousQuestion, answer }) => [
        { role: 'user', content: previousQuestion.slice(0, 2000) },
        { role: 'assistant', content: answer.slice(0, 2000) },
      ]);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history, reasoningEffort }),
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== 'object' || !('answer' in result) || typeof result.answer !== 'string') {
        const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error : 'Unable to get a response. Please try again.';
        throw new Error(message);
      }
      const searchStatus = 'searchStatus' in result && result.searchStatus === 'searched' ? 'searched' : 'not_requested';
      const sources = 'sources' in result ? safeSources(result.sources) : [];
      const searchedAt = 'searchedAt' in result && validTimestamp(result.searchedAt) ? result.searchedAt : undefined;
      setMessages(previous => [...previous, { question, answer: result.answer as string, searchStatus, sources, searchedAt }]);
      setSelectedSourceIndex(searchStatus === 'searched' && sources.length ? messages.length : null);
      setPrompt('');
      if (sample) setFollowUpOffer({ question, answer: result.answer as string, sources });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Unable to get a response. Please try again.');
    } finally {
      requestRef.current = null;
      setPending(false);
    }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(prompt);
  }

  function runSample(question: string) {
    setPrompt(question);
    void sendQuestion(question, true);
  }

  const selectedMessage = selectedSourceIndex === null ? undefined : messages[selectedSourceIndex];

  return <div className="now-live-workspace"><div className={'now-live' + (embedded ? ' now-live--embedded' : '') + (selectedMessage?.sources.length ? ' now-live--has-sources' : '')}>
    {!embedded && <aside className="now-live-sidebar" aria-label="Navigation">
      <button type="button" className="now-live-brand" onClick={onBack}><span><BrandMark /></span>NowChatAI</button>
      <button type="button" className="now-live-nav now-live-nav-active" aria-current="page" disabled={pending} onClick={startNewConversation}><MessageSquare size={17} aria-hidden="true" /> <span className="now-live-nav-text">New conversation</span></button>
      <button type="button" className="now-live-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Back to welcome</button>
    </aside>}
    <main className="now-live-main">
      {!embedded && <header className="now-live-header"><span>NowChatAI <span className="now-live-header-muted">/ Chat</span></span><span className="now-live-badge"><span /> Live chat</span></header>}
      {embedded && <div className="now-live-embedded-tools"><span>Conversation</span><div><button type="button" disabled={pending} onClick={startNewConversation}><MessageSquare size={14} aria-hidden="true" />New chat</button></div></div>}
      <section className="now-live-content" aria-label="Conversation">
        {messages.length === 0 && !pending && (embedded ? <div className="now-live-embedded-empty"><h1>What's on your mind?</h1><p>Ask a question. Make a plan. Start here.</p><div className="now-live-examples" aria-label="Try a sample question"><span>Try a plan</span><div>{sampleQuestions.map(sample => <button key={sample.label} type="button" onClick={() => runSample(sample.question)}>{sample.label}<ArrowRight size={13} aria-hidden="true" /></button>)}</div></div></div> : <div className="now-live-empty">
          <div className="now-live-empty-top"><span className="now-live-empty-icon"><Sparkles size={24} aria-hidden="true" /></span><span className="now-live-eyebrow">YOUR THINKING SPACE</span></div>
          <h1>Start with <span>what's on your mind.</span></h1>
          <p>A little clarity goes a long way. Ask a question, explore an idea, or make a plan.</p>
          <div className="now-live-suggestions" aria-label="Suggested prompts">
            {suggestions.map(({ icon: Icon, title, prompt: suggestion }) => <button type="button" className="now-live-suggestion" key={title} onClick={() => { setPrompt(suggestion); composerRef.current?.focus(); }}><span className="now-live-suggestion-icon"><Icon size={17} aria-hidden="true" /></span><span className="now-live-suggestion-title">{title}</span><ArrowRight className="now-live-suggestion-arrow" size={15} aria-hidden="true" /></button>)}
          </div>
        </div>)}
        {messages.map((message, index) => <div className="now-live-exchange" key={index}>
          <div className="now-live-question">{message.question}</div>
          <article className="now-live-answer">
            <div className="now-live-answer-label"><span><Sparkles size={15} aria-hidden="true" /></span> NowChatAI</div>
            <div className="now-live-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              table: ({ children, node }) => <>
                {message.searchStatus === 'searched' && <aside className="now-live-date-note" aria-label="Information date">
                  <CalendarClock size={18} aria-hidden="true" />
                  <div><strong>Sources &amp; dates</strong><span>{displayCheckedAt(message.searchedAt) ? <>Searched on <time dateTime={message.searchedAt}>{displayCheckedAt(message.searchedAt)}</time> · local time</> : 'Search time unavailable'}</span><small>Estimated dates may indicate publication or an update. Check sources to confirm the facts.</small>
                    {citedTableSources(node, message.sources).length > 0 && <div className="now-live-date-sources"><strong>Estimated source dates</strong><ul>{citedTableSources(node, message.sources).map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title}</a><span>{displayEstimatedSourceDate(source.estimatedSourceDate) ? <time dateTime={source.estimatedSourceDate}>{displayEstimatedSourceDate(source.estimatedSourceDate)}</time> : 'Date unavailable'}</span></li>)}</ul></div>}
                  </div>
                </aside>}
                <div className="now-live-table-wrap"><table>{children}</table></div>
              </>,
              a: ({ href, children }) => {
                try {
                  const url = new URL(href || '');
                  if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return <a href={url.href} target="_blank" rel="noopener noreferrer">{children}</a>;
                } catch { /* Render invalid or relative URLs as text. */ }
                return <span>{children}</span>;
              },
            }}>{message.answer}</ReactMarkdown></div>
            {message.searchStatus === 'searched' && message.sources.length > 0 && <button type="button" className="now-live-reference-trigger" aria-pressed={selectedSourceIndex === index} onClick={() => setSelectedSourceIndex(index)}><BookOpen size={14} aria-hidden="true" /> {message.sources.length} references <ArrowRight size={13} aria-hidden="true" /></button>}
            <button type="button" className="now-live-reference-trigger now-live-follow-trigger" onClick={() => setFollowUpOffer({ question: message.question, answer: message.answer, sources: message.sources })}>Follow this answer <ArrowRight size={13} aria-hidden="true" /></button>
          </article>
        </div>)}
        {pending && <div className="now-live-exchange"><div className="now-live-question">{prompt.trim()}</div><article className="now-live-answer" role="status"><div className="now-live-answer-label"><span><Sparkles size={15} aria-hidden="true" /></span> NowChatAI</div><p>Thinking…</p></article></div>}
        <div ref={conversationEndRef} />
      </section>
      <div className="now-live-bottom">
        {error && <p className="now-live-error" role="alert">{error}</p>}
        <form className="now-live-composer" onSubmit={send}>
          <textarea ref={composerRef} aria-label="Message NowChatAI" placeholder="Ask anything…" rows={2} maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={pending} />
          <div className="now-live-composer-actions">
            <button ref={reasoningTriggerRef} type="button" className="now-reasoning-trigger" aria-label={`Reasoning: ${reasoningLevels[reasoningIndex].label}`} aria-haspopup="menu" aria-expanded={reasoningOpen} aria-controls={reasoningOpen ? reasoningMenuId : undefined} disabled={pending} onClick={() => setReasoningOpen(open => !open)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setReasoningOpen(true); } }}>
              <span>{reasoningLevels[reasoningIndex].label}</span><ChevronDown size={14} aria-hidden="true" />
            </button>
            <button ref={sendButtonRef} type="submit" className="now-live-send" aria-label="Send message" disabled={pending || !prompt.trim()}><ArrowUp size={19} aria-hidden="true" /></button>
          </div>
        </form>
        <p className="now-live-caption">AI can make mistakes. Check important information.</p>
      </div>
    </main>
    {selectedMessage && selectedMessage.sources.length > 0 && <aside className="now-reference-panel" aria-label="References">
      <header className="now-reference-header"><div><span className="now-reference-eyebrow"><BookOpen size={13} aria-hidden="true" /> SOURCE LIBRARY</span><h2>References</h2><p>Sources for this answer</p></div><span className="now-reference-count">{selectedMessage.sources.length}</span></header>
      <div className="now-reference-list"><p className="now-reference-note">Search results · Tavily<br />Source dates are estimates of publication or update.</p><ol>{selectedMessage.sources.map(source => <li key={`${source.id}-${source.url}`}><a href={source.url} target="_blank" rel="noopener noreferrer"><span className="now-reference-number">[{source.id}]</span><span className="now-reference-info"><span className="now-reference-domain">{new URL(source.url).hostname.replace(/^www\./, '')}</span><strong>{source.title}</strong><span className="now-reference-date">{displayEstimatedSourceDate(source.estimatedSourceDate) ? <>Estimated source date: <time dateTime={source.estimatedSourceDate}>{displayEstimatedSourceDate(source.estimatedSourceDate)}</time></> : 'Source date unavailable'}</span></span><ExternalLink size={13} aria-hidden="true" /></a></li>)}</ol></div>
    </aside>}
    {reasoningOpen && reasoningPosition && createPortal(
      <div ref={reasoningMenuRef} id={reasoningMenuId} className="now-reasoning-menu" style={reasoningPosition} role="menu" aria-label="Reasoning effort" onKeyDown={handleReasoningKeys}>
        <div className="now-reasoning-menu-heading"><h2>Reasoning</h2><p>Choose how deeply to think</p></div>
        {reasoningLevels.map((level, index) => <button ref={node => { reasoningOptionsRef.current[index] = node; }} key={level.value} type="button" className="now-reasoning-option" role="menuitemradio" aria-checked={reasoningEffort === level.value} tabIndex={-1} disabled={pending} onClick={() => chooseReasoning(level.value)}>
          <span><strong>{level.label}</strong><span>{level.description}</span></span><span className="now-reasoning-check">{reasoningEffort === level.value && <Check size={16} aria-hidden="true" />}</span>
        </button>)}
      </div>, document.body)}
  </div><FollowUp offer={followUpOffer} visible={followUpVisible} onActivate={() => setFollowUpVisible(true)} onOfferClose={() => setFollowUpOffer(null)} /></div>;
}
