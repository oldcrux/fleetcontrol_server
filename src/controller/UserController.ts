import { Request, Response } from 'express';

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "../util/firebasedb";
import User from '../dbmodel/user';
import { logDebug, logger } from '../util/Logger';
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
        || !req.body.phoneNumber
        || !req.body.address1
        || !req.body.city
        || !req.body.state
        || !req.body.country
        || !req.body.zip
        || !req.body.password) {
        res.status(400).json({ error: 'incomplelete User payload' });
    }
    // const uuid = randomUUID();

    // If the use has secondary orgId (i.e. primary='vendorOrd') set the role to view by default.  Will not give admin access to the vendors.
    const role = req.body.secondaryOrgId? 'view' : req.body.role;

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    try {
        newUser = await User.create({
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
            password: hashedPassword,
            isActive: true,
            createdBy: req.body.createdBy,
        })
    } catch (error) {
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

export const getAllUsers = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}

export const searchUser = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}

export const searchUserByUserId = async (req: Request, res: Response) => {
    const userId = req.query.userId;
    logDebug(`UserController:searchUserByUserId: fetching User: ${userId}`, userId);
    const [user] = await sequelize.query(`select * from "Users" where "userId" = ?`, {
        replacements: [userId],
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
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const sqlString = `update "Users" set "password"='${hashedPassword}' where "primaryOrgId"='${orgId}' and "userId"='${userId}' `;
    const [user] = await sequelize.query(sqlString, {
        Model: User,
        mapToModel: true,
        type: QueryTypes.UPDATE
    });

    logDebug(`UserController:searchUserByUserId: User updated:`, user); //TODO user object is not being returned by sequelize
    res.status(200).json(user);
}

export const deleteUser = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}

export const bulkImportUsers = async (req: Request, res: Response) => {
    res.status(400).json({ error: "not implemented " });
}
