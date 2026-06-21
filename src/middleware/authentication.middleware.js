import jwt from 'jsonwebtoken';
import UsersAuth from '../models/usersAuth.model.js';
import Vendors from '../models/vendors.model.js';
import Customers from '../models/customers.model.js';
import { sendJsonResponse } from '../utils/response.js';

const authenticate = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return sendJsonResponse(res, 401, { message: 'Unauthorized: Authentication token is missing' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userAuth = await UsersAuth.findById(decoded.sub);

        if (!userAuth) {
            return sendJsonResponse(res, 401, { message: 'Unauthorized: Invalid authentication token' });
        }

        req.user = {
            authId: userAuth._id.toString(),
            role: userAuth.role,
        };

        if (userAuth.role === 'vendor') {
            const vendorDetails = await Vendors.findOne({ authId: userAuth._id });
            if (!vendorDetails) return sendJsonResponse(res, 404, { message: 'Vendor profile not found' });

            req.user.id = vendorDetails._id.toString();

        } else if (userAuth.role === 'customer') {
            const customerDetails = await Customers.findOne({ authId: userAuth._id });
            if (!customerDetails) return sendJsonResponse(res, 404, { message: 'Customer profile not found' });

            req.user.id = customerDetails._id.toString();
        }else if (userAuth.role === 'admin') { //uses authId
            req.user.id = userAuth._id.toString();
        }

        next();

    } catch (error) {
        console.error('Authentication error:', error);
        return sendJsonResponse(res, 401, { message: 'Unauthorized: Invalid authentication token' });
    }
};

export default authenticate;