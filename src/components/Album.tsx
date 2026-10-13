import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import CloudPhotoTile from './CloudPhotoTile';
import MemoryPhotoViewer from './MemoryPhotoViewer';
import { deleteOwnCloudPhoto, downloadCloudPhoto, listAllCloudPhotos, uploadLocalPhoto, type CloudPhoto } from '../lib/cloudAlbumV6';
import { supabaseClient } from '../lib/supabaseClient';
import CloudAlbumV64 from './CloudAlbumV64';
import './AlbumV64.css';
import { makeLocalBackup } from '../lib/localBackup';
import { clearLocalMemories, deleteStrip, downloadBlob, listCustomStickers, listStrips, saveStrip } from '../lib/storage';
import type { AlbumEntry } from '../types';

type Props = { onHome: () => void; onNew: () => void };
type Card = { entry: AlbumEntry; url: string };
const CLOUD_ENABLED = import.meta.env.VITE_LOVEBUG_CLOUD_ENABLED === 'true';
type Destination = 'device' | 'shared';

export default function Album({ onHome, onNew }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [destination, setDestination] = useState<Destination>(() => {
    const selected = new URLSearchParams(window.location.search).get('album');
    return CLOUD_ENABLED && selected === 'shared' ? 'shared' : 'device';
  });
  const switchAlbum = (next: Destination) => {
    setDestination(next);
    const location = new URL(window.location.href);
    if (next !== 'device') location.searchParams.set('album', next);
    else location.searchParams.delete('album');
    window.history.replaceState(null, '', location.pathname + location.search + location.hash);
  };
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(CLOUD_ENABLED);
  const [cloudBackups, setCloudBackups] = useState<CloudPhoto[]>([]);
  const [cloudRevision, setCloudRevision] = useState(0);
  const [cloudBusy, setCloudBusy] = useState('');
  const [cloudMessage, setCloudMessage] = useState('');
  const [cloudError, setCloudError] = useState('');
  const [openLocal, setOpenLocal] = useState<Card | null>(null);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const restoredUrls = useRef(new Set<string>());
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

  useEffect(() => {
    if (!CLOUD_ENABLED || !supabaseClient) { setAuthLoading(false); return; }
    const client = supabaseClient;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) { setCloudUser(session?.user ?? null); setAuthLoading(false); }
    });
    void client.auth.getSession().then(({ data }) => {
      if (active) { setCloudUser(data.session?.user ?? null); setAuthLoading(false); }
    }).catch(() => { if (active) setAuthLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!CLOUD_ENABLED || !cloudUser || cloudUser.is_anonymous) { setCloudBackups([]); return; }
    let active = true;
    void listAllCloudPhotos('personal', null).then(photos => { if (active) setCloudBackups(photos); })
      .catch(() => { if (active) setCloudError('Could not load your own cloud backups.'); });
    return () => { active = false; };
  }, [cloudUser?.id, cloudUser?.is_anonymous, cloudRevision]);
  useEffect(() => () => { restoredUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  const signIn = (returnView: Destination) => {
    if (!supabaseClient) { setCloudError('Supabase is not configured.'); return; }
    const url = new URL(window.location.href);
    if (returnView === 'shared') url.searchParams.set('album', 'shared');
    else url.searchParams.set('album', 'device');
    void supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: url.toString() } })
      .then(({error}) => { if (error) setCloudError(error.message); });
  };
  const signOut = () => {
    if (!supabaseClient) return;
    void supabaseClient.auth.signOut().then(({error}) => {
      if (error) setCloudError(error.message);
      else { setCloudUser(null); setCloudBackups([]); setCloudMessage('Signed out. Your device photos are unchanged.'); }
    });
  };
  async function cloudAction(label: string, action: () => Promise<void>, success: string) {
    if (cloudBusy) return;
    setCloudBusy(label); setCloudError(''); setCloudMessage('');
    try { await action(); setCloudMessage(success); setCloudRevision(v => v + 1); }
    catch (reason) { setCloudError(reason instanceof Error ? reason.message : 'Cloud request failed.'); }
    finally { setCloudBusy(''); }
  }
  const backUpOne = (entry: AlbumEntry) => {
    if (!cloudUser || cloudUser.is_anonymous) { signIn('device'); return; }
    void cloudAction(entry.id, () => uploadLocalPhoto(entry, cloudUser, 'personal', null), 'Saved privately to your Google account. Your device photo remains here.');
  };
  const restoreOne = (photo: CloudPhoto) => void cloudAction('restore', async () => {
    const data = await downloadCloudPhoto(photo);
    const entry: AlbumEntry = { id: crypto.randomUUID(), createdAt: Date.now(), theme: photo.theme, note: photo.note, image: data };
    await saveStrip(entry);
    const url = URL.createObjectURL(data);
    restoredUrls.current.add(url);
    setCards(old => [{ entry, url }, ...old]);
  }, 'Restored to this device. Your cloud backup is still there.');
  const deleteCloud = (photo: CloudPhoto) => {
    if (!cloudUser || !window.confirm('Delete this private cloud backup? Your device copies will not be changed.')) return;
    void cloudAction('delete', () => deleteOwnCloudPhoto(photo, cloudUser.id), 'Cloud backup deleted.');
  };

  const remove = async (card: Card) => {
    if (!window.confirm('Remove this strip from this browser? This cannot be undone.')) return;
    setError(null); setMessage('');
    try {
      await deleteStrip(card.entry.id);
      setCards(list => list.filter(item => item.entry.id !== card.entry.id));
      if (openLocal?.entry.id === card.entry.id) setOpenLocal(null);
      URL.revokeObjectURL(card.url);
      restoredUrls.current.delete(card.url);
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
      restoredUrls.current.clear();
      setCards([]);
      setOpenLocal(null);
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

    <p className="lovebug-v64-private-note">Your device photos stay yours, unless you choose to share them. &#9825;</p>

    {CLOUD_ENABLED && <div className="album-destination-switch album-destination-simple" role="group" aria-label="Choose your memories">
      <button type="button" aria-pressed={destination === 'device'} className={destination === 'device' ? 'selected' : ''} onClick={() => switchAlbum('device')}>♡ on this device</button>
      <button type="button" aria-pressed={destination === 'shared'} className={destination === 'shared' ? 'selected' : ''} onClick={() => switchAlbum('shared')}>♡ our shared album</button>
    </div>}

    {destination === 'shared' ? <CloudAlbumV64 localCards={cards} user={cloudUser} authLoading={authLoading} onLogin={() => signIn('shared')} onSignOut={signOut} /> : <>
    <div className="lovebug-v64-device-bar">
      <h2>On this device &#9825;</h2>
      <div className="lovebug-v64-iconbar">
        {CLOUD_ENABLED && <button type="button" aria-label="My private cloud backups" aria-expanded={cloudOpen}
          onClick={() => {setCloudOpen(v=>!v);setDeviceMenuOpen(false);}}>&#9729;</button>}
        <button type="button" aria-label="Device memory options" aria-expanded={deviceMenuOpen}
          onClick={() => {setDeviceMenuOpen(v=>!v);setCloudOpen(false);}}>&#8943;</button>
      </div>
    </div>
    {deviceMenuOpen && <div className="lovebug-v64-popover lovebug-v64-menu" role="group" aria-label="Device memory options">
      <button type="button" onClick={() => {setDeviceMenuOpen(false);void backup();}} disabled={loading || busy !== null || empty}>Download all memories</button>
      <button type="button" onClick={() => {setDeviceMenuOpen(false);setConfirmClear(true);setMessage('');setError(null);}} disabled={loading || busy !== null || empty}>Clear saved memories</button>
    </div>}
    {confirmClear && <div className="album-clear-confirm" role="group" aria-label="Confirm permanent deletion">
      <strong>Clear memories saved on this device?</strong>
      <p>This removes {cards.length} photo strips and {stickerCount} handmade stickers, only from this browser. Download a ZIP first if you want to keep them.</p>
      <div className="album-confirm-buttons"><button className="soft-button" onClick={() => setConfirmClear(false)} disabled={busy !== null}>keep my memories</button><button className="album-confirm-delete" onClick={() => void clear()} disabled={busy !== null}>{busy === 'clear' ? 'clearing...' : 'yes, clear device memories'}</button></div>
    </div>}
    {message && <p className="album-success" role="status">{message}</p>}
    {error && <p className="error-note" role="alert">{error}</p>}

    {loading ? <p className="empty-album">Opening our scrapbook...</p> : cards.length ? <div className="album-grid">{cards.map(({ entry, url }) => <article className="album-card paper-card" key={entry.id}>
      <button type="button" className="album-photo album-photo-open" onClick={() => setOpenLocal({ entry, url })} aria-label="View photo full size"><img src={url} alt={`Photo strip saved on ${new Date(entry.createdAt).toLocaleDateString()}`} /></button>
      <div className="album-card-label lovebug-v64-date"><small>{new Date(entry.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small></div>
    </article>)}</div> : <div className="empty-album paper-card"><img src="/stickers/envelope.svg" alt=""/><h2>Our album is waiting for us.</h2><p>No saved photos here just yet. That means it's time to make some!</p><button className="pink-button" onClick={onNew}>take our first strip <span className="button-icon">&#9829;</span></button></div>}
    {cloudMessage && <p className="cloud-good-news" role="status">{cloudMessage}</p>}
    {cloudError && <p className="error-note" role="alert">{cloudError}</p>}
    {CLOUD_ENABLED && cloudOpen && <section className="cloud-v63-device-backups paper-card lovebug-v64-backups" aria-label="Optional cloud backups">
      <h3>My cloud backups &#9825;</h3>
      {authLoading ? <p role="status">Checking Google sign-in...</p>
        : !cloudUser || cloudUser.is_anonymous ? <button className="soft-button" type="button" onClick={() => signIn('device')}>Continue with Google</button>
        : <>
          <p className="lovebug-v64-account">{cloudUser.email} <button type="button" className="plain-button" onClick={signOut}>Sign out</button></p>
          {cloudBackups.length ? <div className="cloud-album-grid">{cloudBackups.map(photo => <CloudPhotoTile key={photo.id} photo={photo}
            onDelete={deleteCloud} onRestore={restoreOne} busy={!!cloudBusy} deleteLabel="Delete backup" />)}</div>
            : <p className="cloud-v6-empty">No cloud backups yet. You can save any photo from its viewer.</p>}
        </>}
    </section>}
    {openLocal && <MemoryPhotoViewer src={openLocal.url} description="Full-size photo saved on this device"
      onClose={() => setOpenLocal(null)}
      onDownload={() => downloadBlob(openLocal.entry.image, `lovebug-${openLocal.entry.id.slice(0, 8)}.png`)}
      onDelete={() => void remove(openLocal!)}
      busy={!!cloudBusy}
      extraActions={CLOUD_ENABLED ? [{ label: cloudBackups.some(b=>b.source_local_id===openLocal.entry.id)?'Backed up':'Save to cloud',
        onClick:()=>backUpOne(openLocal!.entry), disabled: cloudBackups.some(b=>b.source_local_id===openLocal.entry.id) }] : []} />}
    </>}
  </main>;
}
