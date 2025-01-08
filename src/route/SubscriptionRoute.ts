import { Router } from 'express';
import { activateSubscription, createSubscription, deActivateSubscription, deleteSubscription, extendSubscription, isFeatureSubscriptionActive, pauseSubscription } from '../controller/SubscriptionController';
const router = Router();


// GET {url}/node/api/feature/subscription/active
router.get('/active', isFeatureSubscriptionActive);

// POST {url}/node/api/feature/subscription/create
router.post('/create', createSubscription);

// POST {url}/node/api/feature/subscription/extend
router.post('/extend', extendSubscription);

// POST {url}/node/api/feature/subscription/delete
router.post('/delete', deleteSubscription);

// POST {url}/node/api/feature/subscription/pause
router.post('/pause', pauseSubscription);

// POST {url}/node/api/feature/subscription/deactivate
router.post('/deactivate', deActivateSubscription);

// POST {url}/node/api/feature/subscription/activate
router.post('/activate', activateSubscription);


export default router;