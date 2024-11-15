import { Router } from 'express';
import { createAppConfig, deleteAppConfig, deleteAppConfigCache, fetchAppConfig, fetchAppConfig2, getAppConfigCache, updateAppConfig } from '../controller/AppConfigController';

const router = Router();

// Define routes

// POST {url}/node/api/appconfig/create
router.post('/create', createAppConfig);

// POST {url}/node/api/appconfig/search
router.post('/search', fetchAppConfig);

// GET {url}/node/api/appconfig/search
router.get('/search', fetchAppConfig2);

// POST {url}/node/api/appconfig/update
router.post('/update', updateAppConfig);

// POST {url}/node/api/appconfig/delete
router.post('/delete', deleteAppConfig);

// GET {url}/node/api/appconfig/delete/cache
router.get('/delete/cache', deleteAppConfigCache);

// GET {url}/node/api/appconfig/cache
router.get('/cache', getAppConfigCache);

export default router;
