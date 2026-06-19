import UsersAuth from "../models/usersAuth.model.js";
import { sendJsonResponse } from '../utils/response.js';

const authorizeStatus = (...allowedStatuses) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                console.error('Status Authorization Error: req.user is missing. Ensure authentication middleware is applied before status authorization.');
                return sendJsonResponse(res, 500, { message: 'Internal server error' });
            }

            const userId = req.user.authId;
            const userAuth = await UsersAuth.findById(userId).select('accountStatus');
            
            if (!userAuth) {
                console.error(`Status Authorization Error: User with ID ${userId} not found in database.`);
                return sendJsonResponse(res, 500, { message: 'Internal server error' });
            }

            if (!allowedStatuses.includes(userAuth.accountStatus)) {
                return sendJsonResponse(res, 403, {
                    message: 'Forbidden. Your account status does not have permission to access this resource.'
                });
            }

            next();
        } catch (error) {
            console.error('Status Authorization Error:', error);
            return sendJsonResponse(res, 500, { message: 'Internal server error' });
        }
    };
};

export default authorizeStatus;