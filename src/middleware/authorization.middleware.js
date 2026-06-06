const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                console.error('Role Authorization Error: req.user is missing. Ensure authentication middleware is applied before role authorization.');
                return res.status(500).json({ message: 'Internal server error' });
            }

            console.log(req.user.role, allowedRoles);
            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({
                    message: 'Forbidden. Your account role does not have permission to access this resource.'
                });
            }

            next();
        } catch (error) {
            console.error('Role Authorization Error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
};

export default authorizeRole;