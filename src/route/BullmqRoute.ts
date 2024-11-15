import { Router } from 'express';
import { deleteQueue, inspectMultipleQueues, inspectQueue, purgeQueue } from '../controller/BullmqController';

const router = Router();

// Define routes

// GET {url}/node/api/bull/queue/inspect/all
router.get('/queue/inspect/all', inspectMultipleQueues);

// GET {url}/node/api/bull/queue/inspect
router.get('/queue/inspect', inspectQueue);

// POST {url}/node/api/bull/queue/purge
router.post('/queue/purge', purgeQueue);

// POST {url}/node/api/bull/queue/delete
router.post('/queue/delete', deleteQueue);

export default router;
