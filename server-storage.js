// server-storage.js - Almacenamiento persistente para Jugadores, Amigos, Invitaciones y Push
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'persistence.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// Asegurar que exista la carpeta data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inicializar claves VAPID para Web Push (persistentes en servidor)
let vapidKeys = { publicKey: '', privateKey: '' };
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };
} else if (fs.existsSync(VAPID_FILE)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
  } catch (e) {
    console.error('Error leyendo vapid.json, regenerando...', e);
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), 'utf8');
  }
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), 'utf8');
}

webpush.setVapidDetails(
  'mailto:contacto@domino-game.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Estructura de base de datos en memoria sincronizada atómicamente a disco
let db = {
  users: {},            // { [playerId]: { id, name, avatar, token, createdAt, lastSeen } }
  friends: [],          // [ { user1, user2, createdAt } ]
  friendRequests: [],   // [ { id, fromId, toId, status: 'pending'|'accepted'|'rejected', createdAt } ]
  invitations: [],      // [ { id, fromId, toId, roomId, status: 'pending'|'accepted'|'rejected'|'expired', createdAt, expiresAt } ]
  pushSubscriptions: {} // { [playerId]: [ subObj ] }
};

function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = {
        users: data.users || {},
        friends: data.friends || [],
        friendRequests: data.friendRequests || [],
        invitations: data.invitations || [],
        pushSubscriptions: data.pushSubscriptions || {}
      };
    } catch (e) {
      console.error('Error al cargar persistence.json:', e);
    }
  }
}

loadDatabase();

function saveDatabase() {
  try {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (e) {
    console.error('Error guardando base de datos persistente:', e);
  }
}

// ----------------- Gestión de Usuarios / Identidad -----------------
function upsertUser(playerId, token, name, avatar) {
  if (playerId && typeof playerId === 'object') {
    const opts = playerId;
    playerId = opts.playerId || opts.id;
    token = opts.token || opts.playerToken;
    name = opts.name || opts.playerName;
    avatar = opts.avatar;
  }
  if (!playerId) return null;
  const now = Date.now();
  if (!db.users[playerId]) {
    db.users[playerId] = {
      id: playerId,
      token: token || ('tok_' + Math.random().toString(36).substring(2, 12)),
      name: name || 'Jugador',
      avatar: avatar || 'avatar1',
      createdAt: now,
      lastSeen: now
    };
  } else {
    // Si ya existe, verificar token si se proporciona
    if (name) db.users[playerId].name = name;
    if (avatar) db.users[playerId].avatar = avatar;
    if (token && !db.users[playerId].token) db.users[playerId].token = token;
    db.users[playerId].lastSeen = now;
  }
  saveDatabase();
  return db.users[playerId];
}

function getUser(playerId) {
  return db.users[playerId] || null;
}

// ----------------- Gestión de Amistades -----------------
function areFriends(idA, idB) {
  if (!idA || !idB || idA === idB) return false;
  return db.friends.some(f =>
    (f.user1 === idA && f.user2 === idB) || (f.user1 === idB && f.user2 === idA)
  );
}

function getFriendsList(playerId) {
  const result = [];
  db.friends.forEach(f => {
    let friendId = null;
    if (f.user1 === playerId) friendId = f.user2;
    else if (f.user2 === playerId) friendId = f.user1;

    if (friendId && db.users[friendId]) {
      const u = db.users[friendId];
      result.push({
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        since: f.createdAt,
        lastSeen: u.lastSeen
      });
    }
  });
  return result;
}

function removeFriend(idA, idB) {
  if (!idA || !idB) return { ok: false, error: 'Identificadores inválidos' };
  const initialLen = db.friends.length;
  db.friends = db.friends.filter(f =>
    !((f.user1 === idA && f.user2 === idB) || (f.user1 === idB && f.user2 === idA))
  );
  if (db.friends.length < initialLen) {
    saveDatabase();
    return { ok: true, removed: true, idA, idB };
  }
  return { ok: false, error: 'No se encontró la amistad' };
}

function sendFriendRequest(fromId, toId) {
  if (!fromId || !toId || fromId === toId) {
    return { ok: false, error: 'No puedes enviarte solicitud a ti mismo' };
  }
  if (!db.users[toId]) {
    return { ok: false, error: 'El jugador de destino no existe' };
  }
  if (areFriends(fromId, toId)) {
    return { ok: false, error: 'Ya son amigos' };
  }

  // Verificar si ya existe solicitud pendiente en esta dirección
  const existing = db.friendRequests.find(r =>
    r.fromId === fromId && r.toId === toId && r.status === 'pending'
  );
  if (existing) {
    return { ok: false, error: 'Ya tienes una solicitud pendiente para este jugador' };
  }

  // Si el otro usuario ya me había enviado solicitud pendiente, aceptarla de inmediato
  const reciprocal = db.friendRequests.find(r =>
    r.fromId === toId && r.toId === fromId && r.status === 'pending'
  );
  if (reciprocal) {
    reciprocal.status = 'accepted';
    reciprocal.acceptedAt = Date.now();
    db.friends.push({ user1: fromId, user2: toId, createdAt: Date.now() });
    saveDatabase();
    return { ok: true, autoAccepted: true, friend: db.users[toId] };
  }

  const req = {
    id: 'freq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    fromId,
    toId,
    status: 'pending',
    createdAt: Date.now()
  };
  db.friendRequests.push(req);
  saveDatabase();
  return { ok: true, request: req };
}

function getPendingRequests(playerId) {
  return db.friendRequests
    .filter(r => r.toId === playerId && r.status === 'pending')
    .map(r => {
      const sender = db.users[r.fromId] || { name: 'Amigo', avatar: 'avatar1' };
      return {
        id: r.id,
        fromId: r.fromId,
        fromName: sender.name,
        fromAvatar: sender.avatar,
        createdAt: r.createdAt
      };
    });
}

function respondFriendRequest(requestId, recipientId, action) {
  const req = db.friendRequests.find(r => r.id === requestId);
  if (!req) {
    return { ok: false, error: 'Solicitud no encontrada' };
  }
  if (req.toId !== recipientId) {
    return { ok: false, error: 'No tienes autorización para responder a esta solicitud' };
  }
  if (req.status !== 'pending') {
    return { ok: false, error: 'Esta solicitud ya fue respondida' };
  }

  if (action === 'accept') {
    req.status = 'accepted';
    req.acceptedAt = Date.now();
    if (!areFriends(req.fromId, req.toId)) {
      db.friends.push({ user1: req.fromId, user2: req.toId, createdAt: Date.now() });
    }
    saveDatabase();
    return {
      ok: true,
      action: 'accepted',
      senderId: req.fromId,
      recipientId: req.toId,
      sender: db.users[req.fromId],
      recipient: db.users[req.toId]
    };
  } else {
    req.status = 'rejected';
    req.rejectedAt = Date.now();
    saveDatabase();
    return { ok: true, action: 'rejected', senderId: req.fromId, recipientId: req.toId };
  }
}

// ----------------- Gestión de Invitaciones a Partida -----------------
function createGameInvitation(fromId, toId, roomId) {
  if (fromId && typeof fromId === 'object') {
    const opts = fromId;
    fromId = opts.fromId;
    toId = opts.toId;
    roomId = opts.roomId;
  }
  if (!fromId || !toId || fromId === toId) {
    return { ok: false, error: 'Datos de invitación inválidos' };
  }
  const now = Date.now();
  // Limpiar invitaciones vencidas
  db.invitations = db.invitations.filter(i => i.expiresAt > now);

  // Comprobar si ya hay una invitación pendiente idéntica reciente
  const existing = db.invitations.find(i =>
    i.fromId === fromId && i.toId === toId && i.roomId === roomId && i.status === 'pending'
  );
  if (existing) {
    return { ok: true, invitation: existing, alreadySent: true };
  }

  const inv = {
    id: 'inv_' + now + '_' + Math.random().toString(36).substring(2, 7),
    fromId,
    toId,
    roomId,
    status: 'pending',
    createdAt: now,
    expiresAt: now + (15 * 60 * 1000) // 15 minutos de vigencia
  };
  db.invitations.push(inv);
  saveDatabase();
  return { ok: true, invitation: inv };
}

function getPendingInvitations(playerId) {
  const now = Date.now();
  return db.invitations
    .filter(i => i.toId === playerId && i.status === 'pending' && i.expiresAt > now)
    .map(i => {
      const sender = db.users[i.fromId] || { name: 'Amigo', avatar: 'avatar1' };
      return {
        id: i.id,
        fromId: i.fromId,
        fromName: sender.name,
        fromAvatar: sender.avatar,
        roomId: i.roomId,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt
      };
    });
}

function respondInvitation(inviteId, playerId, action) {
  const inv = db.invitations.find(i => i.id === inviteId);
  if (!inv) return { ok: false, error: 'Invitación no encontrada' };
  if (inv.toId !== playerId) return { ok: false, error: 'No autorizado' };
  if (inv.expiresAt < Date.now()) {
    inv.status = 'expired';
    saveDatabase();
    return { ok: false, error: 'La invitación ha caducado' };
  }
  if (inv.status !== 'pending') {
    return { ok: false, error: 'La invitación ya fue respondida' };
  }

  inv.status = action === 'accept' ? 'accepted' : 'rejected';
  saveDatabase();
  return { ok: true, status: inv.status, roomId: inv.roomId, fromId: inv.fromId };
}

// ----------------- Web Push Subscriptions -----------------
function savePushSubscription(playerId, subscription) {
  if (!playerId || !subscription || !subscription.endpoint) return;
  if (!db.pushSubscriptions[playerId]) {
    db.pushSubscriptions[playerId] = [];
  }
  // Evitar duplicados del mismo endpoint
  const exists = db.pushSubscriptions[playerId].some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    db.pushSubscriptions[playerId].push(subscription);
    saveDatabase();
  }
}

async function sendPushNotification(playerId, payload) {
  const subs = db.pushSubscriptions[playerId];
  if (!subs || subs.length === 0) return false;

  const toRemove = [];
  let sentAny = false;

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sentAny = true;
    } catch (err) {
      // 404 o 410 indica suscripción expirada o desinstalada
      if (err.statusCode === 404 || err.statusCode === 410) {
        toRemove.push(sub.endpoint);
      } else {
        console.warn(`Error enviando WebPush a ${playerId}:`, err.message || err);
      }
    }
  }

  if (toRemove.length > 0) {
    db.pushSubscriptions[playerId] = subs.filter(s => !toRemove.includes(s.endpoint));
    saveDatabase();
  }
  return sentAny;
}

// ----------------- Persistencia de Salas Activas -----------------
function saveRoomsToDisk(roomsMap) {
  try {
    const serialized = [];
    roomsMap.forEach((room, roomId) => {
      // Guardar salas que estén en juego o esperando con jugadores
      if (room.players && room.players.length > 0) {
        // Clonar quitando timers o referencias circulares
        const safeRoom = {
          ...room,
          cleanupTimer: undefined,
          disconnectTimer: undefined,
          reconnectGraceTimer: undefined
        };
        serialized.push(safeRoom);
      }
    });
    const tmp = ROOMS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(serialized, null, 2), 'utf8');
    fs.renameSync(tmp, ROOMS_FILE);
  } catch (e) {
    console.error('Error guardando salas en disco:', e);
  }
}

function loadRoomsFromDisk() {
  if (fs.existsSync(ROOMS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      console.error('Error cargando salas desde disco:', e);
    }
  }
  return [];
}

module.exports = {
  vapidKeys,
  upsertUser,
  getUser,
  areFriends,
  getFriendsList,
  removeFriend,
  sendFriendRequest,
  getPendingRequests,
  respondFriendRequest,
  createGameInvitation,
  getPendingInvitations,
  respondInvitation,
  savePushSubscription,
  sendPushNotification,
  saveRoomsToDisk,
  loadRoomsFromDisk
};
