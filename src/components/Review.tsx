import React, { useRef, useState } from 'react';
import { compressPhoto } from '../lib/photos';
import { PHOTO_W, PHOTO_H } from '../lib/canvas';

type Props = { photos: (string | null)[]; onPhotos: (photos: (string | null)[]) => void; onRetake: (index: number) => void; onEditor: () => void; onBack: () => void; photoFocusY: number[]; onFocusY: (index: number, value: number) => void; readOnly?: boolean };
export default function Review({ photos, onPhotos, onRetake, onEditor, onBack, photoFocusY, onFocusY, readOnly = false }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [replaceIndex, setReplaceIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onReplace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try { const copy = [...photos]; copy[replaceIndex] = await compressPhoto(file); onPhotos(copy); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to use this photo.'); }
  };
  return <main className="inner-page page-width review-page">
    <button className="back-link" onClick={onBack}>← back to the previous step</button>
    <div className="page-intro"><div className="eyebrow">STEP 03 / THE REVEAL</div><h1>Look at <em>these cuties!</em></h1><p>Love them? Perfect. The previews below show exactly what fits in your strip. Move each photo up or down to reframe it without retaking.</p></div>
    <div className="review-layout"><div className="review-grid">{photos.map((photo, index) => <div className="review-shot paper-card" key={index}>
      <div className="review-shot-photo" style={{ aspectRatio: `${PHOTO_W} / ${PHOTO_H}` }}>{photo ? <img style={{ objectPosition: `center ${photoFocusY[index] ?? 50}%` }} src={photo} alt={`Actual saved-strip crop for photo ${index + 1}`} /> : <span>photo {index + 1}</span>}<small>0{index + 1} / 04</small></div>
      {photo && <label className="review-reframe"><span>Reframe photo {index + 1} <small>{photoFocusY[index] ?? 50}%</small></span><input type="range" min={0} max={100} step={1} value={photoFocusY[index] ?? 50} onChange={event => onFocusY(index, Number(event.target.value))} aria-label={`Reframe photo ${index + 1} vertically`} /><small>top &larr; &rarr; bottom</small></label>}
      {!readOnly && <div className="review-shot-actions"><button onClick={() => onRetake(index)}>↻ retake</button><button onClick={() => { setReplaceIndex(index); pickerRef.current?.click(); }}>↑ replace</button></div>}
    </div>)}</div>
      <aside className="review-side paper-card"><img src="/stickers/bow.svg" alt="" /><h2>Ready to make it yours?</h2><p>Here's where the real chaos begins. Add bows, hearts, your own little cutouts, doodles and whatever makes you happy.</p><button className="pink-button wide" disabled={photos.some(p => !p)} onClick={onEditor}>decorate our chaos <span className="button-icon">↗</span></button><small>Each of the four slots needs a picture first.</small>{error && <p className="error-note" role="alert">{error}</p>}</aside>
    </div>
    <input type="file" ref={pickerRef} accept="image/*" className="visually-hidden" onChange={event => void onReplace(event)} aria-label="Replace selected photo" />
  </main>;
}
