import React, { useCallback, useEffect, useRef, useState } from 'react';
import { captureVideoFrame, compressPhoto } from '../lib/photos';
import { POSES } from '../lib/themes';
import { readFlashPreference, saveFlashPreference } from '../lib/flashPreference';

type Props = { timer: number; photos: (string | null)[]; retakeIndex: number | null; onPhotos: (photos: (string | null)[]) => void; onDone: () => void; onBack: () => void };

export default function CameraBooth({ timer, photos, retakeIndex, onPhotos, onDone, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sequenceRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(() => readFlashPreference('solo'));
  const chooseFlash = (enabled: boolean) => { setFlashEnabled(enabled); saveFlashPreference('solo', enabled); };
  const [pose, setPose] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [shots, setShots] = useState(retakeIndex !== null ? 0 : photos.filter(Boolean).length);

  useEffect(() => {
    let abandoned = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera needs HTTPS (or localhost). You can still upload photos below.'); return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (abandoned) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        setError('Camera access was unavailable. Check permission, or use the photo uploader below.');
      }
    };
    void start();
    return () => { abandoned = true; sequenceRef.current++; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; };
  }, []);

  const runShots = useCallback(async () => {
    if (!ready || busy || !videoRef.current) return;
    setNotice(null); setBusy(true);
    const currentSession = ++sequenceRef.current;
    const indices = retakeIndex !== null ? [retakeIndex] : [0,1,2,3].filter(index => !photosRef.current[index]);
    const copy = [...photosRef.current];
    try {
      for (const index of indices) {
        for (let n = timer; n > 0; n--) {
          if (sequenceRef.current !== currentSession) return;
          setCount(n); await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (sequenceRef.current !== currentSession) return;
        setCount(null);
        // Brighten the device screen briefly BEFORE capturing; browser LED torch is not required.
        if (flashEnabled) { setFlash(true); await new Promise(resolve => setTimeout(resolve, 110)); }
        copy[index] = captureVideoFrame(videoRef.current!);
        if (flashEnabled) { await new Promise(resolve => setTimeout(resolve, 90)); setFlash(false); }
        photosRef.current = [...copy]; onPhotos([...copy]); setShots(copy.filter(Boolean).length);
        if (index !== indices[indices.length - 1]) await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (sequenceRef.current === currentSession) onDone();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not take that picture.');
    } finally { setFlash(false); if (sequenceRef.current === currentSession) { setBusy(false); setCount(null); } }
  }, [ready, busy, retakeIndex, timer, flashEnabled, onPhotos, onDone]);

  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.currentTarget.files || [])].slice(0, retakeIndex !== null ? 1 : 4);
    event.currentTarget.value = '';
    if (!chosen.length) return;
    setBusy(true); setNotice(null);
    try {
      const copy = [...photosRef.current];
      const destinations = retakeIndex !== null ? [retakeIndex] : [0,1,2,3].filter(index => !copy[index]);
      for (let i = 0; i < Math.min(destinations.length, chosen.length); i++) copy[destinations[i]] = await compressPhoto(chosen[i]);
      photosRef.current = copy; onPhotos(copy); setShots(copy.filter(Boolean).length);
      onDone();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Could not open those pictures.'); }
    finally { setBusy(false); }
  };

  return <main className="inner-page page-width camera-page">
    <button className="back-link" disabled={busy} onClick={onBack}>← back to setup</button>
    <div className="camera-layout">
      <section className="camera-main paper-card"><div className="camera-top"><div className="eyebrow">STEP 02 / THE MAGIC HAPPENS</div><span className="live-dot">● live booth</span></div>
        <h1>{retakeIndex !== null ? 'One more try!' : 'Say cheese, cuties!'}</h1>
        <div className="camera-screen">
          <video ref={videoRef} playsInline autoPlay muted aria-label="Camera preview" />
          {!ready && <div className="camera-placeholder"><span>♡</span><p>{error ? 'camera taking a little nap' : 'waking up your camera...'}</p></div>}
          {ready && <div className="camera-strip-guide" aria-hidden="true"><span>inside this frame = final photo strip</span></div>}
          {count !== null && <div className="camera-count"><span>{count}</span><small>get silly!</small></div>}
          {flash && <div className="camera-flash" aria-hidden="true" />}
          <span className="camera-badge">LOVEBUG CAM ♡</span>
        </div>
        <p className="camera-framing-note">♡ Keep your faces inside the dotted lines. The strip will show this crop, and you can reframe each shot afterwards.</p>
        <label className="camera-flash-choice"><input type="checkbox" checked={flashEnabled} disabled={busy} onChange={event => chooseFlash(event.target.checked)} /> <span>Flash my screen when taking photos</span><small>optional &middot; screen only, not the phone torch</small></label>
        <div className="camera-progress">{[0,1,2,3].map(index => <div key={index} className={photos[index] ? 'done' : ''}>{photos[index] ? '♥' : String(index + 1).padStart(2,'0')}</div>)}</div>
        <div className="camera-actions"><button className="pink-button" onClick={() => void runShots()} disabled={!ready || busy}>{busy ? 'making memories...' : retakeIndex !== null ? 'retake this one' : shots ? 'finish remaining shots' : 'start four silly shots'} <span className="button-icon">📷</span></button><button className="soft-button" disabled={busy} onClick={() => fileRef.current?.click()}>upload photos instead</button></div>
        <input className="visually-hidden" ref={fileRef} type="file" accept="image/*" multiple={retakeIndex === null} onChange={event => void onUpload(event)} aria-label="Upload your photos" />
        {error && <p className="camera-help">{error}</p>}{notice && <p className="error-note" role="alert">{notice}</p>}
      </section>
      <aside className="camera-side"><div className="paper-card pose-suggestion"><div className="pink-tape">a little inspiration</div><span className="tiny-heading">YOUR NEXT POSE</span><p>{POSES[pose]}</p><button className="outline-button" disabled={busy} onClick={() => setPose(i => (i + 1) % POSES.length)}>shuffle the pose ↻</button><img src="/stickers/cherries.svg" alt="" /></div><div className="side-tip"><span>♡</span><p>Four photos, one strip, infinite silly memories. Each picture gets its own countdown.</p></div></aside>
    </div>
  </main>;
}
