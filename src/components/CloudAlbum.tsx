import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AlbumEntry } from '../types';
import { deleteOwnCloudStrip, joinSpace, listCloudStrips, mySpace, shareLocalStrip, type CloudStrip } from '../lib/cloudAlbum';
import { downloadBlob } from '../lib/storage';
import { supabaseClient } from '../lib/supabaseClient';

type LocalCard = { entry: AlbumEntry; url: string };
type PhotoCard = { record: CloudStrip; image: Blob; url: string };
type Props = { localCards: LocalCard[] };

export default function CloudAlbum({ localCards }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoCard[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const api = supabaseClient;
    if (!api) { setAuthLoading(false); return; }
    let active = true;
    const { data: { subscription } } = api.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setAuthLoading(false); }
    });
    void api.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user ?? null); setAuthLoading(false); }
    }).catch(() => { if (active) setAuthLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) { setSpaceId(null); setPhotos([]); setMembershipLoading(false); return; }
    let active = true;
    setMembershipLoading(true); setError('');
    void mySpace().then(id => { if (active) setSpaceId(id); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not check your invitation.'); })
      .finally(() => { if (active) setMembershipLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!spaceId) { setPhotos([]); return; }
    let active = true;
    const objectUrls: string[] = [];
    setGalleryLoading(true);
    void listCloudStrips().then(results => {
      const next = results.map(({ record, image }) => {
        const url = URL.createObjectURL(image);
        objectUrls.push(url);
        return { record, image, url };
      });
      if (active) setPhotos(next);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load the shared album.');
    }).finally(() => { if (active) setGalleryLoading(false); });
    return () => { active = false; objectUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [spaceId, galleryRevision]);

  const run = async (label: string, work: () => Promise<void>, success?: string) => {
    if (busyAction) return;
    setBusyAction(label); setError(''); setMessage('');
    try { await work(); if (success) setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something interrupted the shared album.'); }
    finally { setBusyAction(''); }
  };

  const googleSignIn = () => void run('google', async () => {
    const destination = new URL(window.location.origin);
    destination.searchParams.set('album', '1');
    const { error } = await supabaseClient!.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: destination.toString() },
    });
    if (error) throw new Error(error.message);
  });
  const emailSignIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run('email', async () => {
      const destination = new URL(window.location.origin);
      destination.searchParams.set('album', '1');
      const { error } = await supabaseClient!.auth.signInWithOtp({
        email: email.trim(), options: { emailRedirectTo: destination.toString() },
      });
      if (error) throw new Error(error.message);
    }, 'Check your email for a sign-in link. Open it on this device. ♡');
  };
  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run('join', async () => {
      const id = await joinSpace(code);
      setSpaceId(id); setCode('');
    }, 'Welcome to your little shared world. ♡');
  };
  const share = (entry: AlbumEntry) => {
    if (!user || !spaceId) return;
    void run(`upload-${entry.id}`, async () => {
      await shareLocalStrip(spaceId, entry, user);
      setGalleryRevision(value => value + 1);
    }, 'Saved to your shared album. She can see it too. ♡');
  };
  const remove = (item: PhotoCard) => {
    if (!window.confirm('Remove this picture from BOTH of your shared albums? This cannot be undone.')) return;
    void run(`remove-${item.record.id}`, async () => {
      await deleteOwnCloudStrip(item.record);
      setGalleryRevision(value => value + 1);
    }, 'Removed from your shared album.');
  };

  return <section className="cloud-album paper-card" aria-label="Private cloud album">
    <div className="cloud-album-header"><div><div className="eyebrow">ONE LITTLE ALBUM / TWO PHONES</div><h2>Our shared <em>memories.</em> ♡</h2><p>Only the two invited lovebugs can see these photos. Nothing uploads without your choice.</p></div><span className="cloud-album-symbol" aria-hidden="true">💌</span></div>
    {!supabaseClient ? <p className="cloud-hint">Cloud saving needs the Supabase Project URL and publishable key in Vercel. Your browser-only photos are still safe below.</p> :
      authLoading ? <p className="cloud-hint" role="status">Checking our little mailbox…</p> :
      !user ? <div className="cloud-login">
        <p className="cloud-hint">Sign in first. You and your lovebug can each have your own account.</p>
        <button type="button" className="pink-button" disabled={Boolean(busyAction)} onClick={googleSignIn}>continue with Google <span className="button-icon">♡</span></button>
        <details className="cloud-email-fallback"><summary>or send me an email sign-in link</summary><form onSubmit={emailSignIn} className="cloud-form"><label htmlFor="cloud-sign-in-email">Email</label><div className="cloud-form-row"><input id="cloud-sign-in-email" type="email" required value={email} placeholder="you@example.com" autoComplete="email" onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)} /><button type="submit" disabled={Boolean(busyAction)} className="soft-button">send link</button></div></form><small>Supabase email links may require custom SMTP to reach addresses outside your Supabase organization.</small></details>
      </div> : membershipLoading ? <p className="cloud-hint" role="status">Finding our shared space…</p> : !spaceId ? <div className="cloud-join">
        <p className="cloud-hint">Signed in as <strong>{user.email}</strong>. Enter your one-time couple invitation code to unlock your private scrapbook.</p>
        <form className="cloud-form" onSubmit={join}><label htmlFor="cloud-invite-code">Our private invitation code</label><div className="cloud-form-row"><input id="cloud-invite-code" value={code} onChange={(event: ChangeEvent<HTMLInputElement>) => setCode(event.target.value)} placeholder="Paste the code shared privately" required minLength={48} autoComplete="off" /><button className="pink-button" disabled={Boolean(busyAction)} type="submit">join ♡</button></div></form>
        <small>The code is created once by the owner in Supabase SQL Editor. It's not stored in the frontend.</small>
      </div> : <>
        <div className="cloud-album-session"><span>♡ Signed in as {user.email} · shared with your lovebug</span><div><button className="plain-button" disabled={Boolean(busyAction) || galleryLoading} onClick={() => setGalleryRevision(value => value + 1)}>refresh</button><button className="plain-button" disabled={Boolean(busyAction)} onClick={() => void run('logout', async () => { const { error: signOutError } = await supabaseClient!.auth.signOut(); if (signOutError) throw signOutError; setSpaceId(null); })}>sign out</button></div></div>
        <div className="cloud-album-grid">
          {galleryLoading ? <p role="status" className="cloud-hint">Opening our private photo box…</p> : photos.length ? photos.map(item => <article className="cloud-photo" key={item.record.id}>
            <div className="cloud-photo-preview"><img loading="lazy" src={item.url} alt="Private shared couple photo strip" /></div>
            <small>{new Date(item.record.created_at).toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'})}</small>
            <div className="cloud-photo-actions"><button type="button" onClick={() => downloadBlob(item.image, `lovebug-shared-${item.record.id.slice(0,8)}.png`)}>↓ download</button>{item.record.created_by === user.id && <button type="button" disabled={Boolean(busyAction)} onClick={() => remove(item)}>remove</button>}</div>
          </article>) : <p className="cloud-hint">Our shared album is waiting for its first memory. ♡</p>}
        </div>
        <div className="cloud-upload-section"><h3>Send a memory to her ♡</h3><p>Your photos below are saved on this device. Choose one to share with both of your phones.</p>
          {localCards.length ? <div className="cloud-local-grid">{localCards.map(({entry,url}) => <div className="cloud-local-choice" key={entry.id}><img src={url} alt="Local photo strip available to share" /><button type="button" disabled={Boolean(busyAction)} onClick={() => share(entry)}>{busyAction === `upload-${entry.id}` ? 'sharing…' : '♡ share this strip'}</button></div>)}</div> : <p className="cloud-hint">First save a strip to your browser album, then return here to share it.</p>}
        </div>
      </>}
    {error && <p role="alert" className="error-note">{error}</p>}
    {message && <p role="status" className="cloud-good-news">{message}</p>}
  </section>;
}
