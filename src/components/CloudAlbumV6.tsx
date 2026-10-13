import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AlbumEntry } from '../types';
import CloudPhotoTile from './CloudPhotoTile';
import {
  createCouple, currentCoupleId, deleteOwnCloudPhoto, disconnectCouple, downloadCloudPhoto,
  joinCouple, listAlbumMembers, listAllCloudPhotos, listCouples, makeCoupleInvitation,
  preserveAlbumToCloud, renameCouple, rotateCoupleInvite, sharePrivateCloudPhoto,
  uploadLocalPhoto, type CloudAlbumMember, type CloudCouple, type CloudPhoto,
} from '../lib/cloudAlbumV6';
import { downloadBlob } from '../lib/storage';
import { createZip, type ZipFile } from '../lib/zipArchive';

type Props = {
  localCards: { entry: AlbumEntry; url: string }[];
  user: User | null;
  authLoading: boolean;
  onLogin: () => void;
  onSignOut: () => void;
};
const date = (stamp: string) => new Date(stamp).toLocaleDateString(undefined, { dateStyle: 'medium' });
const label = (album: CloudCouple) => `${album.title} · ${date(album.created_at)}`;

export default function CloudAlbumV6({ localCards, user, authLoading, onLogin, onSignOut }: Props) {
  const permanent = Boolean(user && !user.is_anonymous);
  const [couples, setCouples] = useState<CloudCouple[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<CloudAlbumMember[]>([]);
  const [membersFor, setMembersFor] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CloudPhoto[]>([]);
  const [backups, setBackups] = useState<CloudPhoto[]>([]);
  const [previousId, setPreviousId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [previousPhotos, setPreviousPhotos] = useState<CloudPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [connectMode, setConnectMode] = useState<'invite' | 'join'>('invite');
  const [joinCode, setJoinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [preserveProgress, setPreserveProgress] = useState('');
  const [confirmShare, setConfirmShare] = useState<{ kind: 'device' | 'cloud'; id: string } | null>(null);
  const [chooseCloudBackup, setChooseCloudBackup] = useState(false);
  const initialLoad = useRef(false);
  const activeRef = useRef<string | null>(null);

  const refresh = () => setRevision(r => r + 1);
  useEffect(() => {
    if (!permanent) {
      setCouples([]); setMembers([]); setMembersFor(null); setActiveId(null); setPhotos([]);
      setBackups([]); setPreviousId(''); setLoaded(false); initialLoad.current = false;
      activeRef.current = null;
      return;
    }
    let alive = true;
    const checkConnection = async () => {
      try {
        const [id, all] = await Promise.all([currentCoupleId(), listCouples()]);
        if (!alive) return;
        if (initialLoad.current && activeRef.current && activeRef.current !== id) {
          setMessage('Your shared connection has ended. Your pictures are safe under Past shared memories if you want copies. ♡');
          setPreviousId(activeRef.current);
        }
        activeRef.current = id;
        initialLoad.current = true;
        setActiveId(id);
        setCouples(all);
        setLoaded(true);
      } catch (reason) {
        if (alive) { setLoaded(true); setError(reason instanceof Error ? reason.message : 'Could not load your connection.'); }
      }
    };
    void checkConnection();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void checkConnection(); }, 12000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [permanent, user?.id, revision]);

  const active = couples.find(c => c.id === activeId);
  const prior = couples.filter(c => c.id !== activeId);
  const priorIds = prior.map(c => c.id).join(':');
  const recentEnded = prior.find(c => c.archived_at && Date.now() - new Date(c.archived_at).getTime() < 7 * 86400000);
  useEffect(() => {
    if (!activeId || !permanent) { setMembers([]); setMembersFor(null); setPhotos([]); return; }
    let alive = true;
    setMembersFor(null); setMembers([]);
    void listAlbumMembers(activeId).then(list => { if (alive) { setMembers(list); setMembersFor(activeId); } })
      .catch(() => { if (alive) setError('Could not check your shared album members.'); });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void listAlbumMembers(activeId).then(list => { if (alive) { setMembers(list); setMembersFor(activeId); } }).catch(() => {});
    }, 12000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [activeId, permanent, revision]);
  useEffect(() => {
    setRenameTitle(active?.title ?? ''); setRenameOpen(false); setDisconnectOpen(false); setConfirmShare(null);
  }, [active?.id, active?.title]);
  useEffect(() => {
    if (!permanent) return;
    let alive = true;
    setLoadingPhotos(true);
    void Promise.all([
      activeId ? listAllCloudPhotos('shared', activeId) : Promise.resolve([]),
      listAllCloudPhotos('personal', null),
    ]).then(([shared, own]) => { if (alive) { setPhotos(shared); setBackups(own); } })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Could not open the album.'); })
      .finally(() => { if (alive) setLoadingPhotos(false); });
    return () => { alive = false; };
  }, [activeId, permanent, user?.id, revision]);
  useEffect(() => {
    if (!permanent || !previousId || !prior.some(c => c.id === previousId)) { setPreviousPhotos([]); return; }
    let alive = true;
    void listAllCloudPhotos('shared', previousId).then(result => { if (alive) setPreviousPhotos(result); })
      .catch(() => { if (alive) setError('Could not open older shared memories.'); });
    return () => { alive = false; };
  }, [permanent, previousId, priorIds, revision]);

  const partner = members.find(member => member.user_id !== user?.id);
  const partnerName = partner?.display_name ?? 'your lovebug';
  const connected = Boolean(active && membersFor === activeId && members.length === 2 && !active.deleting_at);
  const canShare = Boolean(active && connected);
  const hasBackups = backups.length > 0;

  async function run(label: string, callback: () => Promise<void>, success?: string) {
    if (busy) return;
    setBusy(label); setError(''); setMessage('');
    try { await callback(); if (success) setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not finish this action. Try again.'); }
    finally { setBusy(''); setPreserveProgress(''); }
  }
  const connect = () => void run('invite', async () => {
    const code = makeCoupleInvitation();
    await createCouple('our little album', code);
    setInviteCode(code); refresh();
  }, 'Send the code privately. Your album starts empty when you connect.');
  const join = (event: FormEvent) => {
    event.preventDefault();
    void run('join', async () => { await joinCouple(joinCode); setJoinCode(''); setInviteCode(''); refresh(); }, 'Connected! ♡ Choose which memories to share.');
  };
  const renew = () => void run('renew', async () => {
    if (!active) return;
    const code = makeCoupleInvitation();
    await rotateCoupleInvite(active.id, code);
    setInviteCode(code);
  }, 'A new private invitation is ready.');
  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!active) return;
    void run('rename', async () => {
      await renameCouple(active.id, renameTitle); setRenameOpen(false); refresh();
    }, 'Both people will see the new album name.');
  };
  const shareConfirmed = () => {
    if (!user || !active || !canShare || !confirmShare) return;
    const candidate = confirmShare;
    void run('share', async () => {
      if (candidate.kind === 'device') {
        const entry = localCards.find(c => c.entry.id === candidate.id)?.entry;
        if (!entry) throw new Error('This device photo is no longer available.');
        await uploadLocalPhoto(entry, user, 'shared', active.id);
      } else {
        const photo = backups.find(p => p.id === candidate.id);
        if (!photo) throw new Error('This backup is no longer available.');
        const blob = await downloadCloudPhoto(photo);
        await sharePrivateCloudPhoto(photo, blob, user, active.id);
      }
      setConfirmShare(null); refresh();
    }, `Shared with ${partnerName}. ♡`);
  };
  const remove = (photo: CloudPhoto) => {
    if (!user || photo.owner_id !== user.id || !window.confirm('Remove this shared photo for both people? This cannot be undone.')) return;
    void run('delete', async () => { await deleteOwnCloudPhoto(photo, user.id); refresh(); }, 'Shared photo removed.');
  };
  const copy = () => void run('copy', async () => { await navigator.clipboard.writeText(inviteCode); }, 'Invitation copied. Send it privately.');

  async function downloadAll(id: string, title: string) {
    const entries = await listAllCloudPhotos('shared', id);
    if (!entries.length) throw new Error('There are no photos in this album yet.');
    if (entries.length > 100) throw new Error('Download photos individually when there are more than 100 pictures.');
    const files: ZipFile[] = [];
    let size = 0;
    for (let i = 0; i < entries.length; i++) {
      const image = await downloadCloudPhoto(entries[i]);
      size += image.size;
      if (size > 150 * 1024 * 1024) throw new Error('Album exceeds 150 MB. Download individual pictures instead.');
      files.push({ name: `photos/photo-${String(i + 1).padStart(3, '0')}.png`, data: image,
        modifiedAt: new Date(entries[i].created_at).getTime() });
    }
    const zip = await createZip(files);
    downloadBlob(zip, `lovebug-${title.replace(/[^a-z0-9-]/gi, '_').slice(0, 35)}.zip`);
  }
  const keepAll = (id: string) => {
    if (!user) return;
    void run('keep', async () => {
      const total = await preserveAlbumToCloud(id, user, (done, count) => setPreserveProgress(`Saving ${done} of ${count} pictures…`));
      refresh();
      setPreviousId(id);
      setMessage(`${total} pictures copied to your own cloud backups. You can restore them on another device.`);
    });
  };
  const disconnect = (keepCopies: boolean) => {
    if (!active || !user) return;
    void run('disconnect', async () => {
      if (keepCopies) {
        await preserveAlbumToCloud(active.id, user, (done, count) => setPreserveProgress(`Backing up ${done} of ${count} pictures…`));
      }
      await disconnectCouple(active.id);
      setDisconnectOpen(false); setInviteCode(''); setPreviousId(active.id); refresh();
    }, keepCopies ? 'Disconnected. Your own cloud copies are saved.' : 'Disconnected. Old shared photos remain in Past shared memories for both of you.');
  };

  return <section className="cloud-album paper-card" aria-label="Our shared cloud memories">
    <div className="cloud-album-header"><div>
      <div className="eyebrow">PRIVATE, FOR YOUR FAVORITE PERSON</div>
      <h2>Our shared <em>album.</em> ♡</h2>
      <p>One connection, one shared collection. Nothing gets uploaded unless you choose to share a photo.</p>
    </div><span className="cloud-album-symbol" aria-hidden="true">💌</span></div>
    {authLoading ? <p role="status">Checking your Google account…</p> : !permanent ? <div className="cloud-login">
      <p>Sign in with Google to connect with someone. Photo booths and Quick Rooms still work without an account.</p>
      <button type="button" className="pink-button" onClick={onLogin}>Continue with Google ♡</button>
    </div> : <>
      <div className="cloud-album-session"><span>♡ {user?.email}</span><div>
        <button className="plain-button" onClick={refresh}>refresh</button>
        <button className="plain-button" onClick={onSignOut}>sign out</button>
      </div></div>
      {!loaded ? <p role="status">Opening your shared album…</p> : !active ? <>
        {recentEnded && <p className="cloud-v63-connect-notice" role="status">
          ♡ Your previous connection has ended. Old photos are safe under Past shared memories below, where you can download or back them up.
          <button type="button" className="plain-button" onClick={() => { setPreviousId(recentEnded.id); setShowHistory(true); }}>see past memories ↓</button>
        </p>}
        <div className="cloud-v6-connect">
        <h3>Connect with someone ♡</h3>
        <p>Send an invitation or enter theirs. A new connection starts with an empty shared album.</p>
        <div className="cloud-v6-connect-options" role="group" aria-label="Connect with someone">
          <button type="button" className={connectMode === 'invite' ? 'active' : ''} aria-pressed={connectMode === 'invite'} onClick={() => setConnectMode('invite')}>Invite someone</button>
          <button type="button" className={connectMode === 'join' ? 'active' : ''} aria-pressed={connectMode === 'join'} onClick={() => setConnectMode('join')}>I have a code</button>
        </div>
        {connectMode === 'invite' ? <button type="button" className="pink-button" disabled={!!busy} onClick={connect}>make our invitation ♡</button>
          : <form className="cloud-form" onSubmit={join}>
            <label htmlFor="cloud-v63-code">Their private invitation code</label>
            <input id="cloud-v63-code" required minLength={64} maxLength={64} value={joinCode} autoComplete="off" spellCheck={false}
              onChange={e => setJoinCode(e.target.value.trim().toLowerCase())} placeholder="Paste your code" />
            <button type="submit" className="pink-button" disabled={!!busy}>connect ♡</button>
          </form>}
        </div>
      </> : <>
        <div className="cloud-v6-current">
          <div className="cloud-v6-current-head"><div>
            <span className="eyebrow">{connected ? 'JUST THE TWO OF YOU' : 'WAITING FOR YOUR PERSON'}</span>
            <h3>{active.title} ♡</h3>
            <p>{connected ? `Shared with ${partnerName}.` : 'Your invitation is waiting to be accepted.'}</p>
          </div><button type="button" className="plain-button" onClick={() => setRenameOpen(v => !v)} disabled={!!busy}>rename</button></div>
          {renameOpen && <form className="cloud-v6-rename" onSubmit={rename}>
            <label htmlFor="cloud-v63-name">Name that both of you will see</label>
            <div><input id="cloud-v63-name" maxLength={60} required value={renameTitle} onChange={e => setRenameTitle(e.target.value)} />
              <button type="submit" className="soft-button" disabled={!!busy || !renameTitle.trim()}>save name</button></div>
          </form>}
          <div className="cloud-v6-people-head"><strong>People in this album</strong><span>{members.length}/2</span></div>
          <div className="cloud-v6-people">{members.map(person => <div className="cloud-v6-person" key={person.user_id}>
            <span aria-hidden="true">♡</span><div><strong>{person.display_name}{person.user_id === user?.id ? ' (you)' : ''}</strong>
            <small>{person.email}</small></div></div>)}</div>
          {!connected && <button type="button" className="plain-button" disabled={!!busy} onClick={renew}>make another invitation code</button>}
          <div className="cloud-v63-disconnect"><button className="plain-button" type="button" onClick={() => setDisconnectOpen(v => !v)} disabled={!!busy}>disconnect from this person</button></div>
          {disconnectOpen && <div className="cloud-v63-disconnect-confirm" role="group" aria-label="Disconnect safely">
            <strong>Keep our memories? ♡</strong>
            <p>Disconnecting ends this shared connection for both people. A new connection will start empty. Previous photos stay readable under Past shared memories, so neither person loses them automatically.</p>
            <button type="button" className="soft-button" disabled={!!busy} onClick={() => disconnect(true)}>keep copies in my cloud, then disconnect</button>
            <button type="button" className="soft-button" disabled={!!busy} onClick={() => void run('download', () => downloadAll(active.id, active.title), 'ZIP download started. Disconnect separately when ready.')}>↓ download our photos as ZIP</button>
            <button type="button" className="cloud-v63-disconnect-without" disabled={!!busy} onClick={() => disconnect(false)}>disconnect without making new copies</button>
            <button type="button" className="plain-button" disabled={!!busy} onClick={() => setDisconnectOpen(false)}>cancel</button>
            {preserveProgress && <p role="status">{preserveProgress}</p>}
          </div>}
        </div>
        {inviteCode && !connected && <div className="cloud-v6-invite" role="status">
          <strong>Your private invitation ♡</strong><p>Valid once for seven days. Send it directly to your person.</p>
          <code>{inviteCode}</code><button type="button" className="soft-button" onClick={copy} disabled={!!busy}>copy invitation</button>
        </div>}
        {connected && <>
          <h3 className="cloud-v6-heading">Our pictures ♡</h3>
          {loadingPhotos ? <p role="status">Opening the photos…</p>
            : photos.length ? <div className="cloud-album-grid">{photos.map(photo => <CloudPhotoTile key={photo.id} photo={photo}
              onDelete={photo.owner_id === user?.id ? remove : undefined} busy={!!busy} />)}</div>
              : <p className="cloud-v6-empty">This album is empty. Share one little memory below to begin.</p>}
          <div className="cloud-upload-section"><h3>Add a memory ♡</h3><p>Choose a photo from this device or one of your cloud backups. Your person can see it only after you confirm.</p>
            <div className="cloud-local-grid">{localCards.map(card => <div className="cloud-local-choice" key={card.entry.id}>
              <img src={card.url} alt="Photo on this device" loading="lazy" />
              <button type="button" disabled={!!busy} onClick={() => setConfirmShare({ kind: 'device', id: card.entry.id })}>♡ share</button>
            </div>)}</div>
            {!localCards.length && <p className="cloud-hint">No photos saved on this device yet.</p>}
            {hasBackups && <div className="cloud-v63-backup-choices">
              <button type="button" className="plain-button" aria-expanded={chooseCloudBackup} onClick={() => setChooseCloudBackup(v => !v)}>
                {chooseCloudBackup ? 'hide cloud backups' : `or choose a cloud backup (${backups.length})`}
              </button>
              {chooseCloudBackup && <div className="cloud-album-grid">{backups.map(photo => <CloudPhotoTile key={photo.id} photo={photo}
                onShare={() => setConfirmShare({ kind: 'cloud', id: photo.id })} busy={!!busy} />)}</div>}
            </div>}
            {confirmShare && <div className="cloud-v6-confirm-share" role="group" aria-label="Confirm sharing">
              <p>Share this photo with <strong>{partnerName}</strong>? They'll be able to view and download their own copy. Your device/cloud backup is unchanged.</p>
              <div className="cloud-v6-confirm-actions"><button type="button" onClick={() => setConfirmShare(null)} disabled={!!busy}>cancel</button>
                <button type="button" disabled={!!busy} onClick={shareConfirmed}>yes, share ♡</button></div>
            </div>}
          </div>
        </>}
      </>}
      {prior.length > 0 && <details className="cloud-v63-history" open={showHistory} onToggle={event => setShowHistory(event.currentTarget.open)}>
        <summary>Past shared memories ({prior.length})</summary>
        <p>Old connections are read-only. Both people can still download these pictures or preserve their own cloud copies.</p>
        <label htmlFor="cloud-v63-old-picker">Choose a previous album</label>
        <select id="cloud-v63-old-picker" value={previousId} onChange={e => setPreviousId(e.target.value)}>
          <option value="">Choose memories to recover</option>
          {prior.map(c => <option key={c.id} value={c.id}>{label(c)} · {c.id.slice(0,6)}</option>)}
        </select>
        {previousId && prior.some(c => c.id === previousId) && <div className="cloud-v63-history-content">
          <p>{previousPhotos.length} preserved photos. No new photos can be shared to this collection.</p>
          <div className="cloud-v63-history-actions">
            <button type="button" className="soft-button" disabled={!!busy} onClick={() => keepAll(previousId)}>♡ keep copies in my cloud</button>
            <button type="button" className="soft-button" disabled={!!busy} onClick={() => void run('download', () => downloadAll(previousId, prior.find(c => c.id === previousId)?.title || 'shared'), 'ZIP download started.')}>↓ download ZIP</button>
          </div>
          <div className="cloud-album-grid">{previousPhotos.map(photo => <CloudPhotoTile key={photo.id} photo={photo} />)}</div>
          {preserveProgress && <p role="status">{preserveProgress}</p>}
        </div>}
      </details>}
      {message && <p className="cloud-good-news" role="status">{message}</p>}
      {error && <p className="error-note" role="alert">{error}</p>}
    </>}
  </section>;
}
