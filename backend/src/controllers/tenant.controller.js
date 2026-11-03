import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler.js';
import * as tenantService from '../services/tenant.service.js';

const name = z.string().trim().min(1).max(100);
const idParam = z.object({ id: z.string().uuid() });
const createBody = z.object({ organizationId: z.string().uuid(), name });
const updateBody = z.object({ name });

export const list = asyncHandler(async (req, res) => {
  res.json({ tenants: await tenantService.listAccessibleTenants(req.user.id) });
});

export const create = asyncHandler(async (req, res) => {
  const data = createBody.parse(req.body);
  const tenant = await tenantService.createTenant(req.user.id, data.organizationId, data.name);
  res.status(201).json({ tenant });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = updateBody.parse(req.body);
  res.json({ tenant: await tenantService.updateTenant(req.user.id, id, data.name) });
});