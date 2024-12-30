import { Router } from 'express';
import { deleteQueue, inspectAllQueues, inspectQueue, purgeAllQueues, purgeQueue } from '../controller/BullmqController';

const router = Router();

// Define routes

// GET {url}/node/api/bull/queue/inspect/all
router.get('/queue/inspect/all', inspectAllQueues);

// GET {url}/node/api/bull/queue/inspect
router.get('/queue/inspect', inspectQueue);

// POST {url}/node/api/bull/queue/purge
router.post('/queue/purge', purgeQueue);

// POST {url}/node/api/bull/queue/purge/all
router.post('/queue/purge', purgeAllQueues);

// POST {url}/node/api/bull/queue/delete
router.post('/queue/delete', deleteQueue);

export default router;
