import { Router } from 'express';
import { setLogLevel } from '../util/Logger';

const router = Router();

// GET {url}/api/logger/admin/level/debug
router.get('/level/:level', setLogLevel);

export default router;