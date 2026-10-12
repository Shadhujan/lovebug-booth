import { useRef, useState, type ChangeEvent } from 'react';
import { compressPhoto } from '../lib/photos';
import type { PhotoFraming } from '../types';
import PhotoAdjuster from './PhotoAdjuster';

type Props = {
  photos: (string | null)[];
  onPhotos: (photos: (string | null)[]) => void;
  onRetake: (index: number) => void;
  onEditor: () => void;
  onBack: () => void;
  photoFraming: PhotoFraming[];
  onFraming: (index: number, framing: PhotoFraming) => void;
  readOnly?: boolean;
};

export default function Review({ photos, onPhotos, onRetake, onEditor, onBack, photoFraming, onFraming, readOnly = false }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [replaceIndex, setReplaceIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onReplace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const copy = [...photos];
      copy[replaceIndex] = await compressPhoto(file);
      onPhotos(copy);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to use this photo.');
    }
  };

  return <main className="inner-page page-width review-page">
    <button className="back-link" onClick={onBack}>← back to the previous step</button>
    <div className="page-intro">
      <div className="eyebrow">STEP 03 / THE REVEAL</div>
      <h1>Look at <em>these cuties!</em></h1>
      <p>Drag each photo until it looks just right. Pinch with two fingers or use + and - to zoom. What you see here is exactly what goes in your strip.</p>
    </div>
    <div className="review-layout"><div className="review-grid">{photos.map((photo, index) => <div className="review-shot paper-card" key={index}>
      {photo
        ? <PhotoAdjuster source={photo} index={index} framing={photoFraming[index]} onChange={value => onFraming(index, value)} />
        : <div className="review-shot-photo review-empty-photo"><span>photo {index + 1}</span></div>}
      {!readOnly && <div className="review-shot-actions">
        <button onClick={() => onRetake(index)}>↻ retake</button>
        <button onClick={() => { setReplaceIndex(index); pickerRef.current?.click(); }}>↑ replace</button>
      </div>}
    </div>)}</div>
      <aside className="review-side paper-card"><img src="/stickers/bow.svg" alt="" /><h2>Ready to make it yours?</h2><p>Here's where the real chaos begins. Add bows, hearts, your own little cutouts, doodles and whatever makes you happy.</p><button className="pink-button wide" disabled={photos.some(p => !p)} onClick={onEditor}>decorate our chaos <span className="button-icon">↗</span></button><small>Each of the four slots needs a picture first.</small>{error && <p className="error-note" role="alert">{error}</p>}</aside>
    </div>
    <input type="file" ref={pickerRef} accept="image/*" className="visually-hidden" onChange={event => void onReplace(event)} aria-label="Replace selected photo" />
  </main>;
}
