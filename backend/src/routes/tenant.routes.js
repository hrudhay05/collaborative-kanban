import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { list, create, update } from '../controllers/tenant.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.patch('/:id', update);

export default router;