import rateLimit from 'express-rate-limit';
export const globalLimiter = rateLimit({  //will be applied to the whole server (collective requests limit)
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 100, // Limit each IP to 100 requests per windowMs 
    message: {
        status: 429,
        message: "Too many requests from this IP, please try again after 15 minutes."
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, 
});

////////////////

export const authLimiter = rateLimit({ //apply to login
    windowMs: 10 * 60 * 1000, // 10 mins
    max: 5, // Only 5 login attempts allowed
    message: { message: "Too many login attempts. Try again later." },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, 
});


