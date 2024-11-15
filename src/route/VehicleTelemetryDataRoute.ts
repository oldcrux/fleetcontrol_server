import { Router } from 'express';
import { vehicleTelemetryDataIngest, 
    fetchAllVehicleTelemetryData, 
    fetchRunningVehicleCount, 
    fetchRunningVehicleCountSSE,  
    fetchGeofenceTelemetryReport, 
    fetchVehicleTelemetryReport,
    createGeofenceTelemetryReport,
    fetchVehicleTelemetryReportGroupByReportName,
    fetchVehicleTelemetryReportGroupByReportNameVehicleNumber, 
    createVehicleTelemetryReport,
    fetchAllVehiclesSSE,
    todaysTravelPath,
    todaysSpeed,
    } from '../controller/VehicleTelemetryDataController';

const router = Router();

// Define routes

// POST {url}/api/vehicleTelemetryData/create
router.post('/create', vehicleTelemetryDataIngest);

// POST {url}/api/vehicleTelemetryData/fetchAll
router.post('/fetchAll', fetchAllVehicleTelemetryData);

// POST {url}/api/vehicleTelemetryData/fetchRunningCount
router.post('/fetchRunningCount', fetchRunningVehicleCount);

// GET {url}/api/vehicleTelemetryData/fetchRunningCountSSE
router.get('/fetchRunningCountSSE', fetchRunningVehicleCountSSE);

// GET {url}/api/vehicleTelemetryData/fetchAllVehiclesSSE
router.get('/fetchAllVehiclesSSE', fetchAllVehiclesSSE);

// GET {url}/api/vehicleTelemetryData/geofence/report
router.get('/geofence/report', fetchGeofenceTelemetryReport);

// GET {url}/api/vehicleTelemetryData/vehicle/report
router.get('/vehicle/report', fetchVehicleTelemetryReport);

// GET {url}/api/vehicleTelemetryData/report/name
router.get('/report/name', fetchVehicleTelemetryReportGroupByReportName);

// GET {url}/api/vehicleTelemetryData/report/nameAndVehicle
router.get('/report/nameAndVehicle', fetchVehicleTelemetryReportGroupByReportNameVehicleNumber);

// GET {url}/api/vehicleTelemetryData/report/geofence/create
router.get('/report/geofence/create', createGeofenceTelemetryReport);

// GET {url}/api/vehicleTelemetryData/report/vehicle/create
router.get('/report/vehicle/create', createVehicleTelemetryReport);

// GET {url}/api/vehicleTelemetryData/vehicle/travelpath
router.get('/vehicle/travelpath', todaysTravelPath);

// GET {url}/api/vehicleTelemetryData/vehicle/speed
router.get('/vehicle/speed', todaysSpeed);

// GET {url}/api/vehicleTelemetryData/report/trigger/all
// router.get('/report/trigger/all', triggerAllReportWrapper);

export default router;