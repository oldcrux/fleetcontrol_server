
import express, { Request, Response } from 'express';
import { redisPool } from './RedisConnection';
import winston, { transport } from 'winston';
import {LoggingWinston} from '@google-cloud/logging-winston';
require("dotenv").config();

const redisCacheName = "nodeLogLevel";

const getCurrentDate = (): string => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
};
const validLogLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
const logFilename = `logfile_${getCurrentDate()}.log`;

const consoleTransport = new winston.transports.Console();
const fileTransport = new winston.transports.File({ filename: logFilename, level: 'info' });
const loggingWinstonToGC = new LoggingWinston();

const transportsLocal = [
    consoleTransport,
    fileTransport,
];

const transportsProduction = [
    consoleTransport,
    loggingWinstonToGC,
];

// Create a Winston logger instance
export const logger = winston.createLogger({
    level: 'info', // Default log level
    // level: config.env === 'development' ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
        winston.format.json()
    ),
    transports: process.env.NODE_ENV==='development' ? transportsLocal : transportsProduction,
});


export const setLogLevel = async (req: Request, res: Response) => {
    const level = req.params.level;
    if (!(req.params.level)) {
        res.status(500).json('Missing level parameter. Use one of debug, info, warn or error.');
    }
    console.log(`log level requested: ${level}`);

    if (!validLogLevels.includes(level)) {
        res.status(400).json({ message: 'Invalid log level' });
    }
    else {
        await redisPool.getConnection().set(redisCacheName, level, 'EX', 60 * 5); // timeout in secs
        setLogLevel2(level);
        res.status(200).json({ message: `Log level set to ${logger.level}` });
    }
}

export const logInfo = async (message: string, ...meta: any[]) => {
    const level = await redisPool.getConnection().get(redisCacheName);
    if (validLogLevels.includes(level as string)) {
        setLogLevel2(level as string);
    }
    logger.info(message, meta);
}

export const logDebug = async (message: string, ...meta: any[]) => {
    const level = await redisPool.getConnection().get(redisCacheName);
    if (validLogLevels.includes(level as string)) {
        setLogLevel2(level as string);
    }
    logger.debug(message, meta);
}

export const logError = async (message: string, ...meta: any[]) => {
    logger.error(message, meta);
}

export const logWarn = async (message: string, ...meta: any[]) => {
    logger.warn(message, meta);
}

const setLogLevel2 = (level:string) =>{
    logger.format= winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
        winston.format.json());
    logger.level = level;
    // logger.transports.forEach((transport) => {
    //     transport.level = level;
    // });
    // logger.transports[0].level = level;
    logger.transports[1].level = level;
}