import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler.js';
import * as orgService from '../services/organization.service.js';
import * as tenantService from '../services/tenant.service.js';

const orgIdParam = z.object({ orgId: z.string().uuid() });
const createOrgBody = z.object({ name: z.string().trim().min(1).max(100) });

export const list = asyncHandler(async (req, res) => {
  res.json({ organizations: await orgService.listOrganizations(req.user.id) });
});

export const create = asyncHandler(async (req, res) => {
  const { name } = createOrgBody.parse(req.body);
  res.status(201).json({ organization: await orgService.createOrganization(req.user.id, name) });
});

export const getOne = asyncHandler(async (req, res) => {
  const { orgId } = orgIdParam.parse(req.params);
  res.json({ organization: await orgService.getOrganization(req.user.id, orgId) });
});

export const listTenants = asyncHandler(async (req, res) => {
  const { orgId } = orgIdParam.parse(req.params);
  res.json({ tenants: await tenantService.listTenantsForOrg(req.user.id, orgId) });
});