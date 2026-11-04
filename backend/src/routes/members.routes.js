import { Router } from 'express';
import * as authMw from '../middleware/auth.js';
import * as tenantMw from '../middleware/tenant.js';
import * as controller from '../controllers/members.controller.js';

const requireAuth = authMw.requireAuth ?? authMw.default;
const requireTenant = tenantMw.requireTenant ?? tenantMw.default;

const router = Router();
router.get('/', requireAuth, requireTenant, controller.list);

export default router;