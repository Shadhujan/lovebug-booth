import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { captureLivePair, SCENES, type SceneKey } from '../lib/togetherPhotos';

const URL_PATTERN = /^[a-f0-9]{32}$/;
const CLIENT_ID = () => crypto.randomUUID();
const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

type Room = { id: string; role: 'host' | 'guest' };
type Presence = { id: string; role: 'host' | 'guest' };
type Message = {
  from: string;
  to?: string;
  kind: 'offer' | 'answer' | 'ice' | 'scene' | 'shoot';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  scene?: SceneKey;
  swap?: boolean;
  seconds?: number;
};
type Props = { timer: number; onCompleted: (photos: string[]) => void };

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

function initialRoom(): Room | null {
  const id = new URLSearchParams(window.location.search).get('together');
  if (!id || !URL_PATTERN.test(id)) return null;
  let host = false;
  try { host = sessionStorage.getItem(`lovebug-host-${id}`) === 'yes'; } catch { /* optional */ }
  return { id, role: host ? 'host' : 'guest' };
}

function roomLink(id: string): string {
  const target = new URL(window.location.href);
  target.searchParams.set('together', id);
  target.hash = '';
  return target.toString();
}

function isScene(value: unknown): value is SceneKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCENES, value);
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Message>;
  return typeof data.from === 'string' && ['offer', 'answer', 'ice', 'scene', 'shoot'].includes(data.kind ?? '');
}

export default function LiveTogether({ timer, onCompleted }: Props) {
  const [room, setRoom] = useState<Room | null>(initialRoom);
  const [scene, setScene] = useState<SceneKey>('blush');
  const [swap, setSwap] = useState(false);
  const [shotTimer, setShotTimer] = useState([3, 5, 10].includes(timer) ? timer : 3);
  const [status, setStatus] = useState('Create a room or open the invite from your partner.');
  const [notice, setNotice] = useState('');
  const [localReady, setLocalReady] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [shotCount, setShotCount] = useState(0);
  const [shots, setShots] = useState<string[]>([]);
  const [shooting, setShooting] = useState(false);
  const [copied, setCopied] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const otherIdRef = useRef<string | null>(null);
  const offeredRef = useRef(false);
  const queuedIceRef = useRef<RTCIceCandidateInit[]>([]);
  const operationRef = useRef(0);
  const connectedRef = useRef(false);
  const sceneRef = useRef(scene);
  const swapRef = useRef(swap);
  sceneRef.current = scene;
  swapRef.current = swap;
  const shootingRef = useRef(false);
  const runSequenceRef = useRef<(scene: SceneKey, swap: boolean, seconds: number) => Promise<void>>(async () => undefined);
  const clientIdRef = useRef(CLIENT_ID());

  function send(message: Omit<Message, 'from'>) {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: 'broadcast', event: 'lovebug', payload: { ...message, from: clientIdRef.current } }).catch(() => {
      setNotice('Could not send the room update. Check your connection.');
    });
  }

  async function runSequence(selectedScene: SceneKey, selectedSwap: boolean, seconds: number) {
    if (shootingRef.current) return;
    if (!localVideoRef.current?.videoWidth || !remoteVideoRef.current?.videoWidth || !connectedRef.current) {
      setNotice('Wait until both camera feeds are connected.'); return;
    }
    shootingRef.current = true;
    const operation = operationRef.current;
    setNotice(''); setShotCount(0); setShots([]); setShooting(true);
    const made: string[] = [];
    try {
      for (let i = 0; i < 4; i++) {
        for (let n = seconds; n > 0; n--) {
          if (operation !== operationRef.current) return;
          setCount(n);
          await sleep(1000);
        }
        if (operation !== operationRef.current) return;
        if (!connectedRef.current) throw new Error('Your partner disconnected. Try again or use Photo Letters.');
        const mine = localVideoRef.current;
        const theirs = remoteVideoRef.current;
        if (!mine || !theirs) throw new Error('A camera disconnected during the countdown.');
        // Keep the host on the same side on both participants' photo strips.
        const guestSwap = room?.role === 'guest' ? !selectedSwap : selectedSwap;
        made.push(captureLivePair(mine, theirs, selectedScene, guestSwap));
        setShotCount(made.length); setCount(null);
        await sleep(450);
      }
      if (operation === operationRef.current) setShots(made);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not finish this photo strip.');
    } finally {
      if (operation === operationRef.current) { shootingRef.current = false; setCount(null); setShooting(false); }
    }
  }
  runSequenceRef.current = runSequence;

  useEffect(() => {
    if (!room || !supabase) return;
    const joinedRoom: Room = room;
    let active = true;
    const operation = ++operationRef.current;
    connectedRef.current = false;
    setLocalReady(false); setRemoteReady(false); setConnected(false);
    setPeerPresent(false); setShots([]); setShotCount(0); setNotice('');
    setStatus('Asking to use your camera...');
    const clientId = clientIdRef.current;

    function publish(message: Omit<Message, 'from'>) {
      const channel = channelRef.current;
      if (!active || !channel) return;
      void channel.send({ type: 'broadcast', event: 'lovebug', payload: { ...message, from: clientId } }).catch(() => {
        if (active) setNotice('Room signaling interrupted. Try joining again.');
      });
    }

    function disconnectPeer() {
      peerRef.current?.close(); peerRef.current = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      queuedIceRef.current = [];
      otherIdRef.current = null; offeredRef.current = false;
      if (active) { connectedRef.current = false; setRemoteReady(false); setConnected(false); }
    }

    function connectPeer(to: string): RTCPeerConnection {
      if (peerRef.current && otherIdRef.current === to) return peerRef.current;
      disconnectPeer();
      otherIdRef.current = to;
      const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerRef.current = connection;
      for (const track of streamRef.current?.getTracks() ?? []) connection.addTrack(track, streamRef.current!);
      connection.ontrack = event => {
        if (!active || !remoteVideoRef.current) return;
        const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
        remoteVideoRef.current.srcObject = remoteStream;
        void remoteVideoRef.current.play().catch(() => undefined);
      };
      connection.onicecandidate = event => {
        if (event.candidate) publish({ kind: 'ice', to, candidate: event.candidate.toJSON() });
      };
      connection.onconnectionstatechange = () => {
        if (!active) return;
        const state = connection.connectionState;
        connectedRef.current = state === 'connected';
        setConnected(state === 'connected');
        if (state === 'connected') setStatus('Both lovebugs are here. Ready to take pictures.');
        if (state === 'failed') setNotice('The peer connection failed on this network. Try Photo Letters instead. A TURN relay may be required.');
        if (state === 'disconnected') setStatus('Reconnecting to your lovebug...');
      };
      return connection;
    }

    async function flushIce(connection: RTCPeerConnection) {
      const buffered = queuedIceRef.current.splice(0);
      for (const item of buffered) await connection.addIceCandidate(item).catch(() => undefined);
    }

    async function acceptMessage(raw: unknown) {
      if (!active || !isMessage(raw)) return;
      if (raw.from === clientId || (raw.to && raw.to !== clientId)) return;
      if (otherIdRef.current && otherIdRef.current !== raw.from) return;
      if (raw.kind === 'scene') {
        if (joinedRoom.role === 'guest' && isScene(raw.scene)) { setScene(raw.scene); setSwap(Boolean(raw.swap)); }
        return;
      }
      if (raw.kind === 'shoot') {
        if (joinedRoom.role === 'guest' && isScene(raw.scene) && connectedRef.current) {
          setScene(raw.scene);
          setSwap(Boolean(raw.swap));
          await runSequenceRef.current(raw.scene, Boolean(raw.swap), [3, 5, 10].includes(raw.seconds ?? -1) ? raw.seconds! : 3);
        }
        return;
      }
      if (raw.kind === 'offer' && joinedRoom.role !== 'guest') return;
      if (raw.kind === 'answer' && joinedRoom.role !== 'host') return;
      const to = raw.from;
      try {
        const pc = connectPeer(to);
        if (raw.kind === 'offer' && raw.sdp?.type === 'offer') {
          await pc.setRemoteDescription(raw.sdp);
          await flushIce(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          publish({ kind: 'answer', to, sdp: pc.localDescription ?? undefined });
        } else if (raw.kind === 'answer' && raw.sdp?.type === 'answer') {
          await pc.setRemoteDescription(raw.sdp);
          await flushIce(pc);
        } else if (raw.kind === 'ice' && raw.candidate?.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(raw.candidate);
          else queuedIceRef.current.push(raw.candidate);
        }
      } catch (reason) {
        if (active) setNotice(reason instanceof Error ? reason.message : 'Camera negotiation failed. Try a new room.');
      }
    }

    async function makeOffer(to: string) {
      if (offeredRef.current || !active) return;
      try {
        const pc = connectPeer(to);
        offeredRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        publish({ kind: 'offer', to, sdp: pc.localDescription ?? undefined });
        publish({ kind: 'scene', to, scene: sceneRef.current, swap: swapRef.current });
        setStatus('Connecting your cameras...');
      } catch (reason) {
        if (active) setNotice(reason instanceof Error ? reason.message : 'Could not start the call.');
      }
    }

    function presenceSync(channel: RealtimeChannel) {
      const state = channel.presenceState();
      const people: Presence[] = Object.values(state).flatMap(items => items).flatMap(value => {
        const item = value as unknown as Partial<Presence>;
        return typeof item.id === 'string' && (item.role === 'host' || item.role === 'guest')
          ? [{ id: item.id, role: item.role } as Presence] : [];
      });
      const others = people.filter(item => item.id !== clientId);
      if (others.length > 1) { setNotice('This room is for two. Please create another invite.'); return; }
      const opposite = others.find(item => item.role !== joinedRoom.role);
      setPeerPresent(Boolean(opposite));
      if (!opposite) {
        if (otherIdRef.current) disconnectPeer();
        setStatus('Waiting for your favorite person to join...');
      } else if (joinedRoom.role === 'host' && !offeredRef.current) {
        void makeOffer(opposite.id);
      }
    }

    async function connect() {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        setNotice('Live Together requires a modern browser with WebRTC and HTTPS. Photo Letters still work.'); return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20, max: 25 } }, audio: false });
      } catch {
        if (active) setNotice('Please allow camera access, or choose Photo Letters. Both cameras need HTTPS on phones.');
        return;
      }
      if (!active || operation !== operationRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play().catch(() => undefined);
      }
      setLocalReady(true); setStatus('Joining your little room...');
      const channel = supabase!.channel(`lovebug-together:${joinedRoom.id}`, {
        config: { broadcast: { ack: false, self: false }, presence: { key: clientId }, private: false },
      });
      channelRef.current = channel;
      channel.on('broadcast', { event: 'lovebug' }, ({ payload }) => { void acceptMessage(payload); });
      channel.on('presence', { event: 'sync' }, () => presenceSync(channel));
      channel.subscribe(status => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          setStatus('Waiting for your favorite person to join...');
          void channel.track({ id: clientId, role: joinedRoom.role }).catch(() => setNotice('Could not join this room. Try reconnecting.'));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setNotice('Supabase Realtime could not connect. Confirm the project key and Realtime settings.');
        }
      });
    }
    void connect();
    return () => {
      active = false;
      connectedRef.current = false;
      operationRef.current++;
      shootingRef.current = false;
      disconnectPeer();
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (channelRef.current) {
        void supabase!.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // The room owns the connection lifecycle. UI controls publish messages separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  function finishPhotos() {
    const ready = [...shots];
    leaveRoom();
    onCompleted(ready);
  }

  function createRoom() {
    if (!supabase) { setNotice('Connect Supabase first (see docs/TOGETHER_APART_SETUP.md).'); return; }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem(`lovebug-host-${id}`, 'yes'); } catch { /* optional */ }
    window.history.replaceState(null, '', roomLink(id));
    setCopied(false);
    setRoom({ id, role: 'host' });
  }

  function leaveRoom() {
    if (room) {
      try { sessionStorage.removeItem(`lovebug-host-${room.id}`); } catch { /* optional */ }
    }
    const next = new URL(window.location.href);
    next.searchParams.delete('together');
    window.history.replaceState(null, '', next.pathname + next.search + next.hash);
    setRoom(null); setCopied(false); setNotice(''); setStatus('Create a room or open an invite.');
    setShots([]); setShotCount(0); setConnected(false); setPeerPresent(false); setRemoteReady(false);
  }

  async function copyLink() {
    if (!room) return;
    try { await navigator.clipboard.writeText(roomLink(room.id)); setCopied(true); }
    catch { setNotice('Please select the invite link below and copy it manually.'); }
  }

  function selectScene(value: SceneKey) {
    if (room?.role !== 'host') return;
    setScene(value);
    send({ kind: 'scene', scene: value, swap });
  }

  function selectSwap(value: boolean) {
    if (room?.role !== 'host') return;
    setSwap(value);
    send({ kind: 'scene', scene, swap: value });
  }

  function startSharedShots() {
    if (!room || room.role !== 'host' || shootingRef.current || !connected || !remoteReady) return;
    send({ kind: 'shoot', scene, swap, seconds: shotTimer });
    void runSequenceRef.current(scene, swap, shotTimer);
  }

  return <section className="live-together" aria-label="Live remote photo booth">
    {!supabase && <div className="together-config-note" role="status"><strong>One-time setup needed for live rooms.</strong> Add your Supabase project URL and publishable key to <code>.env.local</code>, then restart Vite. The Photo Letters tab works without it.</div>}
    {!room ? <div className="paper-card live-lobby"><div className="live-lobby-icon">&#9825;</div><h2>A little room for two</h2><p>Create a private-link room, then send the link to your girlfriend. Once both cameras connect, you can capture four combined photos. No microphones, no recording, and no cloud photo upload.</p><button className="pink-button" disabled={!supabase} onClick={createRoom}>create our photo room <span className="button-icon">&#8599;</span></button><small>The link is unlisted, not authenticated. Anyone with it may join. Only share it privately.</small></div> : <>
      <div className="paper-card live-invite"><div><span className="eyebrow">OUR LITTLE ROOM</span><h2>{room.role === 'host' ? 'Invite your favorite person' : 'You joined their room'}</h2><p className="live-status" role="status">{status}</p></div><div className="live-invite-actions"><label htmlFor="live-invite-link">Invite link</label><div className="live-share-row"><input id="live-invite-link" aria-label="Invite link" readOnly value={roomLink(room.id)} onFocus={(event: FocusEvent<HTMLInputElement>) => event.target.select()} /><button className="soft-button" onClick={() => void copyLink()}>{copied ? 'copied!' : 'copy link'}</button></div><button className="plain-button" onClick={leaveRoom}>leave this room</button></div></div>
      <div className="live-cameras"><div className="paper-card live-camera-card"><div className="live-camera-label">you <span>{localReady ? 'camera on' : 'waiting'}</span></div><div className="live-video-wrap"><video ref={localVideoRef} autoPlay muted playsInline className="live-local-video" aria-label="Your camera" />{!localReady && <span className="live-video-placeholder">waking up your camera...</span>}{count !== null && <div className="live-count-overlay">{count}</div>}</div></div><div className="paper-card live-camera-card"><div className="live-camera-label">your lovebug <span>{remoteReady && connected ? 'here with you' : peerPresent ? 'connecting' : 'waiting'}</span></div><div className="live-video-wrap"><video ref={remoteVideoRef} autoPlay muted playsInline aria-label="Your partner's camera" onLoadedMetadata={() => setRemoteReady(true)} />{!remoteReady && <span className="live-video-placeholder">waiting for that cute face...</span>}</div></div></div>
      <div className="paper-card live-controls"><div className="eyebrow">YOUR LITTLE PHOTO DATE</div><h3>Choose a common frame</h3><p>Both of you see each other live in separate frames. For now, the backgrounds behind each person remain visible.</p><div className="scene-options" role="group" aria-label="Choose shared photo frame">{(Object.entries(SCENES) as [SceneKey, typeof SCENES[SceneKey]][]).map(([id,item]) => <button key={id} aria-pressed={scene === id} className={scene === id ? 'active' : ''} disabled={room.role !== 'host' || shooting} onClick={() => selectScene(id)}><span className="scene-swatch" style={{ background: item.background }}/>{item.name}</button>)}</div>
      {room.role === 'host' && <label className="letter-swap"><input type="checkbox" checked={swap} disabled={shooting} onChange={(event: ChangeEvent<HTMLInputElement>) => selectSwap(event.target.checked)} /> Put her camera on the left</label>}
      {room.role === 'host' && <div className="live-timer"><span>Countdown per photo</span><div role="group" aria-label="Choose countdown seconds">{[3,5,10].map(value => <button key={value} className={shotTimer === value ? 'active' : ''} aria-pressed={shotTimer === value} disabled={shooting} onClick={() => setShotTimer(value)}>{value}s</button>)}</div></div>}
      <div className="live-shoot-row"><button className="pink-button" disabled={room.role !== 'host' || !connected || !remoteReady || shooting} onClick={startSharedShots}>{shooting ? `capturing photo ${Math.min(4, shotCount + 1)} / 4...` : 'take four photos together'} <span className="button-icon">&#9825;</span></button><span>{room.role === 'guest' ? 'Your partner starts the countdown.' : connected ? 'Ready when you are.' : 'Waiting for both cameras.'}</span></div>
      {shotCount > 0 && <div className="live-shot-progress" aria-label={`${shotCount} of 4 photos captured`}>{[0,1,2,3].map(index => <span key={index} className={index < shotCount ? 'done' : ''}>{index < shotCount ? '\u2665' : index + 1}</span>)}</div>}
      {shots.length === 4 && <div className="live-finished"><div className="live-finished-preview">{shots.map((item,index) => <img key={index} src={item} alt={`Combined live picture ${index + 1}`} />)}</div><button className="pink-button" onClick={finishPhotos}>decorate our photos &#8599;</button></div>}
      {notice && <p role="alert" className="error-note">{notice}</p>}
      <small>Camera video streams directly between browsers using WebRTC. Supabase only relays connection messages and the countdown. Some networks need a TURN relay; if it fails, switch to Photo Letters.</small></div>
    </>}
    {!room && notice && <p role="alert" className="error-note">{notice}</p>}
  </section>;
}
