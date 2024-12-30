import { queueManager } from "../util/BullQueueManager";
import { logDebug, logInfo } from "../util/Logger";
import { Request, Response } from 'express';
import { redisPool } from "../util/RedisConnection";

export async function getAllQueues() {
    const keys = await redisPool.getConnection().keys('bull:*');
    const queueNames = [...new Set(keys.map(key => key.split(':')[1]))];

    logDebug('BullmqController: getAllQueues: Queues:', queueNames);
    return queueNames;
}

async function inspectQueue2(queueName: string) {

    const queue = queueManager.getQueue(queueName);

    const waitingJobs = await queue.getWaiting();
    const activeJobs = await queue.getActive();
    const completedJobs = await queue.getCompleted();
    const failedJobs = await queue.getFailed();
    const delayedJobs = await queue.getDelayed();
    const jobCounts = await queue.getJobCounts();
    const stats = await queue.getJobCounts();

    const queueInfo = {
        queueName: queueName,
        jobCounts: jobCounts,
        jobs: {
            waiting: waitingJobs.length,
            active: activeJobs.length,
            completed: completedJobs.length,
            failed: failedJobs.length,
            delayed: delayedJobs.length
        },
        jobDetails: {
            waitingJobs: waitingJobs,
            activeJobs: activeJobs,
            completedJobs: completedJobs,
            failedJobs: failedJobs,
            delayedJobs: delayedJobs
        }
    };

    return queueInfo;
}

export async function inspectAllQueues(req: Request, res: Response) {
    let queueInfo = [];
    const queueNames = await getAllQueues();
    for (const queueName of queueNames) {
        const info = await inspectQueue2(queueName);
        queueInfo.push(info);
    }
    logDebug(`BullmqController: inspectAllQueues: All queue Info:`, queueInfo);
    res.status(200).json(queueInfo);
}

export async function inspectQueue(req: Request, res: Response) {
    let queueInfo = [];
    const queueName = req.query.queue as string;
    const allQueues = await getAllQueues();
    const queueExists = allQueues.includes(queueName);

    if (queueExists) {
        const info = await inspectQueue2(queueName);
        queueInfo.push(info);
        res.status(200).json(queueInfo);
    }
    else {
        logInfo('BullmqController:inspectQueue2: Queue not found', queueName);
        res.status(400).json({message: `Queue not found - ${queueName}`});
    }
}

async function inspectJobDetails(queue: any, jobId: string) {
    const job = await queue.getJob(jobId);
    logInfo('BullmqController:inspectJobDetails: Job Details:', job);
    logInfo('BullmqController:inspectJobDetails: Job Data:', job ? job.data : 'Job not found');
}

export async function purgeQueue(req: Request, res: Response) {
    const queueName = req.query.queue as string;
    const allQueues = await getAllQueues();
    const queueExists = allQueues.includes(queueName);

    if (queueExists) {
        const queue = queueManager.getQueue(queueName);
        await queue.clean(0, 0, 'completed');  // Remove all completed jobs
        await queue.clean(0, 0, 'failed');     // Remove all failed jobs
        logInfo('Queue purged!', queueName);
        res.status(200).json({message: `Queue purged ${queueName}`});
    }
    else {
        logInfo('BullmqController:purgeQueue: Queue not found', queueName);
        res.status(400).json({message: `Queue not found - ${queueName}`});
    }
}

export async function purgeAllQueues(req: Request, res: Response) {
    let queueInfo = [];
    const queueNames = await getAllQueues();
    for (const queueName of queueNames) {
        const queue = queueManager.getQueue(queueName);
        await queue.clean(0, 0, 'completed');  // Remove all completed jobs
        await queue.clean(0, 0, 'failed');     // Remove all failed jobs
     
        queueInfo.push(queueName);
        res.status(200).json({message: `All queues purged. ${queueInfo}`});
    }
}

export async function deleteQueue(req: Request, res?: Response) {
    const queueName = req.query.queue as string;
    const allQueues = await getAllQueues();
    const queueExists = allQueues.includes(queueName);
    
    if (queueExists) {
        const queue = queueManager.getQueue(queueName);
        await queue.obliterate({ force: true });
        logInfo(`Data purged and Queue deleted: ${queueName}`);
        if(res){
            res.status(200).json({message: `Queue deleted ${queueName}`});
        }
    }
    else {
        logInfo('BullmqController:deleteQueue: Queue not found', queueName);
        if(res){
            res.status(400).json({message: `Queue not found - ${queueName}`});
        }
    }
}


// export async function deleteJobScheduler(req: Request, res?: Response) {
//     const queueName = req.query.queue as string;
//     const allQueues = await getAllQueues();
//     const queueExists = allQueues.includes(queueName);
    
//     if (queueExists) {
//         const queue = queueManager.getQueue(queueName);
//         const schedulers =  await queue.removeJobScheduler;
//         // await queue.removeJobScheduler(queueName)
//         // await queue.obliterate();
//         logInfo(`job schedulers:`, schedulers);
//         if(res){
//             res.status(200).json({message: `Queue deleted ${queueName}`});
//         }
//     }
//     else {
//         logInfo('BullmqController:deleteQueue: Queue not found', queueName);
//         if(res){
//             res.status(400).json({message: `Queue not found - ${queueName}`});
//         }
//     }
// }
