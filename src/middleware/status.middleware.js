const authorizeStatus = (...allowedStatuses) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                console.error('Status Authorization Error: req.user is missing. Ensure authentication middleware is applied before status authorization.');
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (!allowedStatuses.includes(req.user.accountStatus)) {
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