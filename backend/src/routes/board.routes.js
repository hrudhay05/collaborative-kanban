import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant, requireRole } from '../middleware/tenant.js';
import * as boards from '../controllers/board.controller.js';
import * as columns from '../controllers/column.controller.js';

const router = Router();
router.use(requireAuth, requireTenant);

router.get('/', boards.list);
router.post('/', requireRole('TENANT_ADMIN'), boards.create);
router.get('/:id', boards.getOne);
router.patch('/:id', requireRole('TENANT_ADMIN'), boards.update);
router.delete('/:id', requireRole('TENANT_ADMIN'), boards.remove);

router.get('/:id/columns', columns.list);
router.post('/:id/columns', requireRole('TENANT_ADMIN'), columns.create);

export default router;