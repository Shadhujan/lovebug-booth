import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AlbumEntry } from '../types';
import {
  createCouple, deleteOwnCloudPhoto, deleteSharedCloudAlbum, downloadCloudPhoto,
  joinCouple, listAlbumMembers, listCloudPhotos, listCouples,
  makeCoupleInvitation, renameCouple, rotateCoupleInvite,
  sharePrivateCloudPhoto, uploadLocalPhoto,
  type CloudAlbumMember, type CloudCouple, type CloudPhoto,
} from '../lib/cloudAlbumV6';
import { downloadBlob } from '../lib/storage';
import { supabaseClient } from '../lib/supabaseClient';

type Props = { localCards: { entry: AlbumEntry; url: string }[]; view: 'personal' | 'shared' };
const date = (stamp: string) => new Date(stamp).toLocaleDateString(undefined, { dateStyle: 'medium' });
const label = (album: CloudCouple) => `${album.title} · ${date(album.created_at)} · ${album.id.slice(0, 6)}`;

function PhotoCard({ photo, userId, partnerName, onShare, onDelete, busy }: {
  photo: CloudPhoto;
  userId: string;
  partnerName?: string;
  onShare?: (photo: CloudPhoto, blob: Blob) => void;
  onDelete: (photo: CloudPhoto) => void;
  busy: boolean;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [opened, setOpened] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);
  useEffect(() => {
    let active = true;
    let imageUrl = '';
    setBlob(null); setUrl(''); setError(false); setConfirmShare(false);
    void downloadCloudPhoto(photo).then(image => {
      if (!active) return;
      imageUrl = URL.createObjectURL(image);
      setBlob(image); setUrl(imageUrl);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [photo.id, photo.object_path]);
  useEffect(() => {
    if (!opened) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpened(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [opened]);

  const download = () => { if (blob) downloadBlob(blob, `lovebug-${photo.id.slice(0, 8)}.png`); };
  return <article className="cloud-photo">
    <button className="cloud-photo-open" type="button" onClick={() => setOpened(true)} disabled={!url} aria-label="View photo full size">
      <div className="cloud-photo-preview">{url
        ? <img src={url} alt="Saved Lovebug Booth photo strip" loading="lazy" />
        : <span className="cloud-hint">{error ? 'Photo unavailable' : 'Opening photo…'}</span>}</div>
      <span className="cloud-v6-open-hint">tap to view ♡</span>
    </button>
    <small>{date(photo.created_at)}</small>
    <div className="cloud-photo-actions">
      <button type="button" disabled={!blob} onClick={download}>↓ download</button>
      {onShare && <button type="button" disabled={!blob || busy} onClick={() => setConfirmShare(v => !v)}>♡ share</button>}
      {photo.owner_id === userId && <button type="button" disabled={busy} onClick={() => onDelete(photo)}>delete</button>}
    </div>
    {confirmShare && onShare && partnerName && <div className="cloud-v6-confirm-share" role="group" aria-label="Confirm photo sharing">
      <p>Share this photo with <strong>{partnerName}</strong>? They'll be able to see and download it. Your private copy stays yours.</p>
      <div className="cloud-v6-confirm-actions"><button type="button" onClick={() => setConfirmShare(false)} disabled={busy}>cancel</button>
        <button type="button" disabled={busy || !blob} onClick={() => { if (blob) { setConfirmShare(false); onShare(photo, blob); } }}>yes, share ♡</button></div>
    </div>}
    {opened && url && <div className="cloud-v6-lightbox" role="presentation" onClick={() => setOpened(false)}>
      <div className="cloud-v6-lightbox-content" role="dialog" aria-modal="true" aria-label="Photo preview" onClick={event => event.stopPropagation()}>
        <div className="cloud-v6-lightbox-actions"><span>Our little moment ♡</span><button type="button" onClick={() => setOpened(false)} autoFocus aria-label="Close photo preview">✕ close</button></div>
        <img src={url} alt="Full-size Lovebug Booth photo strip" />
        <button type="button" className="soft-button" onClick={download}>↓ download this photo</button>
      </div>
    </div>}
  </article>;
}

export default function CloudAlbumV6({ localCards, view }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [couples, setCouples] = useState<CloudCouple[]>([]);
  const [selectedCouple, setSelectedCouple] = useState('');
  const [members, setMembers] = useState<CloudAlbumMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [photos, setPhotos] = useState<CloudPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [connectMode, setConnectMode] = useState<'invite' | 'join'>('invite');
  const [inviteToJoin, setInviteToJoin] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');

  useEffect(() => {
    const client = supabaseClient;
    if (!client) { setAuthLoading(false); return; }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setAuthLoading(false); }
    });
    void client.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user ?? null); setAuthLoading(false); }
    }).catch(() => { if (active) setAuthLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const permanent = Boolean(user && !user.is_anonymous);
  useEffect(() => {
    if (!permanent) { setCouples([]); setSelectedCouple(''); setMembers([]); setPhotos([]); return; }
    let active = true;
    // Pick an already-connected pair if there are old test albums with duplicate
    // names. Keep the other albums accessible under a collapsed recovery menu.
    void listCouples().then(async result => {
      const complete = await Promise.all(result.map(album =>
        listAlbumMembers(album.id).then(people => ({ id: album.id, count: people.length })).catch(() => ({ id: album.id, count: 0 })),
      ));
      if (!active) return;
      setCouples(result);
      setSelectedCouple(old => result.some(c => c.id === old) ? old
        : (complete.find(pair => pair.count === 2)?.id ?? result[0]?.id ?? ''));
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load your shared album.'); });
    return () => { active = false; };
  }, [permanent, user?.id, revision]);

  useEffect(() => {
    if (!permanent || !selectedCouple) { setMembers([]); return; }
    let active = true;
    setLoadingMembers(true);
    const load = () => {
      void listAlbumMembers(selectedCouple).then(result => { if (active) setMembers(result); })
        .catch(() => { if (active) setError('Could not check who belongs to this album.'); })
        .finally(() => { if (active) setLoadingMembers(false); });
    };
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 12000);
    return () => { active = false; window.clearInterval(timer); };
  }, [permanent, user?.id, selectedCouple, revision]);

  useEffect(() => {
    if (!permanent || (view === 'shared' && !selectedCouple)) { setPhotos([]); return; }
    let active = true;
    setPhotos([]); setLoadingPhotos(true);
    void listCloudPhotos(view, view === 'shared' ? selectedCouple : null).then(result => {
      if (active) setPhotos(result);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load photos.'); })
      .finally(() => { if (active) setLoadingPhotos(false); });
    return () => { active = false; };
  }, [permanent, user?.id, view, selectedCouple, revision]);

  const selected = couples.find(item => item.id === selectedCouple);
  const partner = members.find(item => item.user_id !== user?.id);
  const isOwner = Boolean(selected && selected.owner_id === user?.id);
  const connected = Boolean(selected && members.length === 2 && !selected.deleting_at);
  const partnerName = partner?.display_name || 'your lovebug';
  useEffect(() => { setRenameTitle(selected?.title ?? ''); setRenameOpen(false); setDeleteOpen(false); setDeleteTyped(''); }, [selected?.id, selected?.title]);

  async function run(label: string, action: () => Promise<void>, success?: string) {
    if (busy) return;
    setBusy(label); setError(''); setMessage('');
    try { await action(); if (success) setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(''); }
  }
  const refresh = () => setRevision(n => n + 1);
  const login = () => void run('login', async () => {
    const { error: authError } = await supabaseClient!.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${window.location.origin}/?album=${view}` },
    });
    if (authError) throw authError;
  });
  const logout = () => void run('logout', async () => {
    const { error: authError } = await supabaseClient!.auth.signOut();
    if (authError) throw authError;
    setCouples([]); setSelectedCouple(''); setPhotos([]);
  });
  const createInvite = () => void run('invite', async () => {
    const code = makeCoupleInvitation();
    const id = await createCouple('our little album', code);
    setSelectedCouple(id); setInviteCode(code); refresh();
  }, 'Copy the invitation code and send it privately. When your person joins, your shared album is ready.');
  const join = (event: FormEvent) => {
    event.preventDefault();
    void run('join', async () => {
      const id = await joinCouple(inviteToJoin);
      setSelectedCouple(id); setInviteToJoin(''); setInviteCode(''); refresh();
    }, 'Connected! Your photos can now be shared when you choose. ♡');
  };
  const renew = () => void run('renew', async () => {
    if (!selected) return;
    const code = makeCoupleInvitation();
    await rotateCoupleInvite(selected.id, code); setInviteCode(code);
  }, 'New invitation ready. The previous code has expired.');
  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void run('rename', async () => {
      await renameCouple(selected.id, renameTitle);
      setCouples(items => items.map(c => c.id === selected.id ? { ...c, title: renameTitle.trim() } : c));
      setRenameOpen(false); refresh();
    }, 'Your shared album has a new name for both of you. ♡');
  };
  const deleteAlbum = () => {
    if (!selected || !isOwner || deleteTyped !== selected.title) return;
    void run('delete', async () => {
      await deleteSharedCloudAlbum(selected.id);
      setCouples(items => items.filter(c => c.id !== selected.id));
      setSelectedCouple(''); setMembers([]); setPhotos([]); setInviteCode('');
      setDeleteOpen(false); setDeleteTyped(''); refresh();
    }, 'Shared album and its shared photos were deleted. Your private and device photos are untouched.');
  };
  const upload = (entry: AlbumEntry) => {
    if (!user || (view === 'shared' && !connected)) return;
    void run(`upload-${entry.id}`, async () => {
      await uploadLocalPhoto(entry, user, view, view === 'shared' ? selectedCouple : null);
      refresh();
    }, view === 'shared' ? `Shared with ${partnerName}. ♡` : 'Saved privately to your Google account. ♡');
  };
  const sharePrivate = (photo: CloudPhoto, image: Blob) => {
    if (!user || !selected || !connected) return;
    void run(`share-${photo.id}`, async () => {
      await sharePrivateCloudPhoto(photo, image, user, selected.id); refresh();
    }, `Shared with ${partnerName}. Your personal photo stays private. ♡`);
  };
  const removePhoto = (photo: CloudPhoto) => {
    if (!user || !window.confirm('Delete this photo from the cloud? This cannot be undone.')) return;
    void run(`photo-${photo.id}`, async () => {
      await deleteOwnCloudPhoto(photo, user.id); refresh();
    }, 'Photo deleted from the cloud. Local copies were not changed.');
  };
  const copyInvite = () => void run('copy', async () => {
    await navigator.clipboard.writeText(inviteCode);
  }, 'Code copied. Send it to the person you want to connect with. ♡');

  return <section className="cloud-album paper-card" aria-label="Optional online memories">
    <div className="cloud-album-header"><div>
      <div className="eyebrow">ONLY WHEN YOU CHOOSE</div>
      <h2>Our little <em>memory box.</em> ♡</h2>
      <p>Keep photos private or share them with one person. Nothing uploads unless you choose it.</p>
    </div><span className="cloud-album-symbol" aria-hidden="true">💌</span></div>
    {!supabaseClient ? <p className="error-note" role="alert">Supabase is not configured. Your photos on this device still work.</p>
      : authLoading ? <p className="cloud-hint" role="status">Checking your account…</p>
      : !permanent ? <div className="cloud-login">
        <p>Sign in only if you want an online photo album. Quick Rooms and local photos never require an account.</p>
        <button type="button" className="pink-button" disabled={!!busy} onClick={login}>continue with Google ♡</button>
      </div> : <>
        <div className="cloud-album-session"><span>♡ {user?.email} · optional cloud memories</span><div>
          <button type="button" className="plain-button" disabled={!!busy} onClick={refresh}>refresh</button>
          <button type="button" className="plain-button" disabled={!!busy} onClick={logout}>sign out</button>
        </div></div>
        {view === 'shared' && <div className="cloud-v6-pairing">
          {!selected ? <div className="cloud-v6-connect">
            <h3>Connect with your favorite person ♡</h3>
            <p>Once you're connected, you'll both see the same shared album. Photos remain private until you share them.</p>
            <div className="cloud-v6-connect-options" role="group" aria-label="How to connect">
              <button type="button" aria-pressed={connectMode === 'invite'} className={connectMode === 'invite' ? 'active' : ''} onClick={() => setConnectMode('invite')}>Send an invitation</button>
              <button type="button" aria-pressed={connectMode === 'join'} className={connectMode === 'join' ? 'active' : ''} onClick={() => setConnectMode('join')}>I have a code</button>
            </div>
            {connectMode === 'invite' ? <button type="button" className="pink-button" onClick={createInvite} disabled={!!busy}>create our invitation ♡</button>
              : <form className="cloud-form" onSubmit={join}>
                <label htmlFor="cloud-v6-connect-code">The code they sent you</label>
                <input id="cloud-v6-connect-code" required minLength={64} maxLength={64} spellCheck={false} autoComplete="off" value={inviteToJoin} onChange={e => setInviteToJoin(e.target.value.trim().toLowerCase())} placeholder="Paste your private invitation" />
                <button type="submit" className="pink-button" disabled={!!busy}>join our album ♡</button>
              </form>}
          </div> : <>
            <div className="cloud-v6-current">
              <div className="cloud-v6-current-head"><div>
                <span className="eyebrow">{connected ? 'YOU + YOUR LOVEBUG' : 'WAITING FOR YOUR LOVEBUG'}</span>
                <h3>{selected.title} ♡</h3>
                <p>{connected ? `Your private shared space with ${partnerName}.` : 'Only someone you invite can join this album.'}</p>
              </div><button type="button" className="plain-button" onClick={() => setRenameOpen(x => !x)} disabled={!!busy || Boolean(selected.deleting_at)}>rename</button></div>
              {renameOpen && <form className="cloud-v6-rename" onSubmit={rename}>
                <label htmlFor="cloud-v6-rename-title">New album name (changes for both people)</label>
                <div><input id="cloud-v6-rename-title" value={renameTitle} maxLength={60} required onChange={e => setRenameTitle(e.target.value)} />
                  <button className="soft-button" type="submit" disabled={!!busy || !renameTitle.trim()}>save name</button></div>
              </form>}
              <div className="cloud-v6-people-head"><strong>Only you two can see this album</strong><span>{loadingMembers ? 'checking…' : `${members.length} of 2 joined`}</span></div>
              <div className="cloud-v6-people">{members.map(person => <div className="cloud-v6-person" key={person.user_id}>
                <span aria-hidden="true">♡</span><div><strong>{person.display_name}{person.user_id === user?.id ? ' (you)' : ''}</strong><small>{person.email}</small></div>
              </div>)}</div>
              {!connected && !selected.deleting_at && <p className="cloud-v6-waiting">♡ Your album is waiting for the second person.</p>}
              {selected.deleting_at && <p className="error-note" role="status">Album deletion was interrupted. The creator can retry deleting it below. No new uploads are allowed.</p>}
              {!connected && isOwner && !selected.deleting_at && <button type="button" className="plain-button" disabled={!!busy} onClick={renew}>create a fresh invitation</button>}
              {isOwner && <div className="cloud-v6-delete-row">
                <button type="button" className="plain-button cloud-v6-delete-trigger" disabled={!!busy} onClick={() => setDeleteOpen(v => !v)}>delete this shared album</button>
                {deleteOpen && <div className="cloud-v6-delete-confirm" role="group" aria-label="Confirm permanent shared album deletion">
                  <strong>Delete this album for both of you?</strong>
                  <p>Every shared photo in this album will be permanently deleted for both people. Your private and local photos stay untouched. Type the album name to confirm.</p>
                  <label htmlFor="cloud-v6-delete-name">Type: {selected.title}</label>
                  <input id="cloud-v6-delete-name" value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} autoComplete="off" />
                  <div><button type="button" className="soft-button" disabled={!!busy} onClick={() => { setDeleteOpen(false); setDeleteTyped(''); }}>cancel</button>
                    <button type="button" className="cloud-v6-delete-danger" disabled={!!busy || deleteTyped !== selected.title} onClick={deleteAlbum}>delete for both</button></div>
                </div>}
              </div>}
            </div>
            {inviteCode && !connected && <div className="cloud-v6-invite" role="status">
              <strong>Send this private code to your lovebug ♡</strong>
              <p>One-time code, valid for seven days. Don't post it publicly.</p>
              <code>{inviteCode}</code><button type="button" className="soft-button" disabled={!!busy} onClick={copyInvite}>copy invitation code</button>
            </div>}
            {couples.length > 1 && <details className="cloud-v6-older">
              <summary>Other albums from earlier versions ({couples.length - 1})</summary>
              <label htmlFor="cloud-v6-older-picker">Switch albums</label>
              <select id="cloud-v6-older-picker" value={selectedCouple} onChange={e => { setSelectedCouple(e.target.value); setInviteCode(''); setError(''); setMessage(''); }}>
                {couples.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}
              </select>
            </details>}
          </>}
        </div>}
        {view === 'personal' || (view === 'shared' && connected) ? <>
          <h3 className="cloud-v6-heading">{view === 'personal' ? 'Only you can see these photos ♡' : `Pictures shared with ${partnerName} ♡`}</h3>
          {loadingPhotos ? <p className="cloud-hint" role="status">Opening your photos…</p>
            : photos.length ? <div className="cloud-album-grid">{photos.map(photo => <PhotoCard key={photo.id} photo={photo} userId={user!.id}
                partnerName={partnerName} onShare={view === 'personal' && connected ? sharePrivate : undefined}
                onDelete={removePhoto} busy={!!busy} />)}</div>
              : <p className="cloud-v6-empty">{view === 'personal' ? 'No private cloud photos yet. Save one below if you want to see it on your other devices.' : 'Nothing shared yet. Choose a photo below to send to your lovebug.'}</p>}
          <div className="cloud-upload-section"><h3>{view === 'personal' ? 'Save privately ♡' : `Share a photo with ${partnerName} ♡`}</h3>
            <p>Pick a photo already saved on this device. It won't be uploaded until you tap the button.</p>
            {localCards.length ? <div className="cloud-local-grid">{localCards.map(({entry,url}) => <div className="cloud-local-choice" key={entry.id}>
              <img src={url} alt="Photo saved on this device" />
              <button type="button" disabled={!!busy} onClick={() => upload(entry)}>{busy === `upload-${entry.id}` ? 'saving…' : view === 'personal' ? 'save privately' : 'share this photo ♡'}</button>
            </div>)}</div> : <p className="cloud-hint">Take and save a photo strip on this device first.</p>}
          </div>
        </> : view === 'shared' && selected && !connected ? <p className="cloud-hint">Once your partner joins, you can start sharing photos here. Your private photos are available in the Private album tab.</p> : null}
      </>}
    {message && <p className="cloud-good-news" role="status">{message}</p>}
    {error && <p className="error-note" role="alert">{error}</p>}
  </section>;
}
