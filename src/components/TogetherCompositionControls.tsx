import type { ChangeEvent } from 'react';
import { SCENES, type TogetherComposition, type TogetherLayout, type SceneKey } from '../lib/togetherPhotos';

type Props = {
  value: TogetherComposition;
  onChange: (next: TogetherComposition) => void;
  disabled?: boolean;
  mineLabel?: string;
  partnerLabel?: string;
};

const LAYOUTS: { id: TogetherLayout; title: string; detail: string }[] = [
  { id: 'close', title: 'Closer together', detail: 'Soft overlap, less space between you' },
  { id: 'balanced', title: 'Balanced', detail: 'More of each camera, gentle blend' },
  { id: 'classic', title: 'Classic split', detail: 'No overlap; best if backgrounds clash' },
];

export default function TogetherCompositionControls({
  value, onChange, disabled = false, mineLabel = 'Your', partnerLabel = 'Your lovebug\'s',
}: Props) {
  const change = (update: Partial<TogetherComposition>) => onChange({ ...value, ...update });
  return <div className="together-composition-settings">
    <div><h4>How close should we look?</h4><p>The preview shows the exact photo framing, not a wider camera view.</p></div>
    <div className="together-layout-options" role="group" aria-label="Photo composition style">
      {LAYOUTS.map(option => <button key={option.id} type="button" className={value.layout === option.id ? 'active' : ''} aria-pressed={value.layout === option.id} disabled={disabled} onClick={() => change({ layout: option.id })}>
        <strong>{option.title}</strong><small>{option.detail}</small>
      </button>)}
    </div>
    <div><h4>Our little backdrop</h4><p>Choose the scrapbook border around your shared photo.</p></div>
    <div className="scene-options" role="group" aria-label="Choose shared scrapbook border">
      {(Object.entries(SCENES) as [SceneKey, typeof SCENES[SceneKey]][]).map(([id, item]) => <button key={id} type="button" className={value.scene === id ? 'active' : ''} aria-pressed={value.scene === id} disabled={disabled} onClick={() => change({ scene: id })}><span className="scene-swatch" style={{ background: item.background }} />{item.name}</button>)}
    </div>
    <div className="together-framing-grid">
      <label className="together-toggle"><input type="checkbox" checked={value.swap} onChange={(event: ChangeEvent<HTMLInputElement>) => change({ swap: event.target.checked })} disabled={disabled} /> Swap who is on the left</label>
      <label className="together-toggle"><input type="checkbox" checked={value.mirrorHost} onChange={(event: ChangeEvent<HTMLInputElement>) => change({ mirrorHost: event.target.checked })} disabled={disabled} /> Flip {mineLabel.toLowerCase()} photo</label>
      <label className="together-toggle"><input type="checkbox" checked={value.mirrorGuest} onChange={(event: ChangeEvent<HTMLInputElement>) => change({ mirrorGuest: event.target.checked })} disabled={disabled} /> Flip {partnerLabel.toLowerCase()} photo</label>
    </div>
    <div className="together-focus-grid">
      <label><span>Move {mineLabel.toLowerCase()} photo framing <output>{value.focusHost}%</output></span><input type="range" min="0" max="100" step="5" value={value.focusHost} disabled={disabled} onChange={event => change({ focusHost: Number(event.target.value) })} /></label>
      <label><span>Move {partnerLabel.toLowerCase()} photo framing <output>{value.focusGuest}%</output></span><input type="range" min="0" max="100" step="5" value={value.focusGuest} disabled={disabled} onChange={event => change({ focusGuest: Number(event.target.value) })} /></label>
    </div>
    <p className="together-slider-tip">Slide left or right until both faces sit comfortably in the shared frame. Keep faces out of the middle fade for the cleanest result.</p>
    {disabled && <p className="together-readonly">Your lovebug is choosing the shared framing. You see the same finished composition on your screen.</p>}
    <p className="together-help-note">A soft blend hides a hard seam, but does not erase either room. Very different backgrounds may still show until the live person-cutout feature is ready.</p>
  </div>;
}
