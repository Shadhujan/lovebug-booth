import type { ChangeEvent } from 'react';
import { BACKDROPS, SCENES, type TogetherComposition, type TogetherLayout, type SceneKey, type BackdropKey } from '../lib/togetherPhotos';

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
    <div><h4>Our shared little world ♡</h4><p>Choose Original cameras for the familiar soft blend, or stand together in a virtual scene. Virtual backgrounds cut both people out on each device.</p></div>
    <div className="together-backdrop-options" role="group" aria-label="Our shared background">
      {(Object.entries(BACKDROPS) as [BackdropKey, typeof BACKDROPS[BackdropKey]][]).map(([id, option]) => <button
        key={id} type="button" aria-pressed={value.backdrop === id} className={value.backdrop === id ? 'active' : ''}
        disabled={disabled} onClick={() => change({ backdrop: id })}>
        <span className="together-backdrop-image" style={{ backgroundColor: option.tint, backgroundImage: option.asset ? `url(${option.asset})` : undefined }} aria-hidden="true">{id === 'original' ? '♡ + ♡' : null}</span>
        <strong>{option.name}</strong><small>{option.description}</small>
      </button>)}
    </div>
    {value.backdrop !== 'original' && <div className="together-scale-grid" aria-label="Person cutout sizes">
      <label><span>{mineLabel} size <output>{value.scaleHost}%</output></span><input type="range" min="70" max="140" step="5" value={value.scaleHost} onChange={event => change({ scaleHost: Number(event.target.value) })} disabled={disabled} /></label>
      <label><span>{partnerLabel} size <output>{value.scaleGuest}%</output></span><input type="range" min="70" max="140" step="5" value={value.scaleGuest} onChange={event => change({ scaleGuest: Number(event.target.value) })} disabled={disabled} /></label>
    </div>}
    <div><h4>Our photo-strip border</h4><p>Keep the scrapbook frame you already love.</p></div>
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
    <p className="together-slider-tip">{value.backdrop === 'original' ? 'Slide each camera crop until both faces fit. Keep faces away from the center fade.' : 'Move each person left or right in your shared world. Adjust size just above if you need more space.'}</p>
    {disabled && <p className="together-readonly">Your lovebug is choosing the shared framing. You see the same finished composition on your screen.</p>}
    <p className="together-help-note">{value.backdrop === 'original' ? 'The original soft blend works even without the background remover.' : 'Virtual scenes load an optional on-device cutout model. Use Original cameras if the phone gets warm or the cutout edges look rough.'}</p>
  </div>;
}
