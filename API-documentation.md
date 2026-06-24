# Waste Reduction API Documentation

## Overview

Base URL: `/api`

This document describes all available API endpoints for the frontend team.

Security:
- Authentication uses a JWT stored in an `httpOnly` cookie named `token`.
- For browser requests, use `credentials: 'include'` or `withCredentials: true`.
- Some endpoints require the user role to be `customer`, `vendor`, or `admin`.

Common headers:
- `Content-Type: application/json`
- `Accept: application/json`

Example frontend fetch options:

```js
fetch(`${API_BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ username, password }),
});
```

---

## Authentication Endpoints

### POST /api/auth/register

Register a new user.

Request body:
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "customer|vendor|admin",
  "profileData": { ... }
}
```

Vendor `profileData` example:
```json
{
  "shopName": "My Shop",
  "phoneNumber": "0123456789",
  "taxNumber": "123456789",
  "address": {
    "governorate": "Cairo",
    "city": "Nasr City",
    "neighborhood": "Al Rehab",
    "detailedAddress": "Building 12"
  }
}
```

Customer `profileData` example:
```json
{
  "name": "John Doe",
  "phoneNumber": "0123456789",
  "address": {
    "governorate": "Cairo",
    "city": "Nasr City",
    "neighborhood": "Al Rehab",
    "detailedAddress": "Flat 3"
  }
}
```

Response:
- `201` success
- `400` validation error

---

### POST /api/auth/login

Login and receive an `httpOnly` cookie.

Request body:
```json
{
  "username": "string",
  "password": "string"
}
```

Response:
- `200` success
- `400` invalid credentials

---

### POST /api/auth/logout

Logout and clear the auth cookie.

Headers:
- `Cookie: token=...`

Response:
- `200` success

---

### POST /api/auth/forgot-password

Send a password reset email.

Request body:
```json
{ "username": "string" }
```

Response:
- `200` success (always returns the same message for security)

---

### POST /api/auth/reset-password

Reset the password using a valid token.

Request body:
```json
{
  "token": "string",
  "newPassword": "string"
}
```

Response:
- `200` success
- `400` invalid or expired token

---

## User Endpoints

### GET /api/users/me

Get the authenticated user's profile.

Permissions:
- `customer`
- `vendor`
- `admin`

Response contains role-specific data for customer, vendor, or admin.

---

### PATCH /api/users/me

Update the current user's profile.

Permissions:
- `customer`
- `vendor`

Request body examples:

Customer update:
```json
{
  "name": "New Name",
  "phoneNumber": "0123456789",
  "address": {
    "governorate": "Cairo",
    "city": "Maadi",
    "neighborhood": "Corniche",
    "detailedAddress": "Street 7"
  }
}
```

Vendor update:
```json
{
  "shopName": "New Shop Name",
  "phoneNumber": "0123456789",
  "pickupTime": "10:00 - 13:00",
  "address": {
    "governorate": "Cairo",
    "city": "Nasr City",
    "neighborhood": "Al Rehab",
    "detailedAddress": "Building 12"
  }
}
```

Response:
- `200` updated profile
- `400` invalid fields

---

### PATCH /api/users/change-password

Change the authenticated user's password.

Request body:
```json
{
  "oldPassword": "string",
  "newPassword": "string"
}
```

Response:
- `200` success
- `400` invalid credentials

---

### GET /api/users/vendor-dashboard

Vendor analytics summary.

Permissions:
- `vendor`

Response:
- vendor dashboard data

---

### GET /api/users/get-vendors

Get all vendors.

Permissions:
- `admin`

Response:
- list of vendor profiles

---

### GET /api/users/get-customers

Get all customers.

Permissions:
- `admin`

Response:
- list of customer profiles

---

## Product Endpoints

### GET /api/products

Get all active products.

Query parameters:
- optional filters may exist in service logic

Response:
- array of products

---

### GET /api/products/search?q=...

Search products by query string.

Example:
- `/api/products/search?q=apple`

Response:
- array of matching products

---

### GET /api/products/categories

Get the stored product categories data.

Response:
- array of category metadata

---

### GET /api/products/:id

Get a single product by ID.

Response:
- product details
- `404` if not found

---

### POST /api/products

Create a new product.

Permissions:
- `vendor`

Headers:
- `Content-Type: multipart/form-data`
- `credentials: include`

Fields:
- product data fields in the request body
- product image file upload via the upload middleware

Response:
- `201` created product

---

### PUT /api/products/:id

Update a product.

Permissions:
- `vendor`
- vendor must own the product

Headers:
- `Content-Type: multipart/form-data`

Response:
- updated product

---

### DELETE /api/products/:id

Delete a product.

Permissions:
- `vendor`
- vendor must own the product

Response:
- success message

---

### POST /api/products/recommendations

Get AI-based product recommendations.

Permissions:
- `customer`

Request body:
```json
{
  "cartItems": [
    {
      "_id": "productId",
      "vendorId": "vendorId",
      "category": "string",
      "productName": "string",
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

Response:
- recommended products array

---

## Order Endpoints

### POST /api/orders

Create a new order from the authenticated customer's cart.

Permissions:
- `customer`

Request body:
```json
{
  "products": [
    { "productId": "string", "quantity": number }
  ],
  "shippingAddress": "string",
  "paymentMethod": "cash_on_delivery"
}
```

Notes:
- If `shippingAddress` is omitted, the customer profile address is used if complete.
- `paymentMethod` defaults to `cash_on_delivery`.

Response:
- `201` order created

---

### GET /api/orders/my-orders

Get orders for the authenticated customer.

Permissions:
- `customer`

Query params:
- `page` (default 1)
- `limit` (default 10)
- `status` (optional)

Response:
- paginated order list

---

### GET /api/orders/vendor

Get orders involving the authenticated vendor's products.

Permissions:
- `vendor`

Query params:
- `page` (default 1)
- `limit` (default 10)
- `status` (optional)

Response:
- paginated vendor order list

---

### GET /api/orders/:id

Get order details.

Permissions:
- `customer` (order owner)
- `vendor` (involved vendor)
- `admin`

Response:
- order details

---

### PATCH /api/orders/:id/cancel

Cancel an order.

Permissions:
- `customer`
- only the order owner can cancel

Response:
- `200` success

---

### PATCH /api/orders/:id/status

Update an order status.

Permissions:
- `vendor` (must be involved)
- `admin`

Request body:
```json
{ "status": "pending|ready|completed|abandoned" }
```

Notes:
- `cancelled` should not be set here; use the cancel route.

Response:
- updated order

---

### POST /api/orders/:id/rate

Rate a completed order.

Permissions:
- `customer`
- only the order customer can rate

Request body example:
```json
{
  "rating": 4,
  "review": "Great service"
}
```

Response:
- `200` success

---

## Location Endpoints

### GET /api/locations

Get Egypt location data for governorates, cities, and neighborhoods.

Response:
- array of locations with `results` count

---

## Notes for Frontend Integration

- Always include cookies on requests using `credentials: 'include'` or `withCredentials: true`.
- Auth-protected endpoints return structured JSON with `success`, `data`, or `message`.
- Vendor-only and admin-only endpoints require the correct authenticated role.
- For file uploads, use `multipart/form-data` and include the `token` cookie.

If you need examples for a specific frontend framework, ask for an Axios or Fetch version of the request usage.