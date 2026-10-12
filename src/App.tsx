import { useEffect, useState } from 'react';
import Home from './components/Home';
import Setup from './components/Setup';
import CameraBooth from './components/CameraBooth';
import Review from './components/Review';
import Editor from './components/Editor';
import Finish from './components/Finish';
import Album from './components/Album';
import TogetherApart from './components/TogetherApart';
import { freshDraft } from './lib/themes';
import { DEFAULT_PHOTO_FRAMING, normalizePhotoFraming } from './lib/photoFraming';
import type { EditorDraft, PhotoFraming, Screen, ThemeKey } from './types';

const SAMPLE_PHOTOS = [1,2,3,4].map(n => `/demo/photo-${n}.svg`);
export default function App() {
  const [screen, setScreen] = useState<Screen>(new URLSearchParams(window.location.search).has('together') ? 'together' : 'home');
  const [theme, setTheme] = useState<ThemeKey>('strawberry');
  const [timer, setTimer] = useState(3);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(freshDraft);
  const [image, setImage] = useState('');
  const [cameraPurpose, setCameraPurpose] = useState<'single' | 'letter'>('single');
  const [letterMine, setLetterMine] = useState<(string | null)[]>([null, null, null, null]);
  const [letterPartner, setLetterPartner] = useState<(string | null)[]>([null, null, null, null]);
  const [combined, setCombined] = useState(false);
  useEffect(() => {
    if (screen !== 'together') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('together')) { url.searchParams.delete('together'); window.history.replaceState(null, '', url.pathname + url.search + url.hash); }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [screen]);
  const reset = () => { setCameraPurpose('single'); setCombined(false); setPhotos([null,null,null,null]); setRetakeIndex(null); setDraft(freshDraft()); setImage(''); setScreen('setup'); };
  const beginCamera = () => { setCameraPurpose('single'); setCombined(false); setPhotos([null,null,null,null]); setRetakeIndex(null); setDraft(freshDraft()); setScreen('camera'); };
  const takeLetter = () => {
    const next = letterMine.every(Boolean) ? [null, null, null, null] : [...letterMine];
    setCameraPurpose('letter'); setCombined(false); setPhotos(next); setLetterMine(next); setRetakeIndex(null); setScreen('camera');
  };
  const tryDemo = () => { setCameraPurpose('single'); setCombined(false); setPhotos(SAMPLE_PHOTOS); setRetakeIndex(null); setDraft(freshDraft()); setScreen('review'); };
  // A new/retaken image gets an untouched crop; all other slots keep their edits.
  const receivePhotos = (next: (string | null)[]) => {
    const replaced = next.map((value, index) => value !== photos[index]);
    setPhotos(next);
    if (replaced.some(Boolean)) setDraft(current => ({
      ...current,
      photoFraming: next.map((_, index) => replaced[index]
        ? { ...DEFAULT_PHOTO_FRAMING }
        : normalizePhotoFraming(current.photoFraming?.[index], current.photoFocusY?.[index])),
    }));
  };
  const setFrame = (index: number, framing: PhotoFraming) => setDraft(current => {
    const next = Array.from({ length: 4 }, (_, slot) => normalizePhotoFraming(current.photoFraming?.[slot], current.photoFocusY?.[slot]));
    next[index] = framing;
    return { ...current, photoFraming: next };
  });


  return <div className="app-shell">
    <div className="site-stripe" aria-hidden="true" />
    <header className="site-header"><div className="nav-inner page-width">
      <button className="brand" onClick={() => setScreen('home')} aria-label="Lovebug Booth home"><span className="brand-mark">♥</span><span>lovebug <em>booth</em><sup>✿</sup></span></button>
      <nav aria-label="Main navigation"><button className={screen === 'home' ? 'nav-active' : ''} onClick={() => setScreen('home')}>home</button><button className={screen === 'together' ? 'nav-active' : ''} onClick={() => setScreen('together')}>together apart <span>&#9825;</span></button><button className={screen === 'album' ? 'nav-active' : ''} onClick={() => setScreen('album')}>our little album <span>♡</span></button><button className="nav-booth" onClick={reset}>let's play <span>↗</span></button></nav>
    </div></header>
    {screen === 'home' && <Home onStart={reset} onAlbum={() => setScreen('album')} onTogether={() => setScreen('together')} />}
    {screen === 'setup' && <Setup theme={theme} setTheme={setTheme} timer={timer} setTimer={setTimer} onCamera={beginCamera} onDemo={tryDemo} onBack={() => setScreen('home')} />}
    {screen === 'camera' && <CameraBooth timer={timer} photos={photos} retakeIndex={retakeIndex} onPhotos={next => { receivePhotos(next); if (cameraPurpose === 'letter') setLetterMine(next); }} onDone={() => { setRetakeIndex(null); setScreen(cameraPurpose === 'letter' ? 'together' : 'review'); }} onBack={() => { setRetakeIndex(null); setScreen(cameraPurpose === 'letter' ? 'together' : photos.some(Boolean) ? 'review' : 'setup'); }} />}
    {screen === 'review' && <Review photos={photos} onPhotos={receivePhotos} readOnly={combined} onRetake={index => { setRetakeIndex(index); setScreen('camera'); }} onEditor={() => setScreen('editor')} photoFraming={Array.from({ length: 4 }, (_, index) => normalizePhotoFraming(draft.photoFraming?.[index], draft.photoFocusY?.[index]))} onFraming={setFrame} onBack={() => setScreen(combined ? 'together' : 'setup')} />}
    {screen === 'editor' && <Editor photos={photos} theme={theme} initial={draft} onDraftChange={setDraft} onBack={() => setScreen('review')} onFinish={url => { setImage(url); setScreen('finish'); }} />}
    {screen === 'finish' && <Finish image={image} theme={theme} onAlbum={() => setScreen('album')} onAgain={reset} onBack={() => setScreen('editor')} />}
    {screen === 'together' && <TogetherApart mine={letterMine} partner={letterPartner} onMine={setLetterMine} onPartner={setLetterPartner} onCaptureMine={takeLetter} onCombined={next => { setPhotos(next); setCombined(true); setDraft(freshDraft()); setScreen('review'); }} onBack={() => setScreen('home')} timer={timer} />}
    {screen === 'album' && <Album onHome={() => setScreen('home')} onNew={reset} />}
    <footer className="site-footer"><div className="page-width"><span>✿ made with love, exclusively for our little world</span><span>four photos · two lovebugs · endless silly moments ♡</span></div></footer>
  </div>;
}
