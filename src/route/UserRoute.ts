import { Router } from 'express';
import {  createUser, getAllUsers, searchUserByUserId, updatePassword } from '../controller/UserController';

const router = Router();

// Define routes

// GET {url}/node/api/user
router.get('/', getAllUsers);

// POST {url}/node/api/user/create
router.post('/create', createUser);

// POST {url}/node/api/user/updatePassword
router.post('/updatePassword', updatePassword);

// GET {url}/node/api/user/search
router.get('/search', searchUserByUserId);

export default router;
