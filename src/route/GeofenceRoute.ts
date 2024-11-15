import { Router } from 'express';
import { createGeofence, deleteGeofenceLocationByTag, fetchDistinctGeofenceGroups, searchGeofence } from '../controller/GeofenceController';

const router = Router();

// Define routes

// POST {url}/api/geofence/create
router.post('/create', createGeofence);

// GET {url}/api/geofence/search
router.get('/search', searchGeofence);

// POST {url}/api/geofence/delete
router.post('/delete', deleteGeofenceLocationByTag);

// GET {url}/api/geofence/group/distinct/search
router.get('/group/distinct/search', fetchDistinctGeofenceGroups);


export default router;