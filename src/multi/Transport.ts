import { RoomEvents, SendQueue, type Context } from '@needle-tools/engine';
import type { NetMsg } from '../logic/net';
import { electHost } from '../logic/net';

/**
 * Transport-Abstraktion: offline (nur lokal) oder Needle-Raum (JSON-Broadcast).
 * Der Driver sieht nur: eigene ID, Host-ID, Peers, send/onMessage.
 */
export interface NetTransport {
  readonly id: string;
  readonly hostId: string;
  readonly online: boolean;
  readonly peers: readonly string[];
  readonly roomName: string | null;
  send(msg: NetMsg): void;
  onMessage?: (msg: NetMsg, from: string | null) => void;
  /** Host-Wechsel oder Peer-Liste geändert. */
  onPeersChanged?: (peers: readonly string[], hostId: string) => void;
  onPeerLeft?: (id: string) => void;
  dispose(): void;
}

/** Offline: niemand sonst, lokaler Spieler ist Host. */
export class LocalTransport implements NetTransport {
  readonly id = 'local';
  readonly online = false;
  readonly peers: readonly string[] = [];
  readonly roomName = null;
  onMessage?: (msg: NetMsg, from: string | null) => void;
  onPeersChanged?: (peers: readonly string[], hostId: string) => void;
  onPeerLeft?: (id: string) => void;
  get hostId(): string { return this.id; }
  send(): void { /* keine Peers */ }
  dispose(): void { /* nichts */ }
}

const KEY = 'csw16';

/**
 * Needle-Raum: `context.connection` (öffentlicher Needle-Backend-Server), ein
 * Nachrichten-Key, Host = kleinste Verbindungs-ID. Nachrichten werden
 * vom Engine-Puffer pro Frame gebündelt versendet.
 */
export class NeedleTransport implements NetTransport {
  readonly online = true;
  onMessage?: (msg: NetMsg, from: string | null) => void;
  onPeersChanged?: (peers: readonly string[], hostId: string) => void;
  onPeerLeft?: (id: string) => void;
  private _peers: string[] = [];
  private _host = '';
  private readonly unsubs: (() => void)[] = [];

  constructor(private readonly context: Context, readonly roomName: string) {
    const c = context.connection;
    this.unsubs.push(c.beginListen(KEY, (data: NetMsg) => this.onMessage?.(data, null)));
    this.unsubs.push(c.beginListen(RoomEvents.JoinedRoom, () => this.refresh()));
    this.unsubs.push(c.beginListen(RoomEvents.UserJoinedRoom, () => this.refresh()));
    this.unsubs.push(c.beginListen(RoomEvents.UserLeftRoom, (evt: { userId: string }) => {
      this.onPeerLeft?.(evt.userId);
      this.refresh();
    }));
    c.joinRoom(roomName);
  }

  get id(): string {
    return this.context.connection.connectionId ?? '';
  }

  get hostId(): string {
    return this._host || this.id;
  }

  get peers(): readonly string[] {
    return this._peers;
  }

  get connected(): boolean {
    return this.context.connection.isInRoom;
  }

  private refresh(): void {
    const all = this.context.connection.usersInRoom();
    const me = this.id;
    const ids = all.includes(me) ? [...all] : [...all, me];
    this._peers = ids.filter((x) => x !== me);
    const host = electHost(ids) ?? me;
    const changed = host !== this._host;
    this._host = host;
    this.onPeersChanged?.(this._peers, host);
    void changed;
  }

  send(msg: NetMsg): void {
    const c = this.context.connection;
    if (!c.isInRoom) return;
    // Posen/Snapshots sofort (ungepuffert) senden, Rest über den Frame-Puffer
    const urgent = msg.t === 'pose' || msg.t === 'poses' || msg.t === 'snap';
    c.send(KEY, msg, urgent ? SendQueue.Immediate : SendQueue.Queued);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    try {
      this.context.connection.leaveRoom();
    } catch { /* egal */ }
  }
}
