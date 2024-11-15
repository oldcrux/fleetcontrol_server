import { Router } from 'express';
import { deleteRedisCache, inspectAllRedisKeys } from '../controller/RedisController';

const router = Router();

// Define routes

// GET {url}/node/api/redis/inspect/all
router.get('/inspect/all', inspectAllRedisKeys);

// POST {url}/node/api/redis/delete
router.post('/delete', deleteRedisCache);


export default router;
