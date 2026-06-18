import EGYPT_LOCATIONS from '../../data/egyptLocations.js';

/**
 * @desc    Get all governorates, cities, and neighborhoods in Egypt
 * @route   GET /api/v1/locations
 * @access  Public
 * * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware function
 * * @returns {void} Sends a JSON response containing the locations array
 */
export const getAllLocations = (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    
    return res.status(200).json({
      success: true,
      results: EGYPT_LOCATIONS.length,
      data: EGYPT_LOCATIONS
    });
  } catch (error) {
    next(error); 
  }
};