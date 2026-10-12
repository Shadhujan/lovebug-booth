import { useState } from 'react';
import { dataUrlToBlob, downloadBlob, saveStrip } from '../lib/storage';
import { makeId } from '../lib/themes';
import type { ThemeKey } from '../types';

type Props = { image: string; theme: ThemeKey; onAlbum: () => void; onAgain: () => void; onBack: () => void; embedded?: boolean };
export default function Finish({ image, theme, onAlbum, onAgain, onBack, embedded = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    try { downloadBlob(await dataUrlToBlob(image), `lovebug-booth-${Date.now()}.png`); }
    catch { setError('Could not download the strip. Please try again.'); }
  };
  const share = async () => {
    setError(null);
    try {
      const file = new File([await dataUrlToBlob(image)], `lovebug-booth-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: 'Our Lovebug Booth memory ♡' });
      } else {
        downloadBlob(file, file.name);
        setError('Your browser cannot open a share sheet, so we downloaded your photo. You can send it from your gallery.');
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return;
      setError('Could not share directly. Try downloading the photo instead.');
    }
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
  const Shell = embedded ? 'section' : 'main';
  return <Shell className="inner-page page-width finish-page"><button className="back-link" onClick={onBack}>← back to stickers</button>
    <div className="finish-layout"><div className="finish-preview"><div className="finish-confetti">✦ ♡ ✿ ♥ ✦ ♡</div><div className="final-print"><img src={image} alt="Your beautifully decorated four-photo strip" /></div><img className="finish-bow" src="/stickers/bow.svg" alt=""/><span className="hand-note finish-note">my favorite person, always ♡</span></div>
      <div className="finish-copy paper-card"><div className="eyebrow">STEP 05 / TA-DA!</div><h1>Made with <em>so much love.</em></h1><p>Look at that masterpiece. Every funny face deserves to be remembered!</p><div className="finish-stamp">CERTIFIED CUTIES <span>♥</span></div><button className="pink-button wide" onClick={() => void save()} disabled={saved || busy}>{saved ? 'saved in this browser' : busy ? 'saving our memory...' : '♡ keep on this device'} <span className="button-icon">✓</span></button><button className="soft-button wide" onClick={() => void download()}>↓ download photo strip</button><button className="soft-button wide" onClick={() => void share()}>♡ share photo</button>{saved && <button className="plain-button" onClick={onAlbum}>see our little album →</button>}<button className="plain-button" onClick={onAgain}>start another photo adventure ↗</button>{error && <p className="error-note" role="alert">{error}</p>}<p className="privacy-reminder">♡ Your photos are saved in this browser only. Download important memories before clearing site data.</p></div>
    </div>
  </Shell>;
}
