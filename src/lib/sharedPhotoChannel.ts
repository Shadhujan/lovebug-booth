import { isDraftDelta, type DraftDelta } from './sharedDraft';

export type PhotoMessage =
  | { kind: 'photos'; photos: string[] }
  | { kind: 'received' }
  | { kind: 'captured' }
  | { kind: 'choice'; choice: 'shared' | 'solo' }
  | { kind: 'edit'; id: string; delta: DraftDelta };

type Packet = { kind: 'begin'; id: string; length: number } | { kind: 'part'; id: string; value: string } | { kind: 'end'; id: string };
type Incoming = { id: string; length: number; parts: string[]; received: number };
const CHUNK = 12_000;
const MAX_MESSAGE = 24_000_000;

export function isPhotoMessage(value: unknown): value is PhotoMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<PhotoMessage>;
  if (m.kind === 'photos') return Array.isArray(m.photos) && m.photos.length === 4 && m.photos.every(p => typeof p === 'string' && p.length <= 5_000_000 && /^data:image\/jpeg;base64,/.test(p));
  if (m.kind === 'received' || m.kind === 'captured') return true;
  if (m.kind === 'choice') return m.choice === 'shared' || m.choice === 'solo';
  if (m.kind === 'edit') return typeof m.id === 'string' && m.id.length <= 90 && isDraftDelta(m.delta);
  return false;
}

/** Ordered, bounded SCTP transfers. Photos and custom cutout stickers never
 * pass through Supabase Realtime, and neither do shared-editor edits. */
export class SharedPhotoChannel {
  private channel: RTCDataChannel | null = null;
  private incoming: Incoming | null = null;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private events: {
    onOpen: () => void;
    onMessage: (message: PhotoMessage) => void;
    onClose: () => void;
    onError: (message: string) => void;
  }) {}

  attach(channel: RTCDataChannel): void {
    if (this.disposed) { channel.close(); return; }
    this.channel = channel;
    channel.bufferedAmountLowThreshold = 64_000;
    channel.onopen = () => this.events.onOpen();
    channel.onclose = () => { if (channel === this.channel) { this.channel = null; this.incoming = null; this.events.onClose(); } };
    channel.onmessage = event => this.receive(event.data);
    if (channel.readyState === 'open') this.events.onOpen();
  }

  get ready(): boolean { return this.channel?.readyState === 'open'; }
  close(): void {
    this.disposed = true;
    this.incoming = null;
    this.channel?.close();
    this.channel = null;
  }

  send(message: PhotoMessage): Promise<void> {
    if (!isPhotoMessage(message)) return Promise.reject(new Error('Invalid photo session message.'));
    const json = JSON.stringify(message);
    if (json.length > MAX_MESSAGE) return Promise.reject(new Error('Photo session update is too large.'));
    const job = this.queue.catch(() => undefined).then(() => this.transmit(json));
    this.queue = job;
    return job;
  }

  private async drain(channel: RTCDataChannel): Promise<void> {
    if (channel.bufferedAmount < 150_000) return;
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        channel.removeEventListener('bufferedamountlow', low);
        channel.removeEventListener('close', closed);
        if (err) reject(err); else resolve();
      };
      const low = () => finish();
      const closed = () => finish(new Error('Your photo connection closed during transfer.'));
      const timer = setTimeout(() => finish(new Error('Photo transfer timed out. Keep your browsers open and try again.')), 18_000);
      channel.addEventListener('bufferedamountlow', low);
      channel.addEventListener('close', closed);
      if (channel.bufferedAmount < 150_000) finish();
    });
  }

  private async transmit(json: string): Promise<void> {
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open' || this.disposed) throw new Error('Your lovebug is not connected for photo sharing yet.');
    const id = crypto.randomUUID();
    const emit = (data: Packet) => channel.send(JSON.stringify(data));
    emit({ kind: 'begin', id, length: json.length });
    for (let offset = 0; offset < json.length; offset += CHUNK) {
      if (this.disposed || channel.readyState !== 'open' || channel !== this.channel) throw new Error('The photo connection closed.');
      await this.drain(channel);
      emit({ kind: 'part', id, value: json.slice(offset, offset + CHUNK) });
    }
    emit({ kind: 'end', id });
  }

  private receive(raw: unknown): void {
    if (this.disposed || typeof raw !== 'string' || raw.length > CHUNK + 250) return;
    let packet: Partial<Packet>;
    try { packet = JSON.parse(raw) as Partial<Packet>; } catch { return; }
    if (typeof packet.id !== 'string' || packet.id.length > 90) return;
    if (packet.kind === 'begin') {
      if (typeof packet.length !== 'number' || !Number.isSafeInteger(packet.length) || packet.length < 10 || packet.length > MAX_MESSAGE) return;
      this.incoming = { id: packet.id, length: packet.length, parts: [], received: 0 };
    } else if (packet.kind === 'part') {
      const current = this.incoming;
      if (!current || current.id !== packet.id || typeof packet.value !== 'string' || packet.value.length > CHUNK || current.received + packet.value.length > current.length) { this.incoming = null; return; }
      current.parts.push(packet.value); current.received += packet.value.length;
    } else if (packet.kind === 'end') {
      const current = this.incoming;
      this.incoming = null;
      if (!current || current.id !== packet.id || current.received !== current.length) return;
      try {
        const message: unknown = JSON.parse(current.parts.join(''));
        if (isPhotoMessage(message)) this.events.onMessage(message);
        else this.events.onError('Your lovebug sent an unsupported photo update.');
      } catch { this.events.onError('Could not read the shared photo update.'); }
    }
  }
}
