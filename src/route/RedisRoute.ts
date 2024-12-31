import { Router } from 'express';
import { deleteRedisCache, getRedisKey, getRedisKeyReportGenerationProgress, inspectAllRedisKeys } from '../controller/RedisController';

const router = Router();

// Define routes

// GET {url}/node/api/redis/inspect/all
router.get('/inspect/all', inspectAllRedisKeys);

// GET {url}/node/api/redis/inspect/key
router.get('/inspect/all', getRedisKey);

// GET {url}/node/api/redis/inspect/reportGenerationProgress
router.get('/inspect/reportGenerationProgress', getRedisKeyReportGenerationProgress);

// POST {url}/node/api/redis/delete
router.post('/delete', deleteRedisCache);


export default router;
