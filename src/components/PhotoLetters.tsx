import { useEffect, useRef, useState, type ChangeEvent, type SetStateAction } from 'react';
import { compressPhoto, loadImage } from '../lib/photos';
import { completePhotoSet, composePhotoLetters, DEFAULT_COMPOSITION, downloadPhotoLetter, drawTogetherFrame, readPhotoLetter, type TogetherCutouts, type TogetherComposition } from '../lib/togetherPhotos';
import TogetherCompositionControls from './TogetherCompositionControls';
import { createCustomBackground, getCustomBackground } from '../lib/customBackdrop';

type Props = {
  mine: (string | null)[];
  partner: (string | null)[];
  onMine: (photos: (string | null)[]) => void;
  onPartner: (photos: (string | null)[]) => void;
  onCamera: () => void;
  onCombine: (photos: string[]) => void;
};

export default function PhotoLetters({ mine, partner, onMine, onPartner, onCamera, onCombine }: Props) {
  const minePicker = useRef<HTMLInputElement>(null);
  const partnerPicker = useRef<HTMLInputElement>(null);
  const partnerImagesPicker = useRef<HTMLInputElement>(null);
  const singlePhotoPicker = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<{ who: 'mine' | 'partner'; index: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [compositions, setCompositions] = useState<TogetherComposition[]>(() => Array.from({ length: 4 }, () => ({ ...DEFAULT_COMPOSITION })));
  const composition = compositions[selectedIndex];
  function setComposition(next: SetStateAction<TogetherComposition>) {
    setCompositions(before => before.map((item, index) => index === selectedIndex ? (typeof next === 'function' ? next(item) : next) : item));
  }
  function applyCurrentToAll() { setCompositions(Array.from({length: 4}, () => ({ ...composition }))); }
  const [customBackgroundPreview, setCustomBackgroundPreview] = useState<string>();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [firstPair, setFirstPair] = useState<[HTMLImageElement, HTMLImageElement] | null>(null);
  const [previewCutouts, setPreviewCutouts] = useState<TogetherCutouts | null>(null);
  const [cutoutStatus, setCutoutStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const virtualEnabled = composition.backdrop !== 'original';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mineDone = completePhotoSet(mine);
  const partnerDone = completePhotoSet(partner);

  useEffect(() => {
    let active = true;
    setFirstPair(null);
    if (mine[selectedIndex] && partner[selectedIndex]) {
      void Promise.all([loadImage(mine[selectedIndex]!), loadImage(partner[selectedIndex]!)]).then(images => {
        if (active) setFirstPair(images as [HTMLImageElement, HTMLImageElement]);
      }).catch(() => { if (active) setFirstPair(null); });
    }
    return () => { active = false; };
  }, [mine, partner, selectedIndex]);

  useEffect(() => {
    let active = true;
    setPreviewCutouts(null);
    setCutoutStatus(firstPair && virtualEnabled ? 'loading' : 'idle');
    if (firstPair && virtualEnabled) {
      let processor: import('../lib/personCutout').PersonCutoutProcessor | null = null;
      void import('../lib/personCutout').then(({ PersonCutoutProcessor }) => PersonCutoutProcessor.create('IMAGE')).then(loaded => {
        processor = loaded;
        if (!active) return;
        const [mine, theirs] = firstPair;
        const host = loaded.cutout(mine, mine.naturalWidth, mine.naturalHeight);
        const guest = loaded.cutout(theirs, theirs.naturalWidth, theirs.naturalHeight);
        if (active) { setPreviewCutouts({ host, guest }); setCutoutStatus('ready'); }
      }).catch(reason => { if (active) { setCutoutStatus('error'); setError(reason instanceof Error ? reason.message : 'The background remover could not find both people. Choose Original cameras or use clearer pictures.'); } })
        .finally(() => processor?.close());
    }
    return () => { active = false; };
  }, [firstPair, virtualEnabled]);

  useEffect(() => {
    if (!firstPair || !previewRef.current) return;
    const [yours, theirs] = firstPair;
    drawTogetherFrame(previewRef.current,
      { image: yours, width: yours.naturalWidth, height: yours.naturalHeight },
      { image: theirs, width: theirs.naturalWidth, height: theirs.naturalHeight },
      composition, undefined, previewCutouts ?? undefined,
    );
  }, [firstPair, composition, previewCutouts]);

  async function uploadMine(files: FileList | null) {
    if (!files?.length) return;
    if (files.length !== 4) { setError('Please choose exactly four photos.'); return; }
    setBusy(true); setError('');
    try { onMine(await Promise.all(Array.from(files).map(compressPhoto))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import your photos.'); }
    finally { setBusy(false); }
  }

  async function uploadPartnerImages(files: FileList | null) {
    if (!files?.length) return;
    if (files.length !== 4) { setError('Please choose exactly four pictures from your partner.'); return; }
    setBusy(true); setError('');
    try { onPartner(await Promise.all(Array.from(files).map(compressPhoto))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import the pictures.'); }
    finally { setBusy(false); }
  }

  async function replaceOnePhoto(file: File | undefined) {
    const target = replaceTarget.current; replaceTarget.current = null;
    if (!file || !target) return;
    setBusy(true); setError('');
    try {
      const updated = target.who === 'mine' ? [...mine] : [...partner];
      updated[target.index] = await compressPhoto(file);
      if (target.who === 'mine') onMine(updated); else onPartner(updated);
      setSelectedIndex(target.index);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not replace that photo.'); }
    finally { setBusy(false); }
  }
  function chooseReplacement(who: 'mine' | 'partner') {
    replaceTarget.current = { who, index: selectedIndex };
    singlePhotoPicker.current?.click();
  }

  async function importPartner(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError('');
    try { const letter = await readPhotoLetter(file); onPartner(letter.photos); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read the photo letter.'); }
    finally { setBusy(false); }
  }

  async function uploadBackground(file: File) {
    setBusy(true); setError('');
    try {
      const saved = await createCustomBackground(file);
      setCustomBackgroundPreview(saved.dataUrl);
      setComposition(previous => ({ ...previous, backdrop: 'custom', customBackgroundId: saved.id }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not use that background photo.');
    } finally { setBusy(false); }
  }

  async function combine() {
    setBusy(true); setError('');
    try { onCombine(await composePhotoLetters(mine, partner, compositions)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not make your combined photos.'); }
    finally { setBusy(false); }
  }

  return <section className="together-letters" aria-label="Photo letters, the take-it-later fallback">
    <div className="together-section-lead"><span className="eyebrow">NO PERFECT TIMING REQUIRED</span><h2>Photo letters <em>for two</em></h2><p>Take your pictures whenever you can. Send a little photo letter privately, then blend your four poses into one shared frame. No call or Supabase connection needed.</p></div>
    <div className="letter-steps">
      <article className="paper-card letter-card">
        <div className="letter-step-number">01 / your little letter</div><h3>Take your four pictures</h3><p>Open your camera or choose four from your phone. Download a photo pack to send to her privately.</p>
        <div className="letter-previews">{mine.map((item, index) => <button type="button" className={selectedIndex === index ? 'active' : ''} aria-label={`Preview photo pair ${index + 1}`} aria-pressed={selectedIndex === index} key={index} onClick={() => setSelectedIndex(index)}>{item ? <img src={item} alt={`Your picture ${index + 1}`} /> : <span>{index + 1}</span>}</button>)}</div>
        <div className="letter-actions"><button className="pink-button" onClick={onCamera} disabled={busy}>open my camera <span className="button-icon">&#8599;</span></button><button className="soft-button" onClick={() => minePicker.current?.click()} disabled={busy}>upload four</button></div>
        {mineDone && <button className="outline-button letter-download" disabled={busy} onClick={() => { try { downloadPhotoLetter(mine); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not export your photos.'); } }}>download my photo letter (.json) &#8595;</button>}
      </article>
      <article className="paper-card letter-card">
        <div className="letter-step-number">02 / their little letter</div><h3>Open her photo letter</h3><p>Ask her to do the same, then send you her exported <code>.json</code> file by a private chat. Open it here.</p>
        <div className="letter-previews">{partner.map((item, index) => <button type="button" className={selectedIndex === index ? 'active' : ''} aria-label={`Preview photo pair ${index + 1}`} aria-pressed={selectedIndex === index} key={index} onClick={() => setSelectedIndex(index)}>{item ? <img src={item} alt={`Partner picture ${index + 1}`} /> : <span>{index + 1}</span>}</button>)}</div>
        <div className="letter-actions"><button className="soft-button letter-import" onClick={() => partnerPicker.current?.click()} disabled={busy}>choose their photo letter &#8593;</button><button className="outline-button letter-import" onClick={() => partnerImagesPicker.current?.click()} disabled={busy}>or upload their four photos</button></div>
        {partnerDone && <p className="letter-success" role="status">Her four photos are here. Time for the magic.</p>}
      </article>
    </div>
    <div className="paper-card letter-combine"><div><span className="eyebrow">03 / ONE SWEET PHOTO STRIP</span><h3>Bring your pictures together</h3><p>Choose any of the four pairs, replace either photo, and adjust that pair before combining. Every pair has its own framing.</p></div>
      <div className="letter-pair-picker" role="group" aria-label="Preview and edit each photo pair">{mine.map((myPhoto, index) => <button type="button" disabled={busy} aria-pressed={selectedIndex === index} className={selectedIndex === index ? 'active' : ''} onClick={() => setSelectedIndex(index)} key={index}><strong>0{index+1}</strong><span className="letter-pair-pictures">{myPhoto ? <img src={myPhoto} alt="" /> : <span>you</span>}{partner[index] ? <img src={partner[index]!} alt="" /> : <span>them</span>}</span></button>)}</div>
      <div className="letter-edit-pair-heading"><strong>Editing photo pair {selectedIndex + 1} of 4</strong><p>Only this pair changes unless you copy its framing to all four.</p><div className="letter-edit-pair-actions"><button className="outline-button" disabled={busy} onClick={() => chooseReplacement('mine')}>replace my picture</button><button className="outline-button" disabled={busy} onClick={() => chooseReplacement('partner')}>replace their picture</button><button className="outline-button" disabled={busy} onClick={applyCurrentToAll}>use this framing for all 4</button></div></div>
      <TogetherCompositionControls value={composition} onChange={setComposition} onCustomBackground={uploadBackground}
        customBackgroundPreview={getCustomBackground(composition.customBackgroundId)?.dataUrl ?? customBackgroundPreview}
        customBackgroundBusy={busy} />
      {virtualEnabled && firstPair && <p className="together-cutout-status" role="status" data-state={cutoutStatus}>{cutoutStatus === 'ready' ? '♡ Both people are ready in this photo pair.' : cutoutStatus === 'error' ? 'Could not clearly find both people. Choose brighter pictures or Original cameras.' : 'Preparing the people-only preview locally…'}</p>}
      {firstPair && <div className="letter-merged-preview"><div><span className="eyebrow">PREVIEW / PHOTO {selectedIndex + 1} OF 4</span><p>This is the exact scene for the selected photo pair. Choose another number above to preview or edit it.</p></div><canvas ref={previewRef} width={660} height={495} role="img" aria-label={`Preview of combined photo pair ${selectedIndex + 1} using its own framing`} /></div>}
      <button className="pink-button letter-combine-button" disabled={busy || !mineDone || !partnerDone || (virtualEnabled && cutoutStatus !== 'ready')} onClick={() => void combine()}>{busy ? 'making your memory...' : 'combine our four pictures'} <span className="button-icon">&#9825;</span></button>
      {!mineDone || !partnerDone ? <small>Both sets of four photos are required before combining.</small> : null}
      {error && <p className="error-note" role="alert">{error}</p>}
      <p className="together-help-note">Photo letters stay on your device unless you send them. In a virtual scene, both sets are segmented on this device before the four photo strips are made. If that is slow, choose Original cameras for the familiar soft blend.</p>
    </div>
    <input ref={singlePhotoPicker} className="visually-hidden" type="file" accept="image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => { void replaceOnePhoto(event.target.files?.[0]); event.target.value = ''; }} aria-label="Replace one selected photo" />
    <input ref={minePicker} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { void uploadMine(event.target.files); event.target.value = ''; }} aria-label="Upload your four photos" />
    <input ref={partnerImagesPicker} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { void uploadPartnerImages(event.target.files); event.target.value = ''; }} aria-label="Upload four pictures from your partner" />
    <input ref={partnerPicker} className="visually-hidden" type="file" accept=".json,application/json" onChange={(event: ChangeEvent<HTMLInputElement>) => { void importPartner(event.target.files?.[0]); event.target.value = ''; }} aria-label="Import your partner's Lovebug photo letter" />
  </section>;
}
