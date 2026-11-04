import * as prismaModule from '../config/prisma.js';

const prisma = prismaModule.default ?? prismaModule.prisma;
const RANK = { MEMBER: 1, TENANT_ADMIN: 2, ORG_ADMIN: 3 };

export async function listTenantMembers(tenant) {
  const rows = await prisma.membership.findMany({
    where: {
      organizationId: tenant.organizationId,
      OR: [{ tenantId: tenant.id }, { tenantId: null }],
    },
    select: { role: true, user: { select: { id: true, name: true } } },
  });

  const best = new Map();
  for (const r of rows) {
    const cur = best.get(r.user.id);
    if (!cur || RANK[r.role] > RANK[cur.role]) {
      best.set(r.user.id, { id: r.user.id, name: r.user.name, role: r.role });
    }
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
}