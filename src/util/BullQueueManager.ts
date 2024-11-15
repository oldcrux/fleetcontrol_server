// queueManager.ts
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { redisPool } from './RedisConnection';

import * as dotenv from 'dotenv';
dotenv.config();

const connection = redisPool.getConnection();
// Redis connection configuration
// export const connection = new Redis({
//     host: process.env.REDIS_HOST,
//     port: Number(process.env.REDIS_PORT) || 6379,
//     maxRetriesPerRequest: null,
// });

class QueueManager {
    private static instance: QueueManager;
    private queues: Map<string, Queue> = new Map();

    private constructor() {}

    public static getInstance(): QueueManager {
        if (!QueueManager.instance) {
            QueueManager.instance = new QueueManager();
        }
        return QueueManager.instance;
    }

    public getQueue(queueName: string): Queue {
        if (!this.queues.has(queueName)) {
            const queue = new Queue(queueName, { connection });
            this.queues.set(queueName, queue);
        }
        return this.queues.get(queueName)!;
    }
}

export const queueManager = QueueManager.getInstance();
