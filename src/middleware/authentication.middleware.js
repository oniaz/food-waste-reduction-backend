import jwt from 'jsonwebtoken';
import UsersAuth from '../models/usersAuth.model.js';
import Vendors from '../models/vendors.model.js';
import Customers from '../models/customers.model.js';

const authenticate = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: 'Unauthorized: Authentication token is missing' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userAuth = await UsersAuth.findById(decoded.sub);

        if (!userAuth) {
            return res.status(401).json({ message: 'Unauthorized: Invalid authentication token' });
        }

        req.user = {
            authId: userAuth._id.toString(),
            email: userAuth.email,
            role: userAuth.role,
            accountStatus: userAuth.accountStatus
        };

        if (userAuth.role === 'vendor') {
            const vendorDetails = await Vendors.findOne({ authId: userAuth._id });
            if (!vendorDetails) return res.status(404).json({ message: 'Vendor profile not found' });

            req.user.id = vendorDetails._id.toString();

        } else if (userAuth.role === 'customer') {
            const customerDetails = await Customers.findOne({ authId: userAuth._id });
            if (!customerDetails) return res.status(404).json({ message: 'Customer profile not found' });

            req.user.id = customerDetails._id.toString();
        }

        next();

    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(401).json({ message: 'Unauthorized: Invalid authentication token' });
    }
};

export default authenticate;