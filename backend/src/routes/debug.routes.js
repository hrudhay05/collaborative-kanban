import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant, requireRole } from '../middleware/tenant.js';

// TEMPORARY: used only to test Step 6. Removed once real routes exist.
const router = Router();
router.use(requireAuth, requireTenant);

router.get('/tenant', (req, res) => {
  res.json({ user: req.user.email, tenant: req.tenant.name, role: req.role });
});

router.get('/admin', requireRole('TENANT_ADMIN'), (req, res) => {
  res.json({ user: req.user.email, tenant: req.tenant.name, role: req.role });
});

export default router;