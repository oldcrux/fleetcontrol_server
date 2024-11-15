import { Router } from 'express';
import { bullBoard, createReportJob } from '../controller/JobController';


const router = Router();

// Define routes

// GET {url}/api/job/report/job/create
router.get('/report/job/create', createReportJob);

// GET {url}/api/job/admin/queues
router.get('/admin/queues', bullBoard);


export default router;