import { Router } from 'express';
import { createFeature } from '../controller/FeatureController';
const router = Router();


// POST {url}/node/api/feature/create
router.post('/create', createFeature);

export default router;