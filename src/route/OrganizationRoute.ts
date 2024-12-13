import { Router } from 'express';
import {  createOrganization, searchOrganizationByOrgId } from '../controller/OrganizationController';

const router = Router();

// Define routes

// POST {url}/node/api/organization/create
router.post('/create', createOrganization);


// GET {url}/node/api/organization/search
router.get('/search', searchOrganizationByOrgId);

export default router;
