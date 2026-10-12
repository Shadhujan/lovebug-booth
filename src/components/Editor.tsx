import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StickerCanvas, { type StickerCanvasHandle } from './StickerCanvas';
import CutoutModal from './CutoutModal';
import { makeId, STICKERS, TEXT_IDEAS } from '../lib/themes';
import { listCustomStickers, saveCustomSticker, deleteCustomSticker } from '../lib/storage';
import type { EditorDraft, Phase, SavedSticker, StickerItem, ThemeKey } from '../types';
import { applyDraftDelta, diffDraft, hasDraftChanges, invertDraftDelta, type DraftDelta } from '../lib/sharedDraft';
import type { StickerMotion } from '../lib/sharedPhotoChannel';

type Props = { photos: (string | null)[]; theme: ThemeKey; initial: EditorDraft; onDraftChange: (draft: EditorDraft) => void; onBack: () => void; onFinish: (result: string) => void; embedded?: boolean; shared?: { incoming?: { sequence: number; delta: DraftDelta }[]; onDelta: (delta: DraftDelta) => void; peerGesture?: StickerMotion | null; onGesturePreview?: (motion: StickerMotion | null) => void } };
type History = { past: EditorDraft[]; present: EditorDraft; future: EditorDraft[] };
type Category = 'cute' | 'us' | 'text' | 'doodles';

const COLORS = ['#e05e87', '#ad7bb9', '#71aaa3', '#eda871', '#794955', '#ffffff'];
const FILTERS: EditorDraft['filter'][] = ['none', 'warm', 'dreamy', 'vintage', 'bw'];

export default function Editor({ photos, theme, initial, onDraftChange, onBack, onFinish, embedded = false, shared }: Props) {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: initial, future: [] }));
  const historyRef = useRef(history); historyRef.current = history;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('cute');
  const [mode, setMode] = useState<Phase>('edit');
  const [brushColor, setBrushColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(7);
  const [eraserSize, setEraserSize] = useState(24);
  const [textInput, setTextInput] = useState('');
  const [custom, setCustom] = useState<SavedSticker[]>([]);
  const [cutoutOpen, setCutoutOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = useRef<StickerCanvasHandle>(null);
  const draft = history.present;
  const selected = useMemo(() => draft.stickers.find(sticker => sticker.id === selectedId), [draft.stickers, selectedId]);

  useEffect(() => { void listCustomStickers().then(setCustom).catch(() => undefined); }, []);
  // In shared mode undo only your own operations. A remote stroke or sticker
  // is never removed just because your older local undo snapshot lacked it.
  const ownPast = useRef<{ forward: DraftDelta; reverse: DraftDelta }[]>([]);
  const ownFuture = useRef<{ forward: DraftDelta; reverse: DraftDelta }[]>([]);
  const lastIncomingSequence = useRef(shared?.incoming?.at(-1)?.sequence ?? 0);
  const [historyTick, setHistoryTick] = useState(0);
  const publish = useCallback((next: History) => { historyRef.current = next; setHistory(next); onDraftChange(next.present); }, [onDraftChange]);
  const commit = useCallback((nextDraft: EditorDraft, baseline?: EditorDraft) => {
    const before = historyRef.current;
    if (shared) {
      const delta = diffDraft(baseline ?? before.present, nextDraft);
      if (!hasDraftChanges(delta)) return;
      const reverse = invertDraftDelta(before.present, delta);
      ownPast.current.push({ forward: delta, reverse });
      ownPast.current = ownPast.current.slice(-35);
      ownFuture.current = [];
      setHistoryTick(x => x + 1);
      publish({ past: [], present: applyDraftDelta(before.present, delta), future: [] });
      shared.onDelta(delta);
    } else publish({ past: [...before.past.slice(-35), before.present], present: nextDraft, future: [] });
  }, [publish, shared]);
  const undo = useCallback(() => {
    if (shared) {
      const entry = ownPast.current.pop();
      if (!entry) return;
      ownFuture.current.push(entry);
      setHistoryTick(x => x + 1);
      publish({ past: [], present: applyDraftDelta(historyRef.current.present, entry.reverse), future: [] });
      shared.onDelta(entry.reverse);
    } else {
      const state = historyRef.current;
      if (!state.past.length) return;
      const previous = state.past[state.past.length - 1];
      publish({ past: state.past.slice(0,-1), present: previous, future: [state.present, ...state.future] });
    }
    setSelectedId(null);
  }, [publish, shared]);
  const redo = useCallback(() => {
    if (shared) {
      const entry = ownFuture.current.pop();
      if (!entry) return;
      ownPast.current.push(entry);
      setHistoryTick(x => x + 1);
      publish({ past: [], present: applyDraftDelta(historyRef.current.present, entry.forward), future: [] });
      shared.onDelta(entry.forward);
    } else {
      const state = historyRef.current;
      if (!state.future.length) return;
      const [next, ...rest] = state.future;
      publish({ past: [...state.past, state.present], present: next, future: rest });
    }
    setSelectedId(null);
  }, [publish, shared]);
  useEffect(() => {
    if (!shared?.incoming?.length) return;
    let present = historyRef.current.present;
    let changed = false;
    for (const message of shared.incoming) {
      if (message.sequence <= lastIncomingSequence.current) continue;
      present = applyDraftDelta(present, message.delta);
      lastIncomingSequence.current = message.sequence;
      changed = true;
    }
    if (changed) publish({ past: [], present, future: [] });
    // The queue only advances for newly received peer updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared?.incoming]);
  void historyTick;
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT','TEXTAREA'].includes(target?.tagName || '')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); if (event.shiftKey) redo(); else undo();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault(); const previous = historyRef.current.present;
        commit({ ...previous, stickers: previous.stickers.filter(s => s.id !== selectedId) }); setSelectedId(null);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [undo, redo, selectedId, commit]);

  const addSticker = useCallback((src: string) => {
    const id = makeId(); const offset = (draft.stickers.length % 5) * 18;
    const item: StickerItem = { id, kind: 'image', src, x: 222 + offset, y: 360 + offset, width: 118, height: 118, rotation: (draft.stickers.length % 3 - 1) * 11, ...(shared ? { layer: Math.max(0, ...draft.stickers.map((item,i) => item.layer ?? i)) + 1 } : {}) };
    commit({ ...draft, stickers: [...draft.stickers, item] }); setSelectedId(id); setMode('edit');
  }, [commit, draft]);
  const addText = (text: string) => {
    if (!text.trim()) return;
    const id = makeId(), value = text.trim().slice(0, 32);
    const item: StickerItem = { id, kind: 'text', text: value, x: 250, y: 425, width: Math.min(380, Math.max(150, value.length * 18 + 24)), height: 62, rotation: -6, color: '#d55782', ...(shared ? { layer: Math.max(0, ...draft.stickers.map((item,i) => item.layer ?? i)) + 1 } : {}) };
    commit({ ...draft, stickers: [...draft.stickers, item] }); setSelectedId(id); setTextInput(''); setMode('edit');
  };
  const patchSelected = (patch: Partial<StickerItem>) => {
    if (!selectedId) return;
    commit({ ...draft, stickers: draft.stickers.map(sticker => sticker.id === selectedId ? { ...sticker, ...patch } : sticker) });
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    commit({ ...draft, stickers: draft.stickers.filter(item => item.id !== selectedId) }); setSelectedId(null);
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const duplicate = { ...selected, id: makeId(), x: selected.x + 26, y: selected.y + 28, ...(shared ? { layer: Math.max(0, ...draft.stickers.map((item,i) => item.layer ?? i)) + 1 } : {}) };
    commit({ ...draft, stickers: [...draft.stickers, duplicate] }); setSelectedId(duplicate.id);
  };
  const moveLayer = (front: boolean) => {
    if (!selected) return;
    if (shared) {
      const layers = draft.stickers.map((item,i) => item.layer ?? i);
      const layer = front ? Math.max(...layers) + 1 : Math.min(...layers) - 1;
      commit({ ...draft, stickers: draft.stickers.map(item => item.id === selected.id ? { ...item, layer } : item) });
    } else {
      const items = draft.stickers.filter(s => s.id !== selected.id);
      commit({ ...draft, stickers: front ? [...items, selected] : [selected, ...items] });
    }
  };
  const onCutoutCreated = async (src: string) => {
    const sticker: SavedSticker = { id: makeId(), src, createdAt: Date.now() };
    setCustom(prev => [sticker, ...prev]); setCutoutOpen(false); addSticker(src);
    try { await saveCustomSticker(sticker); }
    catch { setError('Added this sticker to the strip, but could not save it for next time.'); }
  };
  const finish = async () => {
    setWorking(true); setError(null); setSelectedId(null);
    try { const png = await stage.current?.exportDataURL(); if (!png) throw new Error('The strip is not ready.'); onFinish(png); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not finish this strip.'); }
    finally { setWorking(false); }
  };

  const Shell = embedded ? 'section' : 'main';
  return <Shell className="inner-page page-width editor-page">
    <div className="editor-header"><button className="back-link" onClick={onBack}>← back to our photos</button><div className="editor-header-right"><span>STEP 04 / THE STICKER PLAYGROUND</span><button className="surprise-button" onClick={() => addSticker(STICKERS[Math.floor(Math.random()*STICKERS.length)].src)}>🎲 surprise me!</button></div></div>
    <header className="page-intro editor-intro"><h1>Decorate <em>our chaos!</em> <span>♡</span></h1><p>Drag, rotate, doodle, or add a tiny cutout of yourself. No rules, just cute.</p></header>
    <div className="editor-layout">
      <section className="editor-stage-section"><div className="canvas-mat"><img src="/stickers/bow.svg" className="mat-bow" alt=""/><StickerCanvas ref={stage} photos={photos} theme={theme} draft={draft} selectedId={selectedId} onSelect={setSelectedId} onCommit={commit} onGesturePreview={shared?.onGesturePreview} peerGesture={shared?.peerGesture} mode={mode} brushColor={brushColor} brushSize={brushSize} eraserSize={eraserSize}/><span className="mat-scribble">handmade with ♡</span></div><div className="canvas-help">{mode === 'draw' ? 'Draw directly on the strip with your finger or mouse.' : mode === 'erase' ? 'Rub across your doodles to erase only the lines, without touching the photos or stickers.' : 'Drag a sticker · move the round corner handle to resize · top handle to rotate · pinch with two fingers.'}</div></section>
      <section className="editor-sidebar">
        <div className="editor-toolbox paper-card"><div className="toolbox-top"><strong>little editing tools</strong><small>{selected ? 'sticker selected ♡' : 'pick a sticker to edit'}</small></div>
          <div className="editor-tools"><button onClick={undo} disabled={shared ? ownPast.current.length === 0 : !history.past.length} title="Undo">↶<small>undo</small></button><button onClick={redo} disabled={shared ? ownFuture.current.length === 0 : !history.future.length} title="Redo">↷<small>redo</small></button><button onClick={duplicateSelected} disabled={!selected} title="Duplicate">▢<small>copy</small></button><button onClick={deleteSelected} disabled={!selected} title="Delete">×<small>delete</small></button><button onClick={() => moveLayer(true)} disabled={!selected} title="Bring forward">⇧<small>front</small></button><button onClick={() => moveLayer(false)} disabled={!selected} title="Send backward">⇩<small>back</small></button></div>
        </div>
        <div className="sticker-palette paper-card"><div className="palette-top"><strong>Our sticker box</strong><span>✿</span></div><div className="sticker-tabs" role="tablist" aria-label="Sticker categories">
          {([['cute','cute pack'],['us','the two of us'],['text','love notes'],['doodles','doodles']] as [Category,string][]).map(([value,label]) => <button role="tab" aria-selected={category === value} key={value} className={category === value ? 'active' : ''} onClick={() => { setCategory(value); setMode(value === 'doodles' ? 'draw' : 'edit'); }}>{label}</button>)}
        </div>
        {category === 'cute' && <div className="sticker-grid">{STICKERS.map(item => <button className="sticker-choice" key={item.id} title={`Add ${item.name}`} onClick={() => addSticker(item.src)}><img src={item.src} alt={item.name}/></button>)}</div>}
        {category === 'us' && <div className="custom-panel"><div className="custom-intro"><img src="/stickers/bear.svg" alt=""/><p><strong>Make tiny versions of us!</strong><small>Cut out a face, a funny picture, or even that one favorite selfie.</small></p></div><button className="outline-button wide" onClick={() => setCutoutOpen(true)}>+ make a custom cutout</button>{custom.length ? <div className="sticker-grid saved-customs">{custom.map(item => <div className="custom-sticker-item" key={item.id}><button className="sticker-choice" title="Place our custom sticker" onClick={() => addSticker(item.src)}><img src={item.src} alt="Custom photo sticker" /></button><button className="delete-custom" title="Remove from sticker box" onClick={() => { void deleteCustomSticker(item.id).then(() => setCustom(list => list.filter(s => s.id !== item.id))).catch(() => setError('Could not delete this sticker.')); }}>×</button></div>)}</div> : <p className="empty-custom">Your handmade stickers will appear right here. ♡</p>}</div>}
        {category === 'text' && <div className="text-panel"><label htmlFor="text-sticker">Write a tiny love note</label><div className="inline-form"><input id="text-sticker" placeholder="my favorite human..." maxLength={32} value={textInput} onChange={e => setTextInput(e.target.value)} onKeyDown={event => { if (event.key === 'Enter') addText(textInput); }}/><button className="pink-small" onClick={() => addText(textInput)} disabled={!textInput.trim()}>add</button></div><p>or try one of these</p><div className="text-ideas">{TEXT_IDEAS.map(note => <button key={note} onClick={() => addText(note)}>{note}</button>)}</div></div>}
        {category === 'doodles' && <div className="doodle-panel"><p>Draw sweet little notes, or erase just the part you want to change.</p>
          <div className="doodle-tool-choices" role="group" aria-label="Choose a doodle tool"><button className={mode === 'draw' ? 'active' : ''} aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>✎ pen</button><button className={mode === 'erase' ? 'active' : ''} aria-pressed={mode === 'erase'} onClick={() => setMode('erase')}>◇ eraser</button></div>
          {mode !== 'erase' && <div className="color-picks">{COLORS.map(color => <button key={color} className={brushColor === color ? 'picked' : ''} style={{ background: color }} aria-label={`Choose ${color} pen`} onClick={() => setBrushColor(color)} />)}</div>}
          {mode === 'erase' ? <label className="range-label">Eraser size <input type="range" min={8} max={65} value={eraserSize} onChange={event => setEraserSize(Number(event.target.value))}/><span>{eraserSize}</span></label> : <label className="range-label">Pen size <input type="range" min={2} max={24} value={brushSize} onChange={event => setBrushSize(Number(event.target.value))}/><span>{brushSize}</span></label>}
          <div className="doodle-bottom-actions"><button className="outline-button" onClick={() => setMode('edit')}>✓ done doodling</button><button className="outline-button" disabled={!draft.strokes.length} onClick={() => commit({ ...draft, strokes: [] })}>clear doodles only</button></div></div>}
        </div>
        <div className="finishing-options paper-card"><div><strong>photo mood</strong><small>a little magic for your moments</small></div><div className="filter-options">{FILTERS.map(value => <button key={value} onClick={() => commit({ ...draft, filter: value })} className={draft.filter === value ? 'active' : ''}>{value === 'bw' ? 'b&w' : value}</button>)}</div><label htmlFor="caption-input">little note at the bottom</label><input id="caption-input" value={draft.caption} maxLength={38} onChange={event => commit({ ...draft, caption: event.target.value })} placeholder="just us, always ♡" /></div>
        {selected?.kind === 'text' && <div className="selected-text paper-card"><strong>edit your love note</strong><input aria-label="Edit selected text sticker" value={selected.text || ''} maxLength={32} onChange={event => patchSelected({ text: event.target.value, width: Math.min(380, Math.max(150, event.target.value.length * 18 + 24)) })}/></div>}
        <div className="editor-finish"><div className="hand-note">looking good, cuties! ♡</div><button className="pink-button wide" onClick={() => void finish()} disabled={working}>{working ? 'developing our strip...' : 'finish our masterpiece'} <span className="button-icon">↗</span></button>{error && <p className="error-note" role="alert">{error}</p>}</div>
      </section>
    </div>
    {shared && <p className="shared-edit-note" role="status">♡ Shared editing is live. Both of your stickers and doodles appear in this strip. Undo affects your own changes.{shared.peerGesture ? ' Your lovebug is moving a sticker right now.' : ''}</p>}
    {cutoutOpen && <CutoutModal onClose={() => setCutoutOpen(false)} onCreate={source => void onCutoutCreated(source)} />}
  </Shell>;
}
