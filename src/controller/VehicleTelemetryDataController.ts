import express, { Request, response, Response } from "express";
import axios, { AxiosError } from 'axios';
import { fetchAllVehicleByOrganization, fetchAllVehicleByOrganization2, fetchAllVehicleBySerialNumber, fetchVehicleAndGeoByOrganization, fetchVehicleAndGeoCountByOrganization, searchVehicle } from "./VehicleController";
import { searchGeofence, searchGeofenceLocationsByGroup, searchMinMaxScheduleArrivalTimeByGroup } from "./GeofenceController";
import { isPointWithinRadius } from "geolib";
import sequelize from "../util/sequelizedb";
import { QueryTypes } from "sequelize";
import { Sender } from "@questdb/nodejs-client";
import { createReportJob } from "./JobController";
import { parseMessage } from "../parser/iTriangleTS101parser";
import * as dotenv from 'dotenv';
import { logDebug, logError, logger, logInfo, logWarn } from "../util/Logger";
import Vehicle from "../dbmodel/vehicle";
import { redisPool } from "../util/RedisConnection";
import { fetchAppConfigByConfigKey } from "./AppConfigController";
import { isNullOrUndefinedOrNaN } from "../util/CommonUtil";
import { report } from "process";
import { notifyViaEmail } from "./NotificationController";
dotenv.config();

const questdbHost = process.env.QUEST_DB_HOST;
const questdbUser = process.env.QUEST_DB_USER;
const questdbPassword = process.env.QUEST_DB_PASSWORD;
const questdbAutoFlushRows = process.env.QUEST_DB_AUTO_FLUSH_ROWS; // Defaults to 75,000
const questdbAutoFlushInterval = process.env.QUEST_DB_AUTO_FLUSH_INTERVAL; // in milliseconds. Defaults to 1000

const sseDataPushInterval = process.env.SSE_DATA_PUSH_INTERVAL ? process.env.SSE_DATA_PUSH_INTERVAL : 5000;
const pointWithinRadius = process.env.POINT_WITHIN_RADIUS_ACCURACY_IN_METERS ? process.env.POINT_WITHIN_RADIUS_ACCURACY_IN_METERS : 50;
const scheduleArrivalWindow = process.env.GEOFENCE_SCHEDULE_ARRIVAL_WINDOW ? process.env.GEOFENCE_SCHEDULE_ARRIVAL_WINDOW : 30; // default 30mins window
const geohashPrecision = process.env.QUESTDB_GEOHASH_PRECISION ? process.env.QUESTDB_GEOHASH_PRECISION : 30; //default 30

//const conf = "http::addr=localhost:9000;username=admin;password=quest;"
const conf = `http::addr=${questdbHost};username=${questdbUser};password=${questdbPassword};auto_flush_rows=${questdbAutoFlushRows};auto_flush_interval=${questdbAutoFlushInterval}`
const sender = Sender.fromConfig(conf);

const vehicleTelemetryTcpMessageTable = 'VehicleTelemetryTcpMessage';
const vehicleTelemetryTable = 'VehicleTelemetry';
const geofenceTelemetryReportTable = 'GeofenceTelemetryReport';
const vehicleTelemetryReportTable = 'VehicleTelemetryReport';


/** Select the record between 00:00am to 23:00pm */
const questDBTimeRangeToday = ` to_timezone(timestamp, 'Asia/Kolkata') between  date_trunc('day', to_timezone  (now(), 'Asia/Kolkata'))  AND         
                 dateadd ('h', 23, date_trunc('day', to_timezone  (now(), 'Asia/Kolkata'))) `;

const questDBTimeRangeLast24Hours = ` to_timezone(timestamp, 'Asia/Kolkata') between  date_trunc('day', to_timezone  (now(), 'Asia/Kolkata'))  AND         
dateadd ('h', -24, date_trunc('day', to_timezone  (now(), 'Asia/Kolkata'))) `;
/*

   
        
*/


/*
    References - 
    Calculate the aggregate traveled distance for each vehicleNumber
        SELECT vehicleNumber, haversine_dist_deg(lat, lon, k) - k=?? timestamp
            FROM table vehicle_telemetry

    CREATE TABLE trades(
        timestamp TIMESTAMP,
        symbol SYMBOL,
        price DOUBLE,
        amount DOUBLE
        ) TIMESTAMP(timestamp)
        PARTITION BY DAY
        DEDUP UPSERT KEYS(timestamp, symbol);

    steps -
    make_geohash of the circle, polygon

    hash the vehicle_telemetry lat lng
        SELECT make_geohash(142.89124148, -12.90604153, 40)


    SELECT * FROM geofences
        WHERE g8c within(#ezz, #u33d8)
            LATEST ON ts PARTITON BY uuid;
    
*/

// const cacheTimeout = process.env.REDIS_CACHE_GLOBAL_TIMEOUT ? parseInt(process.env.REDIS_CACHE_GLOBAL_TIMEOUT) : 36000;

export const vehicleTelemetryDataParseAndIngest = async (data: string) => {
    logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: data received:`, data);

    /**
     * Steps
     *  1. persist the input data as is to questDB for reference.
     *  2. parse the message.
     *  3. take the serialNumber and search the vehicle number in redis.
     *      if found take the vehicle number and proceed.
     *      if not found search the vehicle number in mysql.  if found, take that, add to redis, and proceed.
     */

    const tcpMessage = await sender.table(`${vehicleTelemetryTcpMessageTable}`)
        .stringColumn('tcpMessage', data)
        .atNow();
    await sender.flush();  // TODO - Added to see if this error goes away "Error: Table name has already been set".  Remove otherwise.

    const parsedMessage = parseMessage(data);
    logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: parsed Message:`, parsedMessage);

    if (isNullOrUndefinedOrNaN(parsedMessage.ignition)
        || isNullOrUndefinedOrNaN(parsedMessage.odometer)
        || isNullOrUndefinedOrNaN(parsedMessage.headingDirectionDegree)) {
        logInfo(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: Initial message with null values. Will not insert into VehicleTelemetry table`, parsedMessage);
        return;
    }

    //This will avoid the condition of vehicle being lost
    if (!parsedMessage.latitude
        || !parsedMessage.longitude) {
        logInfo(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: lat/lng values are 0 or null. Resetting to last known location value and setting ignition to off `, parsedMessage);

        const lastKnownLocation = await fetchLastKnownLocation(parsedMessage.serialNumber);
        parsedMessage.ignition = 0;
        parsedMessage.latitude = lastKnownLocation.latitude !== null ? lastKnownLocation.latitude as number : 0;
        parsedMessage.longitude = lastKnownLocation.longitude !== null ? lastKnownLocation.longitude as number : 0;

        logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: new Parsed Message `, parsedMessage);

        if (!parsedMessage.latitude
            || !parsedMessage.longitude) {
            logInfo(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: lat/lng values are still 0 or null. Will not insert into VehicleTelemetry table `, parsedMessage);
            return;
        }
    }

    /**
     * ************* Rate limiter if Vehicle is off *************
     * Implemented another rate limiter here.  If the Vehicle ignition is off, stop inserting into VehicleTelemetry table
     * Form a key - VehicleNumber_0 and add to redis
     * Before proceeding, check if the key in redis exists. If so, stop inserting and expand the age of redis key.
     */
    if (parsedMessage.ignition === 0) {
        let configValue = await fetchAppConfigByConfigKey('rate_limiter_vehicle_off');
        logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: rate_limiter_vehicle_off config value fetched ${configValue}`, configValue);
        if (!configValue)
            configValue = 120; // Setting 2 mins default

        const vehicleOff = `${parsedMessage.serialNumber}_${parsedMessage.ignition}`;
        const vehicleOffInRedis = await redisPool.getConnection().get(`${vehicleOff}`);
        if (vehicleOffInRedis) {
            logInfo(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: Vehicle ${parsedMessage.serialNumber} is Off. Will not insert into VehicleTelemetry table again.`);
            await redisPool.getConnection().set(`${vehicleOff}`, vehicleOff as string, 'EX', configValue); // 2min.
            return;
        }
        await redisPool.getConnection().set(`${vehicleOff}`, vehicleOff as string, 'EX', configValue); // 2min.
    }
    else if (parsedMessage.ignition === 1) {
        const vehicleOff = `${parsedMessage.serialNumber}_0`;
        await redisPool.getConnection().del(`${vehicleOff}`);
    }

    const vehicleNumber = await fetchAllVehicleBySerialNumber(parsedMessage.serialNumber);
    // const geohash = await makeGeohash(parsedMessage.latitude, parsedMessage.longitude);
    // logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: persisting for vehicle Number: ${vehicleNumber}`);
    // const vehicleTelemetryData = await sender.table(`${vehicleTelemetryTable}`)
    //     .symbol('vehicleNumber', vehicleNumber)
    //     .symbol('serialNumber', parsedMessage.serialNumber)
    //     .stringColumn('geohash', geohash)
    //     .floatColumn('speed', parsedMessage.speed)
    //     .floatColumn('latitude', parsedMessage.latitude)
    //     .floatColumn('longitude', parsedMessage.longitude)
    //     .floatColumn('ignition', parsedMessage.ignition)
    //     .floatColumn('odometer', parsedMessage.odometer)
    //     .floatColumn('headingDirectionDegree', parsedMessage.headingDirectionDegree)
    //     .atNow();
    // await sender.flush(); // TODO check why the vehicleTelemetryTable data is not being flushed without this statement.

    const insertQuery = `INSERT INTO ${vehicleTelemetryTable} (vehicleNumber, serialNumber, speed, overspeed, latitude, longitude, geohash, ignition, odometer, headingDirectionDegree, timestamp) 
    VALUES ('${vehicleNumber}', '${parsedMessage.serialNumber}', ${parsedMessage.speed}, ${parsedMessage.overspeed}, ${parsedMessage.latitude}, ${parsedMessage.longitude}, make_geohash(${parsedMessage.latitude}, ${parsedMessage.longitude}, ${geohashPrecision}), ${parsedMessage.ignition}, ${parsedMessage.odometer}, ${parsedMessage.headingDirectionDegree}, now() )`;

    logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: insertQuery:`, insertQuery);
    const response = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(insertQuery)}`,
    );
    const json = await response.data;
    logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: vehicle telemetry data persisted:`, parsedMessage.serialNumber, vehicleNumber);
}

const makeGeohash = async (latitude: any, longitude: any) => {
    logDebug(`VehicleTelemetryDataController: makeGeohash: Entering with latitude: ${latitude}, longitude: ${longitude}`);
    let geohash: any;
    const queryString = `select make_geohash(${latitude}, ${longitude}, ${geohashPrecision})`;

    const response = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
    );

    const json = await response.data;
    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    geohash = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    logDebug(`VehicleTelemetryDataController: makeGeohash: Exiting. with geohash:`, geohash[0].make_geohash);
    return geohash[0].make_geohash;
}

/** Method for REST API */
export const vehicleTelemetryDataIngest = async (req: Request, res: Response) => {

    logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataIngest: vehicle telemetry data received from REST API:`, req.body);

    if (req.body.serialNumber != null) {
        const serialNumber = req.body.serialNumber;
        const speed = req.body.speed;
        const latitude = req.body.latitude;
        const longitude = req.body.longitude;
        const ignition = req.body.ignition;
        const odometer = req.body.odometer;
        const headingDirectionDegree = req.body.headingDirectionDegree;

        try {
            // add rows to the buffer of the sender
            //const row = await sender.table('location')
            const vehicleNumber = await fetchAllVehicleBySerialNumber(req.body.serialNumber);
            logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataIngest: persisting for vehicle Number: ${vehicleNumber}`);

            const insertQuery = `INSERT INTO ${vehicleTelemetryTable} (vehicleNumber, serialNumber, speed, latitude, longitude, geohash, ignition, odometer, headingDirectionDegree, timestamp) 
    VALUES ('${vehicleNumber}', '${serialNumber}', ${speed},  ${latitude}, ${longitude}, make_geohash(${latitude}, ${longitude}, ${geohashPrecision}), ${ignition}, ${odometer}, ${headingDirectionDegree}, now() )`;

            logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataParseAndIngest: insertQuery:`, insertQuery);
            const response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(insertQuery)}`,
            );
            const json = await response.data;
            // const row = await sender.table(`${vehicleTelemetryTable}`)
            //     .symbol('vehicleNumber', vehicleNumber)
            //     .symbol('serialNumber', serialNumber)
            //     .floatColumn('speed', speed)
            //     .floatColumn('latitude', latitude)
            //     .floatColumn('longitude', longitude)
            //     .floatColumn('ignition', ignition)
            //     .floatColumn('odometer', odometer)
            //     .floatColumn('headingDirectionDegree', headingDirectionDegree)
            //     .atNow();

            // await sender.flush();
            logDebug(`VehicleTelemetryDataController:vehicleTelemetryDataIngest: vehicle telemetry data persisted:`, json);
            res.sendStatus(200);

        } catch (error) {
            res.status(400).json({ error: "Error adding document: " + error });
        }
    }
};

export const fetchAllVehicleTelemetryData = async (req: Request, res: Response) => {

    // steps 
    // 1. get the list of vehicles of the organization from firestore
    // 2. query questDB with the list of vehicles to get the latest details about the vehicle.
    // 3. form the object to return to the data table

    let results: any[] = [];
    try {
        const getAllVehicles = await fetchAllVehicleByOrganization(req, res); // #1
        const vehicleNumbers = getAllVehicles.map(vehicleNumber => `'${vehicleNumber}'`).join(', ');
        const query = `SELECT vehicleNumber, latitude, longitude, ignition, odometer, timestamp 
                from ${vehicleTelemetryTable} 
                    where vehicleNumber in (${vehicleNumbers}) 
                        LATEST ON timestamp PARTITION BY vehicleNumber;`;

        try {
            const response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
            );
            const json = await response.data;

            const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
            const dataset: (string | number | null)[][] = json.dataset;

            results = dataset.map(row => {
                const obj: { [key: string]: string | number | null } = {};
                columns.forEach((col, index) => {
                    obj[col] = row[index];  // Map each column name to the corresponding value in the row
                });
                return obj;
            });
        }
        catch (error) {
            console.log(`fetchAllVehicleTelemetryData. Error fetching vehicle from questDb. ${error}`);
        }

        // Merge the vehicle data fetched from firestore with the data fetched from questdb telemetry data
        // and form the final payload.  
        // This final payload is created, as we want to show all vehicles with + without telemetry data on the dashboard
        results = getAllVehicles.map(vehicleNumbers => {
            const existingVehicle = results.find(v => v.vehicleNumber === vehicleNumbers);
            return existingVehicle
                ? existingVehicle
                : {
                    vehicleNumber: vehicleNumbers,
                    ignition: null,
                    latitude: null,
                    longitude: null,
                    odometer: null,
                    timestamp: null,
                };
        });
        //   console.log(`Mapped Results: ${finalData}`);
        // console.log("Mapped Results:", results);
    }
    catch (error) {
        res.status(400).json({ error: "Error fetching document: " + error });
    }
    res.status(200).json(results);

    ////////////// logic to push the data every 5 sec Starts
    //   const interval = setInterval(() => {
    //     fetchAllVehicleTelemetryData(req, res);
    //     }, 5000);

    //     req.on('close', () => {
    //         clearInterval(interval);
    //         res.end();
    //     });
    ////////////// 
}

// Deprecated
// export const fetchVehicleTelemetryDataByVehicleNumber = async (vehicleNumber: string) => {
//     let vehicletelemetry: any[] = [];

//     const query = `SELECT vehicleNumber, latitude, longitude, geohash
//         from ${vehicleTelemetryTable} 
//             where vehicleNumber in ('${vehicleNumber}') 
//             and ${questDBTimeRangeToday}`;

//     logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryDataByVehicleNumber: query:`, query);
//     try {
//         const response = await axios.get(
//             `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
//         );
//         const json = await response.data;

//         const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
//         const dataset: (string | number | null)[][] = json.dataset;

//         vehicletelemetry = dataset.map(row => {
//             const obj: { [key: string]: string | number | null } = {};
//             columns.forEach((col, index) => {
//                 obj[col] = row[index];  // Map each column name to the corresponding value in the row
//             });
//             return obj;
//         });
//     }
//     catch (error) {
//         logError(`VehicleTelemetryDataController:fetchVehicleTelemetryDataByVehicleNumber: Error fetching vehicle from questDb`, error);
//     }
//     logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryDataByVehicleNumber: telemetry data fetched for vehicle`, vehicleNumber, vehicletelemetry);
//     return vehicletelemetry;
// }

export const fetchVehicleTelemetryDataByVehicleNumberInTimeWindow = async (vehicleNumber: string, minScheduledArrival: any, maxScheduleArrival: any) => {
    let vehicletelemetry: any[] = [];
    if (minScheduledArrival && maxScheduleArrival) {
        logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryDataByVehicleNumberInTimeWindow: Entering with Vehicle, minScheduledArrival, maxScheduledArrival:`, vehicleNumber, minScheduledArrival, maxScheduleArrival);
        const minScheduledArrivalMinute = timeToMinutes(minScheduledArrival);
        const maxScheduleArrivalMinute = timeToMinutes(maxScheduleArrival);

        const query = `SELECT vehicleNumber, latitude, longitude, geohash
        from ${vehicleTelemetryTable} 
            where vehicleNumber in ('${vehicleNumber}') and ignition=1
            and to_timezone(timestamp, 'Asia/Kolkata') between dateadd ('m', ${minScheduledArrivalMinute - Number(scheduleArrivalWindow)}, date_trunc('day', to_timezone  (now(), 'Asia/Kolkata'))) and dateadd ('m', ${maxScheduleArrivalMinute + Number(scheduleArrivalWindow)}, date_trunc('day', to_timezone  (now(), 'Asia/Kolkata')))
            and ${questDBTimeRangeToday}`;

        logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryDataByVehicleNumberInTimeWindow: query:`, query);
        try {
            const response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
            );
            const json = await response.data;

            const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
            const dataset: (string | number | null)[][] = json.dataset;

            vehicletelemetry = dataset.map(row => {
                const obj: { [key: string]: string | number | null } = {};
                columns.forEach((col, index) => {
                    obj[col] = row[index];  // Map each column name to the corresponding value in the row
                });
                return obj;
            });
        }
        catch (error) {
            logError(`VehicleTelemetryDataController:fetchVehicleTelemetryDataByVehicleNumber: Error fetching vehicle from questDb`, error);
        }
        logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryDataByVehicleNumber: telemetry data fetched for vehicle`, vehicleNumber, vehicletelemetry);
        return vehicletelemetry;
    }
}

/** Returns the daily calculated odometer number for all the vehicles */
export const fetchTodaysMileage = async (vehicleNumbers: string) => {
    logDebug(`VehicleTelemetryDataController:fetchTodaysMileage: Entering with vehicle Numbers ${vehicleNumbers} `, vehicleNumbers);
    let vehicletelemetry: any[] = [];

    const query = `SELECT 
                    vehicleNumber, 
                    MAX(odometer) - MIN(odometer) AS mileage
                        from ${vehicleTelemetryTable} 
                            where vehicleNumber in (${vehicleNumbers}) 
                            and ${questDBTimeRangeToday}
                                GROUP BY vehicleNumber ;`;  // 00:01 AM to 00:00 AM the next day //TODO test the time duration

    try {
        const response = await axios.get(
            `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
        );
        const json = await response.data;

        const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
        const dataset: (string | number | null)[][] = json.dataset;

        vehicletelemetry = dataset.map(row => {
            const obj: { [key: string]: string | number | null } = {};
            columns.forEach((col, index) => {
                obj[col] = row[index];  // Map each column name to the corresponding value in the row
            });
            return obj;
        });
    }
    catch (error) {
        logError(`VehicleTelemetryDataController:fetchTodaysMileage: Error fetching vehicle from questDb`, error);
    }
    logDebug(`VehicleTelemetryDataController:fetchTodaysMileage: odometer data fetched for vehicle`, vehicleNumbers, vehicletelemetry);
    return vehicletelemetry;
}


export const fetchLatestGeofenceReportNameOfOrg = async (orgId: string) => {
    logDebug(`VehicleTelemetryDataController:fetchLatestGeofenceReportNameOfOrg: Entering with orgId ${orgId} `);
    let latestReportName: any[] = [];
    // select reportName from geofence_telemetry_report where organization='bmc' limit -1;
    const query = `SELECT reportName,
                        from ${geofenceTelemetryReportTable} 
                            where orgId='${orgId}' limit -1 `;
    try {
        const response = await axios.get(
            `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
        );
        const json = await response.data;

        const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
        const dataset: (string | number | null)[][] = json.dataset;

        latestReportName = dataset.map(row => {
            const obj: { [key: string]: string | number | null } = {};
            columns.forEach((col, index) => {
                obj[col] = row[index];  // Map each column name to the corresponding value in the row
            });
            return obj;
        });
    }
    catch (error) {
        logError(`VehicleTelemetryDataController:fetchLatestGeofenceReportNameOfOrg: Error fetching reportName from questDb`, error);
    }
    logDebug(`VehicleTelemetryDataController:fetchLatestGeofenceReportNameOfOrg: latest geofence report fetched`, latestReportName[0]);
    return latestReportName[0];
}

/** Returns the daily count of touched geolocation all the vehicles */
export const fetchTodaysTouchedGeolocationCount = async (vehicleNumbers: string, orgId: string) => {
    logDebug(`VehicleTelemetryDataController:fetchTodaysTouchedGeolocationCount:Entering with vehicle Numbers ${vehicleNumbers} `, vehicleNumbers);
    let vehicletelemetry: any[] = [];

    // We need to pull the latest geofence report name and pass that to below query.  Reason - The reports will be created multiple times
    // throughout the day and to select actual touched geolocation count we need to look into the latest report only.

    const latestGeofenceReportName = await fetchLatestGeofenceReportNameOfOrg(orgId);

    if (latestGeofenceReportName) {
        logDebug(`VehicleTelemetryDataController:fetchTodaysTouchedGeolocationCount:found report name:`, latestGeofenceReportName);
        const query = `SELECT vehicleNumber,
                    count(1) as touchedLocationCount
                        from ${geofenceTelemetryReportTable} 
                            where vehicleNumber in (${vehicleNumbers}) and orgId='${orgId}' and touchedLocation=true and reportName='${latestGeofenceReportName.reportName}'
                            and ${questDBTimeRangeToday} group by vehicleNumber `;
        logDebug(`VehicleTelemetryDataController:fetchTodaysTouchedGeolocationCount:query:`, query);
        try {
            const response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
            );
            const json = await response.data;

            const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
            const dataset: (string | number | null)[][] = json.dataset;

            vehicletelemetry = dataset.map(row => {
                const obj: { [key: string]: string | number | null } = {};
                columns.forEach((col, index) => {
                    obj[col] = row[index];  // Map each column name to the corresponding value in the row
                });
                return obj;
            });
        }
        catch (error) {
            logError(`VehicleTelemetryDataController:fetchTodaysTouchedGeolocationCount: Error fetching vehicle from questDb`, error);
        }
        logDebug(`VehicleTelemetryDataController:fetchTodaysTouchedGeolocationCount: telemetry data fetched for vehicle`, vehicleNumbers, vehicletelemetry);
        return vehicletelemetry;
    }
}

/** 
 * Method to fetch vehicle's start time today.  This will return the result of all vehicles if input is missing.
 * Expected input 
 *  ["OD021111", "OD02222", "OD023333"]
 */
export const fetchVehicleStartTimeToday = async (vehicles: string[]) => {
    logDebug(`VehicleTelemetryDataController:fetchVehicleStartTimeToday: Entering with vehicle Numbers: `, vehicles);
    let result;

    try {
        const query = `SELECT vehicleNumber, min(timestamp) as startTime
                        from ${vehicleTelemetryTable} where vehicleNumber in (${vehicles}) and ignition=1 and ${questDBTimeRangeToday} `;
        logDebug(`VehicleTelemetryDataController:fetchVehicleStartTimeToday: query:`, query);

        const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
        const json = await response.data;

        const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
        const dataset: (string | number | null)[][] = json.dataset;

        result = dataset.map(row => {
            const obj: { [key: string]: string | number | null } = {};
            columns.forEach((col, index) => {
                obj[col] = row[index];  // Map each column name to the corresponding value in the row
            });
            return obj;
        });
    }
    catch (error) {
        logError(`VehicleTelemetryDataController:fetchVehicleStartTimeToday:`, error);
    }
    logDebug(`VehicleTelemetryDataController:fetchVehicleStartTimeToday: Running vehicles from questDb.`, result);
    return result;
}

export const fetchRunningVehicleCount = async (req: Request, res: Response) => {

    logInfo(`*** VehicleTelemetryDataController: fetchRunningVehicleCount: Is this being used ??? ***`);
    // steps to fetch currently in-flight vehicles correspond to the organization
    // 1. get the list of vehicles of the organization from firestore
    // 2. query questDB with the list of vehicles with ignition=1 and get the count

    let result = 0;
    try {
        const getAllVehicles = await fetchAllVehicleByOrganization(req, res); // #1
        const vehicleNumbers = getAllVehicles.map(vehicleNumber => `'${vehicleNumber}'`).join(', ');
        const query = `SELECT vehicleNumber, ignition
            from ${vehicleTelemetryTable} 
                where vehicleNumber in (${vehicleNumbers}) 
                    LATEST ON timestamp PARTITION BY vehicleNumber;`;

        try {
            const response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
            );
            const json = await response.data;

            // results = json.dataset[0][0];

            result = json.dataset.reduce((accumulator: number, currentValue: number[]) => {
                if (currentValue[1] === 1) {
                    return accumulator + 1;  // Increment the sum if the second value is 1
                }
                return accumulator; // Otherwise, return the accumulator unchanged
            }, 0);
        }
        catch (error) {
            // console.log(`fetchRunningVehicleCount. Error fetching vehicle from questDb. ${error}`);
        }
        // console.log("Mapped Results:", result);
    }
    catch (error) {
        res.status(400).json({ error: "Error fetching vehicle: " + error });
    }
    // return result;
    res.status(200).json(result);
}

export const fetchRunningVehicleCountSSE = async (req: Request, res: Response) => {

    const { orgId, vendorId } = req.query;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    logDebug(`VehicleTelemetryDataController: fetchRunningVehicleCountSSE: Entering with orgId ${orgId} and vendorId ${vendorId}`, orgId, vendorId);

    const result = await fetchRunningVehicleCountForSSE(orgId, vendorId);
    logDebug(`VehicleTelemetryDataController:fetchRunningVehicleCountSSE: data being sent first time:`, result);
    res.write(`data:${JSON.stringify(result)}\n\n`);

    ////////////// logic to push data every 5 sec Starts
    const interval = setInterval(async () => {
        const result = await fetchRunningVehicleCountForSSE(orgId, vendorId);
        logDebug(`VehicleTelemetryDataController:fetchRunningVehicleCountSSE: data being sent again:`, result);
        res.write(`data:${JSON.stringify(result)}\n\n`);
    }, sseDataPushInterval as number); // pushing data every 5 secs

    req.on('close', () => {
        clearInterval(interval);
        res.end();
    });
    ////////////// 
}

const fetchRunningVehicleCountForSSE = async (orgId: any, vendorId: any) => {
    logDebug(`VehicleTelemetryDataController: fetchRunningVehicleCountForSSE: inside with orgId ${orgId}`, orgId);

    // steps to fetch currently in-flight vehicles correspond to the organization
    // 1. get the list of vehicles of the organization from postgresql
    // 2. query questDB with the list of vehicles with ignition=1 and get the count
    const queryString = '';
    let result;
    try {
        const allVehicles = await fetchAllVehicleByOrganization2(orgId, vendorId, queryString); // #1
        if (allVehicles.length > 0) {
            const vehicleNumbers = allVehicles.map((vehicle: any) => `'${vehicle.vehicleNumber}'`).join(', ');
            logDebug(`VehicleTelemetryDataController: fetchRunningVehicleCountForSSE: vehicles appended for query`, vehicleNumbers);

            // const query = `select * from ( SELECT vehicleNumber, ignition
            //                 from ${vehicleTelemetryTable} 
            //                     where vehicleNumber in (${vehicleNumbers}) 
            //                         LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=1`;

            // const response = await axios.get(
            //     `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
            // );
            // const json = await response.data;
            // result = json.dataset.reduce((accumulator: number, currentValue: number[]) => {
            //     if (currentValue[1] === 1) {
            //         return accumulator + 1;  // Increment the sum if the second value is 1
            //     }
            //     return accumulator; // Otherwise, return the accumulator unchanged
            // }, 0);

            /** Off vehicles */
            const ignitionOffVehiclesCount = await ignitionOffVehicleCount(vehicleNumbers);

            /** IDLE vehicles */
            const idleVehiclesCount = await idleVehicleCount(vehicleNumbers);

            /** Running vehicles speed >0 and  <=45 */
            const runningVehiclesCount = await runningVehicleCount(vehicleNumbers);

            /** Speeding vehicles speed > 45 */
            const speedingVehiclesCount = await speedingVehicleCount(vehicleNumbers);

            result = {
                totalIgnitionOnOffCount: ignitionOffVehiclesCount + idleVehiclesCount + runningVehiclesCount + speedingVehiclesCount,
                ignitionOffVehiclesCount: ignitionOffVehiclesCount,
                idleVehiclesCount: idleVehiclesCount,
                runningVehiclesCount: runningVehiclesCount,
                speedingVehiclesCount: speedingVehiclesCount
            };
        }
    } catch (error) {
        logger.error(error);
    }
    logDebug(`VehicleTelemetryDataController: fetchRunningVehicleCountForSSE. vehicle count statuses from questDb. ${JSON.stringify(result)}`,);
    return result;
}

const ignitionOffVehicleCount = async (vehicleNumbers: string) => {
    const idleVehicleSqlString = `select count(*) from ( SELECT vehicleNumber, ignition, speed
    from ${vehicleTelemetryTable} 
    where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=0`;

    const ignitionOffVehicleResponse = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(idleVehicleSqlString)}`,
    );
    const ignitionOffVehiclesCount = await ignitionOffVehicleResponse.data.dataset[0][0];

    // const idleVehiclesCount = idleVehicleJson.dataset[0][0];
    // const idleVehicles = idleVehicleJson.dataset.reduce((accumulator: number, currentValue: number[]) => {
    // if (currentValue[1] === 1) {
    //     return accumulator + 1;  // Increment the sum if the second value is 1
    // }
    // return accumulator; // Otherwise, return the accumulator unchanged
    // }, 0);
    return ignitionOffVehiclesCount;
}

export const fetchVehiclesWithIgnitionOff = async (vehicleNumbers: string) => {
    logDebug(`VehicleTelemetryDataController:fetchAllVehiclesWithIgnitionOff: Entering`);
    const query = `select * from ( SELECT vehicleNumber, ignition, speed, timestamp from ${vehicleTelemetryTable}
            where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=0 ` ;

    const data = await queryQuestDB(query);
    logDebug(`VehicleTelemetryDataController:fetchVehiclesWithIgnitionOff. Fetched vehicles with ignition off from questDb. ${JSON.stringify(data)}`, data);
    return data;
}

/** Idle Vehicles: Ignition=1 && Speed=0 */
export const idleVehicleCount = async (vehicleNumbers: string) => {
    const idleVehicleSqlString = `select count(*) from ( SELECT vehicleNumber, ignition, speed
    from ${vehicleTelemetryTable} 
    where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=1 and speed=0`;

    const idleVehicleResponse = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(idleVehicleSqlString)}`,
    );
    const idleVehiclesCount = await idleVehicleResponse.data.dataset[0][0];


    // const idleVehiclesCount = idleVehicleJson.dataset[0][0];
    // const idleVehicles = idleVehicleJson.dataset.reduce((accumulator: number, currentValue: number[]) => {
    // if (currentValue[1] === 1) {
    //     return accumulator + 1;  // Increment the sum if the second value is 1
    // }
    // return accumulator; // Otherwise, return the accumulator unchanged
    // }, 0);
    return idleVehiclesCount;
}

/** Idle Vehicles: Ignition=1 && Speed=0 */
export const fetchIdleVehicles = async (vehicleNumbers: string) => {
    logDebug(`VehicleTelemetryDataController:fetchAllVehiclesWithIgnitionOff: Entering`);
    const query = `select * from ( SELECT vehicleNumber, ignition, speed, timestamp from ${vehicleTelemetryTable}
            where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=1 and speed=0 ` ;

    const data = await queryQuestDB(query);
    logDebug(`VehicleTelemetryDataController:fetchIdleVehicle. Fetched Idle vehicles from questDb. ${JSON.stringify(data)}`, data);
    return data;
}

/** Running Vehicles: ignition=1 and speed>0 and speed <= 45 */
export const runningVehicleCount = async (vehicleNumbers: string) => {
    const runningVehicleSqlString = `select count(*) from ( SELECT vehicleNumber, ignition, speed
    from ${vehicleTelemetryTable} 
    where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=1 and speed>0 and speed <= 45`; // TODO remove overspeed hardcoding

    const runningVehicleResponse = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(runningVehicleSqlString)}`,
    );
    const runningVehiclesCount = await runningVehicleResponse.data.dataset[0][0];

    // const runningVehiclesCount = runningVehicleJson.dataset[0][0];
    // const runningVehicles = idleVehicleJson.dataset.reduce((accumulator: number, currentValue: number[]) => {
    // if (currentValue[1] === 1) {
    //     return accumulator + 1;  // Increment the sum if the second value is 1
    // }
    // return accumulator; // Otherwise, return the accumulator unchanged
    // }, 0);
    return runningVehiclesCount;
}

/** Running Vehicles: ignition=1 and speed>0 and speed <= 45 */
export const fetchRunningVehicles = async (vehicleNumbers: string) => {
    logDebug(`VehicleTelemetryDataController:fetchAllVehiclesWithIgnitionOff: Entering`);
    const query = `select * from ( SELECT vehicleNumber, ignition, speed, timestamp from ${vehicleTelemetryTable}
            where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=1 and speed>0 and speed <= 45 ` ;

    const data = await queryQuestDB(query);
    logDebug(`VehicleTelemetryDataController:fetchIdleVehicle. Fetched Idle vehicles from questDb. ${JSON.stringify(data)}`, data);
    return data;
}

/** Speeding Vehicles: ignition=1 and speed> 45 */
export const speedingVehicleCount = async (vehicleNumbers: string) => {
    const speedingVehicleSqlString = `select count(*) from ( SELECT vehicleNumber, ignition, speed
    from ${vehicleTelemetryTable} 
    where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=1 and speed> 45`; // TODO remove overspeed hardcoding

    const speedingVehicleResponse = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(speedingVehicleSqlString)}`,
    );
    const speedingVehiclesCount = await speedingVehicleResponse.data.dataset[0][0];

    // const speedingVehiclesCount = speedingVehicleJson.dataset[0][0];
    // const speedingVehicles = idleVehicleJson.dataset.reduce((accumulator: number, currentValue: number[]) => {
    // if (currentValue[1] === 1) {
    //     return accumulator + 1;  // Increment the sum if the second value is 1
    // }
    // return accumulator; // Otherwise, return the accumulator unchanged
    // }, 0);
    return speedingVehiclesCount;
}

/** Speeding Vehicles: ignition=1 and speed> 45 */
export const fetchSpeedingVehicles = async (vehicleNumbers: string) => {
    logDebug(`VehicleTelemetryDataController:fetchAllVehiclesWithIgnitionOff: Entering`);
    const query = `select * from ( SELECT vehicleNumber, ignition, speed, timestamp from ${vehicleTelemetryTable}
            where vehicleNumber in (${vehicleNumbers})
            LATEST ON timestamp PARTITION BY vehicleNumber ) where ignition=1 and speed> 45 ` ;

    const data = await queryQuestDB(query);
    logDebug(`VehicleTelemetryDataController:fetchIdleVehicle. Fetched Idle vehicles from questDb. ${JSON.stringify(data)}`, data);
    return data;
}

/**
 * Method called from the dashboard-map
 * Method fetches all vehicle status running/not running from quest DB
 */
export const fetchAllVehiclesSSE = async (req: Request, res: Response) => {

    let { orgId, vendorId, encodedViewport, query } = req.query;
    // console.log(`request: ${JSON.stringify(req.query)}`);

    let viewport = '';
    let searchParam = '';
    if (query) {
        searchParam = query as string;
    }
    if (encodedViewport) {
        viewport = JSON.parse(String(encodedViewport));
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await fetchAllVehiclesForSSE(orgId, vendorId, searchParam, viewport);
    logDebug(`VehicleTelemetryDataController:fetchAllVehiclesSSE: data being sent first time:`, result);
    res.write(`data:${JSON.stringify(result)}\n\n`);
    // res.status(200).json(result);

    ////////////// logic to push the data every 5 sec Starts
    const interval = setInterval(async () => {
        const result = await fetchAllVehiclesForSSE(orgId, vendorId, searchParam, viewport);
        // console.log(`VehicleTelemetryDataController:fetchRunningVehicleCountSSE: data being sent again ${result}`);
        res.write(`data:${JSON.stringify(result)}\n\n`);
        // res.status(200).json(result);
    }, sseDataPushInterval as number);

    req.on('close', () => {
        clearInterval(interval);
        res.end();
    });
    ////////////// 

}

const fetchAllVehiclesForSSE = async (orgId: any, vendorId: any, query: string, viewport: any) => {

    // steps to fetch all vehicles with their location info and running status correspond to the organization
    // 1. get the list of vehicles of the organization from postgresql db / cache
    // 2. query questDB with the list of vehicles

    logDebug(`VehicleTelemetryDataController: fetchAllVehiclesForSSE: Entering with orgId:${orgId}, vendorId:${vendorId} and viewport:${JSON.stringify(viewport)}`);
    let results: any[] = [];
    try {
        const allVehicles = await fetchAllVehicleByOrganization2(orgId, vendorId, query); // #1
        let viewportQuery = '';
        // if(viewport.north && viewport.south && viewport.east && viewport.west){
        //     viewportQuery = `and latitude <= ${viewport.north} and latitude >= ${viewport.south} and longitude <= ${viewport.east} and longitude >= ${viewport.west}`;
        // }
        if (allVehicles.length > 0) {
            const vehicleNumbers = allVehicles.map((vehicle: any) => `'${vehicle.vehicleNumber}'`).join(', ');
            logDebug(`VehicleTelemetryDataController: fetchAllVehiclesForSSE: vehicles appended for query`, vehicleNumbers);

            const query = `SELECT vehicleNumber, latitude, longitude, ignition, speed
                                from ${vehicleTelemetryTable} 
                                    where ignition!=null and vehicleNumber in (${vehicleNumbers}) ${viewportQuery}
                                        LATEST ON timestamp PARTITION BY vehicleNumber;`;

            logDebug(`VehicleTelemetryDataController:fetchAllVehiclesForSSE: query:`, query);
            const response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(query)}`,
            );

            const json = await response.data;

            const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
            const dataset: (string | number | null)[][] = json.dataset;

            results = dataset.map(row => {
                const obj: { [key: string]: string | number | null } = {};
                columns.forEach((col, index) => {
                    obj[col] = row[index];  // Map each column name to the corresponding value in the row
                });
                return obj;
            });
        }
        logDebug(`VehicleTelemetryDataController:fetchAllVehiclesForSSE: All Vehicles with their current statuses:`, results);
    }
    catch (error) {
        // res.status(400).json({ error: "Error fetching vehicle: " + error });
    }
    return results;
}

// TODO delete this
// export const fetchVehicleTelemetryReport = async (req: Request, res: Response) => {
//     const { page, query, orgId } = req.query;
//     let vehicletelemetry: any[] = [];
//     let whereClauses = '';

//     const newQuery: any = query;
//     console.log(`query string ${newQuery}`);
//     if(query){
//         whereClauses = jsonToString(JSON.parse(newQuery));
//     }
//     console.log(`whereClauses string ${whereClauses}`);
//     // if (query) {
//     //     whereClauses = `and (reportName like '%${query}%' or vehicleNumber like '%${query}%' or geofenceLocationGroupName like '%${query}%' or geofenceLocationTag like '%${query}%' )`;
//     // }

//     // console.log(`VehicleTelemetryDataController:fetchVehicleTelemetryReport: where clause formed- ${whereClauses}`);
//     // const [results] = await sequelize.query(`select * from VehicleTelemetryReport where organization=? ${whereClauses}`, {
//     //     replacements: [orgId],
//     //     type: QueryTypes.RAW,
//     // });

//     let queryString = `select * from ${geofenceTelemetryReportTable} where organization='${orgId}' ${whereClauses}`;
//     const response = await axios.get(
//         `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
//     );
//     const json = await response.data;

//     const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
//     const dataset: (string | number | null)[][] = json.dataset;

//     vehicletelemetry = dataset.map(row => {
//         const obj: { [key: string]: string | number | null } = {};
//         columns.forEach((col, index) => {
//             obj[col] = row[index];  // Map each column name to the corresponding value in the row
//         });
//         return obj;
//     });

//     // console.log(`VehicleTelemetryDataController:fetchVehicleTelemetryReport: fetchVehicleTelemetryReport returned- ${JSON.stringify(vehicletelemetry)}`);
//     res.status(200).json(vehicletelemetry);
// }

export const fetchVehicleTelemetryReport = async (req: Request, res: Response) => {
    let vehicletelemetry: any[] = [];
    let whereClauses = '';

    const orgId = req.query.orgId;
    const start = parseInt(req.query.start as string) || 0;
    const size = parseInt(req.query.size as string) || 0;
    // const filters = JSON.parse(req.query.filters || '[]');
    // const globalFilter = req.query.globalFilter || '';
    // const sorting = JSON.parse(req.query.sorting || '[]');
    logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryReport: Entering with orgId: ${orgId}`, orgId);
    logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryReport: request received:`, req.query);

    try {
        const count = await fetchVehicleTelemetryReportCount(orgId);

        let begin = 0;
        let end = 0;

        begin = count[0]?.count - (start ?? 0);
        end = begin - (size ?? 0);

        if (begin < 0) {
            begin = 0;
        }
        if (end < 0) {
            end = 0;
        }

        logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryReport: begin end indexes ${begin} ${end}`);

        let queryString = `select * from ${vehicleTelemetryReportTable} where orgId='${orgId}' ${whereClauses} order by timestamp desc limit -${begin}, -${end}`;
        let response;
        if (begin >= 0 && end >= 0) {
            response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
            );
        }
        const json = await response?.data;

        const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
        const dataset: (string | number | null)[][] = json.dataset;

        vehicletelemetry = dataset.map(row => {
            const obj: { [key: string]: string | number | null } = {};
            columns.forEach((col, index) => {
                obj[col] = row[index];  // Map each column name to the corresponding value in the row
            });
            return obj;
        });

        const finalResponse = convertToReportApiResponse(vehicletelemetry, count);
        logDebug(`VehicleTelemetryDataController:fetchGeofenceTelemetryReport: final Response`, finalResponse);

        res.status(200).json(finalResponse);
    }
    catch (error) {
        res.status(500).json(`error fetching Vehicle Report`);
    }
}

/** This is the count fetched for the data population on the table on the UI */
const fetchVehicleTelemetryReportCount = async (orgId: any) => {
    logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryReportCount: Entering with orgId: ${orgId}`, orgId);
    let count: any[] = [];
    const queryString = `select count(1) from ${vehicleTelemetryReportTable} where orgId='${orgId}'`;

    const response = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
    );

    const json = await response.data;

    // console.log(`fetchGeofenceTelemetryReport: response json ${JSON.stringify(json)}`);
    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    count = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryReportCount: Exiting with orgId: ${orgId} and count: ${count}`, orgId, count);
    return count;
}

export const fetchGeofenceTelemetryReport = async (req: Request, res: Response) => {
    let geofencetelemetry: any[] = [];
    let whereClauses = '';

    const orgId = req.query.orgId;
    const start = parseInt(req.query.start as string) || 0;
    const size = parseInt(req.query.size as string) || 0;
    // const filters = JSON.parse(req.query.filters || '[]');
    // const globalFilter = req.query.globalFilter || '';
    // const sorting = JSON.parse(req.query.sorting || '[]');
    logDebug(`VehicleTelemetryDataController: fetchGeofenceTelemetryReport: Entering with orgId: ${orgId}`, orgId);
    logDebug(`VehicleTelemetryDataController: fetchGeofenceTelemetryReport: request received`, req.query);

    // const newQuery: any = query;
    // console.log(`query string ${newQuery}`);
    // if(query){
    //     whereClauses = jsonToString(JSON.parse(newQuery));
    // }
    // console.log(`whereClauses string ${whereClauses}`);
    // if (query) {
    //     whereClauses = `and (reportName like '%${query}%' or vehicleNumber like '%${query}%' or geofenceLocationGroupName like '%${query}%' or geofenceLocationTag like '%${query}%' )`;
    // }

    // console.log(`VehicleTelemetryDataController:fetchVehicleTelemetryReport: where clause formed- ${whereClauses}`);
    // const [results] = await sequelize.query(`select * from VehicleTelemetryReport where organization=? ${whereClauses}`, {
    //     replacements: [orgId],
    //     type: QueryTypes.RAW,
    // });

    try {
        const count = await fetchGeofenceTelemetryReportcount(orgId);

        let begin = 0;
        let end = 0;

        begin = count[0]?.count - (start ?? 0);
        end = begin - (size ?? 0);

        if (begin < 0) {
            begin = 0;
        }
        if (end < 0) {
            end = 0;
        }

        logDebug(`VehicleTelemetryDataController:fetchGeofenceTelemetryReport: begin end indexes ${begin} ${end}`);

        let queryString = `select * from ${geofenceTelemetryReportTable} where orgId='${orgId}' ${whereClauses} order by timestamp desc limit -${begin}, -${end}`;
        let response;
        if (begin >= 0 && end >= 0) {
            response = await axios.get(
                `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
            );
        }
        const json = await response?.data;

        // console.log(`fetchGeofenceTelemetryReport: response json ${JSON.stringify(json)}`);
        const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
        const dataset: (string | number | null)[][] = json.dataset;

        geofencetelemetry = dataset.map(row => {
            const obj: { [key: string]: string | number | null } = {};
            columns.forEach((col, index) => {
                obj[col] = row[index];  // Map each column name to the corresponding value in the row
            });
            return obj;
        });
        const finalResponse = convertToReportApiResponse(geofencetelemetry, count);
        logDebug(`VehicleTelemetryDataController:fetchGeofenceTelemetryReport: Exinging with final Response`, finalResponse);

        res.status(200).json(finalResponse);
    }
    catch (error) {
        logError(`Error fetching geofence Telemetry Report`, error);
        res.status(500).json(`error loading Geofence Report`);
    }
}

const fetchGeofenceTelemetryReportcount = async (orgId: any) => {
    logDebug(`VehicleTelemetryDataController: fetchGeofenceTelemetryReportcount: Entering with orgId: ${orgId} `, orgId);
    let count: any[] = [];
    const queryString = `select count(1) from ${geofenceTelemetryReportTable} where orgId='${orgId}'`;

    const response = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
    );

    const json = await response.data;

    // console.log(`fetchGeofenceTelemetryReport: response json ${JSON.stringify(json)}`);
    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    count = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    logDebug(`VehicleTelemetryDataController: fetchGeofenceTelemetryReportcount: Exiting. count returned value: ${JSON.stringify(count)}`);
    return count;
}

// const fetchVehicleTelemetryReportcount = async (orgId: any) => {
//     let count: any[] = [];
//     const queryString = `select count(1) from ${vehicleTelemetryDataIngest} where organization='${orgId}'`;

//     const response = await axios.get(
//         `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
//     );

//     const json = await response.data;

//     // console.log(`fetchGeofenceTelemetryReport: response json ${JSON.stringify(json)}`);
//     const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
//     const dataset: (string | number | null)[][] = json.dataset;

//     count = dataset.map(row => {
//         const obj: { [key: string]: string | number | null } = {};
//         columns.forEach((col, index) => {
//             obj[col] = row[index];  // Map each column name to the corresponding value in the row
//         });
//         return obj;
//     });

//     // console.log(`fetchVehicleTelemetryReportcount: count returned value: ${JSON.stringify(count)}`);
//     return count;
// }

// TODO delete this.
export const fetchVehicleTelemetryReportGroupByReportName = async (req: Request, res: Response) => {
    const { page, query, orgId } = req.query;
    let vehicletelemetry: any[] = [];


    let queryString = `SELECT 
                            reportName, vehicleNumber,
                            CASE 
                                WHEN COUNT(CASE WHEN touchedLocation = false THEN 1 END) = COUNT(1) THEN 'No'
                                WHEN COUNT(CASE WHEN touchedLocation = true THEN 1 END) = COUNT(1) THEN 'Yes'
                                ELSE 'No'
                            END AS touchedAllLocation
                            FROM 
                                ${geofenceTelemetryReportTable} where orgId='${orgId}'
                            GROUP BY 
                                reportName, vehicleNumber`;
    const response = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
    );
    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    vehicletelemetry = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    console.log(`VehicleTelemetryDataController:fetchVehicleTelemetryReportGroupByReportName: returned:`, vehicletelemetry);
    res.status(200).json(vehicletelemetry);
}

export const fetchVehicleTelemetryReportGroupByReportNameVehicleNumber = async (req: Request, res: Response) => {
    const { page, query, orgId } = req.query;
    let vehicletelemetry: any[] = [];

    console.log(`query string received- ${query}`);

    let queryString = `SELECT 
                            reportName,vehicleNumber,
                            CASE 
                                WHEN COUNT(CASE WHEN touchedLocation = false THEN 1 END) = COUNT(1) THEN 'No'
                                WHEN COUNT(CASE WHEN touchedLocation = true THEN 1 END) = COUNT(1) THEN 'Yes'
                                ELSE 'No'
                            END AS touchedAllLocation
                            FROM 
                                ${geofenceTelemetryReportTable} where orgId='${orgId}'
                            GROUP BY 
                                reportName, vehicleNumber`;
    const response = await axios.get(
        `http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`,
    );
    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    vehicletelemetry = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    console.log(`VehicleTelemetryDataController:fetchVehicleTelemetryReportGroupByReportNameVehicleNumber: returned:`, vehicletelemetry);
    res.status(200).json(vehicletelemetry);
}


export const createGeofenceTelemetryReport = async (req: Request, res: Response) => {

    // TODO make this API run in a job - tech - Bull + Redis
    // TODO performance improvements
    /*
        Steps - 
        1. Load the vehicles of the organization
            select vehicleNumber, geofenceLocationGroupName from Vehicle where organization=?;
        2. LOOP 1 - For each vehicle in above query, take the geofenceLocationGroupName and run below query 
            to get vehicles assigned geofence locations.
            select geofencelocation.center, geofencelocation.radius from geofencelocation
                where geofencelocation.organization=:orgId and geofencelocationgroup.
                    and geofencelocation.geofenceLocationGroupName=:geofenceLocationGroupName;
        3. LOOP 2 - Fetch telemetry data of the vehicle for the time duration from questDB
            
            Then check below condition - 
            geolib.isPointWithinRadius(
                { latitude: 51.525, longitude: 7.4575 },  -- Location from loop1, geofence location
                { latitude: 51.5175, longitude: 7.4678 }, -- location of vehicle
                50 - set Default.  Or read from LOOP 1, Can take the Geofence data created originally.
            );
            if true - set touchedLocation=true, violation=false
            if false - set touchedLocation=false, violation=true
                insert into VehicleTelemetryReport
                    (reportName, vehicleNumber, geofenceLocationGroupName, geofenceLocationTag, touchedLocation, violationsRecorded, timeSpent)
                    values
                    ('bmcReport_001', 'OD021111', 'satyaNagar1', 'tag1', true, false, 5)

    
    1.select vehicleNumber, geofenceLocationGroupName from Vehicle where organization=?
    |
     --loop on vehicles
        |
         -- if vehicle has a geofenceLocationGroupName == true
            |
             --Fetch vehicle's telemetry data from questDB
             --Fetch geofence locations assigned to the vehicle from mysql GeofenceLocation table
                |
                 -- loop on geofence location
                    |
                     -- if geofence location's lat/lng matches vehicle's telemetry lat/lng
                        break the loop
                        insert a record in to vehicleTelemetryReport with match==true, for the vehicle + geofence location
                     -- if geofence location's lat/lng DOE SNOT match with all vehicle's telemetry lat/lng
                        insert a record in to vehicleTelemetryReport with match==false, for the vehicle + geofence location

    performance - 1 vehicle * 8 geofences * 8 vehicle telemetry records => 40ms
                200 vehicle * 50000 geofences * 3000 ehicle telemetry records => ??
    */

    const { page, query, orgId } = req.query;

    // console.log(`VehicleTelemetryDataController:createVehicleTelemetryReport. Creating new Report for organization: ${orgId} at time: ${new Date()}`);  

    processGeofenceTelemetryReport(orgId).catch(error => console.error(error));

    res.status(200).json("success");
}


export const processGeofenceTelemetryReport = async (orgId: any) => {
    const executionStartTime = Date.now();
    const reportName = orgId + '_geofence_' + formatTimestamp(executionStartTime);
    logInfo(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Execution started at: ${executionStartTime}`);
    // #1: Fetch all vehicles from mysql Vehicle table
    const allVehicles = await fetchVehicleAndGeoByOrganization(orgId);
    logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Vehicles fetched:`, allVehicles);

    // #2: Loop through vehicles
    for (const vehicle of allVehicles) {
        logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Processing vehicle number: ${vehicle.vehicleNumber}`);
        logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Geofence Group name: ${vehicle.geofenceLocationGroupName}`);

        // Work only on the vehicles that have a geofence assigned.
        if (vehicle.geofenceLocationGroupName) {
            // Fetch vehicle's telemetry data from questDB

            // TODO fetch telemetry data for the vehicle / telemetry group 's min - max time + buffer
            /**
             * select min("scheduleArrival") as minArrivalTime, max("scheduleArrival") as maxArrivalTime from "GeofenceLocation" gl where "geofenceLocationGroupName" ='5868_UNIT-8'
             * 
             * Fetch vehicle telemetry data between this time frame + buffer 30 mins
             */

            const scheduleArrivalTimes = await searchMinMaxScheduleArrivalTimeByGroup(orgId, vehicle.geofenceLocationGroupName);

            // const vehicleTelemetry = await fetchVehicleTelemetryDataByVehicleNumber(vehicle.vehicleNumber);
            const vehicleTelemetry = await fetchVehicleTelemetryDataByVehicleNumberInTimeWindow(vehicle.vehicleNumber, scheduleArrivalTimes.minArrivalTime, scheduleArrivalTimes.maxArrivalTime);

            logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Fetched telemetry data, for vehicle: ${vehicle.vehicleNumber}`, vehicleTelemetry);

            if (vehicleTelemetry && vehicleTelemetry.length <= 0) {
                logInfo(`VehicleTelemetryDataController:processGeofenceTelemetryReport: No telemetry data fetched for vehicle ${vehicle.vehicleNumber}. No Reports will be generated.`);
                continue;
            }
            // Fetch geofence locations assigned to the vehicle from mysql GeofenceLocation table
            const geofencesWithLatLng = await searchGeofenceLocationsByGroup(orgId, vehicle.geofenceLocationGroupName);
            // logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Geofences:`, geofencesWithLatLng);

            // Loop through each geofence Location
            for (const geofence of geofencesWithLatLng) {
                if (geofence.geofenceType === 'circle') {
                    const centerlatLng = JSON.parse(geofence.center);

                    let matchTrueFalse = false;
                    let scheduleArrival = geofence.scheduleArrival;
                    let time;
                    // Loop through each telemetry data record
                    if (vehicleTelemetry) {
                        for (const eachTelemetry of vehicleTelemetry) {

                            logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport:MATCHING - eachTelemetry.lat: ${eachTelemetry.latitude}, eachTelemetry.lng: ${eachTelemetry.longitude}, geofence.center.lat: ${centerlatLng.lat}, geofence.center.lng ${centerlatLng.lng}`);

                            matchTrueFalse = isPointWithinRadius(
                                { latitude: centerlatLng.lat, longitude: centerlatLng.lng },
                                { latitude: eachTelemetry.latitude, longitude: eachTelemetry.longitude },
                                pointWithinRadius as number //meters
                            );

                            if (matchTrueFalse) {
                                logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport:MATCHED - eachTelemetry.lat: ${eachTelemetry.latitude}, eachTelemetry.lng: ${eachTelemetry.longitude}, geofence.center.lat: ${centerlatLng.lat}, geofence.center.lng ${centerlatLng.lng}`);
                                //TODO calculate time spend at this location
                                // console.log(`geofence`, geofence);
                                time = await timeSpentAtThisLocation(vehicle.vehicleNumber, eachTelemetry.latitude, eachTelemetry.longitude, eachTelemetry.geohash, scheduleArrival);
                                break;
                            }
                        }
                    }

                    const scheduleArrivalTime = geofence.scheduleArrival;
                    const timeSpent = time?.timespent ? Number(time?.timespent) : 0;
                    const arrivalTime = time?.mintime ? String(time?.mintime) : null;
                    const departureTime = time?.maxtime ? String(time?.maxtime) : null;
                    // console.log(`time value returned:`, time);
                    // console.log(`arrival/departure time value returned:`, arrivalTime, departureTime);
                    // try {
                    //  Total records - Number of Vehicles x number of geofence locations
                    // logDebug(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Inserting into geofence report table`, geofence.tag, timeSpent, scheduleArrival, arrivalTime, departureTime);
                    if (arrivalTime && departureTime) {
                        const row = await sender.table(`${geofenceTelemetryReportTable}`)
                            .symbol('reportName', reportName)
                            .symbol('orgId', orgId)
                            .symbol('vehicleNumber', vehicle.vehicleNumber)
                            .stringColumn('geofenceLocationGroupName', vehicle.geofenceLocationGroupName)
                            .stringColumn('geofenceLocationTag', geofence.tag)
                            .booleanColumn('touchedLocation', matchTrueFalse)
                            .floatColumn('timeSpent', timeSpent)
                            .stringColumn('scheduleArrivalTime', scheduleArrivalTime)
                            .stringColumn('arrivalTime', arrivalTime!)
                            .stringColumn('departureTime', departureTime!)
                            .atNow();
                    }
                    else {
                        const row = await sender.table(`${geofenceTelemetryReportTable}`)
                            .symbol('reportName', reportName)
                            .symbol('orgId', orgId)
                            .symbol('vehicleNumber', vehicle.vehicleNumber)
                            .stringColumn('geofenceLocationGroupName', vehicle.geofenceLocationGroupName)
                            .stringColumn('geofenceLocationTag', geofence.tag)
                            .booleanColumn('touchedLocation', matchTrueFalse)
                            .floatColumn('timeSpent', timeSpent)
                            .stringColumn('scheduleArrivalTime', scheduleArrivalTime)
                            .atNow();
                    }
                }
            }
        }
    }
    await sender.flush(); //Flushing explicitly because, this report will be used by vehicleTelemetryReport immediately.

    const executionEndTime = Date.now();
    const totalTimeTaken = executionEndTime - executionStartTime;

    await exportGeofenceTelemetryReport(reportName);

    logInfo(`VehicleTelemetryDataController:processGeofenceTelemetryReport: Execution ended at: ${executionEndTime}. Total time taken for Organization ${orgId}: ${totalTimeTaken} ms`);
    logDebug('VehicleTelemetryDataController:processGeofenceTelemetryReport: All vehicles processed.');
};


export const createVehicleTelemetryReport = async (req: Request, res: Response) => {
    const { page, query, orgId } = req.query;
    // console.log(`VehicleTelemetryDataController:createVehicleTelemetryReport2. Creating new Report for organization: ${orgId} at time: ${new Date()}`);  

    processVehicleTelemetryReport2(orgId).catch(error => console.error(error));
    res.status(200).json("success");
}

/** This is daily report generator API.  Monthly report will be generated on top of this */
export const processVehicleTelemetryReport2 = async (orgId: any) => {
    const executionStartTime = Date.now();
    const reportName = orgId + '_vehicle_' + formatTimestamp(executionStartTime);
    logInfo(`VehicleTelemetryDataController:processVehicleTelemetryReport2: Execution started at: ${executionStartTime}`);

    /**
     * Vehicle report table -
     *          report Type = day/month
     *          vehicleNumber
     *          Assigned geofence group
     *          scheduled start time (later)
     *          scheduled arrival time (later) 
     *          actual arrival time (later)
     *          distance covered(Odometer)
     *          assigned geolocations count - 
     *          touched geolocations count - 
     *          createdat
     *          
     * Steps
     * 1. fetch all vehicles and Geofence group, assigned gelocation count
     * select Vehicle.vehicleNumber, Vehicle.geofenceLocationGroupName, count(GeofenceLocation.geofenceLocationGroupName) from Vehicle, GeofenceLocation
        where Vehicle.geofenceLocationGroupName = GeofenceLocation.geofenceLocationGroupName and Vehicle.vehicleNumber='OD02AA9999' group by Vehicle.vehicleNumber;

        2. fetch odometer of all vehicles
     * 
     */


    // #1: Fetch all vehicles from mysql Vehicle table
    const getAllVehicles = await fetchVehicleAndGeoCountByOrganization(orgId);
    // console.log(`VehicleTelemetryDataController:processVehicleTelemetryReport2: Vehicles fetched: ${JSON.stringify(getAllVehicles)}`);

    const vehicleNumbers = getAllVehicles.map((vehicle: { vehicleNumber: any; }) => `'${vehicle.vehicleNumber}'`).join(',');
    const mileageReadings = await fetchTodaysMileage(vehicleNumbers);
    const touchedGeolocationCounts = await fetchTodaysTouchedGeolocationCount(vehicleNumbers, orgId);
    const vehicleStartTimeToday = await fetchVehicleStartTimeToday(vehicleNumbers);

    let geoLocationCountMap = [];
    if (touchedGeolocationCounts) {
        console.log(`touched Geolocation Counts length: ${touchedGeolocationCounts.length}`);
        if (touchedGeolocationCounts.length <= 0) {
            // logWarn(`VehicleTelemetryDataController:processVehicleTelemetryReport2:*** No GeofenceTelemetry Report got generated or No locations touched. Possibily query timestamp issue. ***`);
            // return;
            logWarn(`VehicleTelemetryDataController:processVehicleTelemetryReport2:*** Touched Location count=0. Vehicle might not have geofence group assigned ***`);
        }
        geoLocationCountMap = Object.fromEntries(touchedGeolocationCounts.map(v => [v.vehicleNumber, v.touchedLocationCount]));
    }

    const mileageMap = Object.fromEntries(mileageReadings.map(v => [v.vehicleNumber, v.mileage]));

    const vehicleStartTimeTodayMap = Object.fromEntries(vehicleStartTimeToday!.map(v => [v.vehicleNumber, v.startTime]));

    const mergedPayload = getAllVehicles.map((vehicle: { vehicleNumber: any; }) => {
        return {
            ...vehicle,
            touchedLocationCount: geoLocationCountMap[vehicle.vehicleNumber] || "",
            mileage: mileageMap[vehicle.vehicleNumber] || "",
            actualStartTime: vehicleStartTimeTodayMap[vehicle.vehicleNumber] || "",
        };
    });

    logDebug(`VehicleTelemetryDataController:processVehicleTelemetryReport2: final payload to persist`, mergedPayload);

    for (const vehicle of mergedPayload) {
        const geoLocationsCount = vehicle.geoLocationsCount ? vehicle.geoLocationsCount : 0;
        const touchedLocationCount = vehicle.touchedLocationCount ? vehicle.touchedLocationCount : 0;
        const mileage = vehicle.mileage ? vehicle.mileage : 0;
        const geofenceLocationGroupName = vehicle.geofenceLocationGroupName ? vehicle.geofenceLocationGroupName : "";
        const vehicleGroup = vehicle.vehicleGroup ? vehicle.vehicleGroup : "";

        const row = await sender.table(`${vehicleTelemetryReportTable}`)
            .symbol('reportName', reportName)
            .symbol('orgId', orgId)
            .symbol('reportType', 'day')
            .symbol('vehicleNumber', vehicle.vehicleNumber)
            .stringColumn('vehicleStatus', vehicle.status)
            .stringColumn('vehicleGroup', vehicleGroup)
            .stringColumn('vendor', vehicle.vendorId)
            .stringColumn('geofenceLocationGroupName', geofenceLocationGroupName)
            .stringColumn('scheduleStartTime', '')
            .stringColumn('actualStartTime', vehicle.actualStartTime)
            .floatColumn('assignedGeofenceLocationCount', parseInt(geoLocationsCount))
            .floatColumn('touchedLocationCount', parseInt(touchedLocationCount))
            .floatColumn('mileage', parseFloat(mileage))
            .atNow();

    }
    await sender.flush();

    const executionEndTime = Date.now();
    const totalTimeTaken = executionEndTime - executionStartTime;

    await exportVehicleTelemetryReport(reportName);

    logInfo(`VehicleTelemetryDataController:processVehicleTelemetryReport2: Execution ended at: ${executionEndTime}. Total time taken for Organization ${orgId}: ${totalTimeTaken} ms`);
    logDebug('VehicleTelemetryDataController:processVehicleTelemetryReport2: All vehicles processed.');
}

function jsonToString(json: Record<string, string>): string {
    const parts: string[] = [];

    // Iterate over each key in the JSON object
    for (const key in json) {
        if (json.hasOwnProperty(key)) {
            // Add each key-value pair to the parts array
            parts.push(`${key}='${json[key]}'`);
        }
    }

    // Join the parts with ' and ' and add the initial ' and ' prefix
    return parts.length > 0 ? ' and ' + parts.join(' and ') : '';
}

/** This conversion of data format is done to support infinite scroll on the UI - react-material-table */
function convertToReportApiResponse(reportJson: any, totalCountJson: any) {
    // console.log(`convertToReportApiResponse: total count: ${JSON.stringify(totalCountJson)} json: ${JSON.stringify(reportJson)}`);
    const totalCountArray = totalCountJson;
    const reportArray = reportJson;

    const totalRowCount = totalCountArray[0]?.count || 0;

    return {
        data: reportArray,
        meta: {
            totalRowCount,
        },
    };
}

export const triggerAllReportWrapper = async (orgId: string) => {
    const executionStartTime = Date.now();
    logInfo(`VehicleTelemetryDataController:triggerAllReportWrapper:Report generation started for Organization ${orgId} at: ${executionStartTime}`);

    const geofenceReport = await processGeofenceTelemetryReport(orgId);
    const vehicleReport = await processVehicleTelemetryReport2(orgId);
    // await sender.flush();

    const executionEndTime = Date.now();
    const totalTimeTaken = executionEndTime - executionStartTime;
    logInfo(`VehicleTelemetryDataController:triggerAllReportWrapper:Execution ended at: ${executionEndTime}. Total time taken for Organization ${orgId}: ${totalTimeTaken} ms`);
}

export const fetchAllRunningVehicleNumbers = async (allVehicles: []) => {
    logDebug(`VehicleTelemetryDataController:fetchAllRunningVehicleNumbers: Entering with vehicles`, allVehicles);
    let result;
    let vehicleNumbers;
    if (allVehicles) {
        vehicleNumbers = allVehicles.map((vehicle: any) => `'${vehicle.vehicleNumber}'`).join(', ');
    }
    // const queryString = `select vehicleNumber from
    //                 (select vehicleNumber, ignition from VehicleTelemetry where vehicleNumber in  ( ${vehicleNumbers} )
    //                         latest on timestamp PARTITION BY vehicleNumber) where ignition=1` ;

    const queryString = `select distinct vehicleNumber from ${vehicleTelemetryTable} where vehicleNumber in (${vehicleNumbers}) `;
    // logInfo(`query formed: ${queryString}`);
    const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(queryString)}`);
    const json = await response.data;

    result = parseQuestDBResponseToJson(json);

    logDebug(`VehicleTelemetryDataController:fetchAllRunningVehicleNumbers. Returning vehicles from questDb. ${JSON.stringify(result)}`, result);
    return result;
}

/** 
 * Method to fetch vehicle's latest location.  This will return the result of all vehicles if input is missing.
 * Expected input 
 *  ["OD021111", "OD02222", "OD023333"]
 */
// export const fetchVehicleLatestLocation = async (vehicles: string[]) => {
//     console.log(`VehicleTelemetryDataController:fetchVehicleLatestLocation.vehicle array. ${JSON.stringify(vehicles)}`);
//     let result;
//     let vehicleNumbers;
//     let whereClause = '';
//     if (vehicles.length > 0) {
//         vehicleNumbers = vehicles.map(vehicleNumber => `'${vehicleNumber}'`).join(', ');
//         whereClause = `and vehicleNumber in (${vehicleNumbers})`;
//     }
//     const query = `SELECT vehicleNumber,  latitude, longitude
//                         from ${vehicleTelemetryTable} where ignition=1 ${whereClause} and ${questDBTimeRangeToday} LATEST ON timestamp PARTITION BY vehicleNumber`;

//     const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
//     const json = await response.data;

//     // results = json.dataset[0][0];
//     result = json.dataset.reduce((accumulator: number, currentValue: number[]) => {
//         if (currentValue[1] === 1) {
//             return accumulator + 1;  // Increment the sum if the second value is 1
//         }
//         return accumulator; // Otherwise, return the accumulator unchanged
//     }, 0);

//     console.log(`VehicleTelemetryDataController:fetchVehicleLatestLocation. Running vehicles from questDb. ${JSON.stringify(result)}`);
//     return result;
// }


const parseQuestDBResponseToJson = (responseJson: any) => {
    let results;
    const columns: string[] = responseJson.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = responseJson.dataset;

    results = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });
    return results;
}

/**
 * TODO - Find the time arrival in the 30 mins window of actual schedule time - might need a separate method
 * TODO - Find the time spent in the 30 mins window of actual schedule time.
 * 
 */
async function timeSpentAtThisLocation(vehicleNumber: any, latitude: any, longitude: any, geohash: any, scheduleArrival: any) {

    logDebug(`VehicleTelemetryDataController:timeSpentAtThisLocation: fetching time spent value of vehicle at lat/lng, schedule Arrival: `, vehicleNumber, latitude, longitude, geohash, scheduleArrival);

    let result;
    // const geohash = await makeGeohash(latitude, longitude);
    const scheduleArrivalInMin = timeToMinutes(scheduleArrival);

    const query = `SELECT datediff('m', maxtime, mintime ) as timespent, *
        from (
            SELECT max(timestamp) as maxtime, min(timestamp) as mintime
        from VehicleTelemetry where vehicleNumber='${vehicleNumber}' and geohash='${geohash}'
        and to_timezone(timestamp, 'Asia/Kolkata') between dateadd ('m', ${scheduleArrivalInMin - Number(scheduleArrivalWindow) / 2}, date_trunc('day', to_timezone  (now(), 'Asia/Kolkata'))) and dateadd ('m', ${scheduleArrivalInMin + Number(scheduleArrivalWindow) / 2}, date_trunc('day', to_timezone  (now(), 'Asia/Kolkata')))
        and ${questDBTimeRangeToday});`; // TODO add 'and ignition=1'

    logDebug(`VehicleTelemetryDataController:timeSpentAtThisLocation: time spent query:`, query);
    const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);

    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    result = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    logDebug(`VehicleTelemetryDataController:timeSpentAtThisLocation: time spent:`, result[0]);
    // return [timeSpent, arrivalTime, departureTime];
    return result[0];
}

/** timestamp string in yyyyMMDDhhMMss format   */
function formatTimestamp(timestamp: any) {
    if (timestamp) {
        const date = new Date(timestamp);
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
            String(date.getHours()).padStart(2, '0'),
            String(date.getMinutes()).padStart(2, '0'),
            String(date.getSeconds()).padStart(2, '0')
        ].join('');
    }
}

function timeToMinutes(time: any) {
    const [hours, minutes, second] = time.split(':').map(Number);
    logDebug(`VehicleTelemetryDataController:timeToMinutes: splitted time:`, hours, minutes, second);
    // Convert to minutes (hours * 60 + minutes)
    return (hours * 60) + minutes;
}


export const todaysTravelPath = async (req: Request, res: Response) => {
    const vehicleNumber = req.query.vehicleNumber;
    let result;
    logDebug(`VehicleTelemetryDataController:todaysTravelPath: Entering to fetch todays travel path for vehicle ${vehicleNumber}`, vehicleNumber);

    const query = `select latitude as lat, longitude as lng from ${vehicleTelemetryTable} where ignition=1 and vehicleNumber='${vehicleNumber}' and ${questDBTimeRangeToday} `;
    logDebug(`VehicleTelemetryDataController:todaysTravelPath: query formed:`, query);

    const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    result = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });
    logDebug(`VehicleTelemetryDataController:todaysTravelPath: lat/lng returned:`, result);
    res.status(200).json(result);
}


export const todaysSpeed = async (req: Request, res: Response) => {
    const vehicleNumber = req.query.vehicleNumber;
    let result;
    logDebug(`VehicleTelemetryDataController:todaysSpeed: Entering to fetch todays travel path for vehicle ${vehicleNumber}`, vehicleNumber);

    const query = `select speed, to_timezone(timestamp, 'Asia/Kolkata') as timestamp from  ${vehicleTelemetryTable} where speed!=null and vehicleNumber='${vehicleNumber}' and ${questDBTimeRangeToday} `;
    logDebug(`VehicleTelemetryDataController:todaysSpeed: query formed:`, query);

    const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    result = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });
    logDebug(`VehicleTelemetryDataController:todaysSpeed: speed values:`, result);
    res.status(200).json(result);
}

const exportGeofenceTelemetryReport = async (reportName: any) => {
    logDebug(`VehicleTelemetryDataController:exportGeofenceTelemetryReport: Exporting Geofence Telemetry report:`, reportName);
    let retryCount = 0;
    if (reportName) {
        while (retryCount < 3) {
            const geofenceTelemetryReport = await fetchGeofenceTelemetryReportByReportName(reportName);
            if (geofenceTelemetryReport && geofenceTelemetryReport.length > 0) {
                await notifyViaEmail(reportName, geofenceTelemetryReport);
                logDebug(`VehicleTelemetryDataController:exportGeofenceTelemetryReport: Exported Geofence Telemetry report:`, reportName);
                break;
            }
            else {
                retryCount++;
                await delay(10000);
            }
        }
        if (retryCount === 3) {
            logError(`VehicleTelemetryDataController:exportGeofenceTelemetryReport:Could not fetch Geofence Telemetry Data`);
        }
    }
}

const fetchGeofenceTelemetryReportByReportName = async (reportName: any) => {
    const sqlString = `select * from ${geofenceTelemetryReportTable} where reportName='${reportName}'`;

    logDebug(`VehicleTelemetryDataController:fetchGeofenceTelemetryReportByReportName: query:`, sqlString);
    // const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
    // const json = await response.data;

    // const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    // const dataset: (string | number | null)[][] = json.dataset;

    // const geofenceTelemetryReport = dataset.map(row => {
    //     const obj: { [key: string]: string | number | null } = {};
    //     columns.forEach((col, index) => {
    //         obj[col] = row[index];  // Map each column name to the corresponding value in the row
    //     });
    //     return obj;
    // });

    const geofenceTelemetryReport = queryQuestDB(sqlString);

    logDebug(`VehicleTelemetryDataController:fetchGeofenceTelemetryReportByReportName: Geofence Telemetry data fetched:`, geofenceTelemetryReport);
    return geofenceTelemetryReport;
}

const exportVehicleTelemetryReport = async (reportName: any) => {
    logDebug(`VehicleTelemetryDataController:exportVehicleTelemetryReport: Exporting Vehicle Telemetry report:`, reportName);
    let retryCount = 0;
    if (reportName) {
        while (retryCount < 3) {
            const vehicleTelemetryReport = await fetchVehicleTelemetryReportByReportName(reportName);
            if (vehicleTelemetryReport && vehicleTelemetryReport.length > 0) {
                await notifyViaEmail(reportName, vehicleTelemetryReport);
                logDebug(`VehicleTelemetryDataController:exportVehicleTelemetryReport: Exported Vehicle Telemetry report:`, reportName);
                break;
            }
            else {
                retryCount++;
                await delay(10000);
            }
        }
        if (retryCount === 3) {
            logError(`VehicleTelemetryDataController:exportVehicleTelemetryReport:Could not fetch Vehicle Telemetry Data`);
        }
    }
}

const fetchVehicleTelemetryReportByReportName = async (reportName: any) => {
    /** TODO query to be replaced
   * select reportName, orgId, reportType, vehicleNumber, geofenceLocationGroupName, 
      scheduleStartTime, 
      to_timezone(cast(actualStartTime as timestamp), 'Asia/Kolkata') as actualStartTime,  assignedGeofenceLocationCount, touchedLocationCount, mileage, vendor
      from ${vehicleTelemetryReportTable} where reportName='${reportName}' order by actualStartTime desc;
   */

    // const query = `select * from ${vehicleTelemetryReportTable} where reportName='${reportName}'`;

    const sqlString = `select reportName, orgId, reportType, vehicleNumber, geofenceLocationGroupName, 
        scheduleStartTime, vendor, vehicleStatus, vehicleGroup,
        to_timezone(cast(actualStartTime as timestamp), 'Asia/Kolkata') as actualStartTime,  assignedGeofenceLocationCount, touchedLocationCount, mileage
        from ${vehicleTelemetryReportTable} where reportName='${reportName}' order by actualStartTime desc;`;

    logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryReportByReportName: sqlString:`, sqlString);
    // const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(sqlString)}`);
    // const json = await response.data;

    // const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    // const dataset: (string | number | null)[][] = json.dataset;

    // const vehicleTelemetryReport = dataset.map(row => {
    //     const obj: { [key: string]: string | number | null } = {};
    //     columns.forEach((col, index) => {
    //         obj[col] = row[index];  // Map each column name to the corresponding value in the row
    //     });
    //     return obj;
    // });

    const vehicleTelemetryReport = queryQuestDB(sqlString);

    logDebug(`VehicleTelemetryDataController:fetchVehicleTelemetryReportByReportName: Exported Vehicle Telemetry data fetched:`, vehicleTelemetryReport);
    return vehicleTelemetryReport;
}

export async function manualExportGeofenceTelemetryReport(req: Request, res: Response) {
    const reportName = req.query.reportName;

    await exportGeofenceTelemetryReport(reportName);
    res.status(200).json(`emailed successfully`);
}

export async function manualExporVehicleTelemetryReport(req: Request, res: Response) {
    const reportName = req.query.reportName;

    await exportVehicleTelemetryReport(reportName);
    res.status(200).json(`emailed successfully`);
}

export async function fetchLatestVehicleTelemetryReportName(orgId: String) {

    const query = `select reportName from ${vehicleTelemetryReportTable} where orgId='${orgId}' order by timestamp desc limit 1`;

    logDebug(`VehicleTelemetryDataController:fetchLatestVehicleTelemetryReportName: query:`, query);
    const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    const reportName = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    logDebug(`VehicleTelemetryDataController:fetchLatestVehicleTelemetryReportName: latest Vehicle Telemetry Report Name fetched:`, reportName[0].reportName);
    // res.status(200).json(reportName);
    return reportName[0].reportName;
}

export async function fetchLatestVehicleTelemetryReport(req: Request, res: Response) {
    const orgId = req.query.orgId;
    const reportName = await fetchLatestVehicleTelemetryReportName(orgId as string);
    if (reportName) {
        const vehicleTelemetryReport = await fetchVehicleTelemetryReportByReportName(reportName);
        if (vehicleTelemetryReport) {
            logDebug(`VehicleTelemetryDataController:fetchLatestVehicleTelemetryReport: Vehicle telemetry Report data fetched:`, vehicleTelemetryReport);
            res.status(200).json(vehicleTelemetryReport);
        }
    }
}

export async function fetchLatestGeofenceTelemetryReportName(orgId: String) {

    const query = `select reportName from ${geofenceTelemetryReportTable} where orgId='${orgId}' order by timestamp desc limit 1`;

    const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    const reportName = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];  // Map each column name to the corresponding value in the row
        });
        return obj;
    });

    logDebug(`VehicleTelemetryDataController:fetchLatestGeofenceTelemetryReportName: latest Geofence Telemetry Report Name fetched:`, reportName[0]);
    // res.status(200).json(reportName);
    return reportName[0];
}

export async function fetchLatestGeofenceTelemetryReport(req: Request, res: Response) {
    const orgId = req.query.orgId;
    const reportName = await fetchLatestGeofenceTelemetryReportName(orgId as string);
    if (reportName) {
        const vehicleTelemetryReport = await fetchGeofenceTelemetryReportByReportName(reportName);
        if (vehicleTelemetryReport) {
            logDebug(`VehicleTelemetryDataController:fetchLatestGeofenceTelemetryReport: Geofence telemetry Report data fetched:`, vehicleTelemetryReport);
            res.status(200).json(vehicleTelemetryReport);
        }
    }
}

async function fetchLastKnownLocation(serialNumber: string) {
    logDebug(`VehicleTelemetryDataController:fetchLastKnownLocation: Fetching last known location of vehicle with serial number: ${serialNumber}`, serialNumber);

    const query = `select vehicleNumber, latitude, longitude from ${vehicleTelemetryTable} where serialNumber='${serialNumber}' LATEST ON timestamp PARTITION BY vehicleNumber `;
    const data = await queryQuestDB(query);

    return data[0];
}

const queryQuestDB = async (query: any) => {
    logDebug(`VehicleTelemetryDataController:queryQuestDB: executing query: ${query}`, query);
    const response = await axios.get(`http://${questdbHost}/exec?query=${encodeURIComponent(query)}`);
    const json = await response.data;

    const columns: string[] = json.columns.map((col: { name: any; }) => col.name);
    const dataset: (string | number | null)[][] = json.dataset;

    const data = dataset.map(row => {
        const obj: { [key: string]: string | number | null } = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];
        });
        return obj;
    });

    logDebug(`VehicleTelemetryDataController:queryQuestDB: data returned:`, data);
    return data;
}

function delay(ms: any) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}