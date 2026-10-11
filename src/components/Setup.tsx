import { useState } from 'react';
import { POSES, THEMES } from '../lib/themes';
import type { ThemeKey } from '../types';

type Props = { theme: ThemeKey; setTheme: (next: ThemeKey) => void; timer: number; setTimer: (next: number) => void; onCamera: () => void; onDemo: () => void; onBack: () => void };

export default function Setup({ theme, setTheme, timer, setTimer, onCamera, onDemo, onBack }: Props) {
  const [poseIndex, setPoseIndex] = useState(0);
  return <main className="inner-page page-width setup-page">
    <button className="back-link" onClick={onBack}>← back to our little home</button>
    <header className="page-intro"><div className="eyebrow">STEP 01 / PICK YOUR VIBE</div><h1>First, the <em>cute stuff.</em></h1><p>Choose the color of our little photo strip, then we'll make some memories.</p></header>
    <div className="setup-layout">
      <section className="paper-card settings-card">
        <h2>Pick a little mood <span>✿</span></h2>
        <div className="theme-grid">
          {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, item]) =>
            <button aria-pressed={theme === key} className={`theme-choice ${theme === key ? 'selected' : ''}`} key={key} onClick={() => setTheme(key)}>
              <div className="theme-visual" style={{ background: item.background }}><div className="mini-film" style={{ background: item.paper }}><span>♡</span><span>✿</span><span>♥</span></div><span className="theme-corner" style={{ color: item.ink }}>{theme === key ? '✓' : '♡'}</span></div>
              <strong>{item.name}</strong><small>{item.note}</small>
            </button>)}
        </div>
        <div className="timer-row"><div><h3>Camera countdown</h3><small>Just enough time to get into position!</small></div><div className="timer-buttons">{[3,5,10].map(n => <button className={timer === n ? 'active' : ''} key={n} onClick={() => setTimer(n)}>{n}s</button>)}</div></div>
      </section>
      <aside className="setup-side">
        <div className="pose-card paper-card"><div className="pose-stamp">a little challenge ♡</div><div className="pose-icon">🎲</div><h2>Pose roulette!</h2><p>{POSES[poseIndex]}</p><button className="outline-button" onClick={() => setPoseIndex(index => (index + 1) % POSES.length)}>another silly pose ↻</button><img src="/stickers/flower.svg" alt="" /></div>
        <div className="setup-action paper-card"><h3>Ready, lovebug?</h3><p>Take 4 shots, or try our illustrated demo first.</p><button className="pink-button wide" onClick={onCamera}>open the camera <span className="button-icon">↗</span></button><button className="plain-button" onClick={onDemo}>try with sample pictures instead →</button></div>
      </aside>
    </div>
  </main>;
}
