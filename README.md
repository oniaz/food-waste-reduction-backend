# Waste Reduction Backend

A Node.js backend API for the Waste Reduction application. This project provides authentication, user profiles, product management, order management, location data, and admin tools for a food waste reduction marketplace.

## Features

- User authentication and registration for customers, vendors, and admins
- JWT authentication stored in secure cookies
- Vendor product listings with image upload via Cloudinary
- Customer order creation, tracking, cancellation, and rating
- Vendor order dashboard and analytics
- Admin-only access to lists of customers and vendors
- Egypt location lookup for governorates, cities, and neighborhoods
- Password reset via email
- Global rate limiting and security middleware using Helmet

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- Cloudinary for image uploads
- Nodemailer for email delivery
- JWT authentication
- bcrypt password hashing

## Installation

1. Clone the repository:

```bash
git clone https://github.com/oniaz/waste-reduction-backend.git
cd waste-reduction-backend
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root with the required settings.

4. Start the server:

```bash
npm start
```

The API will run on the port defined in `PORT`, or default to `3000`.

## Environment Variables

Create a `.env` file with the following variables:

```env
PORT=3000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.example.mongodb.net/waste-reduction
JWT_SECRET=your_jwt_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

NODEMAILER_EMAIL_SERVICE=Gmail
NODEMAILER_USERNAME=your-email@example.com
NODEMAILER_PASS=your-email-password

ADMIN_EMAIL=admin@foodwasteapp.com
ADMIN_USERNAME=masteradmin
ADMIN_PASSWORD=your_admin_password
```

> `ADMIN_EMAIL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` are used by `npm run seed:admin` to create an initial admin account.

## Available Scripts

- `npm start` - Start the server with live watch and `.env` support
- `npm run seed:admin` - Create the initial admin user using environment credentials

## API Routes

### Authentication

- `POST /api/auth/register` - Register a new customer, vendor, or admin
- `POST /api/auth/login` - Login and receive a JWT cookie
- `POST /api/auth/logout` - Logout and clear the authentication cookie
- `POST /api/auth/forgot-password` - Send password reset email
- `POST /api/auth/reset-password` - Reset password using token

### Users

- `GET /api/users/me` - Get current user profile
- `PATCH /api/users/me` - Update current user profile
- `PATCH /api/users/change-password` - Change current user password
- `GET /api/users/vendor-dashboard` - Vendor analytics dashboard
- `GET /api/users/get-vendors` - Admin-only vendor list
- `GET /api/users/get-customers` - Admin-only customer list

### Products

- `GET /api/products` - Get all active products
- `GET /api/products/search` - Search products by query
- `GET /api/products/categories` - Get product category data
- `GET /api/products/:id` - Get a single product by ID
- `POST /api/products` - Create a new product (vendor only)
- `PUT /api/products/:id` - Update product (vendor only)
- `DELETE /api/products/:id` - Delete product (vendor only)
- `POST /api/products/recommendations` - Get AI-based product recommendations (customer only)

### Orders

- `POST /api/orders` - Create a new order (customer only)
- `GET /api/orders/my-orders` - Get current customer orders
- `GET /api/orders/vendor` - Get vendor order list
- `GET /api/orders/:id` - Get order details
- `PATCH /api/orders/:id/cancel` - Cancel pending order
- `PATCH /api/orders/:id/status` - Update order status (vendor / admin)
- `POST /api/orders/:id/rate` - Rate a completed order (customer only)

### Locations

- `GET /api/locations` - Get city and neighborhood data for Egypt

## Middleware

- `morgan` for request logging
- `helmet` for security headers
- `cors` with credentials enabled
- `cookie-parser` for JWT cookie handling
- Global rate limiting and per-route rate limits on authentication and AI recommendation endpoints

## Security Notes

- Authentication tokens are stored in `httpOnly` cookies
- Production mode uses `secure` cookies
- Status-based route authorization prevents suspended or incomplete accounts from accessing protected resources

## Admin Seeding

Run the admin seeding script after creating the `.env` file:

```bash
npm run seed:admin
```

This will create an admin user if one does not already exist.

## Notes

- The project expects MongoDB transactions for registration and vendor profile creation.
- Product image uploads are handled by Cloudinary via middleware.
- Password reset flows require valid email credentials.

---

If you need more detail on any endpoint or data model, open the `src/modules` folder and inspect each module's routes and controllers.
