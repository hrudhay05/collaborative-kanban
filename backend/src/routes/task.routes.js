import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant, requireRole } from '../middleware/tenant.js';
import * as tasks from '../controllers/task.controller.js';

const router = Router();
router.use(requireAuth, requireTenant);

router.get('/', tasks.list);
router.post('/', tasks.create);
router.get('/:id', tasks.getOne);
router.get('/:id/activity', tasks.activity);
router.patch('/:id', tasks.update);
router.patch('/:id/move', tasks.move);
router.delete('/:id', requireRole('TENANT_ADMIN'), tasks.remove);

export default router;