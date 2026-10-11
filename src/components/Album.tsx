import { useEffect, useState } from 'react';
import { deleteStrip, downloadBlob, listStrips } from '../lib/storage';
import type { AlbumEntry } from '../types';

type Props = { onHome: () => void; onNew: () => void };

type Card = { entry: AlbumEntry; url: string };
export default function Album({ onHome, onNew }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    const urls: string[] = [];
    void listStrips().then(entries => {
      if (disposed) return;
      const next = [...entries].sort((a,b) => b.createdAt - a.createdAt).map(entry => {
        const url = URL.createObjectURL(entry.image); urls.push(url); return { entry, url };
      });
      setCards(next);
    }).catch(() => setError('This browser could not open your saved album.')).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  const remove = async (card: Card) => {
    if (!window.confirm('Remove this strip from this browser? This cannot be undone.')) return;
    try { await deleteStrip(card.entry.id); setCards(list => list.filter(c => c.entry.id !== card.entry.id)); URL.revokeObjectURL(card.url); }
    catch { setError('Could not delete that strip.'); }
  };
  return <main className="inner-page page-width album-page"><button className="back-link" onClick={onHome}>← back to our little home</button><div className="album-intro"><div><div className="eyebrow">OUR LITTLE CORNER OF FOREVER</div><h1>Our <em>little album.</em></h1><p>Every cheesy smile, every silly face, all in one very cute place. ♡</p></div><button className="pink-button" onClick={onNew}>make new memories <span className="button-icon">↗</span></button></div>
    <div className="local-info"><span>♡</span> Saved privately in this browser on this device. Not synchronized with your girlfriend's phone yet.</div>
    {loading ? <p className="empty-album">Opening our scrapbook...</p> : cards.length ? <div className="album-grid">{cards.map(({entry, url}) => <article className="album-card paper-card" key={entry.id}><div className="album-photo"><img src={url} alt={`Photo strip saved on ${new Date(entry.createdAt).toLocaleDateString()}`} /></div><div className="album-card-label"><strong>our little moment ♡</strong><small>{new Date(entry.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</small></div><div className="album-card-actions"><button onClick={() => downloadBlob(entry.image, `lovebug-${entry.id.slice(0,8)}.png`)}>↓ download</button><button onClick={() => void remove({entry,url})}>remove</button></div></article>)}</div> : <div className="empty-album paper-card"><img src="/stickers/envelope.svg" alt="" /><h2>Our album is waiting for us.</h2><p>No pictures here just yet. That means it's time to make some!</p><button className="pink-button" onClick={onNew}>take our first strip <span className="button-icon">♥</span></button></div>}
    {error && <p className="error-note" role="alert">{error}</p>}
  </main>;
}
