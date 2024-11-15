import { Redis } from 'ioredis';

class RedisPool {
    private pool: Redis[];
    private size: number;

    constructor(size: number) {
        this.pool = [];
        this.size = size;
        this.init();
    }

    private init(): void {
        for (let i = 0; i < this.size; i++) {
            const connection = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: Number(process.env.REDIS_PORT) || 6379,
                maxRetriesPerRequest: null,
            });
            this.pool.push(connection);
        }
    }

    public getConnection(): Redis {
        // Simple round-robin method for getting connections
        const connection = this.pool.shift()!;
        this.pool.push(connection);
        return connection;
    }

    public async close(): Promise<void> {
        await Promise.all(this.pool.map(conn => conn.quit()));
    }
}

export const redisPool = new RedisPool(10); // size of 10 connections
