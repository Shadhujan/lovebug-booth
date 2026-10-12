import { useEffect, useState } from 'react';
import { makeLocalBackup } from '../lib/localBackup';
import { clearLocalMemories, deleteStrip, downloadBlob, listCustomStickers, listStrips } from '../lib/storage';
import type { AlbumEntry } from '../types';

type Props = { onHome: () => void; onNew: () => void };
type Card = { entry: AlbumEntry; url: string };

export default function Album({ onHome, onNew }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [stickerCount, setStickerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'backup' | 'clear' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let disposed = false;
    const urls: string[] = [];
    void Promise.all([listStrips(), listCustomStickers()]).then(([entries, stickers]) => {
      if (disposed) return;
      const next = [...entries].sort((a, b) => b.createdAt - a.createdAt).map(entry => {
        const url = URL.createObjectURL(entry.image);
        urls.push(url);
        return { entry, url };
      });
      setCards(next);
      setStickerCount(stickers.length);
    }).catch(() => {
      if (!disposed) setError('This browser could not open your saved memories.');
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  const remove = async (card: Card) => {
    if (!window.confirm('Remove this strip from this browser? This cannot be undone.')) return;
    setError(null); setMessage('');
    try {
      await deleteStrip(card.entry.id);
      setCards(list => list.filter(item => item.entry.id !== card.entry.id));
      URL.revokeObjectURL(card.url);
    } catch { setError('Could not remove that photo.'); }
  };

  const backup = async () => {
    if (busy) return;
    setBusy('backup'); setError(null); setMessage(''); setConfirmClear(false);
    try {
      const { zip, photos, stickers } = await makeLocalBackup();
      const filename = `lovebug-memories-${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(zip, filename);
      setMessage(`Your backup download started (${photos} photo strips, ${stickers} handmade stickers). Keep the ZIP in a safe place.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not make the ZIP backup.');
    } finally { setBusy(null); }
  };

  const clear = async () => {
    if (busy || !confirmClear) return;
    setBusy('clear'); setError(null); setMessage('');
    try {
      await clearLocalMemories();
      cards.forEach(card => URL.revokeObjectURL(card.url));
      setCards([]);
      setStickerCount(0);
      setConfirmClear(false);
      setMessage('Saved strips and handmade stickers were cleared from this browser. Cloud data was not changed.');
    } catch { setError('Could not clear this browser\'s memories. Please try again.'); }
    finally { setBusy(null); }
  };

  const empty = !cards.length && !stickerCount;

  return <main className="inner-page page-width album-page">
    <button className="back-link" onClick={onHome}>← back to our little home</button>
    <div className="album-intro">
      <div><div className="eyebrow">OUR LITTLE CORNER OF FOREVER</div><h1>Our <em>little album.</em></h1><p>Every cheesy smile, every silly face, all in one very cute place. &#9825;</p></div>
      <button className="pink-button" onClick={onNew}>make new memories <span className="button-icon">↗</span></button>
    </div>

    <section className="album-privacy-card paper-card" aria-label="Your photo privacy">
      <span aria-hidden="true" className="album-privacy-heart">&#9825;</span>
      <div><strong>Your memories belong to you.</strong>
        <p>Photos and handmade stickers saved here stay in this browser. They are not uploaded to a cloud album. Clearing browser data, changing browsers, or losing this device can erase them, so download your favorites.</p>
      </div>
    </section>

    <section className="album-backup-card paper-card" aria-label="Manage local memories">
      <div className="album-backup-intro">
        <div><div className="eyebrow">A LITTLE BACKUP, JUST IN CASE</div><h2>Keep the good ones safe.</h2><p>Download your saved photo strips and custom stickers together as a ZIP. The backup stays with you; it isn't sent to us.</p></div>
        <div className="album-backup-actions">
          <button className="soft-button" type="button" onClick={() => void backup()} disabled={loading || busy !== null || empty}>{busy === 'backup' ? 'packing your memories...' : '↓ download all memories'}</button>
          <button className="plain-button album-clear-button" type="button" onClick={() => { setConfirmClear(true); setMessage(''); setError(null); }} disabled={loading || busy !== null || empty}>clear saved memories</button>
        </div>
      </div>
      {confirmClear && <div className="album-clear-confirm" role="group" aria-label="Confirm permanent deletion">
        <strong>Delete everything saved in this browser?</strong>
        <p>This removes {cards.length} photo {cards.length === 1 ? 'strip' : 'strips'} and {stickerCount} handmade {stickerCount === 1 ? 'sticker' : 'stickers'}. This cannot be undone. Download a backup first if you want to keep them.</p>
        <div className="album-confirm-buttons"><button className="soft-button" onClick={() => setConfirmClear(false)} disabled={busy !== null}>keep my memories</button><button className="album-confirm-delete" onClick={() => void clear()} disabled={busy !== null}>{busy === 'clear' ? 'clearing...' : 'yes, delete local memories'}</button></div>
      </div>}
      {message && <p className="album-success" role="status">{message}</p>}
      {error && <p className="error-note" role="alert">{error}</p>}
    </section>

    {loading ? <p className="empty-album">Opening our scrapbook...</p> : cards.length ? <div className="album-grid">{cards.map(({ entry, url }) => <article className="album-card paper-card" key={entry.id}>
      <div className="album-photo"><img src={url} alt={`Photo strip saved on ${new Date(entry.createdAt).toLocaleDateString()}`} /></div>
      <div className="album-card-label"><strong>our little moment &#9825;</strong><small>{new Date(entry.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</small></div>
      <div className="album-card-actions"><button onClick={() => downloadBlob(entry.image, `lovebug-${entry.id.slice(0, 8)}.png`)}>↓ download</button><button onClick={() => void remove({ entry, url })}>remove</button></div>
    </article>)}</div> : <div className="empty-album paper-card"><img src="/stickers/envelope.svg" alt=""/><h2>Our album is waiting for us.</h2><p>No saved photos here just yet. That means it's time to make some!</p><button className="pink-button" onClick={onNew}>take our first strip <span className="button-icon">&#9829;</span></button></div>}
  </main>;
}
