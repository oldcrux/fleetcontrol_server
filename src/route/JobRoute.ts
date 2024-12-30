import { Router } from 'express';
import { bullBoard, createGeofenceTouchStatusResetScheduler, createReportJob, deleteGeofenceTouchStatusResetScheduler, updateGeofenceTouchStatusResetScheduler } from '../controller/JobController';


const router = Router();

// Define routes

// GET {url}/node/api/job/report/job/create
router.get('/report/job/create', createReportJob);

// GET {url}/node/api/job/admin/queues
router.get('/admin/queues', bullBoard);

// POST {url}/node/api/job/admin/geofenceTouchStatusReset/create
router.post('/admin/geofenceTouchStatusReset/create', createGeofenceTouchStatusResetScheduler);

// POST {url}/node/api/job/admin/geofenceTouchStatusReset/update
router.post('/admin/geofenceTouchStatusReset/update', updateGeofenceTouchStatusResetScheduler);

// POST {url}/node/api/job/admin/geofenceTouchStatusReset/delete
router.post('/admin/geofenceTouchStatusReset/delete', deleteGeofenceTouchStatusResetScheduler);

export default router;