// tenantId -> Map<userId, { user, sockets: Set<socketId> }>
const online = new Map();
const room = (tenantId) => `tenant:${tenantId}`;

export function list(tenantId) {
  const t = online.get(tenantId);
  return t ? [...t.values()].map((e) => e.user) : [];
}

export function add(io, tenantId, socketId, user) {
  let t = online.get(tenantId);
  if (!t) online.set(tenantId, (t = new Map()));

  let entry = t.get(user.id);
  const isFirstTab = !entry;
  if (!entry) t.set(user.id, (entry = { user, sockets: new Set() }));
  entry.sockets.add(socketId);

  if (isFirstTab) {
    io.to(room(tenantId)).emit('presence:online', { tenantId, user });
    io.to(room(tenantId)).emit('presence:update', { tenantId, users: list(tenantId) });
  }
}

export function remove(io, tenantId, socketId, userId) {
  const t = online.get(tenantId);
  const entry = t?.get(userId);
  if (!entry) return;

  entry.sockets.delete(socketId);
  if (entry.sockets.size > 0) return;

  t.delete(userId);
  if (t.size === 0) online.delete(tenantId);

  io.to(room(tenantId)).emit('presence:offline', { tenantId, user: entry.user });
  io.to(room(tenantId)).emit('presence:update', { tenantId, users: list(tenantId) });
}