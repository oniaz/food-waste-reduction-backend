import UsersAuth from "../../models/usersAuth.model.js";
import Vendors from "../../models/vendors.model.js";
import Customers from "../../models/customers.model.js";

// ── UsersAuth ─────────────────────────────────────────────────────────────────

export const findAuthByUsername = (username) =>
    UsersAuth.findOne({ username });

// Returns a full Mongoose document — required when you need to mutate fields and call .save()
export const findAuthByIdAsDocument = (id) =>
    UsersAuth.findById(id);

export const findAuthByEmail = (email, role, session = null) => {
    const query = UsersAuth.findOne({ email, role });
    return session ? query.session(session) : query;
};

export const createAuth = (data, session) =>
    UsersAuth.create([data], { session });

export const saveAuth = (userAuth) =>
    userAuth.save();

export const findUsernameExists = (username) =>
    UsersAuth.findOne({ username });

export const findVendorByTaxNumber = (taxNumber) =>
    Vendors.findOne({ taxNumber: taxNumber.trim() });

export const createVendor = (data, session) =>
    Vendors.create([data], { session });

export const createCustomer = (data, session) =>
    Customers.create([data], { session });