import prisma from '../config/prisma.js';

export const ROLE_RANK = { MEMBER: 1, TENANT_ADMIN: 2, ORG_ADMIN: 3 };

export const hasRole = (role, minRole) => ROLE_RANK[role] >= ROLE_RANK[minRole];

// Returns { tenant, role } if this user may act inside this tenant, otherwise null.
// userId must come from the verified JWT, never from request input.
export async function resolveTenantAccess(userId, tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, organizationId: true, name: true },
  });
  if (!tenant) return null;

  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      organizationId: tenant.organizationId,
      OR: [{ tenantId: tenant.id }, { tenantId: null }],
    },
    select: { role: true, tenantId: true },
  });

  let best = null;
  for (const m of memberships) {
    // Org-level rows (tenantId null) only count when the role is ORG_ADMIN
    const valid = m.tenantId === tenant.id || (m.tenantId === null && m.role === 'ORG_ADMIN');
    if (valid && (best === null || ROLE_RANK[m.role] > ROLE_RANK[best])) best = m.role;
  }
  if (best === null) return null;

  return { tenant, role: best };
}