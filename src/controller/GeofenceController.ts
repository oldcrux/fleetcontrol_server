import express, { Request, response, Response } from "express";
import axios from 'axios';
import sequelize from "../util/sequelizedb";
import { QueryTypes, where } from "sequelize";
import GeofenceLocation from "../dbmodel/geofencelocation";
import { logDebug, logError, logInfo } from "../util/Logger";
import { makeGeohash } from "./VehicleTelemetryDataController";
import { fetchAppConfigByConfigKey } from "./AppConfigController";
import { trimCenterLngLatToFiveDecimal } from "../util/CommonUtil";
import { isGeofenceLocationLiveStatusSubscriptionActive } from "./SubscriptionController";

const { Sender } = require("@questdb/nodejs-client")

require("dotenv").config();
// const { v4: uuidv4 } = require('uuid');

const questdbHost = process.env.QUEST_DB_HOST;
const questdbUser = process.env.QUEST_DB_USER;
const questdbPassword = process.env.QUEST_DB_PASSWORD;
const questdbAutoFlushRows = process.env.QUEST_DB_AUTO_FLUSH_ROWS; // Defaults to 75,000
const questdbAutoFlushInterval = process.env.QUEST_DB_AUTO_FLUSH_INTERVAL; // in milliseconds. Defaults to 1000

//const conf = "http::addr=localhost:9000;username=admin;password=quest;"
const conf = `http::addr=${questdbHost};username=${questdbUser};password=${questdbPassword};auto_flush_rows=${questdbAutoFlushRows};auto_flush_interval=${questdbAutoFlushInterval}`
const sender = Sender.fromConfig(conf);

// const geofenceTable = 'geofence';

/*
   CREATE TABLE `GeofenceLocation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `geofenceType` varchar(255) NOT NULL,
  `tag` varchar(255) NOT NULL,
  `radius` int NOT NULL DEFAULT '0',
  `center` text,
  `polygon` text,
  `geofenceLocationGroupName` varchar(255) DEFAULT NULL,
  `orgId` varchar(255) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`)

    insert into geofence
    (tag, geofenceType, center, radius, polygon, timestamp, orgId, createdBy)
    VALUES
    ('tag1', 'circle', '{"lat":-33.87940684078143,"lng":151.15148974704164}', 683, '' , to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'), 'bmc', 'rashmi')

    

    CREATE TABLE my_table(symb SYMBOL, price DOUBLE, ts TIMESTAMP),
        INDEX (symb CAPACITY 128) timestamp(ts);
*/

export const createGeofence = async (req: Request, res: Response) => {
    logDebug(`GeofenceController:createGeofence:Entering`, req.body);

    if (req.body.length > 0) {
        const geofences = req.body;
        // geofences.forEach(async (geofence: typeof GeofenceLocation) => {
        for (const geofence of geofences) {

            if (geofence.id) {
                continue; // Skip creation if the geofence already exists.
            }
            const geofenceType = geofence.geofenceType;
            const orgId = geofence.orgId;
            const createdBy = geofence.createdBy;
            const tag = geofence.tag;
            const geofenceLocationGroupName = geofence.geofenceLocationGroupName;
            const scheduleArrival = geofence.scheduleArrival;
            const haltDuration = geofence.haltDuration;


            let radius = 0;
            let center = '';
            let polygon = '';
            if ('circle' == geofenceType) {
                radius = geofence.radius;
                center = geofence.center; // TODO might need to save separate latitude and longitude values
            }
            if ('polygon' == geofenceType) {
                polygon = geofence.polygon;
            }

            center = await trimCenterLngLatToFiveDecimal(center);

            let centerPgString = JSON.stringify(center);
            let centerPg = JSON.parse(centerPgString);
            const geohash = '';
            // const geohash = await makeGeohash(centerPg.lat, centerPg.lng, radius);

            // TODO add validatation - 
            // 1. See if the geofence is already present.  OR override the geofence if the same circle or polygon data is present.
            try {
                const newGeofence = await GeofenceLocation.create({
                    tag: tag,
                    geofenceLocationGroupName: geofenceLocationGroupName,
                    orgId: orgId,
                    createdBy: createdBy,
                    geofenceType: geofenceType,
                    radius: radius,
                    center: JSON.stringify(center),
                    centerPoint: {
                        type: 'Point',
                        coordinates: [centerPg.lng, centerPg.lat]  // Note the lng, lat order for PostgreSQL
                    },
                    scheduleArrival: scheduleArrival,
                    haltDuration: haltDuration,
                    geohash: geohash,
                    polygon: JSON.stringify(polygon),
                });

                logDebug(`GeofenceController:createGeofence:Exiting. Created geofence locations successfully`);
                // res.sendStatus(200);
            } catch (error) {
                logError(`Error creating Geofence locations`, error, geofence);
                // res.status(400).json({ error: "Error creating Geofence locations " + error });
                continue;
            }
        }; 
    }
    res.status(200).json({ message: "geofence locations created" });;
};


export const updateGeofence = async (req: Request, res: Response) => {
    logDebug(`GeofenceController:updateGeofence:Entering`, req.body);

    const geofence = req.body;
    const id = geofence.id;
    const geofenceType = geofence.geofenceType;
    const orgId = geofence.orgId;
    const createdBy = geofence.createdBy;
    const tag = geofence.tag;
    const geofenceLocationGroupName = geofence.geofenceLocationGroupName;
    const scheduleArrival = geofence.scheduleArrival;
    const haltDuration = geofence.haltDuration;

    try {
        let radius = 0;
        let center = '';
        let polygon = '';
        if ('circle' == geofenceType) {
            radius = geofence.radius;
            center = typeof geofence.center === 'string' ? JSON.parse(geofence.center) : geofence.center; // TODO might need to save separate latitude and longitude values
        }
        if ('polygon' == geofenceType) {
            polygon = JSON.parse(geofence.polygon);
        }
        let centerPg = typeof geofence.center === 'string' ? JSON.parse(geofence.center) : geofence.center;
        // const geohash = await makeGeohash(centerPg.lat, centerPg.lng, radius);
        const geohash = '';

        // TODO add validatation - 
        // 1. See if the geofence is already present.  OR override the geofence if the same circle or polygon data is present.

        const updatedGeofence = await GeofenceLocation.update({
            tag: tag,
            geofenceLocationGroupName: geofenceLocationGroupName,
            orgId: orgId,
            geofenceType: geofenceType,
            radius: radius,
            center: JSON.stringify(center),
            centerPoint: {
                type: 'Point',
                coordinates: [centerPg.lng, centerPg.lat]  // Note the lng, lat order for PostgreSQL
            },
            scheduleArrival: scheduleArrival,
            haltDuration: haltDuration,
            geohash: geohash,
            //TODO call makeGeohash() and store a column
            polygon: JSON.stringify(polygon),
        },
            { where: { id: id } });

        logDebug(`GeofenceController:updateGeofence:Exiting.  Updated geofence locations successfully`);
        res.sendStatus(200);
    } catch (error) {
        logError(`Error updating Geofence locations`, error);
        res.status(400).json({ error: "Error updating Geofence locations " + error });
    }
};

export const searchGeofence = async (req: Request, res: Response) => {
    const { encodedViewport, query, orgId, vehicles } = req.query;
    // const viewport = JSON.parse(String(encodedViewport));
    logDebug(`GeofenceController:searchGeofence: Entering with query: and orgId:`, req.query);

    if (!orgId) {
        res.status(400).json({ message: "OrgId is missing in request query parameter" });
        return;
    }
    let viewportQuery = '';
    let subQuery = '';
    // if (viewport.north && viewport.south && viewport.east && viewport.west) {
    //     viewportQuery = `JSON_UNQUOTE(circle->'$.lat') BETWEEN ${viewport.south} AND ${viewport.north} AND JSON_UNQUOTE(circle->'$.lng') BETWEEN ${viewport.west} AND ${viewport.east}`;
    // }

    // NOTE - This if condition for query string will only work for 1 condition.
    let additionalCondition = '';

    if (typeof query === 'string' && query?.includes(":")) {
        const parts = query.split(":");
        if (parts.length === 2) {
            additionalCondition = ` and ${parts[0]}='${parts[1]}'`;
        }
    }
    else if (vehicles && vehicles !== 'null' && typeof vehicles === "string") { // NOTE - This if condition is for filtering vehicle specific geofences
        // Split the input by commas, trim whitespace, and wrap each item with quotes
        const vehicleList = vehicles.split(",").map(vehicles => `'${vehicles.trim()}'`);
        const vehicleCondition = vehicleList.join(", ");
        subQuery = `and "geofenceLocationGroupName" in (select DISTINCT("geofenceLocationGroupName") from "Vehicle" where "vehicleNumber" in (${vehicleCondition})) `;
    }
    else if (req.query) {
        additionalCondition = 'and ' + Object.entries(req.query).map(([key, value]) => `"${key}"='${value}'`).join(' and ');
    }

    const sqlString = `select * from "GeofenceLocation" where "orgId"=? ${additionalCondition} ${viewportQuery} ${subQuery}`;
    logDebug(`GeofenceController:searchGeofence: query formed:`, sqlString);
    const [results] = await sequelize.query(sqlString, {
        replacements: [orgId],
        type: QueryTypes.RAW,
    });

    // const cleanedResults = results.map((shape: typeof Geofence) => {
    //     return {
    //         ...shape,
    //         center: JSON.parse(shape.center),  // Parse the center field
    //         polygon: shape.polygon === "\"\"" ? null : JSON.parse(shape.polygon)  // Handle polygon
    //     };
    // });

    logDebug(`GeofenceController:searchGeofence:Exiting. Fetched Geofecences for the orgId: ${orgId}`, orgId, results);
    res.status(200).json(results);
}

/**
 * This method is being used by geofence List Modal
 */
export const fetchGeofence = async (req: Request, res: Response) => {
    const { encodedViewport, query, orgId, vehicles } = req.query;
    logDebug(`GeofenceController:fetchGeofence: Entering with query: and orgId:`, req.query, orgId);

    const start = parseInt(req.query.start as string) || 0;
    const size = parseInt(req.query.size as string) || 0;
    // const filters = JSON.parse(req.query.filters || '[]');
    const globalFilter = req.query.globalFilter || '';
    // const sorting = JSON.parse(req.query.sorting || '[]');
    logDebug(`GeofenceController:fetchGeofence: Entering with orgId: ${orgId}`, orgId);
    // logDebug(`GeofenceController:fetchGeofence: request received`, req.query);

    let whereCondition = '';
    if (globalFilter) {
        whereCondition = ` and ("tag" like '%${globalFilter}%' 
                                    or "geofenceLocationGroupName" like '%${globalFilter}%'  )`;
    }

    try {
        const count = await fetchGeofenceCount(orgId as string, whereCondition);

        // let begin = 0;
        // let end = 0;

        // begin = count?.count - (start ?? 0);
        // end = begin - (size ?? 0);

        // if (begin < 0) {
        //     begin = 0;
        // }
        // if (end < 0) {
        //     end = 0;
        // }

        const sqlString = `select * from "GeofenceLocation" where "orgId"='${orgId}' ${whereCondition} limit ${size} OFFSET ${start}  `;

        logDebug(`GeofenceController:fetchGeofence: query formed:`, sqlString);
        const [results] = await sequelize.query(sqlString, {
            type: QueryTypes.RAW,
        });

        const finalResponse = convertToReportApiResponse(results, count?.count);

        logDebug(`GeofenceController:fetchGeofence:Exiting. Fetched Geofecences for the orgId: ${orgId}`, orgId, finalResponse);
        res.status(200).json(finalResponse);
    }
    catch (error) {
        res.status(400).json(error);
    }
}

const fetchGeofenceCount = async (orgId: string, whereCondition: string) => {
    const sqlString = `select count(*) from "GeofenceLocation" where "orgId"='${orgId}' ${whereCondition} `;
    logDebug(`GeofenceController:fetchGeofenceCount: query formed:`, sqlString);
    const [results] = await sequelize.query(sqlString, {
        type: QueryTypes.RAW,
    });

    logDebug(`GeofenceController:fetchGeofenceCount:Exiting. Fetched Geofecences for the orgId: ${orgId}`, results[0]);
    return results[0];
}

export const searchGeofenceLocationsByGroup = async (orgId: any, geofenceGroup: string) => {

    const [results] = await sequelize.query(`select * from "GeofenceLocation" where "orgId"=? and "geofenceLocationGroupName"=?`, {
        replacements: [orgId, geofenceGroup],
        type: QueryTypes.RAW,
    });
    logDebug(`GeofenceController:searchGeofenceLocationsByGroup: response geofences`, results);
    return results;
}


// export const createGeofenceLocationGroup = async (req: Request, res: Response) => {
//     const { page, query, orgId } = req.query;
//     // console.log(`geofenceController:searchGeofence: request came in with query=${query} and orgId=${orgId}`);

//     // const [results] = await mysqlConnection.query(`select * from GeofenceLocation where orgId='${orgId}'`);

//     const [results] = await sequelize.query(`select * from GeofenceLocation where orgId=?`, {
//         replacements: [orgId],
//         type: QueryTypes.RAW,
//     });
//     res.status(200).json(results);
// }

export const deleteGeofenceLocationByTag = async (req: Request, res: Response) => {
    const { userId, orgId, tag, id } = req.body;
    logInfo(`GeofenceController:deleteGeofenceLocationByTag:Entering with tag=${tag}, user=${userId} on orgId=${orgId}`, req.body);

    if (!orgId) {
        logInfo(`GeofenceController:deleteGeofenceLocationByTag: orgId is missing. Exiting.`);
        res.status(400).json({ message: "orgId is missing." });
        return;
    }
    if (!tag || !id) {
        logInfo(`GeofenceController:deleteGeofenceLocationByTag: Geofence Location tag or Location Id is missing. Exiting.`);
        res.status(400).json({ message: "Geofence Location tag or Location Id is missing." });
        return;
    }

    let sqlString = ``;
    if (orgId && tag) {
        sqlString = `delete from "GeofenceLocation" where "orgId"=? and "tag"='${tag}'`;
    }
    else if (orgId && id) {
        sqlString = `delete from "GeofenceLocation" where "orgId"=? and "id"='${id}'`;
    }

    logInfo(`GeofenceController:deleteGeofenceLocationByTag: sql String`, sqlString);

    const [results] = await sequelize.query(sqlString, {
        replacements: [orgId],
        type: QueryTypes.DELETE,
    });

    logInfo(`GeofenceController:deleteGeofenceLocationByTag:Exiting. Deleted tag=${tag} on orgId=${orgId}`);
    res.status(200).json(results);
}

/**
 * Method being used by geofence list screen.
 */
export const deleteGeofenceLocationById = async (req: Request, res: Response) => {
    const { orgId, id } = req.body;
    logDebug(`GeofenceController:deleteGeofenceLocationById:Entering with id=${id} on orgId=${orgId}`);

    let sqlString = ``;
    if (orgId && id) {
        sqlString = `delete from "GeofenceLocation" where "orgId"=? and "id"=?`;
    }

    logInfo(`GeofenceController:deleteGeofenceLocationById: sql String`, sqlString);

    const [results] = await sequelize.query(sqlString, {
        replacements: [orgId, id],
        type: QueryTypes.SELECT,
    });
    logInfo(`GeofenceController:deleteGeofenceLocationById:Exiting. Deleted id=${id} on orgId=${orgId}`);
    res.status(200).json(results);
}

export const fetchDistinctGeofenceGroups = async (req: Request, res: Response) => {
    const { orgId } = req.query;
    const [results] = await sequelize.query(`select distinct("geofenceLocationGroupName") from "GeofenceLocation" where "orgId"=? order by "geofenceLocationGroupName"`, {
        replacements: [orgId],
        type: QueryTypes.RAW,
    });
    logDebug(`GeofenceController:fetchDistinctGeofenceGroups:response geofences`, results);
    res.status(200).json(results);
}

export const searchMinMaxScheduleArrivalTimeByGroup = async (orgId: any, geofenceLocationGroupName: string) => {

    const [results] = await sequelize.query(`select min("scheduleArrival") as "minArrivalTime", max("scheduleArrival") as "maxArrivalTime" from "GeofenceLocation" gl where "orgId"=? and "geofenceLocationGroupName" = ?`, {
        replacements: [orgId, geofenceLocationGroupName],
        type: QueryTypes.RAW,
    });

    // TODO might need to move to below query.
    // const [results] = await sequelize.query(`select min("scheduleArrival") as "minArrivalTime", max("scheduleArrival") as "maxArrivalTime", "center", "scheduleArrival", "tag" 
    //     from "GeofenceLocation" gl 
    //     where "orgId"=? and "geofenceLocationGroupName" = ? 
    //     group by "center" , "scheduleArrival", "tag"`, 
    //     {replacements: [orgId, geofenceLocationGroupName],
    //     type: QueryTypes.RAW,
    // });

    logDebug(`GeofenceController:searchMinMaxScheduleArrivalTimeByGroup: Response, geofenceLocationGroupName, minArrivalTime, maxArrivalTime`, results[0]);
    return results[0];
}


/** This conversion of data format is done to support infinite scroll on the UI - react-material-table */
function convertToReportApiResponse(reportJson: any, totalCountJson: any) {
    // console.log(`convertToReportApiResponse: total count: ${JSON.stringify(totalCountJson)} json: ${JSON.stringify(reportJson)}`);
    const totalCountArray = totalCountJson;
    const reportArray = reportJson;

    const totalRowCount = totalCountArray || 0;

    return {
        data: reportArray,
        meta: {
            totalRowCount,
        },
    };
}

export const updateGeofenceLocationTouchFlag = async (vehicleNumber: string, orgId: string, longitude: any, latitude: any) => {

    const subscriptionActive= await isGeofenceLocationLiveStatusSubscriptionActive(orgId);
    if(!subscriptionActive)
        return;

    let geohashPrecisionValue;
    const followDefaultGeohashPrecision = await fetchAppConfigByConfigKey("FollowDefaultGeohashPrecision", orgId);
    if (followDefaultGeohashPrecision === '1') {
        geohashPrecisionValue = await fetchAppConfigByConfigKey("PointWithinRadiusAccuracyInMeter", orgId);
    }

    logDebug(`GeofenceController:updateGeofenceLocationTouchFlag: Entering with vehicleNumber:${vehicleNumber}, orgId:${orgId}`);

    const sqlString = `update  "GeofenceLocation" set touched=true  
        where ST_DWithin("centerPoint", ST_MakePoint(${longitude}, ${latitude}), ${geohashPrecisionValue ? geohashPrecisionValue : "radius"}) and "orgId"='${orgId}' 
        and "geofenceLocationGroupName" 
        in (select "geofenceLocationGroupName" from "Vehicle" where "vehicleNumber"='${vehicleNumber}') `;
    logDebug(`GeofenceController:updateGeofenceLocationTouchFlag: sqlString:`, sqlString);

    const [geofenceLocation] = await sequelize.query(sqlString, {
        Model: GeofenceLocation,
        mapToModel: true,
        type: QueryTypes.UPDATE
    });
    logDebug(`GeofenceController:updateGeofenceLocationTouchFlag: Geofence location updated with vehicleNumber:${vehicleNumber}, orgId:${orgId}`);
}

export const resetGeofenceLocationTouchFlagToFalse = async (orgId: string, vehicleGroup: string) => {

    logDebug(`GeofenceController:resetGeofenceLocationTouchFlagToFalse: Resetting touched flag for orgId:${orgId} and vehicleGroup:${vehicleGroup}`);
    if (!orgId) {
        logInfo(`GeofenceController:resetGeofenceLocationTouchFlagToFalse. orgId is missing. Will not be able to reset GeofenceLocation.touched flag`)
        return;
    }
    let sqlString = `update "GeofenceLocation" set "touched" = false  where "orgId" ='${orgId}' and "touched"=true `;
    if (vehicleGroup) {
        sqlString = `update "GeofenceLocation" set "touched" = false  where "orgId" ='${orgId}' and "touched"=true
        and "geofenceLocationGroupName" in (select "geofenceLocationGroupName" from "Vehicle" where "vehicleGroup"='${vehicleGroup}' )`;
    }
    logDebug(`GeofenceController:resetGeofenceLocationTouchFlagToFalse: sqlString: ${sqlString}`);

    const [geofenceLocation] = await sequelize.query(sqlString, {
        Model: GeofenceLocation,
        mapToModel: true,
        type: QueryTypes.UPDATE
    });
    logDebug(`GeofenceController:resetGeofenceLocationTouchFlagToFalse: Resetting touched flag complete for orgId:${orgId} and vehicleGroup:${vehicleGroup}`);
}