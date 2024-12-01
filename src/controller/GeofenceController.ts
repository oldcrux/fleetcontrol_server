import express, { Request, response, Response } from "express";
import axios from 'axios';
import sequelize from "../util/sequelizedb";
import { QueryTypes } from "sequelize";
import GeofenceLocation from "../dbmodel/geofencelocation";
import { logDebug, logError, logInfo } from "../util/Logger";

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
        geofences.forEach(async (geofence: typeof GeofenceLocation) => {
            const geofenceType = geofence.geofenceType;
            const orgId = geofence.orgId;
            const createdBy = geofence.createdBy;
            const tag = geofence.tag;
            const geofenceLocationGroupName = geofence.geofenceLocationGroupName;
            const scheduleArrival = geofence.scheduleArrival;
            const haltDuration = geofence.haltDuration;
            const geohash = '';

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

            let centerPgString= JSON.stringify(center);
            let centerPg= JSON.parse(centerPgString);

            // TODO add validatation - 
            // 1. See if the geofence is already present.  OR override the geofence if the same circle or polygon data is present.
            try {
                //console.log(`values = ${tag}, ${orgId}, ${createdBy}, ${geofenceType}, ${radius}, ${JSON.stringify(center)}, ${JSON.stringify(polygon)}`);
                // add rows to the buffer of the sender
                // Code to add geofence into questDB
                // const row = await sender.table(`${geofenceTable}`)
                //     .symbol("tag", tag)
                //     .symbol("orgId", orgId)
                //     .symbol("createdBy", createdBy)
                //     .symbol("geofenceType", geofenceType)
                //     .floatColumn("radius", radius)
                //     .stringColumn("center", JSON.stringify(center))
                //     .stringColumn("polygon", JSON.stringify(polygon))
                //     .at(Date.now(), "ms")

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
                    //TODO call makeGeohash() and store a column
                    polygon: JSON.stringify(polygon),
                });

                logDebug(`GeofenceController:createGeofence:Exiting.  Created geofence locations successfully`);
                res.sendStatus(200);
            } catch (error) {
                logError(`Error creating Geofence locations`, error);
                res.status(400).json({ error: "Error creating Geofence locations " + error });
            }
        });

    }
};


export const searchGeofence = async (req: Request, res: Response) => {
    const { encodedViewport, query, orgId, vehicles } = req.query;
    const viewport = JSON.parse(String(encodedViewport));
    logDebug(`GeofenceController:searchGeofence: Entering with query: and orgId:`, query, orgId);

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
    else if (vehicles && vehicles !=='null' && typeof vehicles === "string") { // NOTE - This if condition is for filtering vehicle specific geofences
        // Split the input by commas, trim whitespace, and wrap each item with quotes
        const vehicleList = vehicles.split(",").map(vehicles => `'${vehicles.trim()}'`);
        const vehicleCondition = vehicleList.join(", ");
        subQuery = `and "geofenceLocationGroupName" in (select DISTINCT("geofenceLocationGroupName") from "Vehicle" where "vehicleNumber" in (${vehicleCondition})) `;

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
    const { orgId, tag } = req.body;
    logDebug(`GeofenceController:deleteGeofenceLocationByTag:Entering with tag=${tag} on orgId=${orgId}`);

    // const [results] = await mysqlConnection.query(`select * from GeofenceLocation where orgId='${orgId}'`);

    const [results] = await sequelize.query(`delete from "GeofenceLocation" where "orgId"=? and "tag"=?`, {
        replacements: [orgId, tag],
        type: QueryTypes.SELECT,
    });
    logInfo(`GeofenceController:deleteGeofenceLocationByTag:Exiting. Deleted tag=${tag} on orgId=${orgId}`);
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
    logInfo(`GeofenceController:searchMinMaxScheduleArrivalTimeByGroup: Response, geofenceLocationGroupName, minArrivalTime, maxArrivalTime`, results[0]);
    return results[0];
}