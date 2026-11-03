import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { resolveTenantAccess, hasRole } from '../services/access.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Must run after requireAuth. Sets req.tenant and req.role.
export const requireTenant = asyncHandler(async (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new AppError(400, 'X-Tenant-Id header must be a valid UUID');
  }

  const access = await resolveTenantAccess(req.user.id, tenantId);
  // Same answer for "does not exist" and "not yours", so IDs cannot be probed
  if (!access) throw new AppError(403, 'You do not have access to this tenant');

  req.tenant = access.tenant;
  req.role = access.role;
  next();
});

// Hierarchy: requireRole('TENANT_ADMIN') allows TENANT_ADMIN and ORG_ADMIN
export const requireRole = (minRole) => (req, res, next) => {
  if (!req.role || !hasRole(req.role, minRole)) {
    return next(new AppError(403, `Requires ${minRole} role or higher`));
  }
  next();
};