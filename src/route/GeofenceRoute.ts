import { Router } from 'express';
import { createGeofence, deleteGeofenceLocationById, deleteGeofenceLocationByTag, fetchDistinctGeofenceGroups, fetchGeofence, searchGeofence, updateGeofence } from '../controller/GeofenceController';

const router = Router();

// Define routes

// POST {url}/node/api/geofence/create
router.post('/create', createGeofence);

// POST {url}/node/api/geofence/update
router.post('/update', updateGeofence);

// GET {url}/node/api/geofence/search
router.get('/search', searchGeofence);

// GET {url}/node/api/geofence/fetch
router.get('/fetch', fetchGeofence);

// POST {url}/node/api/geofence/delete
router.post('/delete', deleteGeofenceLocationByTag);

// POST {url}/node/api/geofence/delete/id
router.post('/delete/id', deleteGeofenceLocationById);

// GET {url}/node/api/geofence/group/distinct/search
router.get('/group/distinct/search', fetchDistinctGeofenceGroups);


export default router;