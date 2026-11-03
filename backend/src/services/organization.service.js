import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

// Returns null if the user has no membership in this org, else { isOrgAdmin }.
// An org-level ORG_ADMIN row has tenantId null.
export async function getOrgAccess(userId, organizationId) {
  const rows = await prisma.membership.findMany({
    where: { userId, organizationId },
    select: { role: true, tenantId: true },
  });
  if (rows.length === 0) return null;
  const isOrgAdmin = rows.some((r) => r.tenantId === null && r.role === 'ORG_ADMIN');
  return { isOrgAdmin };
}

export async function requireOrgAccess(userId, organizationId) {
  const access = await getOrgAccess(userId, organizationId);
  if (!access) throw new AppError(403, 'You do not have access to this organization');
  return access;
}

export async function listOrganizations(userId) {
  const rows = await prisma.membership.findMany({
    where: { userId },
    select: {
      organizationId: true,
      tenantId: true,
      role: true,
      organization: { select: { id: true, name: true, createdAt: true } },
    },
  });

  const byOrg = new Map();
  for (const m of rows) {
    const entry = byOrg.get(m.organizationId) || { ...m.organization, isOrgAdmin: false };
    if (m.tenantId === null && m.role === 'ORG_ADMIN') entry.isOrgAdmin = true;
    byOrg.set(m.organizationId, entry);
  }
  return [...byOrg.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createOrganization(userId, name) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name } });
    await tx.membership.create({
      data: { userId, organizationId: org.id, tenantId: null, role: 'ORG_ADMIN' },
    });
    return { id: org.id, name: org.name, createdAt: org.createdAt, isOrgAdmin: true };
  });
}

export async function getOrganization(userId, organizationId) {
  const access = await requireOrgAccess(userId, organizationId);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, createdAt: true },
  });
  return { ...org, isOrgAdmin: access.isOrgAdmin };
}