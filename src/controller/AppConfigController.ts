import { Request, Response } from 'express';
import AppConfig from "../dbmodel/appconfig"
import { logDebug, logError, logInfo } from '../util/Logger';
import sequelize from '../util/sequelizedb';
import { QueryTypes } from 'sequelize';
import { redisPool } from "../util/RedisConnection";

export const createAppConfig = async (req: Request, res: Response) => {

    logDebug(`AppConfigController:createAppConfig: creating AppConfig:`, req.body);
    try {
        let appConfigsCreated: any[] = [];
        if (req.body.length > 0) {
            const appConfigs = req.body;
            appConfigs.forEach(async (appconfig: typeof AppConfig) => {
                const appConfig = await AppConfig.create({
                    orgId: appconfig.orgId,
                    configKey: appconfig.configKey,
                    configValue: appconfig.configValue,
                    comments: appconfig.comments,
                    createdBy: appconfig.createdBy
                })
                logDebug(`AppConfigController:createAppConfig: New AppConfig created: ${appConfig}`);

                if(appconfig.orgId){
                    await redisPool.getConnection().set(`${appConfig.configKey}_${appConfig.orgId}`, appConfig.configValue as string, 'EX', 86400); // 24hours timeout in secs
                }else{
                    await redisPool.getConnection().set(`${appConfig.configKey}`, appConfig.configValue as string, 'EX', 86400); // 24hours timeout in secs
                }
                appConfigsCreated.push(appConfig);
            })
        }
        res.status(200).json(appConfigsCreated);
    }
    catch (error) {
        logError(`AppConfigController:createAppConfig: Error updating Geofence locations`, error);
        res.status(400).json({ error: "Error updating Geofence locations " + error });
    }
}

export const updateAppConfig = async (req: Request, res: Response) => {
    const configKey = req.body.configKey;
    const configValue = req.body.configValue;
    const comments = req.body.comments;
    const orgId = req.body.orgId;

    if (!configKey || !configValue) {
        res.status(400).json(`configKey and configValue are required`);
        return;
    }

    // let query = `UPDATE "AppConfig" SET "configValue"=? WHERE "configKey"=? `;
    // let replacements = [configValue, configKey];

    // if (comments) {
    //     query = `UPDATE "AppConfig" SET "configValue"=?, "comments"=? WHERE "configKey"=? `;
    //     replacements = [configValue, comments, configKey];
    // }

    // const [appConfig] = await sequelize.query(query, {
    //     replacements: replacements,
    //     Model: AppConfig,
    //     mapToModel: true,
    //     type: QueryTypes.RAW
    // });

    const [updatedCount, updatedRows] = await AppConfig.update(
        {
            configValue: configValue,
            // updatedBy: userId,
            comments: comments
        },
        { where: { orgId: orgId, configKey: configKey }, returning: true },
    )

    if (updatedCount > 0) {
        if (orgId) {
            await redisPool.getConnection().set(`${configKey}_${orgId}`, configValue as string, 'EX', 86400); // 24hours timeout in secs
        }
        else {
            await redisPool.getConnection().set(`${configKey}`, configValue as string, 'EX', 86400); // 24hours timeout in secs
        }
    }
    res.status(200).json({ message: `AppConfig updated` });
}

/**
 * Method serves request parameter
 */
export const fetchAppConfig2 = async (req: Request, res: Response) => {
    const configKey = req.query.configKey;
    const orgId = req.query.orgId;
    let queryString ;
    if(orgId){
        queryString = `SELECT * FROM "AppConfig" WHERE "configKey"=? and "orgId"=? `;
        const [appConfig] = await sequelize.query(queryString, {
            replacements: [configKey, orgId],
            Model: AppConfig,
            mapToModel: true,
            type: QueryTypes.RAW
        });
        logDebug(`AppConfigController:fetchAppConfig2: AppConfig fetched:`, appConfig[0]);
        res.status(200).json(appConfig[0]);
    }else{
        queryString = `SELECT * FROM "AppConfig" WHERE "configKey"=? `;
        const [appConfig] = await sequelize.query(queryString, {
            replacements: [configKey],
            Model: AppConfig,
            mapToModel: true,
            type: QueryTypes.RAW
        });
        logDebug(`AppConfigController:fetchAppConfig2: AppConfig fetched:`, appConfig[0]);
        res.status(200).json(appConfig[0]);
    }
}

/**
 * Method servers request with body
 */
export const fetchAppConfig = async (req: Request, res: Response) => {
    const configKey = req.body.configKey;
    const configValue = req.body.configValue;
    const comments = req.body.comments;
    const orgId = req.body.orgId;

    const query = `SELECT * FROM "AppConfig" WHERE "configKey"=? and "orgId"=? `;

    const [appConfig] = await sequelize.query(query, {
        replacements: [configKey, orgId],
        Model: AppConfig,
        mapToModel: true,
        type: QueryTypes.RAW
    });
    logDebug(`AppConfigController:fetchAppConfig: AppConfig fetched: ${appConfig}`);
    res.status(200).json(appConfig);
}

export const fetchAppConfigByConfigKey = async (configKey: string, orgId?: string) => {
    let configValueFromCache;
    if (orgId) {
        configValueFromCache = await redisPool.getConnection().get(`${configKey}_${orgId}`);
    } else {
        configValueFromCache = await redisPool.getConnection().get(`${configKey}`);
    }
    if (configValueFromCache) {
        logInfo(`AppConfigController:fetchAppConfigByConfigKey: AppConfig fetched from cache: ${configValueFromCache}`);
        return configValueFromCache;
    }
    else {
        let sqlString;
        if (orgId) {
            sqlString = `SELECT * FROM "AppConfig" WHERE "configKey"='${configKey}' and "orgId"='${orgId}'`;
        }
        else {
            sqlString = `SELECT * FROM "AppConfig" WHERE "configKey"='${configKey}' `;
        }
        const [appConfig] = await sequelize.query(sqlString, {
            // replacements: [configKey],
            Model: AppConfig,
            mapToModel: true,
            type: QueryTypes.RAW
        });
        if (orgId) {
            await redisPool.getConnection().set(`${appConfig[0].configKey}_${orgId}`, appConfig[0].configValue as string, 'EX', 86400); // 24hours timeout in secs
        }
        else {
            await redisPool.getConnection().set(`${appConfig[0].configKey}`, appConfig[0].configValue as string, 'EX', 86400); // 24hours timeout in secs
        }

        logDebug(`AppConfigController:fetchAppConfigByConfigKey: AppConfig fetched from DB:`, appConfig[0]);
        return appConfig[0].configValue;
    }
}

export const deleteAppConfig = async (req: Request, res: Response) => {
    const configKey = req.body.configKey;
    const orgId = req.body.orgId;
    const query = `DELETE FROM "AppConfig" WHERE "configKey"=? and "orgId"=?`;

    const [appConfig] = await sequelize.query(query, {
        replacements: [configKey, orgId],
        Model: AppConfig,
        mapToModel: true,
        type: QueryTypes.RAW
    });
    logDebug(`AppConfigController:updateAppConfig: AppConfig deleted: ${appConfig}`);

    if(orgId){
        await redisPool.getConnection().del(`${configKey}_${orgId}`);
    }else{
        await redisPool.getConnection().del(`${configKey}`);
    }
    res.status(200).json(appConfig);
}

export const deleteAppConfigCache = async (req: Request, res: Response) => {
    const configKey = req.query.configKey;
    await redisPool.getConnection().del(`${configKey}`);
}

export const getAppConfigCache = async (req: Request, res: Response) => {
    const configKey = req.query.configKey;
    logInfo(`fetching configKey from Redis`, configKey);
    const cache = await redisPool.getConnection().get(`${configKey}`);

    res.status(200).json(cache);
}

export const fetchReportEmailSubscribers = async (orgId: string) => {
    const subscribers = await fetchAppConfigByConfigKey("ReportEmailSubscribers", orgId);
    return subscribers;
}

export const fetchFollowDefaultGeohashPrecision = async (orgId: string) => {
    const value = await fetchAppConfigByConfigKey("FollowDefaultGeohashPrecision", orgId);
    return value;
}

export const fetchPointWithinRadiusAccuracyInMeter = async (orgId: string) => {
    const value = await fetchAppConfigByConfigKey("PointWithinRadiusAccuracyInMeter", orgId);
    return value;
}