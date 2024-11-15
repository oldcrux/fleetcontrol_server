import { Router } from 'express';
import {  createOrganization, searchOrganizationByOrgId } from '../controller/OrganizationController';

const router = Router();

// Define routes

// POST {url}/api/organization/create
router.post('/create', createOrganization);


// GET {url}/api/organization/search
router.get('/search', searchOrganizationByOrgId);
export default router;
