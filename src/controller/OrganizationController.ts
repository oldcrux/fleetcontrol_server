import { Request, Response } from 'express';
import Organization from '../dbmodel/organization';
import { randomUUID } from 'crypto';
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "../util/firebasedb";
import { logDebug, logger } from '../util/Logger';
import sequelize from '../util/sequelizedb';
import { QueryTypes } from 'sequelize';

export const createOrganization = async (req: Request, res: Response) => {
    let org;
    if(!req.body.orgId 
        || !req.body.organizationName
        || !req.body.primaryContactName
        || !req.body.primaryPhoneNumber
        || !req.body.primaryEmail
        || !req.body.address1
        || !req.body.city
        || !req.body.state
        || !req.body.country
        || !req.body.zip){
            res.status(400).json({ error: 'incomplelete Organization payload' });
    }
    else{
        org = await Organization.create({
            orgId: req.body.orgId,
            organizationName: req.body.organizationName,
            primaryContactName: req.body.primaryContactName,
            primaryPhoneNumber: req.body.primaryPhoneNumber,
            primaryEmail: req.body.primaryEmail,
            address1: req.body.address1,
            address2: req.body.address2,
            city: req.body.city,
            state: req.body.state,
            country: req.body.country,
            zip: req.body.zip,
            createdBy:req.body.createdBy,
            latitude: req.body.latitude,
            longitude: req.body.longitude
        })
    }
    logDebug(`organizationController:createOrganization: New Organization created: ${org}`);
    res.status(200).json(org);
};


export const getAllOrganizations = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}

export const searchOrganizationByOrgId = async (req: Request, res: Response) => {

    logDebug(`organizationController:searchOrganization: Entering to fetch: ${JSON.stringify(req.query)}`);
    const orgId = req.query.orgId;
    
    const [org] = await sequelize.query(`select * from "Organization" where "orgId" = ?`, {
        replacements: [orgId],
        Model: Organization,
        mapToModel: true,
        type: QueryTypes.RAW
    });
    
    logDebug(`organizationController:searchOrganization: Organization fetched: ${org}`);
    res.status(200).json(org);
}

export const deleteOrganization = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}