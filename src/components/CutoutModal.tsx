import { useEffect, useState } from 'react';
import { makeCutout, type CutoutShape } from '../lib/cutout';

type Props = { onClose: () => void; onCreate: (source: string) => void };

export default function CutoutModal({ onClose, onCreate }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [shape, setShape] = useState<CutoutShape>('circle');
  const [erase, setErase] = useState(false);
  const [tolerance, setTolerance] = useState(55);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const uri = URL.createObjectURL(file);
    setPreview(uri);
    return () => URL.revokeObjectURL(uri);
  }, [file]);
  const create = async () => {
    if (!file || busy) return;
    setBusy(true); setError(null);
    try { onCreate(await makeCutout(file, shape, erase, tolerance)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not make a cutout.'); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cutout-modal paper-card" role="dialog" aria-modal="true" aria-labelledby="cutout-title">
      <button className="modal-close" aria-label="Close sticker maker" onClick={onClose}>×</button>
      <div className="eyebrow">OUR VERY OWN STICKER BOX</div>
      <h2 id="cutout-title">Make a tiny <em>you!</em> ♡</h2>
      <p>Turn your favorite picture into a cute little cutout sticker. Perfect for silly faces.</p>
      <label className="upload-drop"><input type="file" accept="image/*" onChange={event => setFile(event.target.files?.[0] || null)} /><span className="upload-icon">↑</span><span>{file ? file.name : 'choose a picture from your phone'}</span><small>PNG, JPEG, or WebP · max 15 MB</small></label>
      <div className="cutout-preview" aria-live="polite">{preview ? <img className={`cutout-${shape}`} src={preview} alt="Your cutout preview" /> : <img src="/stickers/bunny.svg" alt="Example bunny sticker" />}</div>
      <h3>Pick the cutout shape</h3>
      <div className="shape-options">{(['circle','heart','rounded','original'] as CutoutShape[]).map(s => <button key={s} aria-pressed={shape === s} className={shape === s ? 'chosen' : ''} onClick={() => setShape(s)}>{s === 'circle' ? '●' : s === 'heart' ? '♥' : s === 'rounded' ? '▢' : '□'}<small>{s}</small></button>)}</div>
      <label className="eraser-option"><input type="checkbox" checked={erase} onChange={event => setErase(event.target.checked)} /><span><strong>Try magic background erase</strong><small>Works best with a plain, even background. Not AI removal.</small></span></label>
      {erase && <label className="range-label">Erase strength <input type="range" min="15" max="130" value={tolerance} onChange={event => setTolerance(Number(event.target.value))}/><span>{tolerance}</span></label>}
      {error && <p className="error-note" role="alert">{error}</p>}
      <button disabled={!file || busy} className="pink-button wide" onClick={() => void create()}>{busy ? 'cutting out the cuteness...' : 'add to our sticker box'} <span className="button-icon">♥</span></button>
      <p className="modal-disclaimer">Your picture is processed in this browser only.</p>
    </section>
  </div>;
}
