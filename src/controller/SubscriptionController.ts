import { Request, Response } from 'express';
import { logDebug } from '../util/Logger';
import sequelize from '../util/sequelizedb';
import { QueryTypes } from 'sequelize';
import { redisPool } from "../util/RedisConnection";
import FeatureSubscription from '../dbmodel/featuresubscription';

/**
 * **** TODO ****
 *  Subscription model creation - Monthly, Yearly 
 *  Auto renew at end of each period.  Setup a scheduler to run at last day of each month to auto renew.
 *  When subscription stopped, schedule it to expire at its end of subscription period / month.
 * isFeatureSubscriptionActive2 - Here cache is setup for 24hours, which could potentially be wrong.
 */


export const isFeatureSubscriptionActive = async (req: Request, res: Response) => {

    logDebug(`SubscriptionController:isFeatureSubscriptionActive: Entering`);
    const featureValue = req.query.feature as string;
    const orgId = req.body.orgId;
    if (!featureValue || !orgId) {
        res.status(400).json({ message: `feature or orgId is not provided` });
        return;
    }

    const isActive = await isFeatureSubscriptionActive2(featureValue, orgId);
    res.status(200).json({ message: `Subscription Status`, isActive });
}

export const isFeatureSubscriptionActive2 = async (featureValue: string, orgId: string) => {

    const subscriptionStatus = await redisPool.getConnection().get(`${featureValue}_${orgId}`);
    logDebug(`subscription status of ${featureValue} of org ${orgId} from cache: ${subscriptionStatus}`);
    if(subscriptionStatus){
        if(subscriptionStatus === 'true')
            return true;
        else if (subscriptionStatus === 'false')
            return false;
    }

    const queryString = `select 1 as isActive 
                from feature_subscriptions 
                where org_id='${orgId}' and feature ='${featureValue}' and subscription_active =true and subscription_end_date > now()`;

    logDebug(`SubscriptionController:isFeatureSubscriptionActive2:sql formed:`, queryString);
    const [subscription] = await sequelize.query(queryString, {
        Model: FeatureSubscription,
        mapToModel: true,
        type: QueryTypes.RAW
    });

    logDebug(`SubscriptionController:isFeatureSubscriptionActive2: is subscription active`, subscription);

    if (subscription[0]?.isactive === 1) {
        await redisPool.getConnection().set(`${featureValue}_${orgId}`, 'true', 'EX', 86400); // 24hours timeout in secs
        return true;
    } else {
        await redisPool.getConnection().set(`${featureValue}_${orgId}`, 'false', 'EX', 86400); // 24hours timeout in secs
        return false;
    }
}

export const createSubscription = async (req: Request, res: Response) => {
    logDebug(`FeatureController:createSubscription:request body:`, req.body);

    const feature = req.body.feature;
    const orgId = req.body.orgId;
    const userId = req.body.loggedinUserId;
    const subscriptionActive = true;
    const subscriptionStartDate = new Date();
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 30);

    if (!feature || !orgId) {
        res.status(400).json({ message: `feature and orgId are required` });
        return;
    }
    const [featureSubscription, created] = await FeatureSubscription.findOrCreate({
        where: {
            feature: feature,
            orgId: orgId,
        },
        defaults: {
            subscriptionActive: subscriptionActive,
            subscriptionStartDate: subscriptionStartDate,
            subscriptionEndDate: subscriptionEndDate,
            createdBy: userId,
            updatedBy: userId,
        }
    });
    if (created) {
        await redisPool.getConnection().set(`${feature}_${orgId}`, 'true', 'EX', 86400); // 24hours timeout in secs
        res.status(200).json({ message: `new feature subscription created`, featureSubscription });
        return;
    }
    else {
        res.status(200).json({ message: `existing feature subscription entry returned`, featureSubscription });
        return;
    }
}

export const extendSubscription = async (req: Request, res: Response) => {

}

export const deleteSubscription = async (req: Request, res: Response) => {

}

export const pauseSubscription = async (req: Request, res: Response) => {

}

export const stopSubscription = async (req: Request, res: Response) => {

}

export const deActivateSubscription = async (req: Request, res: Response) => {
    const featureValue = req.body.feature;
    const orgId = req.body.orgId;
    const userId = req.body.loggedinUserId;

    if (!featureValue || !orgId) {
        res.status(400).json({ message: `feature or orgId is not provided` });
        return;
    }
    const [updatedCount, updatedRows] = await FeatureSubscription.update(
        {
            subscriptionActive: false,
            updatedBy: userId,
        },
        { where: { orgId: orgId, feature: featureValue }, returning: true },
    )

    await redisPool.getConnection().set(`${featureValue}_${orgId}`, 'false', 'EX', 86400); // 24hours timeout in secs

    logDebug(`SubscriptionController:deActivateSubscription: subscription deactivated`, updatedCount, updatedRows);
    res.status(200).json({ message: `subscription of ${featureValue} is deactivated` });
}

export const activateSubscription = async (req: Request, res: Response) => {
    const featureValue = req.body.feature;
    const orgId = req.body.orgId;
    const userId = req.body.loggedinUserId;

    if (!featureValue || !orgId) {
        res.status(400).json({ message: `feature or orgId is not provided` });
        return;
    }

    const [updatedCount, updatedRows] = await FeatureSubscription.update(
        {
            subscriptionActive: true,
            updatedBy: userId,
        },
        { where: { orgId: orgId, feature: featureValue }, returning: true },
    )

    await redisPool.getConnection().set(`${featureValue}_${orgId}`, 'true', 'EX', 86400); // 24hours timeout in secs

    logDebug(`SubscriptionController:activateSubscription: subscription activated`, updatedCount, updatedRows);
    res.status(200).json({ message: `subscription of ${featureValue} is activated` });
}

export const isGeofenceLocationLiveStatusSubscriptionActive = async (orgId: string) => {
    const featureValue = 'GeofenceLocationLiveStatus';
    return await isFeatureSubscriptionActive2(featureValue, orgId);
}
