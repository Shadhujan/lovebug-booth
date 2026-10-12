import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AlbumEntry } from '../types';
import {
  createCouple, deleteOwnCloudPhoto, downloadCloudPhoto, joinCouple,
  listCloudPhotos, listCouples, makeCoupleInvitation, rotateCoupleInvite,
  uploadLocalPhoto, type CloudCouple, type CloudPhoto,
} from '../lib/cloudAlbumV6';
import { downloadBlob } from '../lib/storage';
import { supabaseClient } from '../lib/supabaseClient';

type Props = { localCards: { entry: AlbumEntry; url: string }[] };
type View = 'personal' | 'shared';

function PrivatePhotoCard({ photo, userId, onDelete }: {
  photo: CloudPhoto;
  userId: string;
  onDelete: (photo: CloudPhoto) => void;
}) {
  const [photoUrl, setPhotoUrl] = useState('');
  const [image, setImage] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    let url = '';
    void downloadCloudPhoto(photo).then(blob => {
      if (!live) return;
      url = URL.createObjectURL(blob);
      setPhotoUrl(url);
      setImage(blob);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [photo.id, photo.object_path]);
  return <article className="cloud-photo">
    <div className="cloud-photo-preview">
      {photoUrl ? <img src={photoUrl} alt="Your privately saved Lovebug Booth strip" loading="lazy" /> :
        <span className="cloud-hint">{error ? 'Photo unavailable' : 'Opening photo…'}</span>}
    </div>
    <small>{new Date(photo.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small>
    <div className="cloud-photo-actions">
      <button disabled={!image} onClick={() => { if (image) downloadBlob(image, `lovebug-cloud-${photo.id.slice(0, 8)}.png`); }}>↓ download</button>
      {photo.owner_id === userId && <button onClick={() => onDelete(photo)}>remove</button>}
    </div>
  </article>;
}

export default function CloudAlbumV6({ localCards }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>('personal');
  const [couples, setCouples] = useState<CloudCouple[]>([]);
  const [selectedCouple, setSelectedCouple] = useState('');
  const [photos, setPhotos] = useState<CloudPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState('our little album');
  const [inviteToJoin, setInviteToJoin] = useState('');
  const [newInvite, setNewInvite] = useState('');

  useEffect(() => {
    if (!supabaseClient) { setAuthLoading(false); return; }
    let active = true;
    const api = supabaseClient;
    const { data: { subscription } } = api.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    void api.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user ?? null); setAuthLoading(false); }
    }).catch(() => { if (active) setAuthLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const isPermanent = Boolean(user && !user.is_anonymous);
  useEffect(() => {
    if (!isPermanent) {
      setCouples([]); setSelectedCouple(''); setPhotos([]); setNewInvite('');
      return;
    }
    let live = true;
    void listCouples().then(result => {
      if (!live) return;
      setCouples(result);
      setSelectedCouple(old => result.some(c => c.id === old) ? old : (result[0]?.id ?? ''));
    }).catch(reason => { if (live) setError(String(reason instanceof Error ? reason.message : reason)); });
    return () => { live = false; };
  }, [isPermanent, user?.id, revision]);

  useEffect(() => {
    if (!isPermanent || (view === 'shared' && !selectedCouple)) { setPhotos([]); return; }
    let live = true;
    setPhotos([]);
    setLoadingPhotos(true);
    void listCloudPhotos(view, view === 'shared' ? selectedCouple : null).then(result => {
      if (live) setPhotos(result);
    }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : 'Photos could not be loaded.'); })
      .finally(() => { if (live) setLoadingPhotos(false); });
    return () => { live = false; };
  }, [isPermanent, user?.id, view, selectedCouple, revision]);

  async function run(label: string, fn: () => Promise<void>, success?: string) {
    if (busy) return;
    setBusy(label); setError(''); setMessage('');
    try { await fn(); if (success) setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(''); }
  }

  const googleLogin = () => void run('login', async () => {
    if (!supabaseClient) return;
    const destination = `${window.location.origin}/?album=1`;
    const { error: authError } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: destination },
    });
    if (authError) throw authError;
  });

  const signOut = () => void run('logout', async () => {
    const { error: authError } = await supabaseClient!.auth.signOut();
    if (authError) throw authError;
    setNewInvite(''); setPhotos([]); setCouples([]); setSelectedCouple('');
    setView('personal');
  });

  const create = (event: FormEvent) => {
    event.preventDefault();
    void run('create', async () => {
      const code = makeCoupleInvitation();
      const id = await createCouple(name, code);
      setNewInvite(code); setSelectedCouple(id); setView('shared');
      setRevision(x => x + 1);
    }, 'Album created. Copy the code and send it privately. It expires in seven days.');
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    void run('join', async () => {
      const id = await joinCouple(inviteToJoin);
      setSelectedCouple(id); setInviteToJoin(''); setNewInvite(''); setView('shared');
      setRevision(x => x + 1);
    }, 'You joined their private shared album. ♡');
  };

  const selected = couples.find(c => c.id === selectedCouple);
  const renew = () => void run('renew', async () => {
    if (!selected) return;
    const code = makeCoupleInvitation();
    await rotateCoupleInvite(selected.id, code);
    setNewInvite(code);
  }, 'New invite ready. The previous code no longer works.');

  const save = (entry: AlbumEntry) => {
    if (!user) return;
    void run(`save-${entry.id}`, async () => {
      await uploadLocalPhoto(entry, user, view, view === 'shared' ? selectedCouple : null);
      setRevision(x => x + 1);
    }, 'Saved online by your choice. Your local copy stays on this device.');
  };

  const remove = (photo: CloudPhoto) => {
    if (!user || !window.confirm('Remove this cloud photo? Your local copy, if any, stays on your device.')) return;
    void run(`remove-${photo.id}`, async () => {
      await deleteOwnCloudPhoto(photo, user.id);
      setRevision(x => x + 1);
    }, 'This photo was removed from the cloud album.');
  };

  const copyCode = () => void run('copy', async () => {
    await navigator.clipboard.writeText(newInvite);
  }, 'Copied. Send this code privately to the person you want to invite.');

  return <section className="cloud-album paper-card" aria-label="Optional private cloud memories">
    <div className="cloud-album-header"><div>
      <div className="eyebrow">OPTIONAL / ONLY WHEN YOU CHOOSE</div>
      <h2>Memories across <em>our devices.</em> ♡</h2>
      <p>Your photo booth and device album stay free of sign-in. Sign in only for private online backups or to share photos with someone you invite.</p>
    </div><span className="cloud-album-symbol" aria-hidden="true">💌</span></div>

    {!supabaseClient ? <p className="cloud-hint" role="alert">Supabase isn't configured on this website. Your local album still works.</p> :
      authLoading ? <p className="cloud-hint" role="status">Checking your account…</p> :
      !isPermanent ? <div className="cloud-login">
        <p className="cloud-hint">{user?.is_anonymous ? 'You are using a temporary guest identity for photo rooms. ' : ''}Google sign-in is only needed if you want photos saved privately online. We never upload photos automatically.</p>
        <button className="pink-button" type="button" disabled={!!busy} onClick={googleLogin}>continue with Google <span className="button-icon">♡</span></button>
        <small>Sign-in is separate from Quick and Locked Rooms. Finish any live photo session before switching accounts.</small>
      </div> : <>
        <div className="cloud-album-session">
          <span>♡ {user?.email ?? 'Signed in'} · optional online memories</span>
          <div><button className="plain-button" onClick={() => setRevision(x => x + 1)} disabled={!!busy}>refresh</button><button className="plain-button" disabled={!!busy} onClick={signOut}>sign out</button></div>
        </div>
        <div className="cloud-v6-tabs" role="group" aria-label="Choose online photo album">
          <button type="button" aria-pressed={view === 'personal'} className={view === 'personal' ? 'selected' : ''} onClick={() => setView('personal')}>♡ my private photos</button>
          <button type="button" aria-pressed={view === 'shared'} className={view === 'shared' ? 'selected' : ''} onClick={() => setView('shared')}>✿ shared with someone</button>
        </div>

        {view === 'shared' && <div className="cloud-v6-pairing">
          {couples.length > 0 && <div className="cloud-v6-select"><label htmlFor="cloud-v6-couple">Our shared album</label><select id="cloud-v6-couple" value={selectedCouple} onChange={event => { setSelectedCouple(event.target.value); setNewInvite(''); }}>
            {couples.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></div>}
          {selected && selected.owner_id === user?.id && <button type="button" className="plain-button" onClick={renew} disabled={!!busy}>create a fresh invite code</button>}
          {newInvite && <div className="cloud-v6-invite" role="status">
            <strong>A private invitation, just for your person ♡</strong>
            <p>Copy this one-time code now. It is shown only on this device until you leave this page, and expires in seven days. No publicly searchable albums.</p>
            <code>{newInvite}</code>
            <button className="soft-button" type="button" disabled={!!busy} onClick={copyCode}>♡ copy invitation code</button>
          </div>}
          <div className="cloud-v6-pair-forms">
            <form className="cloud-form" onSubmit={create}>
              <h3>Create a shared album</h3>
              <label htmlFor="cloud-v6-title">A name for your album</label>
              <input id="cloud-v6-title" maxLength={60} value={name} onChange={event => setName(event.target.value)} />
              <button className="soft-button" disabled={!!busy} type="submit">create album &amp; invite ♡</button>
            </form>
            <form className="cloud-form" onSubmit={join}>
              <h3>Join someone's album</h3>
              <label htmlFor="cloud-v6-code">One-time invitation code</label>
              <input id="cloud-v6-code" minLength={64} maxLength={64} autoComplete="off" spellCheck={false} value={inviteToJoin} onChange={event => setInviteToJoin(event.target.value.trim().toLowerCase())} placeholder="Paste their private code" required />
              <button className="soft-button" disabled={!!busy} type="submit">join their album ♡</button>
            </form>
          </div>
        </div>}

        {(view === 'personal' || selectedCouple) ? <>
          <h3 className="cloud-v6-heading">{view === 'personal' ? 'Only you can see these photos.' : `Pictures in ${selected?.title ?? 'our shared album'}.`}</h3>
          {loadingPhotos ? <p role="status" className="cloud-hint">Opening private memories…</p> :
            photos.length ? <div className="cloud-album-grid">{photos.map(photo => <PrivatePhotoCard key={photo.id} photo={photo} userId={user!.id} onDelete={remove} />)}</div> :
            <p className="cloud-hint">Nothing here yet. Your saved photos aren't uploaded until you choose one below.</p>}
          <div className="cloud-upload-section"><h3>Choose a photo to save online ♡</h3>
            <p>{view === 'personal' ? 'Save a private backup in your own account.' : 'Share this copy only with members of the chosen album.'} Your local photos remain untouched.</p>
            {localCards.length ? <div className="cloud-local-grid">{localCards.map(({entry,url}) => <div className="cloud-local-choice" key={entry.id}>
              <img src={url} alt="Photo strip saved on this device" />
              <button disabled={!!busy} onClick={() => save(entry)}>{busy === `save-${entry.id}` ? 'saving…' : view === 'personal' ? '♡ save privately' : '♡ share this strip'}</button>
            </div>)}</div> : <p className="cloud-hint">Make a strip and save it on this device first. Then you can upload just the one you choose.</p>}
          </div>
        </> : <p className="cloud-hint">Create or join a shared album above to start exchanging photos.</p>}
      </>}
    {message && <p className="cloud-good-news" role="status">{message}</p>}
    {error && <p className="error-note" role="alert">{error}</p>}
  </section>;
}
