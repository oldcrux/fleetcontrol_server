import { Router } from 'express';
import {  createUser, deleteUser, fetchUsers, getAllUsers, searchUserByUserId, updatePassword, updateUser } from '../controller/UserController';

const router = Router();

// Define routes

// GET {url}/node/api/user
router.get('/', getAllUsers);

// POST {url}/node/api/user/create
router.post('/create', createUser);

// POST {url}/node/api/user/update
router.post('/update', updateUser);

// POST {url}/node/api/user/delete
router.post('/delete', deleteUser);

// POST {url}/node/api/user/updatePassword
router.post('/updatePassword', updatePassword);

// GET {url}/node/api/user/search
router.get('/search', searchUserByUserId);

// GET {url}/node/api/user/fetch
router.get('/fetch', fetchUsers);

export default router;
