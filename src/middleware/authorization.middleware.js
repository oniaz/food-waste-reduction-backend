import { sendJsonResponse } from '../utils/response.js';

const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                console.error('Role Authorization Error: req.user is missing. Ensure authentication middleware is applied before role authorization.');
                return sendJsonResponse(res, 500, { message: 'Internal server error' });
            }

            console.log(req.user.role, allowedRoles);
            if (!allowedRoles.includes(req.user.role)) {
                return sendJsonResponse(res, 403, {
                    message: 'Forbidden. Your account role does not have permission to access this resource.'
                });
            }

            next();
        } catch (error) {
            console.error('Role Authorization Error:', error);
            return sendJsonResponse(res, 500, { message: 'Internal server error' });
        }
    };
};

export default authorizeRole;