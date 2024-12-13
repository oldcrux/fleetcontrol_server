import { Router } from 'express';
import {  createVendor, deleteVendor, fetchVendorNames, fetchVendors, updateVendor } from '../controller/OrganizationController';

const router = Router();

// POST {url}/node/api/vendor/create
router.post('/create', createVendor);

// POST {url}/node/api/vendor/update
router.post('/update', updateVendor);

// POST {url}/node/api/vendor/delete
router.post('/delete', deleteVendor);

// GET {url}/node/api/vendor/search
router.get('/search', fetchVendors);

// GET {url}/node/api/vendor/names
router.get('/names', fetchVendorNames);

export default router;