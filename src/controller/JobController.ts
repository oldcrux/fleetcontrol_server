import express, { Request, Response } from "express";
import { Worker } from 'bullmq';
import { queueManager } from "../util/BullQueueManager";
import { redisPool } from '../util/RedisConnection';
import { triggerAllReportWrapper, vehicleTelemetryDataParseAndIngest } from "./VehicleTelemetryDataController";
import { logDebug, logError, logInfo, logWarn } from "../util/Logger";
import sequelize from "../util/sequelizedb";

// import { createBullBoard } from "bull-board";
// import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
// const { createBullBoard } = require('@bull-board/api');
// const { BullAdapter } = require('@bull-board/api/bullAdapter');
// const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
// const { ExpressAdapter } = require('@bull-board/express');

const app = express();
app.use(express.json());

const testQueue = queueManager.getQueue('testQueue');
const reportGenerationQueue = queueManager.getQueue('reportGenerationQueue');
const tcpMessageQueue = queueManager.getQueue('tcpMessageQueue');
const tcpMessageBatchQueue = queueManager.getQueue('tcpMessageBatchQueue');

const geofenceReportGenerationQueue = queueManager.getQueue('geofenceReportGenerationQueue');
const vehicleReportGenerationQueue = queueManager.getQueue('vehicleReportGenerationQueue');

const connection = redisPool.getConnection();

// const serverAdapter = new ExpressAdapter();
// serverAdapter.setBasePath('/admin/queues');

// const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
//     queues: [new BullAdapter(reportGenerationQueue), new BullAdapter(testQueue)],
//     serverAdapter: serverAdapter,
// })
// export const bullBoard = serverAdapter.getRouter();

export const bullBoard = async (req: Request, res: Response) => {
    // TODO https://github.com/felixmosh/bull-board
    const queue1 = await reportGenerationQueue.getJobCounts();
    const queue2 = await testQueue.getJobCounts();
    const queue3 = await tcpMessageQueue.getJobCounts();
    res.status(200).json([queue1, queue2, queue3]);
}

// Note - batch is implemented in app.ts line 150
export const postTCPMessageBatchToQueue = async (message: []) => {

    const tcpMessageBatchQueueName = 'tcpMessageBatchQueue';
    logDebug(`JobController:postTCPMessageBatchToQueue: Posting ${message} to ${tcpMessageBatchQueueName}`);

    try {
        const job = await tcpMessageBatchQueue.add('tcpMessageBatchJob', { message });
        logDebug(`JobController:postTCPMessageBatchToQueue: Job submitted successfully`, job);
    } catch (error) {
        logError('JobController:postTCPMessageBatchToQueue: Error submitting job:', error);
    }
}

export const postTCPMessageToQueue = async (message: string) => {
    // logInfo(`JobController:postTCPMessageToQueue: Entering`);

    const tcpMessageQueueName = 'tcpMessageQueue';
    logDebug(`JobController:postTCPMessageToQueue: Posting ${message} to ${tcpMessageQueueName}`);

    try {
        const job = await tcpMessageQueue.add('tcpMessageJob', { message },
            {
                removeOnComplete: {
                    age: 3600, // keep up to 1 hour
                    count: 100, // keep up to 100 jobs
                },
                removeOnFail: {
                    age: 24 * 3600, // keep up to 24 hours
                },
            }, // TODO need to review these settings https://docs.bullmq.io/guide/queues/auto-removal-of-jobs
        );
        logDebug(`JobController:postTCPMessageToQueue: Job submitted successfully`, job);
    } catch (error) {
        logError('JobController:postTCPMessageToQueue: Error submitting job:', error);
    }
}

export const createReportJob = async (req: Request, res: Response) => {

    const { orgId, queueName } = req.query;
    const { data } = req.body;
    logInfo(`reportJobController:createReportJob: ${orgId} ${queueName}`);

    try {
        if (queueName === 'reportGenerationQueue') {
            const job = await reportGenerationQueue.add('reportGenerationJob', { orgId },
                {
                    removeOnComplete: {
                        age: 3600, // keep up to 1 hour
                        count: 100, // keep up to 1000 jobs
                    },
                    removeOnFail: {
                        age: 24 * 3600, // keep up to 24 hours
                    },
                }, // TODO need to review these settings https://docs.bullmq.io/guide/queues/auto-removal-of-jobs
            );
            logDebug(`Job ${job} submitted successfully`);
        } else if (queueName === 'testQueue') {
            const job = await testQueue.add('testJob', { data });
            logDebug(`Job ${job} submitted successfully`);
        } else {
            logDebug('Invalid queue name');
        }
    } catch (error) {
        logError('Error submitting job:', error);
    }

    // console.log('Job added to the queue');
}

const tcpMessageBatchWorker = new Worker('tcpMessageBatchQueue', async (job) => {
    logDebug('Processing tcpMessageBatchQueue job:', job.name, job.data);

    // TODO parse and process message
}, { connection });

const tcpMessageWorker = new Worker('tcpMessageQueue', async (job) => {
    logDebug('Processing tcpMessageQueue job:', job.name, job.data);

    vehicleTelemetryDataParseAndIngest(job.data.message);
}, { connection });


// Worker to process jobs from the first queue
const reportGenerationWorker = new Worker('reportGenerationQueue', async (job) => {
    logDebug('Processing reportGenerationQueue job:', job.name, job.data);

    await triggerAllReportWrapper(job.data.orgId);
}, { connection });

// Worker to process jobs from the second queue
const testWorker = new Worker('testQueue', async (job) => {
    logDebug('Processing testQueue job:', job.name, job.data);
    // await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate processing
}, { connection });

tcpMessageBatchWorker.on('completed', (job) => {
    logDebug(`Job ${job.id} completed in tcpMessageQueue`);
});

tcpMessageWorker.on('completed', (job) => {
    logDebug(`Job ${job.id} completed in tcpMessageQueue`);
});

// Event listeners for job completion
reportGenerationWorker.on('completed', (job) => {
    logDebug(`Job ${job.id} completed in reportGenerationQueue`);
});

testWorker.on('completed', (job) => {
    logDebug(`Job ${job.id} completed in testQueue`);
});
// export { reportGenerationWorker, testWorker };

tcpMessageBatchWorker.on('error', (error) => {
    logError(`Error in worker: ${error.message}`);
});

tcpMessageWorker.on('error', (error) => {
    logError(`Error in worker: ${error.message}`);
});

reportGenerationWorker.on('error', (error) => {
    logError(`Error in worker: ${error.message}`);
});

testWorker.on('error', (error) => {
    logError(`Error in worker: ${error.message}`);
});


process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

const gracefulShutdown = async (signal: string) => {
    logInfo(`Received ${signal}, closing server...`);

    await tcpMessageBatchWorker.close();
    await tcpMessageWorker.close();
    await reportGenerationWorker.close();
    await testWorker.close();

    await redisPool.close();
    await sequelize.close();

    process.exit(0);
}