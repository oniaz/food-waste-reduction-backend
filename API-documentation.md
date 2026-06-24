# Waste Reduction API Documentation

## Overview

Base URL: `/api`

This documentation is extracted from the current backend implementation and reflects the actual request and response contracts.

Security:
- Authentication uses a JWT stored in an `httpOnly` cookie named `token`.
- For browser requests, use `credentials: 'include'` or `withCredentials: true`.
- Some endpoints require `customer`, `vendor`, or `admin` roles.

Common headers:
- `Accept: application/json`
- `Content-Type: application/json` for JSON requests

For multipart file uploads, use `Content-Type: multipart/form-data`.

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

Rules:
- `username`: 5-30 chars, no spaces
- `password`: at least 6 chars, no spaces
- `email`: valid email format
- `role`: must be `customer`, `vendor`, or `admin`
- `vendor` requires `profileData` with `shopName`, `phoneNumber`, `taxNumber`, and `address`
- `customer` requires `profileData` with `name`, `phoneNumber`, and `address`

Vendor `profileData` example:
```json
{
  "shopName": "My Shop",
  "phoneNumber": "+201234567890",
  "taxNumber": "123456789",
  "address": {
    "governorate": "cairo",
    "city": "nasr city",
    "neighborhood": "al rehab",
    "detailedAddress": "Building 12"
  }
}
```

Customer `profileData` example:
```json
{
  "name": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "phoneNumber": "+201234567890",
  "address": {
    "governorate": "cairo",
    "city": "nasr city",
    "neighborhood": "al rehab",
    "detailedAddress": "Flat 3"
  }
}
```

Responses:
- `201` success: `{ "message": "User registered successfully." }`
- `400` validation error

---

### POST /api/auth/login

Login and receive an auth cookie.

Request body:
```json
{
  "username": "string",
  "password": "string"
}
```

Responses:
- `200` success: `{ "message": "Login successful." }`
- `400` invalid credentials or missing fields

---

### POST /api/auth/logout

Logout and clear the auth cookie.

Responses:
- `200` success: `{ "message": "Logged out successfully." }`

---

### POST /api/auth/forgot-password

Request a password reset email.

Request body:
```json
{ "username": "string" }
```

Responses:
- `200` generic success message
- `400` missing username

---

### POST /api/auth/reset-password

Reset the password using the reset token.

Request body:
```json
{
  "token": "string",
  "newPassword": "string"
}
```

Responses:
- `200` success: `{ "message": "Password reset successfully!" }`
- `400` invalid token or missing fields
- `404` user not found

---

## User Endpoints

### GET /api/users/me

Get the authenticated user's profile.

Permissions:
- `customer`
- `vendor`
- `admin`

Responses:
- `200` success with one of:
  - `customerData`
  - `vendorData`
  - `adminData`
- `401` unauthorized
- `403` forbidden
- `404` profile not found

Response object shapes:
- `customerData` contains:
  - `_id`
  - `name` (`firstName`, `lastName`)
  - `address` (`governorate`, `city`, `neighborhood`, `detailedAddress`)
  - `phoneNumber`
  - `loyaltyPoints`
  - `authId`
  - `username`
  - `email`
  - `role`
  - `accountStatus`
  - `createdAt`
  - `updatedAt`
- `vendorData` contains:
  - `_id`
  - `shopName`
  - `address` (`governorate`, `city`, `neighborhood`, `detailedAddress`, optional `map`)
  - `phoneNumber`
  - `taxNumber`
  - `pickupTime` (`days`, `from`, `to`)
  - `moneyOwed`
  - `rating` (`score`, `totalRatingsNumber`)
  - `authId`
  - `username`
  - `email`
  - `role`
  - `accountStatus`
  - `vendorRating`
  - `createdAt`
  - `updatedAt`
- `adminData` contains:
  - `_id`
  - `username`
  - `email`
  - `role`
  - `accountStatus`
  - `createdAt`
  - `updatedAt`

---

### PATCH /api/users/me

Update the authenticated user's profile.

Permissions:
- `customer`
- `vendor`

Vendor update body example:
```json
{
  "shopName": "string",
  "phoneNumber": "+201234567890",
  "address": {
    "governorate": "string",
    "city": "string",
    "neighborhood": "string",
    "detailedAddress": "string"
  },
  "pickupTime": {
    "days": ["Sunday"],
    "from": "HH:MM",
    "to": "HH:MM"
  },
  "map": [longitude, latitude]
}
```

Customer update body example:
```json
{
  "name": {
    "firstName": "string",
    "lastName": "string"
  },
  "phoneNumber": "+201234567890",
  "address": {
    "governorate": "string",
    "city": "string",
    "neighborhood": "string",
    "detailedAddress": "string"
  }
}
```

Responses:
- `200` success with updated `customerData` or `vendorData`
- `400` invalid update payload
- `401` unauthorized
- `404` profile not found

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

Responses:
- `200` success: `{ "message": "Password changed successfully" }`
- `400` invalid credentials or missing fields
- `401` unauthorized
- `404` auth record not found

---

### GET /api/users/vendor-dashboard

Get analytics summary for the authenticated vendor.

Permissions:
- `vendor`

Responses:
- `200` success with `analytics`:
  - `profit`
  - `productsInCurrentOrders`
  - `productsInCompletedOrders`
  - `numberOfCustomers`

---

### GET /api/users/get-vendors

Get a paginated list of all vendor profiles.

Permissions:
- `admin`

Query parameters:
- `page` default `1`
- `limit` default `10`

Responses:
- `200` success with pagination and `vendors`
- `401` unauthorized
- `403` forbidden

---

### GET /api/users/get-customers

Get a paginated list of all customer profiles.

Permissions:
- `admin`

Query parameters:
- `page` default `1`
- `limit` default `10`

Responses:
- `200` success with pagination and `customers`
- `401` unauthorized
- `403` forbidden

---

## Product Endpoints

### GET /api/products

Get active, non-expired products with available stock.

Supported query parameters:
- `page` default `1`
- `limit` default `10`
- `sort`: `price_asc`, `price_desc`, `discount_desc`
- `category`: exact category name, case-insensitive
- `vendorId`: vendor ObjectId filter
- `isDeliverable`: `true` or `false`
- `minPrice`: minimum `finalPrice`
- `maxPrice`: maximum `finalPrice`
- `city`, `governorate`, `neighborhood`: vendor location filters

Responses:
- `200` success with:
  - `page`
  - `limit`
  - `total`
  - `totalPages`
  - `data` array of products

---

### GET /api/products/search

Search products by keyword.

Query parameters:
- `q` search string

Responses:
- `200` success with `data` array of matching products

---

### GET /api/products/categories

Get product category configuration.

Responses:
- `200` success with `data` array

---

### GET /api/products/:id

Get product details by ID.

Responses:
- `200` success with `data` product object
- `400` invalid product ID
- `404` product not found

---

### POST /api/products

Create a new product.

Permissions:
- `vendor`

Headers:
- `Content-Type: multipart/form-data`

Required body fields:
- `productName`
- `price`
- `expiryDate`
- `quantity`
- `category`
- `isDeliverable`
- `image` file upload

Optional fields:
- `discount`
- `description`
- `tags`

Notes:
- `vendorId` is set from the authenticated user.
- `tags` may be generated automatically if omitted or empty.

Responses:
- `201` success with `data` created product
- `400` invalid request or missing image

---

### PUT /api/products/:id

Update an existing product.

Permissions:
- `vendor` owner of the product

Headers:
- `Content-Type: multipart/form-data`

Request body:
- any product fields to update
- optional `image` file to replace the existing image

Responses:
- `200` success with `data` updated product
- `400` invalid request
- `403` forbidden if not owner
- `404` product not found

---

### DELETE /api/products/:id

Delete a product.

Permissions:
- `vendor` owner of the product

Responses:
- `200` success with `message` confirmed
- `403` forbidden if not owner
- `404` product not found

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
      "category": "string",
      "productName": "string",
      "tags": ["string"]
    }
  ]
}
```

Notes:
- `cartItems` must be a non-empty array.
- Each item must include `category` and `productName`.
- `tags` is optional but must be an array of non-empty strings if present.

Responses:
- `200` success with `data` recommendations array
- `400` invalid request body

---

## Order Endpoints

### POST /api/orders

Create a new order.

Permissions:
- `customer`

Request body:
```json
{
  "products": [
    { "productId": "string", "quantity": number }
  ],
  "shippingAddress": "string",
  "paymentMethod": "credit_card|paypal|cash_on_delivery"
}
```

Notes:
- `shippingAddress` may be omitted only if the customer's profile contains a complete address.
- `paymentMethod` defaults to `cash_on_delivery`.
- The backend validates product existence, stock, and vendor active status.

Responses:
- `201` success with:
  - `message`
  - `order` object
- `400` invalid request, incomplete address, or stock issues
- `404` product not found

`order` object fields:
- `_id`
- `customerId`
- `products` array of items containing:
  - `productId` ObjectId or populated product object
  - `vendorId` ObjectId
  - `quantity`
  - `priceAtPurchase`
  - `isCommissioned`
- `status`
- `shippingAddress`
- `paymentMethod`
- `createdAt`
- `updatedAt`

---

### GET /api/orders/my-orders

Get paginated orders for the authenticated customer.

Permissions:
- `customer`

Query parameters:
- `page` default `1`
- `limit` default `10`
- `status` optional filter

Responses:
- `200` success with:
  - `count` number
  - `totalOrders` number
  - `totalPages` number
  - `currentPage` number
  - `orders` array of order objects

Each `order` object typically contains:
- `_id`
- `customerId` ObjectId or populated customer object
- `products` array of items containing:
  - `productId` ObjectId or populated product object
  - `vendorId` ObjectId
  - `quantity`
  - `priceAtPurchase`
  - `isCommissioned`
- `status`
- `shippingAddress`
- `paymentMethod`
- `createdAt`
- `updatedAt`

---

### GET /api/orders/vendor

Get paginated orders containing the authenticated vendor's products.

Permissions:
- `vendor`

Query parameters:
- `page` default `1`
- `limit` default `10`
- `status` optional filter

Responses:
- `200` success with:
  - `success` boolean
  - `count` number
  - `totalOrders` number
  - `totalPages` number
  - `currentPage` number
  - `orders` array of order objects

Each `order` object typically contains:
- `_id`
- `customerId` ObjectId or populated customer object with `name`, `phoneNumber`, `address`
- `products` array of items containing:
  - `productId` ObjectId or populated product object with `productName`, `priceWithCommission`, `category`
  - `vendorId` ObjectId
  - `quantity`
  - `priceAtPurchase`
  - `isCommissioned`
- `status`
- `shippingAddress`
- `paymentMethod`
- `createdAt`
- `updatedAt`

---

### GET /api/orders/:id

Get order details by ID.

Permissions:
- `customer` if order owner
- `vendor` if involved in the order
- `admin`

Responses:
- `200` success with:
  - `success` boolean
  - `order` object
- `400` invalid order ID
- `403` forbidden
- `404` order not found

`order` object fields:
- `_id`
- `customerId` ObjectId or populated customer object
- `products` array of items containing:
  - `productId` ObjectId or populated product object
  - `vendorId` ObjectId or populated vendor object
  - `quantity`
  - `priceAtPurchase`
  - `isCommissioned`
- `status`
- `shippingAddress`
- `paymentMethod`
- `summary` object containing:
  - `totalPriceBeforeDiscount`
  - `totalDiscount`
  - `finalPrice`
- `createdAt`
- `updatedAt`

---

### PATCH /api/orders/:id/cancel

Cancel a pending or ready order.

Permissions:
- `customer` owner of the order

Responses:
- `200` success with:
  - `success` boolean
  - `message` string
  - `order` object
- `400` invalid status or order not cancelable
- `403` forbidden if not owner
- `404` order not found

`order` object fields:
- `_id`
- `customerId`
- `products` array of items containing:
  - `productId`
  - `vendorId`
  - `quantity`
  - `priceAtPurchase`
  - `isCommissioned`
- `status`
- `shippingAddress`
- `paymentMethod`
- `createdAt`
- `updatedAt`

---

### PATCH /api/orders/:id/status

Update an order status.

Permissions:
- `vendor` involved in the order
- `admin`

Request body:
```json
{ "status": "pending|ready|completed|abandoned" }
```

Notes:
- `cancelled` is rejected here.
- Orders already `completed`, `cancelled`, or `abandoned` cannot be updated.
- `completed` awards customer loyalty points and increments vendor money owed.
- `abandoned` restores product inventory.

Responses:
- `200` success with:
  - `success` boolean
  - `message` string
  - `order` object
- `400` invalid status or immutable order
- `403` forbidden
- `404` order not found

`order` object fields:
- `_id`
- `customerId`
- `products` array of items containing:
  - `productId`
  - `vendorId`
  - `quantity`
  - `priceAtPurchase`
  - `isCommissioned`
- `status`
- `shippingAddress`
- `paymentMethod`
- `createdAt`
- `updatedAt`

---

### POST /api/orders/:id/rate

Rate a completed order.

Permissions:
- `customer` owner of the order

Request body:
```json
{ "rating": 1 }
```

Notes:
- `rating` must be an integer between `1` and `5`.
- Only orders with `status: completed` may be rated.
- The current implementation ignores a `review` field if provided.
- The backend sets `isRated: true` on the order document even though the schema does not define it explicitly.

Responses:
- `200` success with:
  - `success` boolean
  - `message` string
  - `order` object
- `400` invalid rating or order state
- `403` forbidden if not owner
- `404` order not found

`order` object fields:
- `_id`
- `customerId`
- `products` array of items containing:
  - `productId`
  - `vendorId`
  - `quantity`
  - `priceAtPurchase`
  - `isCommissioned`
- `status`
- `shippingAddress`
- `paymentMethod`
- `isRated` boolean
- `createdAt`
- `updatedAt`

---

## Admin Endpoints

### GET /api/admin/pending-vendors

Get vendors whose auth status is `pending`.

Permissions:
- `admin`

Query parameters:
- `page` default `1`
- `limit` default `10`

Responses:
- `200` success with pagination and `pendingVendors`
- `401` unauthorized
- `403` forbidden

---

### PATCH /api/admin/vendors/:vendorId/status

Update a vendor account status.

Permissions:
- `admin`

Request body:
```json
{ "status": "pending|incompleteData|active|suspended" }
```

Notes:
- `active` can only be set from `suspended` in the current implementation.
- Setting the same status again returns `400`.

Responses:
- `200` success with status update data
- `400` invalid transition or status
- `403` forbidden
- `404` vendor or auth record not found

---

### PATCH /api/admin/customers/:customerId/status

Update a customer account status.

Permissions:
- `admin`

Request body:
```json
{ "status": "pending|active|suspended" }
```

Notes:
- `active` can only be set from `pending` or `suspended`.

Responses:
- `200` success with status update data
- `400` invalid transition or status
- `403` forbidden
- `404` customer or auth record not found

---

### GET /api/admin/logs

Get all admin logs.

Permissions:
- `admin`

Query parameters:
- `page` default `1`
- `limit` default `10`

Responses:
- `200` success with pagination and `logs`

---

### GET /api/admin/:id/logs

Get logs for a specific admin by admin document `_id`.

Permissions:
- `admin`

Query parameters:
- `page` default `1`
- `limit` default `10`

Responses:
- `200` success with pagination and `logs`
- `400` invalid admin ID
- `404` admin profile not found

---

## Location Endpoints

### GET /api/locations

Get Egypt governorates, cities, and neighborhoods.

Responses:
- `200` success with `{ "results": number, "data": [...] }`

---

## Notes for Frontend Integration

- Always include cookies on authenticated requests using `credentials: 'include'` or `withCredentials: true`.
- Auth-protected endpoints return a normalized JSON body with `success`, `message`, and `data`.
- Use multipart form data for product image uploads.
- The `review` field is not consumed by the current order rating endpoint.
