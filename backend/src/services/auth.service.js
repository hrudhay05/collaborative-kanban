import bcrypt from 'bcrypt';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  createdAt: u.createdAt,
});

export async function registerUser({ name, email, password, organizationName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, 10);

  // If organizationName is given, create the org and make this user its ORG_ADMIN
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name, email, passwordHash } });
    if (organizationName) {
      const org = await tx.organization.create({ data: { name: organizationName } });
      await tx.membership.create({
        data: { userId: u.id, organizationId: org.id, tenantId: null, role: 'ORG_ADMIN' },
      });
    }
    return u;
  });

  return { user: publicUser(user), token: signToken(user.id) };
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  // Same message for unknown email and wrong password, so emails cannot be probed
  if (!ok) throw new AppError(401, 'Invalid email or password');
  return { user: publicUser(user), token: signToken(user.id) };
}

export async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          organization: { select: { id: true, name: true } },
          tenant: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!user) throw new AppError(404, 'User not found');
  return {
    ...publicUser(user),
    memberships: user.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      organization: m.organization,
      tenant: m.tenant,
    })),
  };
}