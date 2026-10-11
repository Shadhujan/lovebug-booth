import { useState } from 'react';
import { dataUrlToBlob, downloadBlob, saveStrip } from '../lib/storage';
import { makeId } from '../lib/themes';
import type { ThemeKey } from '../types';

type Props = { image: string; theme: ThemeKey; onAlbum: () => void; onAgain: () => void; onBack: () => void };
export default function Finish({ image, theme, onAlbum, onAgain, onBack }: Props) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    try { downloadBlob(await dataUrlToBlob(image), `lovebug-booth-${Date.now()}.png`); }
    catch { setError('Could not download the strip. Please try again.'); }
  };
  const save = async () => {
    if (saved || busy) return;
    setBusy(true); setError(null);
    try {
      await saveStrip({ id: makeId(), createdAt: Date.now(), theme, image: await dataUrlToBlob(image), note: 'just us, always ♡' });
      setSaved(true);
    } catch { setError('This browser could not save to the local album. Please download your strip instead.'); }
    finally { setBusy(false); }
  };
  return <main className="inner-page page-width finish-page"><button className="back-link" onClick={onBack}>← back to stickers</button>
    <div className="finish-layout"><div className="finish-preview"><div className="finish-confetti">✦ ♡ ✿ ♥ ✦ ♡</div><div className="final-print"><img src={image} alt="Your beautifully decorated four-photo strip" /></div><img className="finish-bow" src="/stickers/bow.svg" alt=""/><span className="hand-note finish-note">my favorite person, always ♡</span></div>
      <div className="finish-copy paper-card"><div className="eyebrow">STEP 05 / TA-DA!</div><h1>Made with <em>so much love.</em></h1><p>Look at that masterpiece. Every funny face deserves to be remembered!</p><div className="finish-stamp">CERTIFIED CUTIES <span>♥</span></div><button className="pink-button wide" onClick={() => void save()} disabled={saved || busy}>{saved ? '♥ saved to our album!' : busy ? 'saving our memory...' : '♡ save to our album'} <span className="button-icon">✓</span></button><button className="soft-button wide" onClick={() => void download()}>↓ download photo strip</button>{saved && <button className="plain-button" onClick={onAlbum}>see our little album →</button>}<button className="plain-button" onClick={onAgain}>start another photo adventure ↗</button>{error && <p className="error-note" role="alert">{error}</p>}<p className="privacy-reminder">♡ For now, the album saves to this browser only. Shared Supabase albums are the next milestone.</p></div>
    </div>
  </main>;
}
