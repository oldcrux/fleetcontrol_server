import cluster from "cluster";
import os from "os";
import net from "net";

import express, { Request, Response } from "express";
import userRoutes from './route/UserRoute';
import organizationRoutes from './route/OrganizationRoute';
import vendorRoutes from './route/VendorRoute';
import vehicleRoutes from './route/VehicleRoute';
import vehicleTelemetryDataRoutes from './route/VehicleTelemetryDataRoute';
import geofenceRoute from './route/GeofenceRoute';
import appConfigRoute from './route/AppConfigRoute';
import bullmqRoute from './route/BullmqRoute';
import redisRoute from './route/RedisRoute';
import sequelize from "./util/sequelizedb";
import jobRoute from "./route/JobRoute";
import loggerRoute from "./route/LoggerRoute";
import { createGeofenceTouchStatusResetWorkers, postTCPMessageToQueue } from "./controller/JobController";
import { logDebug, logError, logger, logInfo, logWarn } from "./util/Logger";
import { redisPool } from "./util/RedisConnection";
import { fetchAppConfigByConfigKey } from "./controller/AppConfigController";
import validateToken from "./middlewares";
import { searchUserByUserId } from "./controller/UserController";

require("dotenv").config();
// const { InfluxDB, HttpError, Point } = require("@influxdata/influxdb-client");
// const { OrgsAPI, BucketsAPI } = require("@influxdata/influxdb-client-apis");
// const axios = require("axios");
const cors = require('cors');


// const organizationName = process.env.INFLUXDB_ORGANIZATION;
// const organizationID = process.env.ORGANIZATION_ID;
// const url = process.env.INFLUXDB_HOST;
// const token = process.env.INFLUXDB_TOKEN;
// const bucketName = process.env.INFLUXDB_BUCKET;

// // client for accessing InfluxDB
// const client = new InfluxDB({ url, token });
// const writeAPI = client.getWriteApi(organizationName, bucketName);
// const queryClient = client.getQueryApi(organizationName);

// set up your server and begin listening on port 8080.
//const express = require("express");
const app = express();
const PORT = 8080;
const TCP_PORT = 4000;
const numCPUs = os.cpus().length;
// const bodyParser = require("body-parser");

// app.use(bodyParser.json());
app.use(express.json({ limit: '10mb' })); 
const corsOptions = {
  // origin: true, // Replace with your frontend URL
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://fleetcontrol.oldcrux.com' // Production URL
    : 'http://localhost:3000', 
  methods: ['GET', 'POST'], // Allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true // Allow credentials (cookies, authorization headers, etc.)
};
app.use(cors(corsOptions));

// app.use("/", (req, res, next) => {
//   console.log("A new request was received at " + Date.now());
//   next();
// });
// app.js

// console.log(`Initializing logger with current log level: ${logger.level}`);

if (cluster.isPrimary) {
  // Fork workers
  logInfo(`app.ts:no of CPUs: ${numCPUs}`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logInfo(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });

  //************* Verify the connection pool at startup *************
  // const checkDatabaseConnection = async () => {
  //   try {
  //     await mysqlConnection.query('SELECT 1');
  //     console.log('Database connection verified.');
  //   } catch (error) {
  //     console.error('Error connecting to the database:', error);
  //   }
  // };
  // checkDatabaseConnection();


  //************* TODO remove the sync() & this whole block *************
  (async () => {
    try {
      // Synchronize all defined models with the database
      await sequelize.sync();
      logInfo('Database synchronized.');

    } catch (error) {
      logError('Unable to connect to the database:', error);
    }
  })();
  // *************                *************

  createGeofenceTouchStatusResetWorkers();
}
else {
  app.get("/", (req: Request, res: Response) => {
    res.send("Welcome to Fleet Control Center");
  });
  
  app.get('/node/api/user/search', searchUserByUserId);

  app.use(validateToken);
  app.use('/node/api/organization', organizationRoutes);
  app.use('/node/api/vendor', vendorRoutes);
  app.use('/node/api/user', userRoutes);
  app.use('/node/api/vehicle', vehicleRoutes);
  app.use('/node/api/vehicleTelemetryData', vehicleTelemetryDataRoutes);
  app.use('/node/api/geofence', geofenceRoute);
  app.use('/node/api/job', jobRoute);
  app.use('/node/api/logger/admin', loggerRoute);
  app.use('/node/api/appconfig', appConfigRoute);
  app.use('/node/api/bull', bullmqRoute);
  app.use('/node/api/redis', redisRoute);

  app.use((err: any, req: Request, res: Response, next: any) => {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Internal Server Error' });
  });

  // HTTP port
  app.listen(PORT, () => {
    logInfo(`Worker ${process.pid} is listening on HTTP port ${PORT}`);
  });

  // Workers can share any TCP connection
  // TCP Server
  const tcpServer = net.createServer((socket) => {

    logInfo(`TCP connection established with ${socket.remoteAddress}:${socket.remotePort}`);

    let buffer = '';
    let messageBatch = [];

    socket.setTimeout(120000); // 2 min idle timeout
    // Handle the timeout event to close truly idle connections
    socket.on('timeout', () => {
      logInfo(`Idle connection closed for ${socket.remoteAddress}`);
      socket.end(); // Close the socket
    });

    socket.on('data', async (data) => {
      socket.setTimeout(120000); // Reset 2 min idle timeout

      // ************* Rate limiter - Allows message from a device 1 message per 30secs
      const deviceIdIP = socket.remoteAddress;
      const deviceId = deviceIdIP?.replace(/:/g, '');
      // const deviceId = `${socket.remoteAddress}:${socket.remotePort}`;  // Local testing

      let configValue = await fetchAppConfigByConfigKey('rate_limiter_tcp');
        logDebug(`app.ts:tcp: rate_limiter_tcp config value fetched ${configValue} secs`, configValue);
        if(!configValue)
            configValue = 30; // Setting 30 secs default

      const msgSentTooSoon = await redisPool.getConnection().get(`${deviceId}`);
      if (msgSentTooSoon) {
        logInfo(`Message ${data} from ${deviceIdIP} dropped. Sent too soon.`);
        return;
      }
      await redisPool.getConnection().set(`${deviceId}`, deviceId as string, 'EX', configValue); // 30sec.
      // *************

      logDebug(`Received data on TCP from ${socket.remoteAddress}: data: ${data}`);
      buffer += data.toString(); //TODO if the message has '$$' character, then start buffering.

      let startIndex = buffer.indexOf('$$CLIENT_1NS'); // Find the start of the message
      let endIndex = buffer.indexOf('*');  // Find the end of the message

      if (startIndex !== -1 && endIndex !== -1) {
        // Extract the full message
        let completeMessage = buffer.slice(startIndex, endIndex + 3); // '+ 3' to include '*05'

        // Remove the processed message from the buffer
        buffer = buffer.slice(endIndex + 3);

        logDebug(`Received complete message before: ${completeMessage}`);
        completeMessage = completeMessage.slice(2, -3);
        // Process the complete message
        logDebug(`Received complete message after: ${completeMessage}`);

        // messageBatch.push(completeMessage);
        // if (messageBatch.length >= 1000) {
        //   // postTCPMessageToQueue(messageBatch);
        //   messageBatch = []; // Clear the batch after processing
        // }
        postTCPMessageToQueue(completeMessage);
      }

    });

    // ********* This piece is implemented for back pressure handling ************
    socket.on('data', (data) => {
      if (!socket.write(data)) {
        socket.pause();  // Pause if the buffer is full
      }
    });

    socket.on('drain', () => {
      socket.resume();  // Resume once the buffer has drained
    });
    // *********

    socket.on('error', (err) => {
      logError(`TCP Socket error: ${err}`);
    });

    socket.on('end', () => {
      logInfo(`TCP connection closed with ${socket.remoteAddress}`);
    });
  });

  tcpServer.listen(TCP_PORT, 10000, () => {
    logInfo(`Worker ${process.pid} is listening on TCP port ${TCP_PORT}`);
  });

  // **************
  tcpServer.on('connection', (socket) => {
    // socket.setTimeout(60000); // 60 sec idle timeout
    // **************
  });

}

process.on('uncaughtException', (error) => {
  logError(`Uncaught Exception:`, error.message, error.stack);

});
process.on("unhandledRejection", (reason, promise) => {
  // logError(`unhandled Rejection:`, promise, reason);
  const trackedPromise = trackPromise(promise, "Some important promise");

  if (reason instanceof Error) {
    logError(`Unhandled Rejection: ${reason.message}`, {
      stack: reason.stack,
      promiseDetails: trackedPromise,
    });
  } else {
    logError(`Unhandled Rejection: ${reason}`, {
      promiseDetails: trackedPromise,
    });
  }
});

interface TrackedPromise {
  promise: Promise<any>;
  description: string;
  timestamp: Date;
  state?: 'pending' | 'fulfilled' | 'rejected';  // State of the promise
  result?: any;
  error?: any;
}

function trackPromise(promise: Promise<any>, description: string): TrackedPromise {
  const tracked: TrackedPromise = {
    promise,
    description,
    timestamp: new Date(),
  };

  promise
    .then(result => {
      tracked.result = result;
      tracked.state = 'fulfilled';
    })
    .catch(error => {
      tracked.error = error;
      tracked.state = 'rejected';
    });

  tracked.state = tracked.state || 'pending';

  return tracked;
}
