import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { captureLivePair, DEFAULT_COMPOSITION, drawTogetherFrame, isTogetherComposition, type TogetherCutouts, type TogetherComposition } from '../lib/togetherPhotos';
import TogetherCompositionControls from './TogetherCompositionControls';

const URL_PATTERN = /^[a-f0-9]{32}$/;
const CLIENT_ID = () => crypto.randomUUID();
const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

type Room = { id: string; role: 'host' | 'guest' };
type Presence = { id: string; role: 'host' | 'guest' };
type Message = {
  from: string;
  to?: string;
  kind: 'offer' | 'answer' | 'ice' | 'scene' | 'shoot' | 'cutout-ready';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  composition?: TogetherComposition;
  seconds?: number;
  ready?: boolean;
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

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Message>;
  return typeof data.from === 'string' && ['offer', 'answer', 'ice', 'scene', 'shoot', 'cutout-ready'].includes(data.kind ?? '');
}

export default function LiveTogether({ timer, onCompleted }: Props) {
  const [room, setRoom] = useState<Room | null>(initialRoom);
  const [composition, setComposition] = useState<TogetherComposition>(DEFAULT_COMPOSITION);
  const [mirrorSelfView, setMirrorSelfView] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [cutoutStatus, setCutoutStatus] = useState<'off' | 'loading' | 'searching' | 'ready' | 'error'>('off');
  const [missingPerson, setMissingPerson] = useState<'host' | 'guest' | null>(null);
  const [peerCutoutReady, setPeerCutoutReady] = useState(false);
  const virtualEnabled = composition.backdrop !== 'original';
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const compactPreviewRef = useRef<HTMLCanvasElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cutoutsRef = useRef<Partial<TogetherCutouts>>({});
  const cutoutsReadyRef = useRef(false);
  const peerCutoutReadyRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const otherIdRef = useRef<string | null>(null);
  const offeredRef = useRef(false);
  const queuedIceRef = useRef<RTCIceCandidateInit[]>([]);
  const operationRef = useRef(0);
  const connectedRef = useRef(false);
  const compositionRef = useRef(composition);
  compositionRef.current = composition;
  const shootingRef = useRef(false);
  const runSequenceRef = useRef<(selected: TogetherComposition, seconds: number) => Promise<void>>(async () => undefined);
  const clientIdRef = useRef(CLIENT_ID());

  function send(message: Omit<Message, 'from'>) {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: 'broadcast', event: 'lovebug', payload: { ...message, from: clientIdRef.current } }).catch(() => {
      setNotice('Could not send the room update. Check your connection.');
    });
  }

  async function runSequence(selected: TogetherComposition, seconds: number) {
    if (shootingRef.current) return;
    if (!localVideoRef.current?.videoWidth || !remoteVideoRef.current?.videoWidth || !connectedRef.current) {
      setNotice('Wait until both camera feeds are connected.'); return;
    }
    if (selected.backdrop !== 'original' && (!cutoutsReadyRef.current || !peerCutoutReadyRef.current)) {
      setNotice('We cannot see both people clearly yet. Face the cameras and try brighter lighting, or choose Original cameras.');
      return;
    }
    shootingRef.current = true;
    setSettingsOpen(false); // Leave the entire photo visible during the countdown.
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
        if (selected.backdrop !== 'original' && (!cutoutsReadyRef.current || !cutoutsRef.current.host || !cutoutsRef.current.guest)) {
          throw new Error('A person disappeared from the virtual scene. Please move into the light and take the photos again, or choose Original cameras.');
        }
        // Host/guest source ordering is identical on both devices, including mirrors.
        made.push(captureLivePair(mine, theirs, selected, room?.role ?? 'host',
          selected.backdrop !== 'original' && cutoutsReadyRef.current
            ? cutoutsRef.current as TogetherCutouts : undefined));
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
    setPeerCutoutReady(false); peerCutoutReadyRef.current = false;
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
      setPeerCutoutReady(false); peerCutoutReadyRef.current = false;
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
      if (raw.kind === 'cutout-ready') {
        const ready = raw.ready === true;
        peerCutoutReadyRef.current = ready;
        setPeerCutoutReady(ready);
        return;
      }
      if (raw.kind === 'scene') {
        if (joinedRoom.role === 'guest' && isTogetherComposition(raw.composition)) { setComposition(raw.composition); compositionRef.current = raw.composition; }
        return;
      }
      if (raw.kind === 'shoot') {
        if (joinedRoom.role === 'guest' && isTogetherComposition(raw.composition) && connectedRef.current) {
          setComposition(raw.composition);
          compositionRef.current = raw.composition;
          await runSequenceRef.current(raw.composition, [3, 5, 10].includes(raw.seconds ?? -1) ? raw.seconds! : 3);
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
        publish({ kind: 'scene', to, composition: compositionRef.current });
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
    setSettingsOpen(false);
    cutoutsRef.current = {}; cutoutsReadyRef.current = false;
    peerCutoutReadyRef.current = false; setPeerCutoutReady(false); setCutoutStatus('off');
  }

  async function copyLink() {
    if (!room) return;
    try { await navigator.clipboard.writeText(roomLink(room.id)); setCopied(true); }
    catch { setNotice('Please select the invite link below and copy it manually.'); }
  }

  function selectComposition(value: TogetherComposition) {
    if (room?.role !== 'host' || shootingRef.current) return;
    setComposition(value);
    compositionRef.current = value;
    if (value.backdrop === 'original') {
      peerCutoutReadyRef.current = false; setPeerCutoutReady(false);
    }
    send({ kind: 'scene', composition: value });
  }

  function openAdjustments() {
    setSettingsOpen(true);
    // On phones and compact laptops, bring the full-size photo above the
    // bottom inspector. The inspector never changes the photo's dimensions.
    if (window.matchMedia('(max-width: 1249px)').matches) {
      window.requestAnimationFrame(() => {
        previewFrameRef.current?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          block: 'start',
        });
        settingsPanelRef.current?.scrollTo({ top: 0 });
      });
    }
  }

  useEffect(() => {
    if (!settingsOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [settingsOpen]);

  function startSharedShots() {
    if (!room || room.role !== 'host' || shootingRef.current || !connected || !remoteReady) return;
    setSettingsOpen(false);
    const selected = compositionRef.current;
    send({ kind: 'shoot', composition: selected, seconds: shotTimer });
    void runSequenceRef.current(selected, shotTimer);
  }

  // Load the optional selfie model only while a shared virtual world is in
  // use. Both browsers segment both WebRTC feeds locally; no image is sent to
  // Supabase. Running at ~4 cutouts/sec per person keeps Android usable.
  useEffect(() => {
    let active = true;
    let frame = 0;
    let processor: import('../lib/personCutout').PersonCutoutProcessor | null = null;
    cutoutsRef.current = {};
    cutoutsReadyRef.current = false;
    setCutoutStatus(virtualEnabled ? 'loading' : 'off');
    setMissingPerson(null);
    if (!virtualEnabled || !room || !connected || !localReady || !remoteReady) {
      if (room) send({ kind: 'cutout-ready', ready: false });
      return () => { active = false; };
    }
    send({ kind: 'cutout-ready', ready: false });
    let lastRun = 0;
    let step = 0;
    void import('../lib/personCutout').then(({ PersonCutoutProcessor }) => PersonCutoutProcessor.create('VIDEO')).then(loaded => {
      if (!active) { loaded.close(); return; }
      processor = loaded;
      const run = (time: number) => {
        if (!active || !processor) return;
        frame = requestAnimationFrame(run);
        if (time - lastRun < 115) return;
        lastRun = time;
        const mine = localVideoRef.current;
        const theirs = remoteVideoRef.current;
        if (!mine?.videoWidth || !theirs?.videoWidth) return;
        const video = step++ % 2 === 0 ? mine : theirs;
        const role = video === mine ? (room.role === 'host' ? 'host' : 'guest') : (room.role === 'host' ? 'guest' : 'host');
        try {
          const previous = cutoutsRef.current[role]?.image;
          const output = previous instanceof HTMLCanvasElement ? previous : undefined;
          cutoutsRef.current[role] = processor.cutout(video, video.videoWidth, video.videoHeight, output);
          if (!cutoutsReadyRef.current && cutoutsRef.current.host && cutoutsRef.current.guest) {
            cutoutsReadyRef.current = true;
            setCutoutStatus('ready');
            setMissingPerson(null);
            send({ kind: 'cutout-ready', ready: true });
          }
        } catch (reason) {
          // Low light or a face moving out of frame is recoverable. Keep
          // checking the cameras rather than permanently stopping inference.
          if (reason instanceof Error && reason.name === 'PersonNotDetectedError') {
            // cutout() may have reused the same canvas before the model
            // rejected its mask. Discard it immediately: a raw or transparent
            // frame must never be mistaken for a valid detected person.
            delete cutoutsRef.current[role];
            if (cutoutsReadyRef.current) send({ kind: 'cutout-ready', ready: false });
            cutoutsReadyRef.current = false;
            setCutoutStatus('searching');
            setMissingPerson(role);
            return;
          }
          cancelAnimationFrame(frame);
          setCutoutStatus('error');
          setMissingPerson(null);
          cutoutsReadyRef.current = false;
          cutoutsRef.current = {};
          send({ kind: 'cutout-ready', ready: false });
          setNotice(reason instanceof Error ? `Background removal failed: ${reason.message}. Choose Original cameras.` : 'Background removal is not available. Choose Original cameras.');
        }
      };
      frame = requestAnimationFrame(run);
    }).catch(() => {
      if (active) {
        setCutoutStatus('error');
        setNotice('Could not download the optional person-cutout model. Switch to Original cameras to keep taking photos.');
        send({ kind: 'cutout-ready', ready: false });
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      processor?.close();
      cutoutsRef.current = {};
      cutoutsReadyRef.current = false;
    };
    // This effect changes only when entering/leaving virtual mode, not when
    // selecting a different scene or tweaking the sliders.
  }, [room, connected, localReady, remoteReady, virtualEnabled]);

  // Preview and JPEG export use the same drawing function, crop and orientation.
  // Render at 15 fps to avoid needless phone battery drain. Canvas is decorative
  // only; it never uploads video frames or camera images.
  useEffect(() => {
    if (!room || !connected || !localReady || !remoteReady) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const scratch = document.createElement('canvas');
    let request = 0;
    let lastDraw = 0;
    const draw = (time: number) => {
      if (time - lastDraw >= 65) {
        const mine = localVideoRef.current;
        const theirs = remoteVideoRef.current;
        if (mine?.videoWidth && theirs?.videoWidth) {
          const localSource = { image: mine, width: mine.videoWidth, height: mine.videoHeight };
          const remoteSource = { image: theirs, width: theirs.videoWidth, height: theirs.videoHeight };
          try {
            drawTogetherFrame(canvas,
              room.role === 'host' ? localSource : remoteSource,
              room.role === 'guest' ? localSource : remoteSource,
              // While detection is incomplete, show live cameras rather than
              // a misleading empty illustrated scene. Export is still blocked.
              cutoutsReadyRef.current ? compositionRef.current
                : { ...compositionRef.current, backdrop: 'original' }, scratch,
              cutoutsReadyRef.current ? cutoutsRef.current as TogetherCutouts : undefined);
            // The mobile inspector displays a live, reduced-resolution copy
            // of the *same* composited frame. No second cropping algorithm.
            if (settingsOpenRef.current && compactPreviewRef.current) {
              const mini = compactPreviewRef.current;
              mini.getContext('2d')?.drawImage(canvas, 0, 0, mini.width, mini.height);
            }
          } catch { /* Video frames can briefly be unavailable during reconnection. */ }
          lastDraw = time;
        }
      }
      request = window.requestAnimationFrame(draw);
    };
    request = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(request);
  }, [room, connected, localReady, remoteReady]);

  return <section className="live-together" aria-label="Live remote photo booth">
    {!supabase && <div className="together-config-note" role="status"><strong>One-time setup needed for live rooms.</strong> Add your Supabase project URL and publishable key to <code>.env.local</code>, then restart Vite. The Photo Letters tab works without it.</div>}
    {!room ? <div className="paper-card live-lobby"><div className="live-lobby-icon">&#9825;</div><h2>A little room for two</h2><p>Create a private-link room, then send the link to your girlfriend. Once both cameras connect, you can capture four combined photos. No microphones, no recording, and no cloud photo upload.</p><button className="pink-button" disabled={!supabase} onClick={createRoom}>create our photo room <span className="button-icon">&#8599;</span></button><small>The link is unlisted, not authenticated. Anyone with it may join. Only share it privately.</small></div> : <>
      <div className="paper-card live-invite"><div><span className="eyebrow">OUR LITTLE ROOM</span><h2>{room.role === 'host' ? 'Invite your favorite person' : 'You joined their room'}</h2><p className="live-status" role="status">{status}</p></div><div className="live-invite-actions"><label htmlFor="live-invite-link">Invite link</label><div className="live-share-row"><input id="live-invite-link" aria-label="Invite link" readOnly value={roomLink(room.id)} onFocus={(event: FocusEvent<HTMLInputElement>) => event.target.select()} /><button className="soft-button" onClick={() => void copyLink()}>{copied ? 'copied!' : 'copy link'}</button></div><button className="plain-button" onClick={leaveRoom}>leave this room</button></div></div>
      <div className={`live-booth-workspace ${settingsOpen ? 'live-adjusting' : ''}`}>
        <div className="paper-card live-main-preview">
          <div className="live-stage-header">
            <div><span className="eyebrow">THE PHOTO WE WILL REALLY SAVE</span><h3>In the same little frame <span aria-hidden="true">&hearts;</span></h3><p>The pink frame is the whole photo. No hidden portrait crop after the countdown.</p></div>
            <div className="live-stage-actions">
              <label className="together-toggle"><input type="checkbox" checked={showGuides} onChange={(event: ChangeEvent<HTMLInputElement>) => setShowGuides(event.target.checked)} /> Show composition guides</label>
              <button type="button" className="live-adjust-trigger" aria-controls="live-adjust-panel" aria-expanded={settingsOpen} onClick={openAdjustments}>
                <span aria-hidden="true">✿</span> adjust our photo
              </button>
            </div>
          </div>
          <div className="live-stage-frame" ref={previewFrameRef}><canvas ref={previewCanvasRef} width={660} height={495} aria-label="Live preview of the exact combined photo, including the chosen crop and mirrors" role="img" />
            {(!connected || !remoteReady || !localReady) && <div className="live-stage-waiting">{peerPresent ? 'Joining your cameras into one photo...' : 'Waiting for your favorite person to join...'}</div>}
            {showGuides && connected && remoteReady && <div className="live-stage-guides" aria-hidden="true"><span>your shared photo</span></div>}
            {count !== null && <div className="live-count-overlay" aria-label={`Taking photo in ${count}`}>{count}</div>}
          </div>
          {virtualEnabled && <div className="together-cutout-status" role="status" data-state={cutoutStatus}>
            <span>{cutoutStatus === 'ready'
              ? peerCutoutReady ? '♡ Both people are visible. Your shared scene is ready.' : 'We found both people here. Waiting for your lovebug’s phone…'
              : cutoutStatus === 'searching'
                ? `We can’t clearly find ${missingPerson === (room.role === 'host' ? 'host' : 'guest') ? 'you' : 'your lovebug'} yet. Move into the camera frame and brighten the room. We’re showing the original cameras until both people are visible.`
              : cutoutStatus === 'error' ? 'Person cutouts stopped working. You can continue with Original cameras.'
              : 'Finding both people… Look toward the cameras and keep your head and shoulders inside the frame.'}</span>
            {room.role === 'host' && (cutoutStatus === 'searching' || cutoutStatus === 'error') && <button type="button" className="cutout-fallback-link" onClick={() => selectComposition({ ...compositionRef.current, backdrop: 'original' })}>Use Original cameras ↗</button>}
          </div>}
          <div className="live-shoot-row live-preview-shoot">
            <button className="pink-button" disabled={room.role !== 'host' || !connected || !remoteReady || shooting || (virtualEnabled && (cutoutStatus !== 'ready' || !peerCutoutReady))} onClick={startSharedShots}>{shooting ? `capturing photo ${Math.min(4, shotCount + 1)} / 4...` : 'take four photos together'} <span className="button-icon">&#9825;</span></button>
            <span>{room.role === 'guest' ? 'Your partner starts the countdown.' : virtualEnabled && (cutoutStatus !== 'ready' || !peerCutoutReady) ? 'Preparing the shared scene on both devices.' : connected ? 'Ready when you are.' : 'Waiting for both cameras.'}</span>
          </div>
          <div className="live-mini-cameras"><div className="live-mini-camera"><div className="live-camera-label">your camera <span>{localReady ? 'on' : 'waiting'}</span></div><div className="live-video-wrap"><video ref={localVideoRef} autoPlay muted playsInline className={mirrorSelfView ? 'live-local-video' : ''} aria-label="Your private selfie preview" />{!localReady && <span className="live-video-placeholder">waking up...</span>}</div></div><div className="live-mini-camera"><div className="live-camera-label">your lovebug <span>{connected && remoteReady ? 'here with you' : 'waiting'}</span></div><div className="live-video-wrap"><video ref={remoteVideoRef} autoPlay muted playsInline aria-label="Your partner's camera thumbnail" onLoadedMetadata={() => setRemoteReady(true)} />{!remoteReady && <span className="live-video-placeholder">waiting...</span>}</div></div></div>
          <label className="together-toggle selfie-flip"><input type="checkbox" checked={mirrorSelfView} onChange={(event: ChangeEvent<HTMLInputElement>) => setMirrorSelfView(event.target.checked)} /> Mirror my little selfie tile (only my tile, not the saved photo)</label>
          {shotCount > 0 && <div className="live-shot-progress" aria-label={`${shotCount} of 4 photos captured`}>{[0,1,2,3].map(index => <span key={index} className={index < shotCount ? 'done' : ''}>{index < shotCount ? '\u2665' : index + 1}</span>)}</div>}
          {shots.length === 4 && <div className="live-finished"><div className="live-finished-preview">{shots.map((item,index) => <img key={index} src={item} alt={`Combined live picture ${index + 1}`} />)}</div><button className="pink-button" onClick={finishPhotos}>decorate our photos &#8599;</button></div>}
          {notice && <p role="alert" className="error-note">{notice}</p>}
          <small className="live-privacy-note">Camera video streams directly between browsers using WebRTC. Supabase only relays connection messages and the countdown. Some networks need a TURN relay; if it fails, switch to Photo Letters.</small>
        </div>
        <div id="live-adjust-panel" className={`paper-card live-controls ${settingsOpen ? 'live-controls-open' : ''}`} ref={settingsPanelRef} role="region" aria-label="Together Apart photo adjustments">
          <div className="live-adjust-heading">
            <div><div className="eyebrow">YOUR LITTLE PHOTO DATE</div><h3><span className="live-adjust-desktop-title">Make this one picture ours</span><span className="live-adjust-mobile-title">Adjust our photo ♡</span></h3><p>Changes appear instantly in your shared photo.</p></div>
            <button type="button" className="live-adjust-close" onClick={() => setSettingsOpen(false)} aria-label="Close photo adjustments">done <span aria-hidden="true">×</span></button>
          </div>
          <div className="live-adjust-mini-preview">
            <div className="live-adjust-mini-frame"><canvas ref={compactPreviewRef} width={220} height={165} role="img" aria-label="Live miniature of your exact shared photo" />{(!connected || !remoteReady || !localReady) && <span>your photo appears here ♡</span>}</div>
            <p>Your little photo, live. Adjust below and watch it change.</p>
          </div>
          <TogetherCompositionControls value={composition} onChange={selectComposition} disabled={room.role !== 'host' || shooting} mineLabel={room.role === 'host' ? 'Your' : "Your lovebug's"} partnerLabel={room.role === 'host' ? "Your lovebug's" : 'Your'} />
          {room.role === 'host' && <div className="live-timer"><span>Countdown per photo</span><div role="group" aria-label="Choose countdown seconds">{[3,5,10].map(value => <button key={value} className={shotTimer === value ? 'active' : ''} aria-pressed={shotTimer === value} disabled={shooting} onClick={() => setShotTimer(value)}>{value}s</button>)}</div></div>}
          <div className="live-adjust-footer"><button className="soft-button" type="button" onClick={() => setSettingsOpen(false)}>done adjusting ♡</button></div>
        </div>
      </div>
    </>}
    {!room && notice && <p role="alert" className="error-note">{notice}</p>}
  </section>;
}
