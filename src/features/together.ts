import type { Block, Doc, MediaItem } from '../core/model';
import type { EditorStore } from '../editor/store';
import { pack, unpack } from './share';

// Two or more copies of the app talk directly to each other. Codes are swapped by any
// messenger; after that, changes flow between the devices without a server in between.
const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

type Msg =
  | { t: 'hello'; name: string }
  | { t: 'full'; doc: Omit<Doc, 'media' | 'preserved'>; media: Record<string, { mime: string; data: string }> }
  | { t: 'blocks'; blocks: Block[]; media: Record<string, { mime: string; data: string }> }
  | { t: 'where'; name: string; para: string };

export interface Peer { id: number; name: string; para?: string; channel: RTCDataChannel; pc: RTCPeerConnection }

const enc = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const dec = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const waitIce = (pc: RTCPeerConnection): Promise<void> => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') { resolve(); return; }
  const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
  pc.addEventListener('icegatheringstatechange', done);
  window.setTimeout(resolve, 4000);
});

export class Together {
  peers: Peer[] = [];
  private seq = 0;
  private sentMedia = new Set<string>();
  private synced = new Map<string, Block>();
  private lastDoc: Doc | null = null;
  private timer = 0;
  private pendingHost: RTCPeerConnection | null = null;
  private applying = false;
  host = false;

  constructor(private store: EditorStore, private changed: () => void) {
    store.subscribe(() => {
      if (this.applying || !this.peers.length || store.doc === this.lastDoc) return;
      this.lastDoc = store.doc;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.sendBlocks(), 120);
    });
    store.subscribe(() => { if (this.peers.length) this.broadcast({ t: 'where', name: store.author, para: store.sel.focus.para }); });
  }

  // Step 1 on the first device: make an invitation code.
  async invite(): Promise<string> {
    const pc = new RTCPeerConnection(ICE);
    const channel = pc.createDataChannel('doc');
    this.wire(pc, channel);
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    this.pendingHost = pc;
    this.host = true;
    return pack(pc.localDescription);
  }

  // Step 2 on the other device: answer the invitation.
  async answer(code: string): Promise<string> {
    const pc = new RTCPeerConnection(ICE);
    pc.ondatachannel = (e) => this.wire(pc, e.channel);
    await pc.setRemoteDescription(unpack<RTCSessionDescriptionInit>(code));
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    return pack(pc.localDescription);
  }

  // Step 3 on the first device: finish with the reply code.
  async accept(code: string): Promise<void> {
    if (!this.pendingHost) throw new Error('Make an invitation first.');
    await this.pendingHost.setRemoteDescription(unpack<RTCSessionDescriptionInit>(code));
    this.pendingHost = null;
  }

  leave(): void {
    for (const p of this.peers) { p.channel.close(); p.pc.close(); }
    this.peers = [];
    this.changed();
  }

  private wire(pc: RTCPeerConnection, channel: RTCDataChannel): void {
    const peer: Peer = { id: ++this.seq, name: 'Guest', channel, pc };
    channel.onopen = () => {
      this.peers.push(peer);
      this.send(peer, { t: 'hello', name: this.store.author });
      if (this.host) this.sendFull(peer);
      this.changed();
    };
    channel.onclose = () => { this.peers = this.peers.filter((p) => p !== peer); this.changed(); };
    channel.onmessage = (e) => { try { this.receive(peer, JSON.parse(String(e.data)) as Msg); } catch { /* ignore a malformed message */ } };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { this.peers = this.peers.filter((p) => p !== peer); this.changed(); } };
  }

  private send(p: Peer, m: Msg): void { if (p.channel.readyState === 'open') p.channel.send(JSON.stringify(m)); }
  private broadcast(m: Msg): void { for (const p of this.peers) this.send(p, m); }

  private newMedia(all = false): Record<string, { mime: string; data: string }> {
    const out: Record<string, { mime: string; data: string }> = {};
    for (const [k, v] of Object.entries(this.store.doc.media)) {
      if (!all && this.sentMedia.has(k)) continue;
      this.sentMedia.add(k);
      out[k] = { mime: v.mime, data: enc(v.data) };
    }
    return out;
  }

  private sendFull(p: Peer): void {
    const { media: _m, preserved: _p, ...doc } = this.store.doc;
    this.remember(this.store.doc.blocks);
    this.send(p, { t: 'full', doc, media: this.newMedia(true) });
  }

  private sendBlocks(): void {
    this.remember(this.store.doc.blocks);
    this.broadcast({ t: 'blocks', blocks: this.store.doc.blocks, media: this.newMedia() });
  }

  private remember(blocks: Block[]): void {
    this.synced = new Map(blocks.map((b) => [b.id, b]));
  }

  private media(m: Record<string, { mime: string; data: string }>): Record<string, MediaItem> {
    const out: Record<string, MediaItem> = { ...this.store.doc.media };
    for (const [k, v] of Object.entries(m)) { out[k] = { mime: v.mime, data: dec(v.data) }; this.sentMedia.add(k); }
    return out;
  }

  private receive(peer: Peer, m: Msg): void {
    if (m.t === 'hello') { peer.name = String(m.name).slice(0, 60); this.changed(); return; }
    if (m.t === 'where') { peer.para = m.para; this.changed(); return; }
    this.applying = true;
    try {
      if (m.t === 'full') {
        const doc = { ...m.doc, media: this.media(m.media) } as Doc;
        this.remember(doc.blocks);
        this.store.load(doc, { name: this.store.file.name, dirty: true });
      } else {
        // A block keeps the other device's version unless it was changed here since the last exchange.
        const local = new Map(this.store.doc.blocks.map((b) => [b.id, b]));
        const merged: Block[] = [];
        const used = new Set<string>();
        for (const b of m.blocks) {
          const mine = local.get(b.id);
          merged.push(mine && mine !== this.synced.get(b.id) ? mine : b);
          used.add(b.id);
        }
        this.store.doc.blocks.forEach((b, i) => { if (!used.has(b.id) && !this.synced.has(b.id)) merged.splice(Math.min(i, merged.length), 0, b); });
        const doc = { ...this.store.doc, blocks: merged.length ? merged : this.store.doc.blocks, media: this.media(m.media) };
        this.remember(m.blocks);
        this.store.commit({ doc, sel: this.store.sel });
      }
      if (this.host) for (const p of this.peers) if (p !== peer) this.send(p, m);
    } finally {
      this.applying = false;
      this.lastDoc = this.store.doc;
    }
  }
}
