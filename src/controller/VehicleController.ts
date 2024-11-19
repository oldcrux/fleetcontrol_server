import express, { Request, Response } from 'express';
// import { Vehicle } from '../model/vehicle';
// import { randomUUID } from 'crypto';
// import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";
// import { firebaseDb } from "../util/firebasedb";

import Vehicle from '../dbmodel/vehicle';
import sequelize from '../util/sequelizedb';
import { Model, QueryTypes } from 'sequelize';
import { fetchAllRunningVehicleNumbers } from './VehicleTelemetryDataController';
import { redisPool } from '../util/RedisConnection';
import { logDebug, logError, logger, logInfo } from '../util/Logger';
import { isNullOrUndefinedOrNaN } from '../util/CommonUtil';

const vehicleCollection = "vehicles";

const app = express();
app.use(express.json());

const cacheTimeout = process.env.REDIS_CACHE_GLOBAL_TIMEOUT ? parseInt(process.env.REDIS_CACHE_GLOBAL_TIMEOUT) : 36000;

//TODO handle 400 error - node server crashes when 400 error is sent
export const createVehicle = async (req: Request, res: Response) => {

    logDebug(`vehicleController:createVehicle: payload`, req.body);
    if (!req.body.vehicleNumber
        || !req.body.orgId
        || !req.body.serialNumber
        || !req.body.primaryPhoneNumber) {
        res.status(400).json({ error: 'incomplelete Vehicle payload' });
    }

    var isActive = req.body.isActive;
    let isActivedb = 1;
    if (!isNullOrUndefinedOrNaN(isActive)) {
        console.log(`is Active`, isActive);
        const normalizedActive = String(isActive).trim().toLowerCase();
        if (normalizedActive === '1' || normalizedActive === 'true' || normalizedActive === 'y' || normalizedActive === 'yes') {
            isActivedb = 1;
        }
        if (normalizedActive === '0' || normalizedActive === 'false' || normalizedActive === 'n' || normalizedActive === 'no') {
            isActivedb = 0;
        }
    }

    // TODO add data validation validation.
    try {
        const newVehicle = await Vehicle.create({
            vehicleNumber: req.body.vehicleNumber.trim(),
            make: req.body.make,
            model: req.body.model,
            owner: req.body.owner,
            orgId: req.body.orgId,
            createdBy: req.body.createdBy,
            primaryPhoneNumber: req.body.primaryPhoneNumber.trim(),
            secondaryPhoneNumber: req.body.secondaryPhoneNumber ? req.body.secondaryPhoneNumber : null,
            serialNumber: req.body.serialNumber.trim(),
            geofenceLocationGroupName: req.body.geofenceLocationGroupName ? req.body.geofenceLocationGroupName.trim() : null,
            vehicleGroup: req.body.vehicleGroup ? req.body.vehicleGroup : null,
            isActive: isActivedb,
        });
        await redisPool.getConnection().hdel('vehicleCache', req.body.orgId); // Delete all the cache. The new vehicle will make it to the cache when reloaded.
        res.status(200).json(newVehicle);

    } catch (error) {
        logError("Error adding vehicle: ", error);
        res.status(400).json({ error: "Error adding vehicle: " + error });
    }
};

export const bulkCreateVehicle = async (req: Request, res: Response) => {
    let createdVehicles: any[] = [];
    let errorVehicle: any[] = [];
    let errorData: any[] = [];

    if (req.body.length > 0) {
        const vehicles = req.body;
        logInfo(`VehicleController: bulkCreateVehicle. Vehicles to create`, vehicles);

        vehicles.forEach(async (vehicle: typeof Vehicle) => {
            // for (const vehicle of vehicles) {
            logInfo(`VehicleController: bulkCreateVehicle. persisting vehicle- `, vehicle);
            try {
                if (!vehicle.vehicleNumber
                    || !vehicle.orgId
                    || !vehicle.serialNumber
                    || !vehicle.primaryPhoneNumber) {
                    errorVehicle.push(`Incomplelete Vehicle payload ${vehicle.vehicleNumber}`);

                    logInfo(`Vehicle data Error`);
                    return;
                }

                var isActive = vehicle.isActive;
                let isActivedb = 1;
                if (!isNullOrUndefinedOrNaN(isActive)) {
                    console.log(`is Active`, isActive);
                    const normalizedActive = String(isActive).trim().toLowerCase();
                    if (normalizedActive === '1' || normalizedActive === 'true' || normalizedActive === 'y' || normalizedActive === 'yes') {
                        isActivedb = 1;
                    }
                    if (normalizedActive === '0' || normalizedActive === 'false' || normalizedActive === 'n' || normalizedActive === 'no') {
                        isActivedb = 0;
                    }
                }

                const newVehicle = await Vehicle.create({
                    vehicleNumber: vehicle.vehicleNumber.trim(),
                    make: vehicle.make,
                    model: vehicle.model,
                    owner: vehicle.owner,
                    orgId: vehicle.orgId,
                    createdBy: vehicle.createdBy,
                    primaryPhoneNumber: vehicle.primaryPhoneNumber.trim(),
                    secondaryPhoneNumber: vehicle.secondaryPhoneNumber ? vehicle.secondaryPhoneNumber : null,
                    serialNumber: vehicle.serialNumber.trim(),
                    geofenceLocationGroupName: vehicle.geofenceLocationGroupName ? vehicle.geofenceLocationGroupName.trim() : null,
                    vehicleGroup: vehicle.vehicleGroup ? vehicle.vehicleGroup : null,
                    isActive: isActivedb,
                });
                createdVehicles.push(newVehicle);
            }
            catch (error) {
                logError(`error creating Vehicle`, error);
                errorData.push(error);
            }
        });
        await redisPool.getConnection().hdel('vehicleCache', req.body.orgId);
    }

    logInfo(`VehicleController: bulkCreateVehicle.. final Data created`, createdVehicles, errorVehicle, errorData);
    res.status(200).json(`${createdVehicles}, ${errorVehicle}, ${errorData}`);
}


export const updateVehicle = async (req: Request, res: Response) => {
    logDebug(`VehicleController:updateVehicle: payload:`, req.body);

    var isActive = req.body.isActive;
    let isActivedb = 1;
    if (isActive === '1' || isActive.toLowerCase() === 'true' || isActive.toLowerCase() === 'y' || isActive.toLowerCase() === 'yes')
        isActivedb = 1;
    if (isActive === '0' || isActive.toLowerCase() === 'false' || isActive.toLowerCase() === 'n' || isActive.toLowerCase() === 'no')
        isActivedb = 0;

    const result = await Vehicle.update({
        make: req.body.make,
        model: req.body.model,
        owner: req.body.owner,
        orgId: req.body.orgId,
        primaryPhoneNumber: req.body.primaryPhoneNumber.trim(),
        secondaryPhoneNumber: req.body.secondaryPhoneNumber ? req.body.secondaryPhoneNumber : null,
        serialNumber: req.body.serialNumber.trim(),
        geofenceLocationGroupName: req.body.geofenceLocationGroupName ? req.body.geofenceLocationGroupName.trim() : null,
        vehicleGroup: req.body.vehicleGroup ? req.body.vehicleGroup : null,
        isActive: isActivedb,
    },
        { where: { vehicleNumber: req.body.vehicleNumber } });
    await redisPool.getConnection().hdel('vehicleCache', req.body.orgId);
    res.status(200).json(result);
};

export const getAllVehicles = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}

export const fetchVehicles = async (req: Request, res: Response) => {

    // const { page, query, orgId } = req.query;
    logDebug(`vehicleController:fetchVehicles: Entering with ${JSON.stringify(req.query)}`, req.query);

    const orgId = req.query.orgId;
    const start = parseInt(req.query.start as string) || 0;
    const size = parseInt(req.query.size as string) || 0;
    // const filters = JSON.parse(req.query.filters || '[]');
    const globalFilter = req.query.globalFilter || '';
    // const sorting = JSON.parse(req.query.sorting || '[]');

    if (orgId == null) {
        res.status(400).json(`orgId param is required`);
        return;
    }
    if (size == null) {
        res.status(400).json(`size param is required with value >0`);
        return;
    }

    const count = await fetchAllVehicleCount(orgId as string);

    //whereClauses = `and (reportName like '%${query}%' or vehicleNumber like '%${query}%' or geofenceLocationGroupName like '%${query}%' or geofenceLocationTag like '%${query}%' )`;

    let whereCondition = '';
    if (globalFilter) {
        whereCondition = ` and ("vehicleNumber" like '%${globalFilter}%' 
                                    or "make" like '%${globalFilter}%' 
                                    or "model" like '%${globalFilter}%' 
                                    or "owner" like '%${globalFilter}%' 
                                    or "primaryPhoneNumber" like '%${globalFilter}%' 
                                    or "secondaryPhoneNumber" like '%${globalFilter}%' 
                                    or "serialNumber" like '%${globalFilter}%' 
                                    or "geofenceLocationGroupName" like '%${globalFilter}%' 
                                    or "vehicleGroup" like '%${globalFilter}%' )`;
    }

    const query = `select * from "Vehicle" where "orgId"=? ${whereCondition} order by "updatedAt" desc limit ${size} offset ${start}`;
    logDebug(`vehicleController:fetchVehicles: query formed:`, query);
    const [results] = await sequelize.query(query, {
        replacements: [orgId],
        type: QueryTypes.RAW,
    });
    // logDebug(`vehicleController:fetchVehicles:vehicles fetched from DB :`, results);
    const finalResponse = convertToVehiclesApiResponse(results, count);
    logDebug(`vehicleController:fetchVehicles:vehicles returned`, finalResponse);
    res.status(200).json(finalResponse);
}

//@deprecate
export const fetchAllVehicleByOrganization = async (req: Request, res: Response) => {
    let org;

    logInfo(`*** VehicleController: fetchAllVehicleByOrganization: Is this being used ??? ***`);
    const { organization } = req.params || {};
    if (organization) {
        org = organization;
    }
    else
        org = req.body?.organization;

    const data: string | any[] = [];
    // if (org) {
    //     const result = query(collection(firebaseDb, vehicleCollection), where("orgId", "==", org));
    //     const querySnapshot = await getDocs(result);
    //     querySnapshot.forEach((doc) => {
    //         const vehicle = doc.data();
    //         data.push(vehicle.vehicleNumber);
    //     });
    // }
    return data;
}

/**
    *   1. Method takes the serialNumber and search the vehicle number in redis.
    *      if found take the vehicle number and proceed.
    *      if not found search the vehicle number in mysql.  if found, take that, add to redis, and proceed.
 */
export const fetchAllVehicleBySerialNumber = async (serialNumber: string) => {
    const executionStartTime = Date.now();
    logDebug(`VehicleController:fetchAllVehicleBySerialNumber. Fetching vehicles with serialNumber: ${serialNumber}`);
    let vehicleNumber = await redisPool.getConnection().get(serialNumber);
    if (!vehicleNumber) {
        logDebug(`VehicleController:fetchAllVehicleBySerialNumber: fetching vehicle from DB with serialNumber ${serialNumber}`);

        const [results, fields] = await sequelize.query(`select "vehicleNumber" from "Vehicle" where "serialNumber"=?`, {
            replacements: [serialNumber],
            Model: Vehicle,
            mapToModel: true,
            type: QueryTypes.RAW
        });

        const allVehicle = results;
        if (allVehicle.length > 1) {
            logError(`VehicleController:fetchAllVehicleBySerialNumber: more than 1 vehicle fetched for the serialNumber`, allVehicle);
        }
        vehicleNumber = allVehicle[0].vehicleNumber;

        // add serialNumber and vehicleNumber to redis cache
        // vehicleNumber = await connection.set(parsedMessage.serialNumber, vehicle.vehicleNumber, 'EX', 60*60*12); // Setting the cache for 12hours
        await redisPool.getConnection().set(serialNumber, vehicleNumber as string, 'EX', cacheTimeout); // timeout in secs

        // ********* Redis timing check *********
        const executionEndTime = Date.now();
        const totalTimeTaken = executionEndTime - executionStartTime;
        logDebug(`VehicleController:fetchAllVehicleBySerialNumber: total time taken for looking into redis cache+loading the vehicle+setting in to cache: ${totalTimeTaken} ms`);
        // ********* Redis timing check *********
    }
    else {// ********* Redis timing check *********
        const executionEndTime = Date.now();
        const totalTimeTaken = executionEndTime - executionStartTime;
        logDebug(`VehicleController:fetchAllVehicleBySerialNumber: total time taken for looking into redis cache: ${totalTimeTaken} ms`);
    }// ********* Redis timing check *********
    logDebug(`VehicleController:fetchAllVehicleBySerialNumber: Exiting with vehicleNumber: ${vehicleNumber}`);
    return vehicleNumber;
}

export const fetchAllVehicleByOrganization2 = async (orgId: string) => {
    let allVehicle;

    allVehicle = await redisPool.getConnection().hget('vehicleCache', orgId);
    logDebug(`VehicleController:fetchAllVehicleByOrganization: vehicles fetched from redis cache:`, allVehicle);
    if (allVehicle) {
        allVehicle = JSON.parse(allVehicle);
    }
    else {
        const [results] = await sequelize.query(`select "vehicleNumber" from "Vehicle" where "orgId"=?`, {
            replacements: [orgId],
            Model: Vehicle,
            mapToModel: true,
            type: QueryTypes.RAW
        });
        allVehicle = results;
        await redisPool.getConnection().hset('vehicleCache', orgId, JSON.stringify(allVehicle));
        await redisPool.getConnection().expire('vehicleCache', cacheTimeout);
        logDebug(`VehicleController:fetchAllVehicleByOrganization: Added all vehicles to redis cache`);

    }
    logDebug(`VehicleController: fetchAllVehicleByOrganization: vehicle list returned`, orgId, allVehicle);
    return allVehicle;
}

export const fetchVehiclesAndGeoByOrganization = async (orgId: any) => {

    /*
    select vehicleNumber from vehicle where organization='bmc';
    */
    const [results, fields] = await sequelize.query(`select "vehicleNumber", "geofenceLocationGroupName" from "Vehicle" where "orgId"=?`, {
        replacements: [orgId],
        Model: Vehicle,
        mapToModel: true,
        type: QueryTypes.RAW
    });

    const allVehicle = results;
    // console.log(`VehicleController:fetchAllVehicleByOrganization: for organization ${orgId}, ${JSON.stringify(allVehicle)}`);
    return allVehicle;
}

export const fetchVehiclesAndGeoCountByOrganization = async (orgId: any) => {

    /*
    select vehicleNumber from vehicle where organization='bmc';
    */
    const [results, fields] = await sequelize.query(`SELECT "Vehicle"."vehicleNumber", 
        "Vehicle"."geofenceLocationGroupName", 
        COUNT("GeofenceLocation"."geofenceLocationGroupName") AS "geoLocationsCount"
    FROM "Vehicle", "GeofenceLocation"
    WHERE "Vehicle"."geofenceLocationGroupName" = "GeofenceLocation"."geofenceLocationGroupName"
    AND "Vehicle"."orgId" = ?
    GROUP BY "Vehicle"."vehicleNumber"`, {
        replacements: [orgId],
        Model: Vehicle,
        mapToModel: true,
        type: QueryTypes.RAW
    });

    const allVehicle = results;
    console.log(`VehicleController:fetchVehiclesAndGeoCountByOrganization: for organization ${orgId}, ${JSON.stringify(allVehicle)}`);
    return allVehicle;
}

// In Use
export const fetchAllVehicleCountByOrganization = async (req: Request, res: Response) => {
    let orgId;

    const { organization } = req.params || {};
    if (organization) {
        orgId = organization;
    }
    else
        orgId = req.body?.organization;

    logDebug(`VehicleController: fetchAllVehicleCountByOrganization: for OrgId: ${orgId}`, orgId);

    const data: string | any[] = [];
    if (orgId) {
        // const result = query(collection(firebaseDb, vehicleCollection), where("organization", "==", org));
        // const querySnapshot = await getDocs(result);
        // querySnapshot.forEach((doc) => {
        //     const vehicle = doc.data();
        //     data.push(vehicle.vehicleNumber);
        // });

        const [results] = await sequelize.query(`select count(1) as result from "Vehicle" where "orgId"=?`, {
            replacements: [orgId],
            Model: Vehicle,
            mapToModel: true,
            type: QueryTypes.RAW
        });
        const allVehicleCount = results[0];
        logDebug(`VehicleController: fetchAllVehicleCountByOrganization: count returned: `, results[0]);
        res.status(200).json(allVehicleCount.result);
    }
    else {
        res.status(200).json('no Vehicle found for your organization');
    }
}

export const fetchVehicleAndGeoByOrganization = async (orgId: any) => {
    const [allVehicle] = await sequelize.query(`select "vehicleNumber", "geofenceLocationGroupName" from "Vehicle" where "orgId" = ?`, {
        replacements: [orgId],
        Model: Vehicle,
        mapToModel: true,
        type: QueryTypes.RAW
    });
    logDebug(`VehicleController:fetchVehicleAndGeoByOrganization: all vehicles of organization ${orgId} `, allVehicle);
    return allVehicle;
}

export const fetchVehicleAndGeoCountByOrganization = async (orgId: any) => {
    const [allVehicle] = await sequelize.query(`SELECT "Vehicle"."vehicleNumber", 
                "Vehicle"."geofenceLocationGroupName", "Vehicle"."owner",
                COUNT("GeofenceLocation"."geofenceLocationGroupName") AS "geoLocationsCount"
            FROM "Vehicle", "GeofenceLocation"
            WHERE "Vehicle"."geofenceLocationGroupName" = "GeofenceLocation"."geofenceLocationGroupName"
            AND "Vehicle"."orgId" = ?
            GROUP BY "Vehicle"."vehicleNumber"`, {
        replacements: [orgId],
        Model: Vehicle,
        mapToModel: true,
        type: QueryTypes.RAW
    });
    logDebug(`VehicleController:fetchVehicleAndGeoCountByOrganization: for organization ${orgId}`, allVehicle);
    return allVehicle;
}

export const fetchAllVehicleCount = async (orgId: string) => {
    if (orgId) {
        // const result = query(collection(firebaseDb, vehicleCollection), where("organization", "==", org));
        // const querySnapshot = await getDocs(result);
        // querySnapshot.forEach((doc) => {
        //     const vehicle = doc.data();
        //     data.push(vehicle.vehicleNumber);
        // });

        const [results] = await sequelize.query(`select count(1) as result from "Vehicle" where "orgId"=?`, {
            replacements: [orgId],
            Model: Vehicle,
            mapToModel: true,
            type: QueryTypes.SELECT
        });
        logDebug(`VehicleController:fetchAllVehicleCount: count returned ${results.result}`);
        return results.result;

    }
    // console.log(`VehicleController:fetchAllVehicleCount: fetched 0`);
}

// Not being used
export const searchVehicle = async (req: Request, res: Response) => {

    const { page, query, orgId } = req.query;
    // console.log(`vehicleController:searchVehicle: request query= ${query} orgId=${orgId}`);

    let whereClauses = '';
    if (query) {
        whereClauses = `and ("vehicleNumber" like '%${query}%' or "make" like '%${query}%' or "model" like '%${query}%' or "serialNumber" like '%${query}%' or "phoneNumber" like '%${query}%' or geofence like '%${query}%')`;
    }

    //TODO search the running status from node-cache.
    // const data: string | any[] = [];

    // console.log(`vehicleController:searchVehicle: where clause formed- ${whereClauses}`);
    const [results] = await sequelize.query(`select * from Vehicle where orgId=? ${whereClauses}`, {
        replacements: [orgId],
        type: QueryTypes.RAW,
    });
    // console.log(`vehicleController:searchVehicle:vehicles returned- ${typeof results}, ${JSON.stringify(results)}`);
    res.status(200).json(results);
}

export const deleteVehicle = async (req: Request, res: Response) => {
    logDebug(`VehicleController:deleteVehicle: Vehicle delete request`, req.body);
    const userId = req.body.userId;
    const orgId = req.body.orgId;
    const vehicleNumber = req.body.vehicleNumber;
    logInfo(`VehicleController:deleteVehicle: Vehicle delete request by:${userId}`, req.body);
    await redisPool.getConnection().hdel('vehicleCache', orgId);
    const result = await Vehicle.destroy({
        where: {
            vehicleNumber: vehicleNumber,
            orgId: orgId,
        }
    });
    logInfo(`VehicleController:deleteVehicle: vehicle deleted: ${vehicleNumber}`, vehicleNumber);
    res.status(200).json(result);
}

// export const deleteAllVehicle = async (req: Request, res: Response) => {
//     logInfo(`VehicleController:deleteAllVehicle: deleting all vehicles`);
//     const deletedVehicles: string | any[] = [];
//     try {
//         const querySnapshot = await getDocs(collection(firebaseDb, vehicleCollection));
//         querySnapshot.forEach(async (vehicleDocument) => {
//             deletedVehicles.push(vehicleDocument.data().vehicleNumber);
//             await deleteDoc(doc(firebaseDb, vehicleCollection, vehicleDocument.data().vehicleNumber));
//         });

//         // await connection.hdel('vehicleCache', orgId);
//     } catch (error) {
//         logError("Error adding vehicle: ", error);
//         res.status(400).json({ error: "Error deleting vehicle: " + error });
//     }
//     res.status(200).json("deleted Vehicles => " + deletedVehicles);
// }

export const bulkImportVehicles = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}


function convertToVehiclesApiResponse(vehicleJson: any, totalRowCount: any) {
    // logDebug(`vehicleController:convertToVehiclesApiResponse: total count: ${JSON.stringify(totalRowCount)} json: ${JSON.stringify(vehicleJson)}`);
    return {
        data: vehicleJson,
        meta: {
            totalRowCount,
        },
    };
}


export const fetchAllVehicleRunningVehicles = async (req: Request, res: Response) => {
    logDebug(`VehicleController:fetchAllVehicleRunningVehicles: Entering with request: ${JSON.stringify(req.query)}`, req.query);
    const orgId = req.query.orgId;
    if (orgId) {
        /**
         * load all the vehicles from mysql for the org. (cached)
         * search questdb with these list of vehicles to find vehicles with ignition=1
         * take this subset and look into mysql again with to find all details of running vehicle
         */

        const allVehicles = await fetchAllVehicleByOrganization2(orgId as string);
        const runningVehicleNumbers = await fetchAllRunningVehicleNumbers(allVehicles);

        let query;
        let runningVehicleNumberString;
        if (runningVehicleNumbers.length > 0) {
            runningVehicleNumberString = runningVehicleNumbers.map((vehicle: any) => `'${vehicle.vehicleNumber}'`).join(', ');
            logDebug(`VehicleController:fetchAllVehicleRunningVehicles: All running vehicle Numbers: ${runningVehicleNumberString}`);
            query = `select * from "Vehicle" where "orgId"=? and "vehicleNumber" in ( ${runningVehicleNumberString})`;
        }
        else {
            query = `select * from "Vehicle" where "orgId"=? `;
        }
        const [results] = await sequelize.query(`${query}`, {
            replacements: [orgId],
            Model: Vehicle,
            mapToModel: true,
            type: QueryTypes.RAW
        });
        logDebug(`VehicleController:fetchAllVehicleRunningVehicles:  Exiting with ${JSON.stringify(results)}`, results);
        res.status(200).json(results);
    }
}

export const fetchAllVehicleIdleVehicles = async (req: Request, res: Response) => {
    logDebug(`VehicleController:fetchAllVehicleIdleVehicles: Entering with request:`, req.query);
    const orgId = req.query.orgId;
    if (orgId) {
        /**
         * load all the vehicles from mysql for the org. (cached)
         * search questdb with these list of vehicles to find vehicles with ignition=1
         * for idle vehicles, select with NOT IN
         */

        const allVehicles = await fetchAllVehicleByOrganization2(orgId as string);
        const runningVehicleNumbers = await fetchAllRunningVehicleNumbers(allVehicles);

        let query;
        let runningVehicleNumberString;
        if (runningVehicleNumbers.length > 0) {
            runningVehicleNumberString = runningVehicleNumbers.map((vehicle: any) => `'${vehicle.vehicleNumber}'`).join(', ');
            logDebug(`VehicleController:fetchAllVehicleIdleVehicles: All running vehicle Numbers: ${runningVehicleNumberString}`, runningVehicleNumberString);
            query = `select * from "Vehicle" where "orgId"=? and "vehicleNumber" not in ( ${runningVehicleNumberString})`;
        }
        else {
            query = `select * from "Vehicle" where "orgId"=? `;
        }
        const [results] = await sequelize.query(`${query}`, {
            replacements: [orgId],
            Model: Vehicle,
            mapToModel: true,
            type: QueryTypes.RAW
        });
        logDebug(`VehicleController:fetchAllVehicleIdleVehicles: fetched all idle vehicles`, results);
        res.status(200).json(results);
    }
}