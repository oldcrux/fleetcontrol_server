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
    manualExportGeofenceTelemetryReport,
    manualExporVehicleTelemetryReport,
    fetchLatestVehicleTelemetryReport,
    fetchLatestGeofenceTelemetryReport,
    } from '../controller/VehicleTelemetryDataController';

const router = Router();

// Define routes

// POST {url}/node/api/vehicleTelemetryData/create
router.post('/create', vehicleTelemetryDataIngest);

// POST {url}/node/api/vehicleTelemetryData/fetchAll
router.post('/fetchAll', fetchAllVehicleTelemetryData);

// POST {url}/node/api/vehicleTelemetryData/fetchRunningCount
router.post('/fetchRunningCount', fetchRunningVehicleCount);

// GET {url}/node/api/vehicleTelemetryData/fetchRunningCountSSE
router.get('/fetchRunningCountSSE', fetchRunningVehicleCountSSE);

// GET {url}/node/api/vehicleTelemetryData/fetchAllVehiclesSSE
router.get('/fetchAllVehiclesSSE', fetchAllVehiclesSSE);

// GET {url}/node/api/vehicleTelemetryData/geofence/report
router.get('/geofence/report', fetchGeofenceTelemetryReport);

// GET {url}/node/api/vehicleTelemetryData/vehicle/report
router.get('/vehicle/report', fetchVehicleTelemetryReport);

// GET {url}/node/api/vehicleTelemetryData/vehicle/report/download
router.get('/vehicle/report/download', fetchLatestVehicleTelemetryReport);

// GET {url}/node/api/vehicleTelemetryData/geofence/report/download
router.get('/geofence/report/download', fetchLatestGeofenceTelemetryReport);

// GET {url}/node/api/vehicleTelemetryData/report/name
router.get('/report/name', fetchVehicleTelemetryReportGroupByReportName);

// GET {url}/node/api/vehicleTelemetryData/report/nameAndVehicle
router.get('/report/nameAndVehicle', fetchVehicleTelemetryReportGroupByReportNameVehicleNumber);

// GET {url}/node/api/vehicleTelemetryData/report/geofence/create
router.get('/report/geofence/create', createGeofenceTelemetryReport);

// GET {url}/node/api/vehicleTelemetryData/report/vehicle/create
router.get('/report/vehicle/create', createVehicleTelemetryReport);

// GET {url}/node/api/vehicleTelemetryData/vehicle/travelpath
router.get('/vehicle/travelpath', todaysTravelPath);

// GET {url}/node/api/vehicleTelemetryData/vehicle/speed
router.get('/vehicle/speed', todaysSpeed);

// GET {url}/node/api/vehicleTelemetryData/report/trigger/all
// router.get('/report/trigger/all', triggerAllReportWrapper);

// GET {url}/node/api/vehicleTelemetryData/manual/geofenceReport/export
router.get('/manual/geofenceReport/export', manualExportGeofenceTelemetryReport);

// GET {url}/node/api/vehicleTelemetryData/manual/vehicleReport/export
router.get('/manual/vehicleReport/export', manualExporVehicleTelemetryReport);


export default router;