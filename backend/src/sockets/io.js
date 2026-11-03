let io = null;

export function setIO(instance) {
  io = instance;
}

export function emitToTenant(tenantId, event, payload) {
  if (io) io.to(`tenant:${tenantId}`).emit(event, payload);
}