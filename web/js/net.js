'use strict';
// Networking transports for room-code multiplayer.
//
// PeerNet  — WebRTC via PeerJS (free public broker). Host claims the peer id
//            derived from the room code; guests connect to it. Production.
// LocalNet — BroadcastChannel same-origin transport with identical API.
//            Lets the whole multiplayer stack run in automated tests
//            (two tabs in one browser) with zero external services.
//
// API (both):
//   net = await hostRoom(code, {onPeerJoin(id), onPeerLeave(id), onMessage(id, msg)})
//   net = await joinRoom(code, {onMessage(id, msg), onClosed()})
//   net.send(id, msg) / net.broadcast(msg) / net.close()
// Messages are structured-cloneable objects.

const PREFIX = 'zooworld2-';

export function makeRoomCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[(Math.random() * abc.length) | 0];
  return s;
}

// ── PeerJS transport ─────────────────────────────────────────
function peerId(code, guest) {
  return PREFIX + code.toUpperCase() + (guest ? '-' + Math.random().toString(36).slice(2, 8) : '');
}

export function hostRoomPeer(code, cb) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(peerId(code, false));
    const conns = new Map();
    peer.on('open', () => resolve({
      kind: 'peer', code,
      send: (id, msg) => conns.get(id)?.send(msg),
      broadcast: (msg) => { for (const c of conns.values()) c.send(msg); },
      close: () => peer.destroy(),
      peers: () => [...conns.keys()],
    }));
    peer.on('connection', (conn) => {
      conn.on('open', () => { conns.set(conn.peer, conn); cb.onPeerJoin?.(conn.peer); });
      conn.on('data', (msg) => cb.onMessage?.(conn.peer, msg));
      conn.on('close', () => { conns.delete(conn.peer); cb.onPeerLeave?.(conn.peer); });
    });
    peer.on('error', (e) => reject(e));
  });
}

export function joinRoomPeer(code, cb) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(peerId(code, true));
    peer.on('open', () => {
      const conn = peer.connect(peerId(code, false), { reliable: true });
      const timeout = setTimeout(() => reject(new Error('Could not find that room')), 12000);
      conn.on('open', () => {
        clearTimeout(timeout);
        resolve({
          kind: 'peer', code,
          send: (_id, msg) => conn.send(msg),
          broadcast: (msg) => conn.send(msg),
          close: () => peer.destroy(),
        });
      });
      conn.on('data', (msg) => cb.onMessage?.('host', msg));
      conn.on('close', () => cb.onClosed?.());
      conn.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });
    peer.on('error', (e) => reject(e));
  });
}

// ── BroadcastChannel transport (tests / same-device tabs) ────
export function hostRoomLocal(code, cb) {
  const ch = new BroadcastChannel(PREFIX + code);
  const known = new Set();
  ch.onmessage = (ev) => {
    const { from, to, msg } = ev.data;
    if (to !== 'host' || !from) return;
    if (msg.t === '__hello__') { if (!known.has(from)) { known.add(from); cb.onPeerJoin?.(from); } return; }
    if (msg.t === '__bye__') { known.delete(from); cb.onPeerLeave?.(from); return; }
    cb.onMessage?.(from, msg);
  };
  return Promise.resolve({
    kind: 'local', code,
    send: (id, msg) => ch.postMessage({ from: 'host', to: id, msg }),
    broadcast: (msg) => { for (const id of known) ch.postMessage({ from: 'host', to: id, msg }); },
    close: () => ch.close(),
    peers: () => [...known],
  });
}

export function joinRoomLocal(code, cb) {
  const ch = new BroadcastChannel(PREFIX + code);
  const myId = 'local-' + Math.random().toString(36).slice(2, 8);
  ch.onmessage = (ev) => {
    const { from, to, msg } = ev.data;
    if (from === 'host' && to === myId) cb.onMessage?.('host', msg);
  };
  ch.postMessage({ from: myId, to: 'host', msg: { t: '__hello__' } });
  return Promise.resolve({
    kind: 'local', code, id: myId,
    send: (_id, msg) => ch.postMessage({ from: myId, to: 'host', msg }),
    broadcast: (msg) => ch.postMessage({ from: myId, to: 'host', msg }),
    close: () => { ch.postMessage({ from: myId, to: 'host', msg: { t: '__bye__' } }); ch.close(); },
  });
}

export function hostRoom(code, cb, local = false) {
  return local ? hostRoomLocal(code, cb) : hostRoomPeer(code, cb);
}
export function joinRoom(code, cb, local = false) {
  return local ? joinRoomLocal(code, cb) : joinRoomPeer(code, cb);
}
