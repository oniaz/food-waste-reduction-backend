import rateLimit from 'express-rate-limit';
import { sendJsonResponse } from '../utils/response.js';

const rateLimitHandler = (message) => (req, res, next, options) => {
    const resolvedMessage = typeof message === 'string'
        ? message
        : message?.message || 'Too many requests. Please try again later.';

    return sendJsonResponse(res, options.statusCode, {
        message: resolvedMessage,
    });
};

export const globalLimiter = rateLimit({  //will be applied to the whole server (collective requests limit)
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 100, // Limit each IP to 100 requests per windowMs 
    handler: rateLimitHandler("Too many requests from this IP, please try again after 15 minutes."),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, 
});

////////////////

export const authLimiter = rateLimit({ //apply to login
    windowMs: 10 * 60 * 1000, // 10 mins
    max: 5, // Only 5 login attempts allowed
    handler: rateLimitHandler("Too many login attempts. Try again later."),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, 
});
/////

export const aiCreateLimiter = rateLimit({ //apply to login
    windowMs: 1 * 60 * 1000, // 1 min
    max: 2, // Only 2 ai requests per minuit
    keyGenerator: (req, res) => 'global-endpoint-bucket',
    handler: rateLimitHandler("Too many requests. Try again later."),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, 
});

export const aiRecommendationLimiter = rateLimit({ //apply to login
    windowMs: 1 * 60 * 1000, // 1 min
    max: 6, // Only 6 ai requests per minuit
    keyGenerator: (req, res) => 'global-endpoint-bucket',
    handler: rateLimitHandler("Too many requests. Try again later."),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, 
});