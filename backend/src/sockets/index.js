import { Server } from 'socket.io';
import { z } from 'zod';
import { verifyToken } from '../utils/jwt.js';
import { resolveTenantAccess } from '../services/access.service.js';
import * as prismaModule from '../config/prisma.js';
import { setIO } from './io.js';
import * as presence from './presence.js';

// works whether config/prisma.js uses a default or a named "prisma" export
const prisma = prismaModule.default ?? prismaModule.prisma;

const tenantPayload = z.object({ tenantId: z.string().uuid() });
const room = (tenantId) => `tenant:${tenantId}`;

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
  });
  setIO(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true },
      });
      if (!user) return next(new Error('Unauthorized'));
      socket.data.user = user;
      socket.data.tenants = new Set();
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;

    socket.on('tenant:join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const { tenantId } = tenantPayload.parse(payload);
        const access = await resolveTenantAccess(user.id, tenantId);
        if (!access) return reply({ ok: false, error: 'Forbidden' });

        if (!socket.data.tenants.has(tenantId)) {
          socket.join(room(tenantId));
          socket.data.tenants.add(tenantId);
          presence.add(io, tenantId, socket.id, user);
        }
        reply({ ok: true, tenantId, role: access.role, online: presence.list(tenantId) });
      } catch {
        reply({ ok: false, error: 'Invalid request' });
      }
    });

    socket.on('tenant:leave', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const parsed = tenantPayload.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: 'Invalid request' });
      const { tenantId } = parsed.data;
      if (socket.data.tenants.delete(tenantId)) {
        socket.leave(room(tenantId));
        presence.remove(io, tenantId, socket.id, user.id);
      }
      reply({ ok: true });
    });

    socket.on('disconnect', () => {
      for (const tenantId of socket.data.tenants) {
        presence.remove(io, tenantId, socket.id, user.id);
      }
    });
  });

  return io;
}