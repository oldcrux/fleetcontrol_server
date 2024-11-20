import { Router } from 'express';
import {  createVehicle, 
    updateVehicle,
    fetchVehicles, 
    deleteVehicle, 
    fetchAllVehicleCountByOrganization,
    fetchAllVehicleRunningVehicles,
    fetchAllVehicleIdleVehicles,
    bulkCreateVehicle,
    fetchVehicleByNumber, } from '../controller/VehicleController';

// import express, { Request, Response } from 'express';
// const app = express();
// app.use(express.json()); 

const router = Router();


// Define routes

// POST {url}/node/api/vehicle/create
router.post('/create', createVehicle);

// POST {url}/node/api/vehicle/bulkCreate
router.post('/bulkCreate', bulkCreateVehicle);

// POST {url}/node/api/vehicle/update
router.post('/update', updateVehicle);

// GET {url}/node/api/vehicle/search
router.get('/search', fetchVehicles);

// GET {url}/node/api/vehicle/search/vehicleNumber
router.get('/search/vehicleNumber', fetchVehicleByNumber);

// GET {url}/node/api/vehicle/running/search
router.get('/running/search', fetchAllVehicleRunningVehicles);

// GET {url}/node/api/vehicle/idle/search
router.get('/idle/search', fetchAllVehicleIdleVehicles);

// GET {url}/node/api/vehicle/all
// router.get('/all/:organization', getAllVehicles);

// POST {url}/node/api/vehicle/delete/all
// router.post('/delete/all', deleteAllVehicle);

// POST {url}/node/api/vehicle/delete
router.post('/delete', deleteVehicle);

// router.get('/all/byOrganization', fetchAllVehicleByOrganization);

// GET {url}/node/api/vehicle/count/:organization
router.get('/count/:organization', fetchAllVehicleCountByOrganization);

export default router;
