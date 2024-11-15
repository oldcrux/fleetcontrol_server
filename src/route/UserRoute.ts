import { Router } from 'express';
import {  createUser, getAllUsers, searchUserByUserId } from '../controller/UserController';

const router = Router();

// Define routes

// GET {url}/api/user
router.get('/', getAllUsers);

// POST {url}/api/user/create
router.post('/create', createUser);

// GET {url}/api/user/search
router.get('/search', searchUserByUserId);

export default router;
