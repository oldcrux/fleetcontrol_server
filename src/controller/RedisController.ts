import { Request, Response } from 'express';
import { redisPool } from "../util/RedisConnection";
import { logInfo } from '../util/Logger';

export async function inspectAllRedisKeys(req: Request, res: Response) {
    let cursor = '0';
    let keys = [];

    do {
        const result = await redisPool.getConnection().scan(cursor);
        cursor = result[0];
        const scannedKeys = result[1];

        for (const key of scannedKeys) {
            const type = await redisPool.getConnection().type(key);
            const ttl = await redisPool.getConnection().ttl(key);

            let value = null;

            switch (type) {
                case 'string':
                    value = await redisPool.getConnection().get(key);
                    break;
                case 'hash':
                    value = await redisPool.getConnection().hgetall(key);
                    break;
                case 'list':
                    value = await redisPool.getConnection().lrange(key, 0, -1);
                    break;
                case 'set':
                    value = await redisPool.getConnection().smembers(key);
                    break;
                case 'zset':
                    value = await redisPool.getConnection().zrange(key, 0, -1); 
                    break;
                case 'stream':
                    value = await redisPool.getConnection().xrange(key, '-', '+');
                    break;
                default:
                    value = null; // Unsupported type
                    break;
            }

            keys.push({
                key: key,
                type: type,
                value: value,
                ttl: ttl,
            });
        }
    } while (cursor !== '0');

    logInfo(`All Redis Keys fetched`, keys);
    res.status(200).json(keys);
}

export async function deleteRedisCache(req: Request, res: Response) {
    const key = req.query.key;
    await redisPool.getConnection().del(`${key}`);
    res.status(200).json(`key ${key} deleted from redis cache`);
}