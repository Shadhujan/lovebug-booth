import { CUSTOM_BACKGROUND_CHUNK, CUSTOM_BACKGROUND_ID, MAX_CUSTOM_BACKGROUND_CHARS, getCustomBackground, registerCustomBackground } from './customBackdrop';

type WireMessage = { kind: 'request' | 'ready' | 'begin' | 'part' | 'end'; id: string; length?: number; value?: string };

type Incoming = { id: string; length: number; parts: string[]; received: number };

/**
 * Temporary peer-to-peer transport for a single resized background image.
 * 12 KB ordered chunks avoid oversized SCTP messages on mobile browsers.
 * Nothing is written to Supabase; the data channel uses the room's WebRTC call.
 */
export class BackgroundChannel {
  private channel: RTCDataChannel | null = null;
  private incoming: Incoming | null = null;
  private sending = false;
  private queuedId: string | null = null;
  private disposed = false;

  constructor(private events: {
    onOpen: () => void;
    onReady: (id: string) => void;
    onBackground: (id: string) => void;
    onError: (message: string) => void;
  }) {}

  attach(channel: RTCDataChannel): void {
    if (this.disposed) { channel.close(); return; }
    this.channel = channel;
    channel.bufferedAmountLowThreshold = 64 * 1024;
    channel.onopen = () => this.events.onOpen();
    channel.onmessage = event => { void this.receive(event.data); };
    channel.onclose = () => { if (this.channel === channel) this.channel = null; };
    if (channel.readyState === 'open') this.events.onOpen();
  }

  get ready(): boolean { return this.channel?.readyState === 'open'; }

  close(): void {
    this.disposed = true;
    this.incoming = null;
    this.queuedId = null;
    this.channel?.close();
    this.channel = null;
  }

  private emit(message: WireMessage): boolean {
    if (!this.ready) return false;
    try { this.channel!.send(JSON.stringify(message)); return true; }
    catch { return false; }
  }

  request(id: string): void { if (CUSTOM_BACKGROUND_ID.test(id)) this.emit({ kind: 'request', id }); }
  acknowledge(id: string): void { if (CUSTOM_BACKGROUND_ID.test(id)) this.emit({ kind: 'ready', id }); }

  sendBackground(id: string): void {
    if (!CUSTOM_BACKGROUND_ID.test(id) || !getCustomBackground(id) || !this.ready) return;
    if (this.sending) { this.queuedId = id; return; }
    void this.transmit(id);
  }

  private async drain(channel: RTCDataChannel): Promise<void> {
    if (channel.bufferedAmount <= 160 * 1024) return;
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        channel.removeEventListener('bufferedamountlow', low);
        channel.removeEventListener('close', closed);
        if (error) reject(error);
        else resolve();
      };
      const low = () => finish();
      const closed = () => finish(new Error('Your lovebug disconnected before receiving the background.'));
      const timeout = setTimeout(() => finish(new Error('Background transfer timed out. Try uploading it again.')), 12_000);
      channel.addEventListener('bufferedamountlow', low);
      channel.addEventListener('close', closed);
      if (channel.bufferedAmount <= 160 * 1024) finish();
    });
  }

  private async transmit(id: string): Promise<void> {
    const asset = getCustomBackground(id);
    const channel = this.channel;
    if (!asset || !channel || channel.readyState !== 'open') return;
    this.sending = true;
    try {
      if (!this.emit({ kind: 'begin', id, length: asset.dataUrl.length })) throw new Error('The background connection is not ready.');
      for (let offset = 0; offset < asset.dataUrl.length; offset += CUSTOM_BACKGROUND_CHUNK) {
        if (this.disposed || channel !== this.channel || channel.readyState !== 'open') return;
        await this.drain(channel);
        this.emit({ kind: 'part', id, value: asset.dataUrl.slice(offset, offset + CUSTOM_BACKGROUND_CHUNK) });
      }
      this.emit({ kind: 'end', id });
    } catch (reason) {
      this.events.onError(reason instanceof Error ? reason.message : 'Could not share the background.');
    } finally {
      this.sending = false;
      const pending = this.queuedId;
      this.queuedId = null;
      if (pending && pending !== id) this.sendBackground(pending);
    }
  }

  private async receive(raw: unknown): Promise<void> {
    if (this.disposed || typeof raw !== 'string' || raw.length > CUSTOM_BACKGROUND_CHUNK + 200) return;
    let message: Partial<WireMessage>;
    try { message = JSON.parse(raw) as Partial<WireMessage>; }
    catch { return; }
    const id = message.id;
    if (typeof id !== 'string' || !CUSTOM_BACKGROUND_ID.test(id)) return;
    switch (message.kind) {
      case 'request': this.sendBackground(id); return;
      case 'ready': this.events.onReady(id); return;
      case 'begin': {
        const length = message.length;
        if (typeof length !== 'number' || !Number.isInteger(length) || length < 40 || length > MAX_CUSTOM_BACKGROUND_CHARS) return;
        this.incoming = { id, length, parts: [], received: 0 };
        return;
      }
      case 'part': {
        const data = message.value;
        const current = this.incoming;
        if (!current || current.id !== id || typeof data !== 'string' || data.length > CUSTOM_BACKGROUND_CHUNK
          || current.received + data.length > current.length) { this.incoming = null; return; }
        current.parts.push(data);
        current.received += data.length;
        return;
      }
      case 'end': {
        const current = this.incoming;
        this.incoming = null;
        if (!current || current.id !== id || current.received !== current.length) return;
        try {
          await registerCustomBackground(id, current.parts.join(''));
          if (this.disposed) return;
          this.acknowledge(id);
          this.events.onBackground(id);
        } catch {
          this.events.onError('Your lovebug’s background could not be opened. Ask them to upload it again.');
        }
      }
    }
  }
}
