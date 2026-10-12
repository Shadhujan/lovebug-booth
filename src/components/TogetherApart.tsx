import { useState } from 'react';
import type { ThemeKey } from '../types';
import PhotoLetters from './PhotoLetters';
import LiveTogether from './LiveTogether';

type Props = {
  mine: (string | null)[];
  partner: (string | null)[];
  onMine: (photos: (string | null)[]) => void;
  onPartner: (photos: (string | null)[]) => void;
  onCaptureMine: () => void;
  onCombined: (photos: string[]) => void;
  onBack: () => void;
  onAlbum: () => void;
  timer: number;
  theme: ThemeKey;
};

export default function TogetherApart({ mine, partner, onMine, onPartner, onCaptureMine, onCombined, onBack, onAlbum, timer, theme }: Props) {
  const [mode, setMode] = useState<'live' | 'letters'>(new URLSearchParams(window.location.search).has('together') ? 'live' : 'letters');
  const [livePhotoStage, setLivePhotoStage] = useState(false);
  return <main className="inner-page page-width together-page">
    {!livePhotoStage && <><button className="back-link" onClick={onBack}>&#8592; back to our little home</button>
    <header className="together-intro"><div className="eyebrow">TWO PLACES / ONE LITTLE MEMORY</div><h1>Together <em>Apart.</em></h1><p>Miles apart, still in the same little photo strip. Choose a live booth date or make photo letters at your own pace.</p><img className="together-hero-bow" src="/stickers/bow.svg" alt="" /></header>
    <div className="together-mode-tabs" role="group" aria-label="Choose long distance photo mode"><button aria-pressed={mode === 'live'} onClick={() => setMode('live')} className={mode === 'live' ? 'active' : ''}>live together &#9825;<small>both cameras, same time</small></button><button aria-pressed={mode === 'letters'} onClick={() => setMode('letters')} className={mode === 'letters' ? 'active' : ''}>photo letters &#9993;<small>take pictures whenever</small></button></div></>}
    {mode === 'letters' ? <PhotoLetters mine={mine} partner={partner} onMine={onMine} onPartner={onPartner} onCamera={onCaptureMine} onCombine={onCombined} /> : <LiveTogether timer={timer} theme={theme} onPhotoStageChange={setLivePhotoStage} onAlbum={onAlbum} onHome={onBack} />}
  </main>;
}
