import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { resolveTenantAccess, hasRole } from './access.service.js';
import { requireOrgAccess } from './organization.service.js';

const shape = (t, role) => ({
  id: t.id,
  organizationId: t.organizationId,
  name: t.name,
  createdAt: t.createdAt,
  ...(t.organization ? { organization: t.organization } : {}),
  role,
});

// Tenants of one org that this user may see
export async function listTenantsForOrg(userId, organizationId) {
  const access = await requireOrgAccess(userId, organizationId);
  const tenants = await prisma.tenant.findMany({
    where: access.isOrgAdmin
      ? { organizationId }
      : { organizationId, memberships: { some: { userId } } },
    include: { memberships: { where: { userId }, select: { role: true } } },
    orderBy: { name: 'asc' },
  });
  return tenants.map((t) => shape(t, access.isOrgAdmin ? 'ORG_ADMIN' : t.memberships[0]?.role));
}

// Every tenant this user may access across all orgs (for the tenant switcher)
export async function listAccessibleTenants(userId) {
  const mems = await prisma.membership.findMany({
    where: { userId },
    select: { organizationId: true, tenantId: true, role: true },
  });
  const adminOrgIds = [
    ...new Set(
      mems.filter((m) => m.tenantId === null && m.role === 'ORG_ADMIN').map((m) => m.organizationId)
    ),
  ];
  const directIds = mems.filter((m) => m.tenantId !== null).map((m) => m.tenantId);

  const tenants = await prisma.tenant.findMany({
    where: { OR: [{ organizationId: { in: adminOrgIds } }, { id: { in: directIds } }] },
    include: {
      organization: { select: { id: true, name: true } },
      memberships: { where: { userId }, select: { role: true } },
    },
    orderBy: [{ organization: { name: 'asc' } }, { name: 'asc' }],
  });
  return tenants.map((t) =>
    shape(t, adminOrgIds.includes(t.organizationId) ? 'ORG_ADMIN' : t.memberships[0]?.role)
  );
}

export async function createTenant(userId, organizationId, name) {
  const access = await requireOrgAccess(userId, organizationId);
  if (!access.isOrgAdmin) throw new AppError(403, 'Only an org admin can create tenants');
  const tenant = await prisma.tenant.create({ data: { organizationId, name } });
  return shape(tenant, 'ORG_ADMIN');
}

export async function updateTenant(userId, tenantId, name) {
  const access = await resolveTenantAccess(userId, tenantId);
  if (!access) throw new AppError(403, 'You do not have access to this tenant');
  if (!hasRole(access.role, 'ORG_ADMIN')) {
    throw new AppError(403, 'Only an org admin can rename tenants');
  }
  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { name } });
  return shape(tenant, 'ORG_ADMIN');
}