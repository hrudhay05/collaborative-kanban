import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { list, create, getOne, listTenants } from '../controllers/organization.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.get('/:orgId', getOne);
router.get('/:orgId/tenants', listTenants);

export default router;