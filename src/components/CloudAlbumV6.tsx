import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AlbumEntry } from '../types';
import {
  createCouple, deleteOwnCloudPhoto, downloadCloudPhoto, joinCouple,
  listAlbumMembers, listCloudPhotos, listCouples, makeCoupleInvitation, renameCouple,
  rotateCoupleInvite, sharePrivateCloudPhoto, uploadLocalPhoto,
  type CloudAlbumMember, type CloudCouple, type CloudPhoto,
} from '../lib/cloudAlbumV6';
import { downloadBlob } from '../lib/storage';
import { supabaseClient } from '../lib/supabaseClient';

type Props = { localCards: { entry: AlbumEntry; url: string }[] };
type View = 'personal' | 'shared';

function albumLabel(album: CloudCouple): string {
  const date = new Date(album.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  // Names can repeat (e.g. "test"). The short suffix makes the choice unambiguous.
  return `${album.title} · ${date} · ${album.id.slice(0, 6)}`;
}

function PrivatePhotoCard({ photo, userId, onDelete, onShare, targetName, busy }: {
  photo: CloudPhoto;
  userId: string;
  onDelete: (photo: CloudPhoto) => void;
  onShare?: (photo: CloudPhoto, image: Blob) => void;
  targetName?: string;
  busy: boolean;
}) {
  const [photoUrl, setPhotoUrl] = useState('');
  const [image, setImage] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);

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
      <button type="button" disabled={!image} onClick={() => { if (image) downloadBlob(image, `lovebug-cloud-${photo.id.slice(0, 8)}.png`); }}>↓ download</button>
      {onShare && <button type="button" disabled={!image || busy} onClick={() => setConfirmShare(value => !value)}>
        ♡ share a copy
      </button>}
      {photo.owner_id === userId && <button type="button" disabled={busy} onClick={() => onDelete(photo)}>remove</button>}
    </div>
    {confirmShare && onShare && targetName && <div className="cloud-v6-confirm-share" role="group" aria-label="Confirm sharing this private photo">
      <p>Share a copy with <strong>{targetName}</strong>? Members of that album will be able to view and download it. Your original stays private.</p>
      <div className="cloud-v6-confirm-actions">
        <button type="button" disabled={busy} onClick={() => setConfirmShare(false)}>keep it private</button>
        <button type="button" disabled={busy || !image} onClick={() => { if (image) onShare(photo, image); }}>yes, share ♡</button>
      </div>
    </div>}
  </article>;
}

export default function CloudAlbumV6({ localCards }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>('personal');
  const [couples, setCouples] = useState<CloudCouple[]>([]);
  const [selectedCouple, setSelectedCouple] = useState('');
  const [members, setMembers] = useState<CloudAlbumMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [photos, setPhotos] = useState<CloudPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState('our little album');
  const [renameName, setRenameName] = useState('');
  const [showRename, setShowRename] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
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
      setCouples([]); setSelectedCouple(''); setPhotos([]); setNewInvite(''); setMembers([]);
      return;
    }
    let live = true;
    void listCouples().then(result => {
      if (!live) return;
      setCouples(result);
      setSelectedCouple(old => result.some(c => c.id === old) ? old : (result[0]?.id ?? ''));
    }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load your shared albums.'); });
    return () => { live = false; };
  }, [isPermanent, user?.id, revision]);

  useEffect(() => {
    if (!isPermanent || !selectedCouple) {
      setMembers([]); setMembersLoading(false); setMemberError('');
      return;
    }
    let live = true;
    setMembers([]); setMembersLoading(true); setMemberError('');
    const load = () => {
      void listAlbumMembers(selectedCouple).then(result => {
        if (live) { setMembers(result); setMemberError(''); }
      }).catch(reason => {
        if (live) setMemberError(reason instanceof Error ? reason.message : 'Could not load the people in this album.');
      }).finally(() => { if (live) setMembersLoading(false); });
    };
    load();
    // A second member may join while the creator is watching. Refresh quietly,
    // without requiring Realtime replication or uploading anything.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30000);
    return () => { live = false; window.clearInterval(timer); };
  }, [isPermanent, user?.id, selectedCouple, revision]);

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

  const selected = couples.find(c => c.id === selectedCouple);
  useEffect(() => { setRenameName(selected?.title ?? ''); }, [selected?.id, selected?.title]);

  async function run(label: string, fn: () => Promise<void>, success?: string) {
    if (busy) return;
    setBusy(label); setError(''); setMessage('');
    try { await fn(); if (success) setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(''); }
  }

  const chooseCouple = (id: string) => {
    setSelectedCouple(id); setMembers([]); setNewInvite(''); setShowRename(false); setError(''); setMessage('');
  };

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
    setNewInvite(''); setPhotos([]); setCouples([]); setSelectedCouple(''); setMembers([]);
    setView('personal');
  });

  const create = (event: FormEvent) => {
    event.preventDefault();
    void run('create', async () => {
      const code = makeCoupleInvitation();
      const id = await createCouple(name, code);
      setNewInvite(code); setSelectedCouple(id); setView('shared');
      setName('our little album'); setShowCreate(false); setShowJoin(false);
      setRevision(x => x + 1);
    }, 'Album created. Copy its invitation code and send it privately. It expires in seven days.');
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    void run('join', async () => {
      const id = await joinCouple(inviteToJoin);
      setSelectedCouple(id); setInviteToJoin(''); setNewInvite(''); setView('shared');
      setShowCreate(false); setShowJoin(false);
      setRevision(x => x + 1);
    }, 'You joined this private album. See the people in it above. ♡');
  };

  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void run('rename', async () => {
      await renameCouple(selected.id, renameName);
      setCouples(old => old.map(c => c.id === selected.id ? { ...c, title: renameName.trim() } : c));
      setShowRename(false); setRevision(x => x + 1);
    }, 'Album renamed for both members. ♡');
  };

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

  const shareExisting = (photo: CloudPhoto, image: Blob) => {
    if (!user || !selected) return;
    const albumId = selected.id;
    const albumName = selected.title;
    void run(`share-${photo.id}`, async () => {
      await sharePrivateCloudPhoto(photo, image, user, albumId);
      setRevision(x => x + 1);
    }, `Shared a copy with “${albumName}”. Open Shared with someone to see it; your original remains private. Your partner can refresh their album.`);
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

  const albumPeople = members.map(person => ({ ...person, isYou: person.user_id === user?.id }));
  const isOwner = Boolean(selected && selected.owner_id === user?.id);
  const canShareToSelected = Boolean(selected && !membersLoading && !memberError && members.some(person => person.user_id === user?.id));

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
          <div><button type="button" className="plain-button" onClick={() => setRevision(x => x + 1)} disabled={!!busy}>refresh</button><button type="button" className="plain-button" disabled={!!busy} onClick={signOut}>sign out</button></div>
        </div>
        <div className="cloud-v6-tabs" role="group" aria-label="Choose online photo album">
          <button type="button" aria-pressed={view === 'personal'} className={view === 'personal' ? 'selected' : ''} onClick={() => setView('personal')}>♡ my private photos</button>
          <button type="button" aria-pressed={view === 'shared'} className={view === 'shared' ? 'selected' : ''} onClick={() => setView('shared')}>✿ shared with someone</button>
        </div>

        {view === 'shared' && <div className="cloud-v6-pairing">
          {couples.length > 0 ? <>
            <div className="cloud-v6-select"><label htmlFor="cloud-v6-couple">Currently viewing</label>
              <select id="cloud-v6-couple" value={selectedCouple} onChange={event => chooseCouple(event.target.value)}>
                {couples.map(c => <option key={c.id} value={c.id}>{albumLabel(c)}</option>)}
              </select>
            </div>
            {selected && <div className="cloud-v6-current" aria-label="Selected shared album details">
              <div className="cloud-v6-current-head">
                <div><span className="eyebrow">YOUR SELECTED SHARED ALBUM</span><h3>{selected.title} ♡</h3>
                  <p>Created {new Date(selected.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {isOwner ? 'You created this album' : 'You were invited'}</p>
                </div>
                {isOwner && <button type="button" className="plain-button" disabled={!!busy} aria-expanded={showRename} onClick={() => setShowRename(v => !v)}>rename</button>}
              </div>
              {showRename && isOwner && <form className="cloud-v6-rename" onSubmit={rename}>
                <label htmlFor="cloud-v6-rename-title">Rename this selected album</label>
                <div><input id="cloud-v6-rename-title" required maxLength={60} value={renameName} onChange={event => setRenameName(event.target.value)} /><button className="soft-button" disabled={!!busy || !renameName.trim()} type="submit">save name</button></div>
              </form>}
              <div className="cloud-v6-people-head"><strong>Who's in this little album?</strong><span>{membersLoading && !members.length ? 'checking…' : `${members.length} of 2 people`}</span></div>
              <div className="cloud-v6-people" aria-live="polite">
                {albumPeople.map(person => <div className="cloud-v6-person" key={person.user_id}>
                  <span aria-hidden="true">♡</span><div><strong>{person.display_name}{person.isYou ? ' (you)' : ''}</strong><small>{person.email}</small></div>
                  <span className="cloud-v6-person-role">{person.is_owner ? 'creator' : 'joined'}</span>
                </div>)}
                {members.length === 1 && <p className="cloud-v6-waiting">♡ One spot is still open. Only someone with your private invitation code can join.</p>}
              </div>
              {memberError && <p role="alert" className="error-note">{memberError}</p>}
              <p className="cloud-v6-identity-note">Names and emails are shown only to the two approved album members, so you can recognize who you're sharing with.</p>
              {isOwner && members.length < 2 && <button type="button" className="plain-button cloud-v6-renew" onClick={renew} disabled={!!busy}>create a fresh invite code</button>}
            </div>}
          </> : <p className="cloud-hint">You haven't created or joined a shared album yet. Start one below or accept an invitation.</p>}
          {newInvite && <div className="cloud-v6-invite" role="status">
            <strong>A private invitation, just for your person ♡</strong>
            <p>Copy this one-time code now. It is shown only on this device until you leave this page, and expires in seven days. Do not share it publicly.</p>
            <code>{newInvite}</code>
            <button className="soft-button" type="button" disabled={!!busy} onClick={copyCode}>♡ copy invitation code</button>
          </div>}
          {couples.length > 0 && <div className="cloud-v6-manage-actions">
            <button type="button" aria-expanded={showCreate} onClick={() => { setShowCreate(v => !v); setShowJoin(false); }}>＋ create another album</button>
            <button type="button" aria-expanded={showJoin} onClick={() => { setShowJoin(v => !v); setShowCreate(false); }}>✉ join a different album</button>
          </div>}
          {(!couples.length || showCreate || showJoin) && <div className="cloud-v6-pair-forms">
            {(!couples.length || showCreate) && <form className="cloud-form" onSubmit={create}>
              <h3>Create a new shared album</h3><p className="cloud-v6-form-help">This makes a separate album. It does not rename the one you are viewing.</p>
              <label htmlFor="cloud-v6-title">New album name</label>
              <input id="cloud-v6-title" required maxLength={60} value={name} onChange={event => setName(event.target.value)} />
              <button className="soft-button" disabled={!!busy || !name.trim()} type="submit">create album &amp; invite ♡</button>
            </form>}
            {(!couples.length || showJoin) && <form className="cloud-form" onSubmit={join}>
              <h3>Join someone's album</h3><p className="cloud-v6-form-help">Use the one-time code they sent privately.</p>
              <label htmlFor="cloud-v6-code">One-time invitation code</label>
              <input id="cloud-v6-code" minLength={64} maxLength={64} autoComplete="off" spellCheck={false} value={inviteToJoin} onChange={event => setInviteToJoin(event.target.value.trim().toLowerCase())} placeholder="Paste their private code" required />
              <button className="soft-button" disabled={!!busy} type="submit">join their album ♡</button>
            </form>}
          </div>}
        </div>}

        {view === 'personal' && !!couples.length && <div className="cloud-v6-share-target">
          <label htmlFor="cloud-v6-share-destination">When sharing a private photo, send a copy to</label>
          <select id="cloud-v6-share-destination" value={selectedCouple} onChange={event => chooseCouple(event.target.value)}>
            {couples.map(c => <option key={c.id} value={c.id}>{albumLabel(c)}</option>)}
          </select>
          {membersLoading ? <small role="status">Checking who's in this shared album…</small> : memberError ?
            <small role="alert">Could not verify the members of this album. Open Shared with someone to see the error before sharing.</small> :
            <small>{members.length > 1 ? `A shared copy will be visible to ${members.filter(person => person.user_id !== user?.id).map(person => `${person.display_name} (${person.email})`).join(', ')}.` : 'This album is waiting for its second member. When they join, they will be able to see shared copies.'} Your personal original stays private.</small>}
        </div>}

        {(view === 'personal' || selectedCouple) ? <>
          <h3 className="cloud-v6-heading">{view === 'personal' ? 'Only you can see these photos.' : `Pictures in “${selected?.title ?? 'our shared album'}”.`}</h3>
          {loadingPhotos ? <p role="status" className="cloud-hint">Opening private memories…</p> :
            photos.length ? <div className="cloud-album-grid">{photos.map(photo => <PrivatePhotoCard
              key={`${photo.id}-${selectedCouple}`} photo={photo} userId={user!.id} onDelete={remove}
              onShare={view === 'personal' && canShareToSelected ? shareExisting : undefined}
              targetName={selected ? albumLabel(selected) : undefined} busy={!!busy}
            />)}</div> :
            <div className="cloud-v6-empty"><p className="cloud-hint">{view === 'personal' ? 'No private online photos yet. Save one from your device below, then you can open it on another device with the same Google account.' : 'Nothing in this shared album yet. You can share an existing private photo without uploading it again.'}</p>
              {view === 'shared' && <button type="button" className="soft-button" onClick={() => setView('personal')}>♡ choose from my private photos</button>}
            </div>}
          {view === 'personal' && photos.length > 0 && !couples.length && <p className="cloud-hint">To share one of these private photos, first create or join an album under “Shared with someone.”</p>}
          <div className="cloud-upload-section"><h3>{view === 'personal' ? 'Save a photo online ♡' : 'Add a photo to this album ♡'}</h3>
            <p>{view === 'personal' ? 'Make a private backup in your own account.' : 'Upload a new copy from this device, or go to My private photos to share an existing online photo.'} Your local photos remain untouched.</p>
            {localCards.length ? <div className="cloud-local-grid">{localCards.map(({entry,url}) => <div className="cloud-local-choice" key={entry.id}>
              <img src={url} alt="Photo strip saved on this device" />
              <button type="button" disabled={!!busy} onClick={() => save(entry)}>{busy === `save-${entry.id}` ? 'saving…' : view === 'personal' ? '♡ save privately' : '♡ share this strip'}</button>
            </div>)}</div> : <p className="cloud-hint">No photos saved in this browser. {view === 'personal' ? 'Take a strip and keep it on this device to upload a new one. Private cloud photos above are available wherever you sign in.' : 'Either take new pictures, or open My private photos to share a copy of one already online.'}</p>}
          </div>
        </> : <p className="cloud-hint">Create or join a shared album above to start exchanging photos.</p>}
      </>}
    {message && <p className="cloud-good-news" role="status">{message}</p>}
    {error && <p className="error-note" role="alert">{error}</p>}
  </section>;
}
