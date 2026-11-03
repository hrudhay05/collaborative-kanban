import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant, requireRole } from '../middleware/tenant.js';
import * as columns from '../controllers/column.controller.js';

const router = Router();
router.use(requireAuth, requireTenant);

router.patch('/:id', requireRole('TENANT_ADMIN'), columns.update);
router.delete('/:id', requireRole('TENANT_ADMIN'), columns.remove);

export default router;