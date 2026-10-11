import { useEffect, useState } from 'react';
import Home from './components/Home';
import Setup from './components/Setup';
import CameraBooth from './components/CameraBooth';
import Review from './components/Review';
import Editor from './components/Editor';
import Finish from './components/Finish';
import Album from './components/Album';
import { freshDraft } from './lib/themes';
import type { EditorDraft, Screen, ThemeKey } from './types';

const SAMPLE_PHOTOS = [1,2,3,4].map(n => `/demo/photo-${n}.svg`);
export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [theme, setTheme] = useState<ThemeKey>('strawberry');
  const [timer, setTimer] = useState(3);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(freshDraft);
  const [image, setImage] = useState('');
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);
  const reset = () => { setPhotos([null,null,null,null]); setRetakeIndex(null); setDraft(freshDraft()); setImage(''); setScreen('setup'); };
  const beginCamera = () => { setPhotos([null,null,null,null]); setRetakeIndex(null); setDraft(freshDraft()); setScreen('camera'); };
  const tryDemo = () => { setPhotos(SAMPLE_PHOTOS); setRetakeIndex(null); setDraft(freshDraft()); setScreen('review'); };

  return <div className="app-shell">
    <div className="site-stripe" aria-hidden="true" />
    <header className="site-header"><div className="nav-inner page-width">
      <button className="brand" onClick={() => setScreen('home')} aria-label="Lovebug Booth home"><span className="brand-mark">♥</span><span>lovebug <em>booth</em><sup>✿</sup></span></button>
      <nav aria-label="Main navigation"><button className={screen === 'home' ? 'nav-active' : ''} onClick={() => setScreen('home')}>home</button><button className={screen === 'album' ? 'nav-active' : ''} onClick={() => setScreen('album')}>our little album <span>♡</span></button><button className="nav-booth" onClick={reset}>let's play <span>↗</span></button></nav>
    </div></header>
    {screen === 'home' && <Home onStart={reset} onAlbum={() => setScreen('album')} />}
    {screen === 'setup' && <Setup theme={theme} setTheme={setTheme} timer={timer} setTimer={setTimer} onCamera={beginCamera} onDemo={tryDemo} onBack={() => setScreen('home')} />}
    {screen === 'camera' && <CameraBooth timer={timer} photos={photos} retakeIndex={retakeIndex} onPhotos={setPhotos} onDone={() => { setRetakeIndex(null); setScreen('review'); }} onBack={() => { setRetakeIndex(null); setScreen(photos.some(Boolean) ? 'review' : 'setup'); }} />}
    {screen === 'review' && <Review photos={photos} onPhotos={setPhotos} onRetake={index => { setRetakeIndex(index); setScreen('camera'); }} onEditor={() => setScreen('editor')} onBack={() => setScreen('setup')} />}
    {screen === 'editor' && <Editor photos={photos} theme={theme} initial={draft} onDraftChange={setDraft} onBack={() => setScreen('review')} onFinish={url => { setImage(url); setScreen('finish'); }} />}
    {screen === 'finish' && <Finish image={image} theme={theme} onAlbum={() => setScreen('album')} onAgain={reset} onBack={() => setScreen('editor')} />}
    {screen === 'album' && <Album onHome={() => setScreen('home')} onNew={reset} />}
    <footer className="site-footer"><div className="page-width"><span>✿ made with love, exclusively for our little world</span><span>four photos · two lovebugs · endless silly moments ♡</span></div></footer>
  </div>;
}
