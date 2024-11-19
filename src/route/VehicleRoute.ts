import { Router } from 'express';
import {  createVehicle, 
    updateVehicle,
    fetchVehicles, 
    deleteVehicle, 
    fetchAllVehicleCountByOrganization,
    fetchAllVehicleRunningVehicles,
    fetchAllVehicleIdleVehicles,
    bulkCreateVehicle, } from '../controller/VehicleController';

// import express, { Request, Response } from 'express';
// const app = express();
// app.use(express.json()); 

const router = Router();


// Define routes

// POST {url}/api/vehicle/create
router.post('/create', createVehicle);

// POST {url}/api/vehicle/bulkCreate
router.post('/bulkCreate', bulkCreateVehicle);

// POST {url}/api/vehicle/update
router.post('/update', updateVehicle);

// GET {url}/api/vehicle/search
router.get('/search', fetchVehicles);

// GET {url}/api/vehicle/running/search
router.get('/running/search', fetchAllVehicleRunningVehicles);

// GET {url}/api/vehicle/idle/search
router.get('/idle/search', fetchAllVehicleIdleVehicles);

// GET {url}/api/vehicle/all
// router.get('/all/:organization', getAllVehicles);

// POST {url}/api/vehicle/delete/all
// router.post('/delete/all', deleteAllVehicle);

// POST {url}/api/vehicle/delete
router.post('/delete', deleteVehicle);

// router.get('/all/byOrganization', fetchAllVehicleByOrganization);

// GET {url}/api/vehicle/count/:organization
router.get('/count/:organization', fetchAllVehicleCountByOrganization);

export default router;
