import express from "express";
import { getAllLocations } from './locations.controller.js';

const router = express.Router();

// GET /locations | Public | get all governorates, cities, and neighborhoods
router.get('/', getAllLocations);

export default router;