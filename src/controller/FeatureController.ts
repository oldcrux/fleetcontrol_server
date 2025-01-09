import { Request, Response } from 'express';
import { logDebug, logError, logInfo } from '../util/Logger';
import Features from '../dbmodel/feature';


export const createFeature = async (req: Request, res: Response) => {

    logDebug(`FeatureController:createFeature:request body:`, req.body);

    const userId = req.body.loggedinUserId;

    if (!req.body.feature || !req.body.description) {
        res.status(400).json({ message: `feature and description are required` });
        return;
    }
    const [feature, created] = await createFeature2(req.body.feature, req.body.description, userId);
    if (created) {
        res.status(200).json({ message: `new feature created`, feature });
        return;
    }
    else {
        res.status(200).json({ message: `existing feature entry returned`, feature });
        return;
    }
}

export const createFeature2 = async (featureValue: string, description: string, userId: string) => {

    const [feature, created] = await Features.findOrCreate({
        where: {
            feature: featureValue,
        },
        defaults: {
            description: description,
            createdBy: userId,
            updatedBy: userId,
        }
    });
    logDebug(`FeatureController:createFeature2: new feature created:`, feature, created);
    return [feature, created];
}

export const findFeature = async (featureValue: string) => {

    const feature = await Features.findOne({
        attributes: ['description'],
        where: {
            feature: featureValue,
        }
    });
    logDebug(`FeatureController:findFeature: feature found:`, feature);
    return feature;
}