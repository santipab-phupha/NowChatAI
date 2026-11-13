import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import './welcome.css';

type WelcomeProps = { onContinue: () => void };

type WelcomeLayoutProps = { children: ReactNode; onHome: () => void; view: 'welcome' | 'live' };

export function WelcomeLayout({ children, onHome, view }: WelcomeLayoutProps) {
  return (
    <div className="welcome" data-view={view}>
      <header className="welcome-header">
        <div className="welcome-brand-group">
          <button type="button" className="welcome-brand" onClick={onHome} aria-label="NowChatAI — back to welcome"><span className="welcome-brand-icon"><BrandMark /></span> NowChatAI</button>
        </div>
        <span className="welcome-preview">Geek Room Global AI Hackathon</span>
      </header>
      {view === 'welcome' && <span className="welcome-header-intro" aria-hidden="true">Welcome to</span>}
      {children}
    </div>
  );
}

export function Welcome({ onContinue }: WelcomeProps) {
  return (
      <main className="welcome-main" aria-labelledby="welcome-title">
        <div className="welcome-hero">
          <div className="welcome-copy">
            <h1 id="welcome-title" aria-label="Welcome to NowChatAI"><span className="welcome-title-name">NowChat<span>AI</span></span></h1>
            <p className="welcome-intro">Stay Your Answer Right Now</p>
            <div className="welcome-actions">
              <button className="welcome-start" onClick={onContinue}>
                <span>Get Start</span><ArrowRight size={17} aria-hidden="true" />
                <span className="welcome-start-wipe" aria-hidden="true"><span>Get Start</span><ArrowRight size={17} /></span>
              </button>
            </div>
          </div>

          <figure className="welcome-example" aria-labelledby="welcome-example-question">
            <div className="welcome-ticket-header"><span>NowChatAI</span><span className="welcome-ticket-serial">NC—001</span></div>
            <div className="welcome-ticket-body">
            <div className="welcome-example-heading"><span>Park day</span><span>1 person</span></div>
            <h2 id="welcome-example-question">Still within budget?</h2>
            <div className="welcome-ticket-budget"><span>Budget</span><strong>500 <span>THB</span></strong></div>
            <div className="welcome-evidence">
              <div className="welcome-evidence-heading"><h3>Ticket</h3></div>
              <div className="welcome-price" aria-label="Ticket price changed from 200 to 350 Thai baht">
                <div className="welcome-amount welcome-amount--before"><span>Before</span><div><strong>200</strong><span>THB</span></div></div>
                <ArrowRight size={24} strokeWidth={1.5} aria-hidden="true" />
                <div className="welcome-amount welcome-amount--now"><span>Now</span><div><strong>350</strong><span>THB</span></div></div>
              </div>
            </div>
            </div>
            <div className="welcome-ticket-tear" aria-hidden="true"><span /></div>
            <div className="welcome-ticket-stub">
            <div className="welcome-consequence">
              <h3>Total</h3>
              <div className="welcome-total" aria-label="Trip total changed from 400 to 550 Thai baht"><span>400</span><ArrowRight size={20} aria-hidden="true" /><strong>550 <span>THB</span></strong></div>
              <div className="welcome-budget-impact"><strong>50 THB over budget</strong></div>
            </div>
            <div className="welcome-ticket-foot" aria-hidden="true"><span className="welcome-ticket-barcode" /></div>
            </div>
            <figcaption>Fictional example</figcaption>
          </figure>
        </div>

        <div className="welcome-features" aria-label="How NowChatAI helps">
          <div className="welcome-feature"><span className="welcome-feature-number" aria-hidden="true">01</span><div><strong>Keep what matters</strong><span>Track answers you want to revisit.</span></div></div>
          <div className="welcome-feature"><span className="welcome-feature-number" aria-hidden="true">02</span><div><strong>See what changed</strong><span>Revisit the evidence behind an answer.</span></div></div>
          <div className="welcome-feature"><span className="welcome-feature-number" aria-hidden="true">03</span><div><strong>Understand the impact</strong><span>Follow connections across your plans.</span></div></div>
        </div>
      </main>
  );
}
