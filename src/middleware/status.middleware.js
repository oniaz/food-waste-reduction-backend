import UsersAuth from "../models/usersAuth.model.js";

const authorizeStatus = (...allowedStatuses) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                console.error('Status Authorization Error: req.user is missing. Ensure authentication middleware is applied before status authorization.');
                return res.status(500).json({ message: 'Internal server error' });
            }

            const userId = req.user.authId;
            const userAuth = await UsersAuth.findById(userId).select('accountStatus');
            
            if (!userAuth) {
                console.error(`Status Authorization Error: User with ID ${userId} not found in database.`);
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (!allowedStatuses.includes(userAuth.accountStatus)) {
                return res.status(403).json({
                    message: 'Forbidden. Your account status does not have permission to access this resource.'
                });
            }

            next();
        } catch (error) {
            console.error('Status Authorization Error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
};

export default authorizeStatus;