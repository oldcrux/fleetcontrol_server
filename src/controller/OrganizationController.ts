import { Request, Response } from 'express';
import Organization from '../dbmodel/organization';
import { randomUUID } from 'crypto';
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "../util/firebasedb";
import { logDebug, logger, logInfo } from '../util/Logger';
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
            orgType: 'primary',
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

export const createVendor = async (req: Request, res: Response) => {
    let vendor;
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
            res.status(400).json({ error: 'incomplelete vendor payload' });
    }
    else{
        vendor = await Organization.create({
            orgId: req.body.orgId,
            organizationName: req.body.organizationName,
            orgType: 'vendor',
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
    logDebug(`organizationController:createVendor: New Organization created: ${vendor}`);
    res.status(200).json(vendor);
};


export const updateVendor = async (req: Request, res: Response) => {

    const vendor = await Organization.create({
        orgId: req.body.orgId,
        primaryOrgId: req.body.primaryOrgId,
        organizationName: req.body.organizationName,
        orgType: 'vendor',
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

    res.status(200).json(vendor);
}

export const deleteVendor = async (req: Request, res: Response) => {
    logInfo(`OrganizationController:deleteVendor: Vendor delete request`, req.body);
    const userId = req.body.userId;
    const orgId = req.body.orgId;
    const primaryOrgId = req.body.primaryOrgId;

    logInfo(`OrganizationController:deleteVendor: Vendor delete request by:${userId}`, req.body);
    const result = await Organization.destroy({
        where: {
            orgId: orgId,
            primaryOrgId: primaryOrgId,
        }
    });
    logInfo(`OrganizationController:deleteVendor: Vendor deleted:${orgId}, with primary orgId:${primaryOrgId}`, orgId, primaryOrgId);
    res.status(200).json(result);
}

export const fetchVendors = async (req: Request, res: Response) => {
    logDebug(`OrganizationController:fetchVendors: Entering with ${JSON.stringify(req.query)}`, req.query);

    const orgId = req.query.orgId;
    const start = parseInt(req.query.start as string) || 0;
    const size = parseInt(req.query.size as string) || 0;
    // const filters = JSON.parse(req.query.filters || '[]');
    const globalFilter = req.query.globalFilter || '';
    // const sorting = JSON.parse(req.query.sorting || '[]');

    if (orgId == null) {
        res.status(400).json(`orgId param is required`);
        return;
    }
    if (size == null) {
        res.status(400).json(`size param is required with value >0`);
        return;
    }

    let whereCondition = '';
    if (globalFilter) {
        whereCondition = ` and ("orgId" like '%${globalFilter}%' 
                                    or "organizationName" like '%${globalFilter}%' 
                                    or "primaryContactName" like '%${globalFilter}%' 
                                    or "primaryPhoneNumber" like '%${globalFilter}%' 
                                    or "primaryPhoneNumber" like '%${globalFilter}%' 
                                    or "primaryEmail" like '%${globalFilter}%' )`;
    }

    const count = await fetchAllVendorCount(orgId as string, whereCondition);

    const query = `select * from "Vehicle" where "primaryOrgId"=? ${whereCondition} order by "updatedAt" desc limit ${size} offset ${start}`;
    logDebug(`OrganizationController:fetchVehicles: query formed:`, query);
    const [results] = await sequelize.query(query, {
        replacements: [orgId],
        type: QueryTypes.RAW,
    });
    // logDebug(`OrganizationController:fetchVehicles:vehicles fetched from DB :`, results);
    const finalResponse = convertToVendorApiResponse(results, count);
    logDebug(`OrganizationController:fetchVehicles:vehicles returned`, finalResponse);
    res.status(200).json(finalResponse);
}

export const fetchAllVendorCount = async (orgId: string, whereCondition: string) => {
    if (orgId) {
        const [results] = await sequelize.query(`select count(1) as result from "Organization" where "primaryOrgId"=? ${whereCondition} `, {
            replacements: [orgId],
            Model: Organization,
            mapToModel: true,
            type: QueryTypes.SELECT
        });
        logDebug(`OrganizationController:fetchAllVendorCount: count returned ${results.result}`);
        return results.result;
    }
}

function convertToVendorApiResponse(vendorJson: any, totalRowCount: any) {
    // logDebug(`OrganizationController:convertToVendorApiResponse: total count: ${JSON.stringify(totalRowCount)} json: ${JSON.stringify(vendorJson)}`);
    return {
        data: vendorJson,
        meta: {
            totalRowCount,
        },
    };
}