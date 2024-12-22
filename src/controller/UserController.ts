import { Request, Response } from 'express';

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "../util/firebasedb";
import User from '../dbmodel/user';
import { logDebug, logError, logger, logInfo } from '../util/Logger';
import sequelize from '../util/sequelizedb';
import { QueryTypes, ValidationError } from 'sequelize';
import bcrypt from 'bcryptjs';

export const createUser = async (req: Request, res: Response) => {
    let newUser;
    if (!req.body.userId
        || !req.body.firstName
        || !req.body.lastName
        || !req.body.primaryOrgId
        || !req.body.email
        || !req.body.authType
        || !req.body.phoneNumber
        || !req.body.address1
        || !req.body.city
        || !req.body.state
        || !req.body.country
        || !req.body.zip) {
        res.status(400).json({ error: 'incomplelete User payload' });
    }
    // TODO make sure userId is unique

    // If the use has secondary orgId (i.e. primary='vendorOrd') set the role to view by default.  Will not give admin access to the vendors.
    const role = req.body.secondaryOrgId? 'view' : req.body.role;
    logInfo(`userController: createUser: creating new User:`, req.body);

    //TODO add role validation. if role not in view, admin, system

    // let hashedPassword;
    // if(req.body.authType==='db' && req.body.password){
    //     hashedPassword = await bcrypt.hash(req.body.password, 10);
    // }

    try {
        newUser = await User.create({
            userId: req.body.userId,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            primaryOrgId: req.body.primaryOrgId,
            secondaryOrgId: req.body.secondaryOrgId,
            role: role,
            authType: req.body.authType,
            password: req.body.password,
            isActive: true,
            email: req.body.email,
            phoneNumber: req.body.phoneNumber,
            address1: req.body.address1,
            address2: req.body.address2,
            city: req.body.city,
            state: req.body.state,
            country: req.body.country,
            zip: req.body.zip,
            createdBy: req.body.createdBy,
        })
    } catch (error) {
        logError(`userController: createUser: Error creating User`, error);
        if (error instanceof ValidationError) {
            const messages = error.errors.map(err => err.message);
            res.status(400).json({ messages });
        } else {
            res.status(500).json({ message: "An unexpected error occurred." });
        }
    }
    if (newUser) {
        logDebug(`userController: createUser: New User created:`, newUser);
        res.status(200).json(newUser);
    }
};

export const updateUser = async (req: Request, res: Response) => {
    let user;
    if (!req.body.userId
        || !req.body.firstName
        || !req.body.lastName
        || !req.body.primaryOrgId
        || !req.body.email
        || !req.body.authType
        || !req.body.phoneNumber
        || !req.body.address1
        || !req.body.city
        || !req.body.state
        || !req.body.country
        || !req.body.zip) {
        res.status(400).json({ error: 'incomplelete User payload' });
    }
    logInfo(`userController: updateUser: updating User:`, req.body);
    // If the use has secondary orgId (i.e. primary='vendorOrd') set the role to view by default.  Will not give admin access to the vendors.
    const role = req.body.secondaryOrgId? 'view' : req.body.role;

    // let hashedPassword;
    // if(req.body.authType==='db' && req.body.password){
    //     hashedPassword = await bcrypt.hash(req.body.password, 10);
    // }
    
    try {
        user = await User.update({
            userId: req.body.userId,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            primaryOrgId: req.body.primaryOrgId,
            secondaryOrgId: req.body.secondaryOrgId,
            role: role,
            email: req.body.email,
            phoneNumber: req.body.phoneNumber,
            address1: req.body.address1,
            address2: req.body.address2,
            city: req.body.city,
            state: req.body.state,
            country: req.body.country,
            zip: req.body.zip,
            authType: req.body.authType,
            // password: hashedPassword,
            isActive: req.body.isActive,
            createdBy: req.body.createdBy,
        },
        { where: { userId: req.body.userId } });
    } catch (error) {
        logError(`userController: updateUser: Error updating User`, error);
        if (error instanceof ValidationError) {
            const messages = error.errors.map(err => err.message);
            res.status(400).json({ messages });
        } else {
            res.status(500).json({ message: "An unexpected error occurred." });
        }
    }
    if (user) {
        logDebug(`userController: updateUser: User updated:`, user);
        res.status(200).json(user);
    }
};

export const getAllUsers = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}

export const searchUser = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}

export const searchUserByUserId = async (req: Request, res: Response) => {
    const userId = req.query.userId;
    logDebug(`UserController:searchUserByUserId: fetching User: ${userId}`, userId);
    const [user] = await sequelize.query(`select * from "Users" where "userId" = ? or "email"=? `, {
        replacements: [userId, userId],
        Model: User,
        mapToModel: true,
        type: QueryTypes.SELECT
    });

    logDebug(`UserController:searchUserByUserId: User fetched:`, user);
    res.status(200).json(user);
}

export const updatePassword = async (req: Request, res: Response) => {
    
    if (!req.body.userId
        || !req.body.orgId
        || !req.body.password) {
        res.status(400).json({ error: 'incomplelete User payload' });
    }
    const orgId = req.body.orgId;
    const userId = req.body.userId;
    const password = req.body.password;
    // const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const sqlString = `update "Users" set "password"='${password}' where "primaryOrgId"='${orgId}' and "userId"='${userId}' `;
    const [user] = await sequelize.query(sqlString, {
        Model: User,
        mapToModel: true,
        type: QueryTypes.UPDATE
    });

    logDebug(`UserController:searchUserByUserId: User updated:`, user); //TODO user object is not being returned by sequelize
    res.status(200).json(user);
}

/** 
 * Delete user request will only be raised by primary org User (Ex. bmc admin user)
 * bmc admin user can delete any admin/view user, where primary org Id = bmc, 
 * can delete any view user, where secondary org Id = bmc)
 */
export const deleteUser = async (req: Request, res: Response) => {
    logInfo(`UserController:deleteUser: User delete request`, req.body);
    const userId = req.body.userId;
    const secondaryOrgId = req.body.secondaryOrgId;
    const deletedBy = req.body.deletedBy;

    logInfo(`UserController:deleteUser: User delete request by:${deletedBy}`, req.body);
    const result = await User.destroy({
        where: {
            userId:userId,
        }
    });
    logInfo(`UserController:deleteUser: User deleted:${userId}, with secondary orgId:${secondaryOrgId}`, userId, secondaryOrgId);
    res.status(200).json(result);
}

export const bulkImportUsers = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}


export const fetchUsers = async (req: Request, res: Response) => {
    logDebug(`UserController:fetchUsers: Entering with ${JSON.stringify(req.query)}`, req.query);

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
        whereCondition = ` and ("userId" like '%${globalFilter}%' 
                                    or "firstName" like '%${globalFilter}%' 
                                    or "lastName" like '%${globalFilter}%' 
                                    or "primaryOrgId" like '%${globalFilter}%' 
                                    or "phoneNumber" like '%${globalFilter}%' 
                                    or "email" like '%${globalFilter}%' )`;
    }

    const count = await fetchAllUserCount(orgId as string, whereCondition);

    const query = `select * from "Users" where ("primaryOrgId"='${orgId}' or "secondaryOrgId"='${orgId}')  ${whereCondition} order by "updatedAt" desc limit ${size} offset ${start}`;
    logDebug(`UserController:fetchUsers: query formed:`, query);
    const [results] = await sequelize.query(query, {
        type: QueryTypes.RAW,
    });
    // logDebug(`UserController:fetchUsers:users fetched from DB :`, results);
    const finalResponse = convertToUserApiResponse(results, count);
    logDebug(`UserController:fetchUsers:users returned`, finalResponse);
    res.status(200).json(finalResponse);
}

export const fetchAllUserCount = async (orgId: string, whereCondition: string) => {
    if (orgId) {
        const [results] = await sequelize.query(`select count(1) as result from "Users" where ("primaryOrgId"='${orgId}' or "secondaryOrgId"='${orgId}' ) ${whereCondition} `, {
            Model: User,
            mapToModel: true,
            type: QueryTypes.SELECT
        });
        logDebug(`UserController:fetchAllUserCount: count returned ${results.result}`);
        return results.result;
    }
}

function convertToUserApiResponse(userJson: any, totalRowCount: any) {
    // logDebug(`UserController:convertToUserApiResponse: total count: ${JSON.stringify(totalRowCount)} json: ${JSON.stringify(userJson)}`);
    return {
        data: userJson,
        meta: {
            totalRowCount,
        },
    };
}
