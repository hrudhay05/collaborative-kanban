import asyncHandler from '../utils/asyncHandler.js';
import * as membersService from '../services/members.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json({ members: await membersService.listTenantMembers(req.tenant) });
});