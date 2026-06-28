# Food Waste Reduction — REST API Documentation

> **Version:** 1.0.0
> **Stack:** Node.js · Express 5 · MongoDB / Mongoose · JWT (HTTP-only cookie) · Cloudinary · Gemini 2.5 Flash · Groq Llama 3.1 8B
> **Base URL:** `https://<your-domain>/api`
> **Deployment:** Vercel (serverless) — `app` is exported as default for the Vercel handler

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
   - 1.1 [URL Structure](#11-url-structure)
   - 1.2 [Authentication Flow](#12-authentication-flow)
   - 1.3 [Authorization Layers](#13-authorization-layers)
   - 1.4 [Rate Limiting](#14-rate-limiting)
   - 1.5 [File Uploads](#15-file-uploads)
   - 1.6 [AI Services](#16-ai-services)
   - 1.7 [Standard Response Shape](#17-standard-response-shape)
   - 1.8 [Global Error Handling](#18-global-error-handling)
2. [Auth Endpoints `POST /api/auth/...`](#2-auth-endpoints)
   - 2.1 [Register](#21-post-apiauthregister)
   - 2.2 [Login](#22-post-apiauthlogin)
   - 2.3 [Logout](#23-post-apiauthlogout)
   - 2.4 [Forgot Password](#24-post-apiauthforgot-password)
   - 2.5 [Reset Password](#25-post-apiauthreset-password)
3. [User Endpoints `GET|PATCH /api/users/...`](#3-user-endpoints)
   - 3.1 [Get Current User Profile](#31-get-apiusersme)
   - 3.2 [Update Current User Profile](#32-patch-apiusersme)
   - 3.3 [Change Password](#33-patch-apiuserschange-password)
   - 3.4 [Get Vendor Analytics Dashboard](#34-get-apiusersvendor-dashboard)
   - 3.5 [Get All Vendors (Admin)](#35-get-apiusersget-vendors)
   - 3.6 [Get All Customers (Admin)](#36-get-apiusersget-customers)
4. [Admin Endpoints `GET|PATCH /api/admin/...`](#4-admin-endpoints)
   - 4.1 [List Pending Vendors](#41-get-apiadminpending-vendors)
   - 4.2 [Change Vendor Account Status](#42-patch-apiadminvendorsvendoridstatus)
   - 4.3 [Change Customer Account Status](#43-patch-apiadmincustomerscustomeridstatus)
   - 4.4 [Get All System Logs](#44-get-apiadminlogs)
   - 4.5 [Get Logs for a Specific Admin](#45-get-apiadminidlogs)
5. [Product Endpoints `GET|POST|PUT|DELETE /api/products/...`](#5-product-endpoints)
   - 5.1 [Get All Products](#51-get-apiproducts)
   - 5.2 [Search Products](#52-get-apiproductssearch)
   - 5.3 [Get Product Categories](#53-get-apiproductscategories)
   - 5.4 [Get Product by ID](#54-get-apiproductsid)
   - 5.5 [Create Product](#55-post-apiproducts)
   - 5.6 [Update Product](#56-put-apiproductsid)
   - 5.7 [Delete Product](#57-delete-apiproductsid)
   - 5.8 [Get AI Recommendations](#58-post-apiproductsrecommendations)
6. [Order Endpoints `GET|POST|PATCH /api/orders/...`](#6-order-endpoints)
   - 6.1 [Create Order](#61-post-apiorders)
   - 6.2 [Get My Orders (Customer)](#62-get-apiordersmy-orders)
   - 6.3 [Get Vendor Orders](#63-get-apiordersvendor)
   - 6.4 [Get Order Details](#64-get-apiordersid)
   - 6.5 [Cancel Order](#65-patch-apiordersidcancel)
   - 6.6 [Update Order Status](#66-patch-apiordersidstatus)
   - 6.7 [Rate Order](#67-post-apiordersidrate)
7. [Locations Endpoint `GET /api/locations`](#7-locations-endpoint)
8. [Reference Tables](#8-reference-tables)
   - 8.1 [Account Status Enum](#81-account-status-enum)
   - 8.2 [Order Status Lifecycle](#82-order-status-lifecycle)
   - 8.3 [Product Categories & Buffer Days](#83-product-categories--buffer-days)
   - 8.4 [Supported Egypt Locations](#84-supported-egypt-locations)
   - 8.5 [Validation Rules Quick Reference](#85-validation-rules-quick-reference)
   - 8.6 [Product Tags Master List](#86-product-tags-master-list)

---

## 1. Architecture Overview

### 1.1 URL Structure

All routes are prefixed with `/api`:

| Module | Base Path |
|---|---|
| Auth | `/api/auth` |
| Users | `/api/users` |
| Admin | `/api/admin` |
| Products | `/api/products` |
| Orders | `/api/orders` |
| Locations | `/api/locations` |

---

### 1.2 Authentication Flow

Authentication uses **JWT stored in an HTTP-only cookie** named `token`.

- The `authenticate` middleware reads `req.cookies.token`, verifies it against `JWT_SECRET`, and looks up the user in `UsersAuth`.
- On success it populates `req.user` with:

```js
req.user = {
  authId: string,   // UsersAuth._id
  role: string,     // "customer" | "vendor" | "admin"
  id: string        // role-specific profile _id (Customers._id or Vendors._id; for admin = UsersAuth._id)
}
```

- The JWT is issued at login, expires in **7 days**, and is cleared on logout.
- Cookie flags: `httpOnly: true`, `sameSite: "none"`, `secure: true` (production only).

---

### 1.3 Authorization Layers

Two middleware guards run after `authenticate`:

**`authorizeRole(...roles)`**
Rejects requests whose `req.user.role` is not in the allowed list.
```
→ 403 "Forbidden. Your account role does not have permission to access this resource."
```

**`authorizeStatus(...statuses)`**
Fetches the user's current `accountStatus` from `UsersAuth` and rejects if not in the allowed list.
```
→ 403 "Forbidden. Your account status does not have permission to access this resource."
```

Both guards are composable — most protected routes stack both in order:
```
authenticate → authorizeRole("vendor") → authorizeStatus("active")
```

---

### 1.4 Rate Limiting

| Limiter | Window | Max Requests | Scope | Applied To |
|---|---|---|---|---|
| `globalLimiter` | 1 min | 100 | Per IP | All routes |
| `authLimiter` | 10 min | 5 | Per IP | `POST /api/auth/login` |
| `aiCreateLimiter` | 1 min | 4 | Global bucket | `POST /api/products` (create) |
| `aiRecommendationLimiter` | 1 min | 6 | Global bucket | `POST /api/products/recommendations` |

> **Global bucket** means all users share one counter — it is not per-IP.

**Rate limit error response:**
```json
{ "message": "Too many requests. Try again later." }
```
Status: `429 Too Many Requests`

---

### 1.5 File Uploads

The `uploadMiddleware` (multer, memory storage) applies to `POST /api/products` and `PUT /api/products/:id`.

| Constraint | Value |
|---|---|
| Form field name | `image` |
| Max file size | 5 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |
| Max files | 1 |
| Storage | Cloudinary folder `food-waste-reduction/products` |

**Upload errors:**

| Scenario | Status | Message |
|---|---|---|
| File exceeds 5 MB | `400` | `"File size exceeds maximum limit of 5MB"` |
| More than one file | `400` | `"Only one image file is allowed"` |
| Invalid MIME type | `400` | `"Invalid file type: <type>. Allowed types: image/jpeg, image/png, image/webp"` |

---

### 1.6 AI Services

Two AI providers are used for product tagging and cart recommendations, with a three-tier cascade fallback:

| Priority | Provider | Model | Used For |
|---|---|---|---|
| 1 (primary) | Google Gemini | `gemini-2.5-flash` | Tag generation, recommendations |
| 2 (fallback) | Groq | `llama-3.1-8b-instant` | Tag generation, recommendations |
| 3 (ground fallback) | Local algorithm | — | Category-based static tags / local DB scoring |

If all AI providers fail, the system **never errors out** — it silently falls back to the local strategy and returns a valid result.

---

### 1.7 Standard Response Shape

All responses pass through a `normalizeResponseBody` interceptor mounted on `res.json`. It ensures every response includes a `success` boolean and a `message` string:

**Success shape:**
```json
{
  "success": true,
  "message": "Request successful",
  "...": "additional fields"
}
```

**Error shape:**
```json
{
  "success": false,
  "message": "Human-readable error description"
}
```

> The `status` field is stripped from response bodies if accidentally included by controllers.

---

### 1.8 Global Error Handling

The `errorMiddleware` catches all errors passed via `next(err)` and normalizes the response:

| Trigger | Status | Message |
|---|---|---|
| `SyntaxError` / `entity.parse.failed` | `400` | `"Invalid JSON body. Check syntax (missing quotes, trailing commas, etc)."` |
| Mongoose duplicate key (`err.code === 11000`) | `409` | `"Duplicate value for <fieldName>"` |
| Mongoose `ValidationError` | `400` | Mongoose validation message |
| Any unhandled `5xx` error | `500` | `"Internal server error"` |
| Route not registered | `404` | `"Route not found"` |

---

## 2. Auth Endpoints

**Base path:** `/api/auth` | All endpoints are **public** unless noted.

---

### 2.1 `POST /api/auth/register`

#### Description

Creates a new user account for a `customer`, `vendor`, or `admin`. Vendor and customer registrations run inside a MongoDB session/transaction — both the `UsersAuth` record and the role-specific profile (`Vendors` or `Customers`) are created atomically. If either write fails, both are rolled back.

**Account status assigned on registration:**

| Role | Initial `accountStatus` |
|---|---|
| `vendor` | `pending` — must be approved by an admin before the account becomes usable |
| `customer` | `active` |
| `admin` | `active` |

> **Note:** The `admin` role can be registered through this endpoint, but in practice admin accounts are seeded via the `createAdmin.js` script.

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/auth/register` |
| **Auth required** | No |
| **Content-Type** | `application/json` |
| **Rate limit** | Global (100 req/min/IP) |

**Request Body — All Roles**

| Field | Type | Required | Validation |
|---|---|---|---|
| `username` | string | Yes | 5–30 chars, no whitespace |
| `email` | string | Yes | Valid email format; stored as lowercase |
| `password` | string | Yes | Min 6 chars, no whitespace; hashed with bcrypt (cost 10) before storage |
| `role` | string | Yes | `"customer"`, `"vendor"`, or `"admin"` |

**Additional fields — Vendor** (sent at the top level of the body alongside the base fields)

| Field | Type | Required | Validation |
|---|---|---|---|
| `shopName` | string | Yes | 3–50 chars |
| `phoneNumber` | string | Yes | Format: `+?[0-9]{7,15}` |
| `taxNumber` | string | Yes | Non-empty; must be unique across the `Vendors` collection |
| `address` | object | Yes | See address shape below |

**Additional fields — Customer** (same pattern)

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | object | Yes | `{ firstName, lastName }` — each 3–50 chars, Unicode letters/hyphens/apostrophes |
| `phoneNumber` | string | Yes | Same format as vendor |
| `address` | object | Yes | Same shape as vendor |

**Address object shape** (used by both vendor and customer):

| Field | Type | Required | Validation |
|---|---|---|---|
| `governorate` | string | Yes | Must match a valid governorate in the Egypt locations dataset (Cairo, Alexandria, Giza) |
| `city` | string | Yes | Must belong to the supplied governorate |
| `neighborhood` | string | Yes | Must belong to the supplied city |
| `detailedAddress` | string | Yes | Free text, max 200 chars |

**Request Example — Vendor Registration**

```json
POST /api/auth/register

{
  "username": "fresh_basket",
  "email": "vendor@example.com",
  "password": "pass1234",
  "role": "vendor",
  "shopName": "Fresh Basket",
  "phoneNumber": "01012345678",
  "taxNumber": "TAX-9988776",
  "address": {
    "governorate": "cairo",
    "city": "nasr city",
    "neighborhood": "el-nozha",
    "detailedAddress": "12 El-Nozha St, Apt 3"
  }
}
```

**Request Example — Customer Registration**

```json
POST /api/auth/register

{
  "username": "sara_hassan",
  "email": "sara@example.com",
  "password": "mypass99",
  "role": "customer",
  "name": {
    "firstName": "Sara",
    "lastName": "Hassan"
  },
  "phoneNumber": "01198765432",
  "address": {
    "governorate": "cairo",
    "city": "cairo city",
    "neighborhood": "Heliopolis",
    "detailedAddress": "5 El-Merghany St, Floor 2"
  }
}
```

#### Success Response — `201 Created`

```json
{
  "success": true,
  "message": "User registered successfully."
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | Any of `username`, `email`, `password`, `role` is missing | `"All fields are required: username, email, password, role."` |
| `400` | `role` not in allowed enum | `"Invalid role."` |
| `400` | `username` length violation | `"Username must be between 5 and 30 characters."` |
| `400` | `username` contains spaces | `"username cannot contain spaces."` |
| `400` | Invalid `email` format | `"Invalid email format."` |
| `400` | `password` too short | `"Password must be at least 6 characters."` |
| `400` | `password` contains spaces | `"password cannot contain spaces."` |
| `400` | `username` already exists in `UsersAuth` | `"Username already exists."` |
| `400` | `taxNumber` already used by another vendor | `"Tax number already in use."` |
| `400` | Customer `email` already registered | `"Customer account already exists with this email. Only one customer account per email is allowed."` |
| `400` | Vendor/customer profile field fails validation | `"<specific validator message>"` |
| `400` | Invalid governorate | `"address: '<value>' is not a valid or supported governorate."` |
| `400` | City doesn't belong to governorate | `"address: City '<value>' is invalid or does not belong to the selected governorate."` |
| `400` | Neighborhood doesn't belong to city | `"address: Neighborhood '<value>' is invalid or does not exist inside <cityName>."` |
| `500` | Transaction or unexpected DB error | `"Internal server error"` |

---

### 2.2 `POST /api/auth/login`

#### Description

Authenticates a user and issues a JWT stored in an HTTP-only cookie named `token`. Username lookup is exact and case-sensitive (after trimming). The same error message is returned for both "user not found" and "wrong password" to prevent account enumeration.

**Cookie issued on success:**

| Property | Value |
|---|---|
| Name | `token` |
| `httpOnly` | `true` |
| `secure` | `true` in production, `false` in development |
| `sameSite` | `"none"` |
| `maxAge` | 7 days (604 800 000 ms) |

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/auth/login` |
| **Auth required** | No |
| **Content-Type** | `application/json` |
| **Rate limit** | Auth limiter — 5 attempts / IP / 10 minutes |

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | Yes | Trimmed before lookup; case-sensitive |
| `password` | string | Yes | Compared via bcrypt |

**Request Example**

```json
POST /api/auth/login

{
  "username": "fresh_basket",
  "password": "pass1234"
}
```

#### Success Response — `200 OK`

```json
{
  "message": "Login successful.",
  "user": {
    "authId": "60d21b4667d0d8992e610c85",
    "id": "60d21b4667d0d8992e610c86",
    "username": "fresh_basket",
    "role": "vendor",
    "accountStatus": "active"
  }
}
```

> The `token` cookie is set on the response. Subsequent requests to protected endpoints must include this cookie.

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `username` or `password` missing | `"Username and password are required."` |
| `400` | Username not found or password mismatch | `"Invalid username or password."` |
| `429` | Rate limit exceeded | `"Too many login attempts. Try again later."` |
| `500` | Unexpected server error | `"Internal server error"` |

---

### 2.3 `POST /api/auth/logout`

#### Description

Clears the `token` cookie, ending the session. The backend is stateless — no server-side token blocklist is maintained. This is purely a cookie-clear operation.

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/auth/logout` |
| **Auth required** | Yes — all roles, any status |
| **Cookie** | `token=<JWT>` |

**Request Body:** None.

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

> The `token` cookie is cleared on the response.

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT cookie | `"Unauthorized: Authentication token is missing"` |
| `500` | Unexpected server error | `"Internal server error"` |

---

### 2.4 `POST /api/auth/forgot-password`

#### Description

Initiates a password reset. If the `username` exists in the database, a short-lived JWT reset token (15-minute expiry) is generated, saved to `UsersAuth.resetToken`, and emailed to the account's registered email address via Nodemailer. The reset link points to: `FRONTEND_URL/reset-password?token=<token>`.

**Security note:** The endpoint always returns the same 200 message regardless of whether the account exists, preventing username enumeration.

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/auth/forgot-password` |
| **Auth required** | No |
| **Content-Type** | `application/json` |

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | Yes | The registered username |

**Request Example**

```json
POST /api/auth/forgot-password

{
  "username": "fresh_basket"
}
```

#### Success Response — `200 OK`

Returned whether or not the account exists:

```json
{
  "success": true,
  "message": "If the account exists, a reset link has been sent to the associated email."
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `username` field missing | `"Username is required"` |
| `500` | Unexpected server error | `"Internal server error"` |

---

### 2.5 `POST /api/auth/reset-password`

#### Description

Completes a password reset using the token issued by `forgot-password`. The token is verified against `JWT_SECRET` for structural validity and then cross-checked against `UsersAuth.resetToken` to prevent replay attacks. On success, the new password is saved (triggering the bcrypt `pre-save` hook) and `resetToken` is cleared to `null`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/auth/reset-password` |
| **Auth required** | No |
| **Content-Type** | `application/json` |

**Request Body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `token` | string | Yes | Short-lived JWT from the reset email |
| `newPassword` | string | Yes | Min 6 chars (enforced by Mongoose schema `pre-save`) |

**Request Example**

```json
POST /api/auth/reset-password

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "newSecurePass99"
}
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Password reset successfully!"
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `token` or `newPassword` missing | `"Missing required fields"` |
| `400` | Token expired, structurally invalid, or doesn't match stored `resetToken` | `"Link is invalid or has expired"` |
| `404` | No user found for decoded `userId` | `"User not found"` |
| `500` | Unexpected server error | `"Internal server error"` |

---

## 3. User Endpoints

**Base path:** `/api/users` | All endpoints require authentication.

---

### 3.1 `GET /api/users/me`

#### Description

Returns the authenticated user's full profile. The response shape varies by role:

- **Vendor:** Full `Vendors` document merged with `UsersAuth` fields (`username`, `email`, `role`, `accountStatus`), plus a computed `vendorRating` = `rating.score / rating.totalRatingsNumber` (or `0` if no ratings yet). `password` and `resetToken` are excluded.
- **Customer:** Full `Customers` document merged with `UsersAuth` fields. Same exclusions.
- **Admin:** Full `Admin` profile document merged with `UsersAuth` fields. Same exclusions.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/users/me` |
| **Auth required** | Yes — roles: `customer`, `vendor`, `admin` |
| **Cookie** | `token=<JWT>` |

**Request Body:** None.

#### Success Response — `200 OK` (Vendor)

```json
{
  "success": true,
  "vendorData": {
    "_id": "664a1f3e2b7c8d9e0f123456",
    "shopName": "Fresh Basket",
    "address": {
      "governorate": "cairo",
      "city": "nasr city",
      "neighborhood": "el-nozha",
      "detailedAddress": "12 El-Nozha St, Apt 3",
      "map": [31.23, 30.06]
    },
    "phoneNumber": "01012345678",
    "taxNumber": "TAX-9988776",
    "pickupTime": {
      "days": ["saturday", "sunday"],
      "from": "09:00",
      "to": "17:00"
    },
    "moneyOwed": 0,
    "rating": {
      "score": 18,
      "totalRatingsNumber": 4
    },
    "authId": "663f8a1b2c3d4e5f6a7b8c9d",
    "username": "fresh_basket",
    "email": "vendor@example.com",
    "role": "vendor",
    "accountStatus": "active",
    "vendorRating": 4.5,
    "createdAt": "2024-05-19T10:22:00.000Z",
    "updatedAt": "2024-05-20T09:00:00.000Z"
  }
}
```

#### Success Response — `200 OK` (Customer)

```json
{
  "success": true,
  "customerData": {
    "_id": "665b2c4d3e8f9a0b1c2d3e4f",
    "name": {
      "firstName": "Sara",
      "lastName": "Hassan"
    },
    "address": {
      "governorate": "cairo",
      "city": "cairo city",
      "neighborhood": "Heliopolis",
      "detailedAddress": "5 El-Merghany St, Floor 2"
    },
    "phoneNumber": "01198765432",
    "loyaltyPoints": 120,
    "authId": "663f8a1b2c3d4e5f6a7b8c9d",
    "username": "sara_hassan",
    "email": "sara@example.com",
    "role": "customer",
    "accountStatus": "active",
    "createdAt": "2024-05-18T08:00:00.000Z",
    "updatedAt": "2024-05-19T10:00:00.000Z"
  }
}
```

#### Success Response — `200 OK` (Admin)

```json
{
  "success": true,
  "adminData": {
    "_id": "664a1f3e2b7c8d9e0f123457",
    "authId": "663f8a1b2c3d4e5f6a7b8c9d",
    "username": "masteradmin",
    "email": "admin@foodwasteapp.com",
    "role": "admin",
    "accountStatus": "active",
    "createdAt": "2024-05-19T10:22:00.000Z",
    "updatedAt": "2024-05-20T09:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `404` | `UsersAuth` record not found | `"Account authentication credentials not found"` |
| `404` | Vendor profile not found | `"Vendor profile not found"` |
| `404` | Customer profile not found | `"Customer profile not found"` |
| `404` | Admin profile not found | `"Admin profile not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 3.2 `PATCH /api/users/me`

#### Description

Updates the authenticated user's own profile. Fields are gated by role — only the fields allowed for a given role are processed; any other fields are silently ignored. At least one valid field must be provided after role-filtering, otherwise a `400` is returned.

**Vendor-allowed fields:** `shopName`, `address`, `phoneNumber`, `pickupTime`, `map` (stored under `address.map`).

**Customer-allowed fields:** `name`, `address`, `phoneNumber`.

**Auto-activation:** If a vendor update results in both `address.map` and `pickupTime` being present on the document, `accountStatus` is automatically promoted from `"incompleteData"` to `"active"`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `PATCH /api/users/me` |
| **Auth required** | Yes — roles: `customer`, `vendor`; status: `active` or `incompleteData` |
| **Content-Type** | `application/json` |
| **Cookie** | `token=<JWT>` |

**Request Body — Vendor (all optional, at least one required)**

| Field | Type | Validation |
|---|---|---|
| `shopName` | string | 3–50 chars |
| `address` | object | Full address shape (see §2.1); all sub-fields validated against Egypt locations |
| `phoneNumber` | string | `+?[0-9]{7,15}` |
| `pickupTime` | object | `{ days: string[], from: "HH:MM", to: "HH:MM" }` — `days` must be non-empty |
| `map` | number[2] | `[longitude, latitude]` — lng: −180 to 180, lat: −90 to 90 |

**Request Body — Customer (all optional, at least one required)**

| Field | Type | Validation |
|---|---|---|
| `name` | object | `{ firstName, lastName }` — each 3–50 chars, Unicode letters/hyphens/apostrophes |
| `address` | object | Same address shape and validation |
| `phoneNumber` | string | Same format |

**Request Example — Vendor**

```json
PATCH /api/users/me

{
  "shopName": "Green Basket",
  "phoneNumber": "01099887766",
  "pickupTime": {
    "days": ["monday", "wednesday", "friday"],
    "from": "10:00",
    "to": "18:00"
  },
  "map": [31.2357, 30.0444]
}
```

**Request Example — Customer**

```json
PATCH /api/users/me

{
  "name": {
    "firstName": "Nour",
    "lastName": "Ali"
  },
  "phoneNumber": "01234567890"
}
```

#### Success Response — `200 OK` (Vendor)

```json
{
  "success": true,
  "message": "Vendor profile updated successfully",
  "vendorData": {
    "_id": "664a1f...",
    "shopName": "Green Basket",
    "address": { "...": "updated fields" },
    "phoneNumber": "01099887766",
    "pickupTime": { "days": ["monday", "wednesday", "friday"], "from": "10:00", "to": "18:00" },
    "moneyOwed": 0,
    "rating": { "score": 0, "totalRatingsNumber": 0 },
    "authId": "663f8a..."
  }
}
```

#### Success Response — `200 OK` (Customer)

```json
{
  "success": true,
  "message": "Customer profile updated successfully",
  "customerData": {
    "_id": "665b2c...",
    "name": { "firstName": "Nour", "lastName": "Ali" },
    "address": { "...": "unchanged fields" },
    "phoneNumber": "01234567890",
    "loyaltyPoints": 120,
    "authId": "663f8a..."
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | No valid update fields after role-filtering | `"Bad Request: No valid fields provided for update"` |
| `400` | `shopName` validation fails | `"Shop name must be between 3 and 50 characters."` |
| `400` | `name` validation fails | `"name: firstName must be between 3 and 50 characters."` (or similar) |
| `400` | `phoneNumber` format invalid | `"Invalid phoneNumber format."` |
| `400` | `address` validation fails | `"address: '<value>' is not a valid or supported governorate."` (or similar) |
| `400` | `pickupTime` structure invalid | `"Pickup schedule requires an array of at least one day."` (or similar) |
| `400` | `map` coordinates invalid | `"Longitude must be between -180 and 180."` (or similar) |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is `admin` | `"Forbidden: Only authorized vendors and customers can access this endpoint"` |
| `403` | `accountStatus` not `active` or `incompleteData` | `"Forbidden. Your account status does not have permission to access this resource."` |
| `404` | Vendor profile not found | `"Vendor profile not found"` |
| `404` | Customer profile not found | `"Customer profile not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 3.3 `PATCH /api/users/change-password`

#### Description

Changes the authenticated user's password. The existing password is verified via bcrypt before saving the new one. The new password is hashed by the `UsersAuth` `pre-save` hook. No `authorizeStatus` middleware is applied — this route is accessible regardless of account status.

#### Request Details

| | |
|---|---|
| **Method & URL** | `PATCH /api/users/change-password` |
| **Auth required** | Yes — roles: `customer`, `vendor` (admin is blocked by role check in controller) |
| **Content-Type** | `application/json` |
| **Cookie** | `token=<JWT>` |

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `oldPassword` | string | Yes | The user's current plain-text password |
| `newPassword` | string | Yes | Min 6 chars (enforced by Mongoose schema) |

**Request Example**

```json
PATCH /api/users/change-password

{
  "oldPassword": "myOldPass123",
  "newPassword": "myNewPass456"
}
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `oldPassword` or `newPassword` missing | `"Bad Request: Missing required parameters"` |
| `400` | Either field is not a string | `"Bad Request: Password fields must be valid text strings."` |
| `400` | `oldPassword` does not match stored hash | `"Current password is incorrect"` |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is `admin` | `"Forbidden: Unauthorized access"` |
| `404` | `UsersAuth` record not found | `"Authentication record not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 3.4 `GET /api/users/vendor-dashboard`

#### Description

Returns a KPI analytics summary for the authenticated vendor. The controller iterates all orders containing at least one of the vendor's products and computes:

| KPI | Calculation |
|---|---|
| `profit` | Sum of `priceAtPurchase × quantity` for all items in **completed** orders, multiplied by `0.9` (net of 10% platform commission) |
| `productsInCurrentOrders` | Total quantity of vendor items in **pending** + **ready** orders |
| `productsInCompletedOrders` | Total quantity of vendor items in **completed** orders |
| `numberOfCustomers` | Count of unique customer IDs across all orders |

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/users/vendor-dashboard` |
| **Auth required** | Yes — role: `vendor`; status: `active` or `suspended` |
| **Cookie** | `token=<JWT>` |

**Request Body:** None.

#### Success Response — `200 OK` (with orders)

```json
{
  "success": true,
  "analytics": {
    "profit": 1845.60,
    "productsInCurrentOrders": 34,
    "productsInCompletedOrders": 210,
    "numberOfCustomers": 57
  }
}
```

#### Success Response — `200 OK` (no orders yet)

```json
{
  "success": true,
  "message": "Vendor has no orders yet",
  "analytics": {
    "profit": 0,
    "productsInCurrentOrders": 0,
    "productsInCompletedOrders": 0,
    "numberOfCustomers": 0
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `vendor` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `403` | `accountStatus` not `active` or `suspended` | `"Forbidden. Your account status does not have permission to access this resource."` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 3.5 `GET /api/users/get-vendors`

#### Description

Returns a paginated list of all `Vendors` documents, sorted descending by `moneyOwed` (highest platform debt first). Intended for admin financial oversight.The authId field is populated to return the Vendors's account status. Intended for admin user management

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/users/get-vendors` |
| **Auth required** | Yes — role: `admin`; no status restriction |
| **Cookie** | `token=<JWT>` |

**Query Parameters**

| Parameter | Type | Required | Default |
|---|---|---|---|
| `page` | integer | No | `1` |
| `limit` | integer | No | `10` |

**Request Example**

```
GET /api/users/get-vendors?page=1&limit=20
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "pagination": {
    "totalVendors": 48,
    "currentPage": 1,
    "totalPages": 3,
    "limit": 20
  },
  "count": 20,
  "vendors": [
    {
      "_id": "664a1f...",
      "shopName": "Fresh Basket",
      "moneyOwed": 340.50,
      "rating": { "score": 18, "totalRatingsNumber": 4 },
      "authId": {
        "_id": "663f8a...",
        "accountStatus": "active"
      },
      "...": "full Vendors document"
    }
  ]
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `admin` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 3.6 `GET /api/users/get-customers`

#### Description

Returns a paginated list of all `Customers` documents, sorted descending by `createdAt` (newest registrations first). Intended for admin user management.The authId field is populated to return the customer's account status. Intended for admin user management

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/users/get-customers` |
| **Auth required** | Yes — role: `admin`; no status restriction |
| **Cookie** | `token=<JWT>` |

**Query Parameters**

| Parameter | Type | Required | Default |
|---|---|---|---|
| `page` | integer | No | `1` |
| `limit` | integer | No | `10` |

**Request Example**

```
GET /api/users/get-customers?page=3&limit=15
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "pagination": {
    "totalCustomers": 312,
    "currentPage": 3,
    "totalPages": 21,
    "limit": 15
  },
  "count": 15,
  "customers": [
    {
      "_id": "665b2c...",
      "name": { "firstName": "Sara", "lastName": "Hassan" },
      "loyaltyPoints": 120,
      "authId": {
        "_id": "663f8a...",
        "accountStatus": "active"
      },
      "...": "full Customers document"
    }
  ]
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `admin` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

## 4. Admin Endpoints

**Base path:** `/api/admin` | All endpoints require role: `admin`.

---

### 4.1 `GET /api/admin/pending-vendors`

#### Description

Returns a paginated list of vendor profiles whose `UsersAuth.accountStatus` is `"pending"`. The controller first queries `UsersAuth` for all auth records with `role: "vendor"` and `accountStatus: "pending"`, slices that array for pagination, then fetches matching `Vendors` documents.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/admin/pending-vendors` |
| **Auth required** | Yes — role: `admin` |
| **Cookie** | `token=<JWT>` |

**Query Parameters**

| Parameter | Type | Required | Default |
|---|---|---|---|
| `page` | integer | No | `1` |
| `limit` | integer | No | `10` |

**Request Example**

```
GET /api/admin/pending-vendors?page=1&limit=5
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "pagination": {
    "totalVendors": 23,
    "currentPage": 1,
    "totalPages": 5,
    "limit": 5
  },
  "count": 5,
  "pendingVendors": [
    {
      "_id": "664a1f...",
      "shopName": "Fresh Basket",
      "address": {
        "governorate": "cairo",
        "city": "nasr city",
        "neighborhood": "el-nozha",
        "detailedAddress": "12 El-Nozha St, Apt 3",
        "map": null
      },
      "phoneNumber": "01012345678",
      "taxNumber": "TAX-9988776",
      "pickupTime": null,
      "moneyOwed": 0,
      "rating": { "score": 0, "totalRatingsNumber": 0 },
      "authId": "663f8a...",
      "createdAt": "2024-05-19T10:22:00.000Z",
      "updatedAt": "2024-05-19T10:22:00.000Z"
    }
  ]
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `admin` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `500` | Unexpected DB or server error | `"Internal server error"` |

---

### 4.2 `PATCH /api/admin/vendors/:vendorId/status`

#### Description

Updates a vendor's `accountStatus` in `UsersAuth` and writes an immutable audit log to `AdminLogs`. Strict lifecycle rules are enforced:

**Valid transitions:**

| From | To | Log Action |
|---|---|---|
| `pending` | `incompleteData` | `approve_vendor` |
| `pending` | `suspended` | `reject_vendor` |
| `active` | `suspended` | `suspend_user` |
| `incompleteData` | `suspended` | `suspend_user` |
| `suspended` | `active` | `reactivate_user` |

**Blocked transitions:**

- Setting status to `"active"` from anything other than `"suspended"` → `400`.
- Setting a status identical to the current status → `400`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `PATCH /api/admin/vendors/:vendorId/status` |
| **Auth required** | Yes — role: `admin` |
| **Content-Type** | `application/json` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `vendorId` | ObjectId string | Yes | `_id` of the target `Vendors` document |

**Request Body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `status` | string | Yes | One of: `"pending"`, `"incompleteData"`, `"active"`, `"suspended"` |

**Request Example**

```json
PATCH /api/admin/vendors/664a1f3e2b7c8d9e0f123456/status

{
  "status": "incompleteData"
}
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Vendor account status successfully updated to incompleteData",
  "data": {
    "vendorId": "664a1f3e2b7c8d9e0f123456",
    "authId": "663f8a1b2c3d4e5f6a7b8c9d",
    "newStatus": "incompleteData"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `vendorId` is not a valid ObjectId | `"Invalid vendor ID format"` |
| `400` | `status` missing or not in enum | `"Invalid or missing status value"` |
| `400` | `status` equals current status | `"Vendor account is already <status>"` |
| `400` | Trying to set `active` from anything other than `suspended` | `"Bad Request: Accounts can only be manually set to active from a suspended state."` |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `admin` | `"Forbidden: Unauthorized access"` |
| `404` | Vendor document not found | `"Vendor profile not found"` |
| `404` | Admin profile not found | `"Admin profile record not found"` |
| `404` | `UsersAuth` record for vendor not found | `"Associated authentication account not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 4.3 `PATCH /api/admin/customers/:customerId/status`

#### Description

Updates a customer's `accountStatus` in `UsersAuth`. Allowed target statuses: `"active"`, `"suspended"`, `"pending"`. Activation is only permitted from `"suspended"` or `"pending"` states — attempting to activate from `"incompleteData"` is blocked. An audit log is always written on success.

**Log action mapping:**

| Target Status | Log Action |
|---|---|
| `active` | `reactivate_user` |
| `suspended` | `suspend_user` |
| `pending` | `suspend_user` |

#### Request Details

| | |
|---|---|
| **Method & URL** | `PATCH /api/admin/customers/:customerId/status` |
| **Auth required** | Yes — role: `admin` |
| **Content-Type** | `application/json` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `customerId` | ObjectId string | Yes | `_id` of the target `Customers` document |

**Request Body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `status` | string | Yes | One of: `"pending"`, `"active"`, `"suspended"` |

**Request Example**

```json
PATCH /api/admin/customers/665b2c4d3e8f9a0b1c2d3e4f/status

{
  "status": "suspended"
}
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Customer account status successfully updated to suspended",
  "data": {
    "customerId": "665b2c4d3e8f9a0b1c2d3e4f",
    "authId": "663f8a1b2c3d4e5f6a7b8c9d",
    "newStatus": "suspended"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `customerId` is not a valid ObjectId | `"Invalid customer ID format"` |
| `400` | `status` missing or not in enum | `"Invalid or missing status value"` |
| `400` | `status` equals current status | `"Customer account is already <status>"` |
| `400` | Activating from an illegal state | `"Bad Request: Customer accounts can only be set to active from a pending or suspended state."` |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `admin` | `"Forbidden: Unauthorized access"` |
| `404` | Customer document not found | `"Customer profile not found"` |
| `404` | Admin profile not found | `"Admin profile record not found"` |
| `404` | `UsersAuth` record not found | `"Associated authentication account not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 4.4 `GET /api/admin/logs`

#### Description

Returns a paginated, descending-chronological list of every `AdminLogs` document across all admins. Used for global system auditing.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/admin/logs` |
| **Auth required** | Yes — role: `admin` |
| **Cookie** | `token=<JWT>` |

**Query Parameters**

| Parameter | Type | Required | Default |
|---|---|---|---|
| `page` | integer | No | `1` |
| `limit` | integer | No | `10` |

**Request Example**

```
GET /api/admin/logs?page=2&limit=20
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "pagination": {
    "totalLogs": 145,
    "currentPage": 2,
    "totalPages": 8,
    "limit": 20
  },
  "count": 20,
  "logs": [
    {
      "_id": "666c3d...",
      "adminId": "664d2e...",
      "userId": "663f8a...",
      "action": "approve_vendor",
      "description": "Changed vendor with Id 664a1f... status from 'pending' to 'incompleteData'.",
      "createdAt": "2024-06-01T08:30:00.000Z",
      "updatedAt": "2024-06-01T08:30:00.000Z"
    }
  ]
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `admin` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 4.5 `GET /api/admin/:id/logs`

#### Description

Returns paginated audit log entries for a single admin, matched by the Admin collection's `_id` field (not `authId`). Results are sorted descending by `createdAt`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/admin/:id/logs` |
| **Auth required** | Yes — role: `admin` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | `_id` of the `Admin` document (not `authId`) |

**Query Parameters**

| Parameter | Type | Required | Default |
|---|---|---|---|
| `page` | integer | No | `1` |
| `limit` | integer | No | `10` |

**Request Example**

```
GET /api/admin/664d2e3f4a5b6c7d8e9f0a1b/logs?page=1&limit=10
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "pagination": {
    "totalLogs": 12,
    "currentPage": 1,
    "totalPages": 2,
    "limit": 10
  },
  "count": 10,
  "logs": [
    {
      "_id": "666c3d...",
      "adminId": "664d2e...",
      "userId": "663f8a...",
      "action": "suspend_user",
      "description": "Changed customer status from 'active' to 'suspended'.",
      "createdAt": "2024-06-02T11:00:00.000Z",
      "updatedAt": "2024-06-02T11:00:00.000Z"
    }
  ]
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `:id` is not a valid ObjectId | `"Invalid Admin ID format"` |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `admin` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `404` | No `Admin` document with that `_id` | `"Admin profile not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

## 5. Product Endpoints

**Base path:** `/api/products`

### Product Document Shape

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `productName` | string | 3–50 chars; cannot be all digits |
| `category` | string (enum) | One of 8 category keys — see §8.3 |
| `price` | number | Base price (before commission/discount). Must be > 0 |
| `commission` | number | Auto-calculated: `price × 0.10` on every save |
| `discount` | number | Percentage (0–100). Default: `0` |
| `finalPrice` | number | **Computed in aggregation, not stored:** `price + commission − (price × discount / 100)` |
| `expiryDate` | Date | Must be a future date at time of creation |
| `validDate` | Date | Auto-calculated: `expiryDate − bufferDays[category]` |
| `vendorId` | ObjectId → `Vendors` | Injected from `req.user.id`; never accepted from body |
| `quantity` | integer | Min 0; decremented on order creation; restored on cancellation |
| `isDeliverable` | boolean | Required |
| `imgUrl` | string | Cloudinary CDN URL |
| `publicImgId` | string | Cloudinary public ID; used for deletion |
| `description` | string | Optional, max 200 chars |
| `tags` | string[] | AI-generated on create if not provided; see §8.6 |

---

### 5.1 `GET /api/products`

#### Description

Returns active, in-stock, non-expired products with vendor info joined in via MongoDB aggregation. Only products from **active vendors** are returned. Supports rich filtering, geographic scoping, and sorting.

**Baseline filters always applied:** `validDate >= today`, `expiryDate > today`, `quantity > 0`, vendor `accountStatus === "active"`.

**`finalPrice` computation** (added in aggregation stage):
```
finalPrice = (price + commission) - (price × discount / 100)
```

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/products` |
| **Auth required** | No — public |

**Query Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `category` | string | No | Case-insensitive match. Must be a valid category key |
| `isDeliverable` | string | No | `"true"` or `"false"` |
| `vendorId` | ObjectId string | No | Filter to a specific vendor's products |
| `minPrice` | number | No | Applied against computed `finalPrice` |
| `maxPrice` | number | No | Applied against computed `finalPrice` |
| `city` | string | No | Case-insensitive regex on `vendor.address.city` |
| `governorate` | string | No | Case-insensitive regex on `vendor.address.governorate` |
| `neighborhood` | string | No | Case-insensitive regex on `vendor.address.neighborhood` |
| `sort` | string | No | `"price_asc"`, `"price_desc"`, `"discount_desc"`. Default: `expiryDate` ascending |
| `page` | integer | No | Default: `1` |
| `limit` | integer | No | Default: `10` |

**Request Example**

```
GET /api/products?category=bakery&city=nasr+city&sort=price_asc&page=1&limit=5
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "page": 1,
    "limit": 5,
    "total": 42,
    "totalPages": 9,
    "data": [
      {
        "_id": "664a1f...",
        "productName": "Whole Wheat Loaf",
        "price": 25,
        "commission": 2.5,
        "discount": 20,
        "finalPrice": 22.5,
        "expiryDate": "2024-06-05T00:00:00.000Z",
        "validDate": "2024-05-29T00:00:00.000Z",
        "quantity": 10,
        "isDeliverable": true,
        "imgUrl": "https://res.cloudinary.com/...",
        "description": "Freshly baked whole wheat",
        "tags": ["quick breakfast (fetoor)", "perishable / consume today"],
        "category": "bakery",
        "vendorId": "663b2c...",
        "vendor": {
          "address": {
            "city": "nasr city",
            "governorate": "cairo",
            "neighborhood": "el-nozha",
            "detailedAddress": "12 El-Nozha St"
          }
        },
        "shopName": "Fresh Basket"
      }
    ]
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `500` | Unexpected DB / aggregation error | `"Internal server error"` |

---

### 5.2 `GET /api/products/search`

#### Description

Full-text search across `productName`, `vendor.shopName`, and `tags` fields using case-insensitive regex. The same baseline filters apply (`validDate`, `expiryDate`, `quantity`). Results are sorted by `expiryDate` ascending. For geographic or price filtering, use `GET /api/products` instead.

> **Route ordering note:** This route is registered **before** `GET /api/products/:id` to prevent the `:id` wildcard from consuming the literal string `"search"`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/products/search` |
| **Auth required** | No — public |

**Query Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `q` | string | No | Search keyword. If omitted or empty, returns all valid products. |
| `page` | integer | No | Default: `1` |
| `limit` | integer | No | Default: `10` |

**Request Example**

```
GET /api/products/search?q=cheese&page=1&limit=10
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "page": 1,
    "limit": 10,
    "total": 7,
    "totalPages": 1,
    "data": [ { "...": "product documents" } ]
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 5.3 `GET /api/products/categories`

#### Description

Returns the full `CATEGORY_CONFIG` object — all supported product categories with their human-readable labels and the buffer-day windows used to compute `validDate`. Primarily used to populate frontend dropdowns.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/products/categories` |
| **Auth required** | No — public |

**Request Example**

```
GET /api/products/categories
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "dairy":           { "label": "Dairy",              "bufferDays": 10 },
    "meat_seafood":    { "label": "Meat & Seafood",      "bufferDays": 7  },
    "bakery":          { "label": "Bakery",              "bufferDays": 7  },
    "frozen_food":     { "label": "Frozen Food",         "bufferDays": 30 },
    "ready_meals":     { "label": "Ready Meals",         "bufferDays": 10 },
    "snacks_desserts": { "label": "Snacks & Desserts",   "bufferDays": 30 },
    "drinks":          { "label": "Drinks",              "bufferDays": 30 },
    "pantry":          { "label": "Pantry",              "bufferDays": 30 }
  }
}
```

---

### 5.4 `GET /api/products/:id`

#### Description

Returns a single product by ID. Vendor address, pickup schedule, and computed `finalPrice` are joined in via aggregation. Also returns `vendorStatus` so the frontend can display unavailability warnings when a vendor is suspended mid-listing.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/products/:id` |
| **Auth required** | No — public |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | 24-character hex MongoDB ObjectId |

**Request Example**

```
GET /api/products/664a1f3e2b7c8d9e0f123456
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "_id": "664a1f...",
    "productName": "Whole Wheat Loaf",
    "category": "bakery",
    "price": 25,
    "commission": 2.5,
    "discount": 20,
    "finalPrice": 22.5,
    "expiryDate": "2024-06-05T00:00:00.000Z",
    "validDate": "2024-05-29T00:00:00.000Z",
    "quantity": 10,
    "isDeliverable": true,
    "imgUrl": "https://res.cloudinary.com/...",
    "description": "Freshly baked whole wheat",
    "tags": ["quick breakfast (fetoor)", "perishable / consume today"],
    "vendorId": "663b2c...",
    "shopName": "Fresh Basket",
    "vendorStatus": "active",
    "vendor": {
      "address": {
        "governorate": "cairo",
        "city": "nasr city",
        "neighborhood": "el-nozha",
        "detailedAddress": "12 El-Nozha St",
        "map": [31.33, 30.06]
      },
      "pickupTime": {
        "days": ["saturday", "sunday"],
        "from": "09:00",
        "to": "17:00"
      }
    },
    "createdAt": "2024-05-20T09:00:00.000Z",
    "updatedAt": "2024-05-20T09:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `:id` is not a valid ObjectId | `{ "success": false, "message": "Invalid product ID" }` |
| `404` | No product found | `{ "success": false, "message": "Product not found" }` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 5.5 `POST /api/products`

#### Description

Creates a new product listing. Key behaviours:

- `vendorId` is always injected from `req.user.id` — it must **not** be sent in the body.
- **Business rule:** A product is rejected if its computed `validDate` (`expiryDate - bufferDays[category]`) falls before today.
- If `tags` is absent or empty, the AI tagging pipeline is triggered (Gemini → Groq → static fallback).
- `commission` (10% of `price`) and `validDate` are auto-calculated on Mongoose `pre-save`.
- The image is uploaded to Cloudinary; `imgUrl` and `publicImgId` are stored.
- **Rate limit:** 4 requests/minute (global bucket — shared across all users).
- **Content-Type must be `multipart/form-data`** — all fields are sent as text form fields, the image as a file field.

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/products` |
| **Auth required** | Yes — role: `vendor`; status: `active` |
| **Content-Type** | `multipart/form-data` |
| **Rate limit** | 4 req/min (global AI bucket) |
| **Cookie** | `token=<JWT>` |

**Form Fields**

| Field | Type | Required | Validation |
|---|---|---|---|
| `image` | file | Yes | Field name must be `image`. JPEG/PNG/WebP only. Max 5 MB. |
| `productName` | string | Yes | 3–50 chars; cannot be all digits |
| `category` | string | Yes | Must be one of the 8 valid category keys |
| `price` | number (as string) | Yes | Positive number; auto-converted from string |
| `quantity` | integer (as string) | Yes | Positive integer; auto-converted |
| `expiryDate` | date string | Yes | Must be a valid future date; must clear the category buffer window |
| `isDeliverable` | boolean string | Yes | `"true"` or `"false"`; auto-converted |
| `discount` | number (as string) | No | 0–100 percentage; auto-converted. Default: `0` |
| `description` | string | No | Max 200 chars |
| `tags` | JSON string / string[] | No | If omitted or empty, AI auto-generates |

**Request Example**

```
POST /api/products
Content-Type: multipart/form-data

productName: Whole Wheat Loaf
category: bakery
price: 25
quantity: 10
expiryDate: 2024-06-10
isDeliverable: true
discount: 20
description: Freshly baked daily
image: [binary — .jpg/.png/.webp, max 5 MB]
```

#### Success Response — `201 Created`

```json
{
  "success": true,
  "data": {
    "_id": "664a1f...",
    "productName": "Whole Wheat Loaf",
    "category": "bakery",
    "price": 25,
    "commission": 2.5,
    "discount": 20,
    "expiryDate": "2024-06-10T00:00:00.000Z",
    "validDate": "2024-06-03T00:00:00.000Z",
    "vendorId": "663b2c...",
    "quantity": 10,
    "isDeliverable": true,
    "imgUrl": "https://res.cloudinary.com/...",
    "publicImgId": "food-waste-reduction/products/abc123",
    "description": "Freshly baked daily",
    "tags": ["quick breakfast (fetoor)", "perishable / consume today", "crunchy bite"],
    "createdAt": "2024-05-20T09:00:00.000Z",
    "updatedAt": "2024-05-20T09:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | Required field missing | `"<fieldName> is required"` |
| `400` | No image file in request | `"Product image file is required"` |
| `400` | `productName` wrong type | `"Product name must be a string"` |
| `400` | `productName` length violation | `"Product name must be between 3 and 50 characters"` |
| `400` | `productName` is all digits | `"Product name cannot contain only numbers"` |
| `400` | `category` not in enum | `"Category must be one of: dairy, meat_seafood, bakery, frozen_food, ready_meals, snacks_desserts, drinks, pantry"` |
| `400` | Product too close to expiry for its category | `"This <category> product is too close to expiry to be accepted"` |
| `400` | `expiryDate` invalid or in the past | `"Expiry date must be a valid future date"` |
| `400` | `price` not positive | `"Price must be a positive number"` |
| `400` | `quantity` not a positive integer | `"Quantity must be a positive integer"` |
| `400` | `discount` out of range | `"Discount must be between 0 and the product price"` |
| `400` | `isDeliverable` not boolean | `"isDeliverable must be true or false"` |
| `400` | Image exceeds 5 MB | `"File size exceeds maximum limit of 5MB"` |
| `400` | Invalid image MIME type | `"Invalid file type: <type>. Allowed types: image/jpeg, image/png, image/webp"` |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `vendor` | `{ "success": false, "message": "Only vendors can create products" }` |
| `403` | Account status is not `active` | `"Forbidden. Your account status does not have permission to access this resource."` |
| `429` | AI rate limit exceeded | `"Too many requests. Try again later."` |
| `500` | Unexpected server or Cloudinary error | `"Internal server error"` |

---

### 5.6 `PUT /api/products/:id`

#### Description

Updates an existing product. Only the owning vendor can update their own products. If a new `image` is uploaded, the old Cloudinary asset is deleted first. If `category` or `expiryDate` changes, `validDate` and `commission` are recalculated by the `pre-save` hook.

All fields are optional — send only the ones to change. No separate validation middleware is applied; Mongoose schema validators run via `product.save()`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `PUT /api/products/:id` |
| **Auth required** | Yes — role: `vendor`; status: `active` |
| **Content-Type** | `multipart/form-data` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | `_id` of the product to update |

**Form Fields (all optional)**

Same field set as `POST /api/products`, except `image` is optional and all other fields are optional too.

**Request Example**

```
PUT /api/products/664a1f3e2b7c8d9e0f123456
Content-Type: multipart/form-data

discount: 30
quantity: 8
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "_id": "664a1f...",
    "discount": 30,
    "quantity": 8,
    "...": "full updated product document"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `401` | No `req.user` in session | `{ "success": false, "message": "Unauthorized" }` |
| `403` | Role is not `vendor` | `{ "success": false, "message": "Only vendors can update products" }` |
| `403` | Vendor does not own this product | `{ "success": false, "message": "You are not allowed to update this product" }` |
| `403` | Account status is not `active` | `"Forbidden. Your account status does not have permission to access this resource."` |
| `404` | Product not found | `{ "success": false, "message": "Product not found" }` |
| `500` | Unexpected server or Cloudinary error | `"Internal server error"` |

---

### 5.7 `DELETE /api/products/:id`

#### Description

Permanently deletes a product and removes its associated image from Cloudinary. Only the owning vendor can delete their own products.

#### Request Details

| | |
|---|---|
| **Method & URL** | `DELETE /api/products/:id` |
| **Auth required** | Yes — role: `vendor`; status: `active` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | `_id` of the product to delete |

**Request Example**

```
DELETE /api/products/664a1f3e2b7c8d9e0f123456
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Deleted successfully"
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `401` | No `req.user` in session | `{ "success": false, "message": "Unauthorized" }` |
| `403` | Role is not `vendor` | `{ "success": false, "message": "Only vendors can delete products" }` |
| `403` | Vendor does not own this product | `{ "success": false, "message": "You are not allowed to delete this product" }` |
| `403` | Account status is not `active` | `"Forbidden. Your account status does not have permission to access this resource."` |
| `404` | Product not found | `{ "success": false, "message": "Product not found" }` |
| `500` | Unexpected server or Cloudinary error | `"Internal server error"` |

---

### 5.8 `POST /api/products/recommendations`

#### Description

Returns up to **4 AI-powered product recommendations** based on the customer's current cart contents. Products already in the cart are excluded from results.

**Three-tier recommendation cascade:**

| Tier | Strategy | Description |
|---|---|---|
| 1 | Gemini Flash | Generates `{ suggestedCategories, suggestedTags }` from cart summary, then queries DB with those signals + customer location proximity scoring |
| 2 | Groq Llama 8B | Same prompt and DB query logic as Tier 1 — triggered if Gemini fails |
| 3 | Local algorithm | Entirely offline; scores candidates by category match (+2), tag overlap (+1 each), same vendor (+5), same neighborhood (+3), same city (+2), same governorate (+1) |

**Scoring weights (Tiers 1 & 2 DB pipeline):**

| Signal | Score |
|---|---|
| Category match | +1 |
| Tag intersection | +2 |
| Same vendor as cart item | +5 |
| Same neighborhood as customer | +3 |
| Same city as customer | +2 |
| Same governorate as customer | +1 |

The system **never errors due to AI failures** — it falls through to the next tier silently.

**Rate limit:** 6 requests/minute (global bucket — shared across all users).

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/products/recommendations` |
| **Auth required** | Yes — role: `customer`; status: `active` |
| **Content-Type** | `application/json` |
| **Rate limit** | 6 req/min (global AI bucket) |
| **Cookie** | `token=<JWT>` |

**Request Body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `cartItems` | array | Yes | Non-empty array of valid product IDs (24-character hexadecimal strings) |

**Request Example**

```json
POST /api/products/recommendations

{
  "cartItems": [
    "664b3e7ebc4f3a0017a01d01",
    "663b2c8fac4f3a0017a01d02"
  ]
}
```

#### Success Response — `200 OK` (results found)

```json
{
  "success": true,
  "data": [
    {
      "_id": "664b3e...",
      "productName": "Baladi Cheese Slices",
      "category": "dairy",
      "price": 45,
      "discount": 10,
      "tags": ["quick breakfast (fetoor)", "requires continuous fridge"],
      "vendorId": "663b2c...",
      "quantity": 20,
      "imgUrl": "https://res.cloudinary.com/...",
      "expiryDate": "2024-06-07T00:00:00.000Z"
    }
  ]
}
```

#### Success Response — `200 OK` (no results)

```json
{
  "success": true,
  "data": [],
  "message": "No recommendations available based on current cart items"
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `cartItems` is not an array | `{ "success": false, "message": "cartItems must be an array" }` |
| `400` | `cartItems` is empty | `{ "success": false, "message": "cartItems cannot be empty" }` |
| `400` | An item is not an object | `{ "success": false, "message": "cartItems[N] must be an object" }` |
| `400` | `category` missing or empty | `{ "success": false, "message": "cartItems[N].category is required and must be a non-empty string" }` |
| `400` | `productName` missing or empty | `{ "success": false, "message": "cartItems[N].productName is required and must be a non-empty string" }` |
| `400` | `tags` not an array | `{ "success": false, "message": "cartItems[N].tags must be an array when provided" }` |
| `400` | A tag is empty or not a string | `{ "success": false, "message": "cartItems[N].tags must contain only non-empty strings" }` |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `customer` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `403` | Account status is not `active` | `"Forbidden. Your account status does not have permission to access this resource."` |
| `429` | AI rate limit exceeded | `"Too many requests. Try again later."` |
| `500` | Unexpected server error | `"Internal server error"` |

---

## 6. Order Endpoints

**Base path:** `/api/orders`

### Order Document Shape

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `customerId` | ObjectId → `Customers` | The placing customer |
| `products` | array | Snapshot of items at purchase time |
| `products[N].productId` | ObjectId → `Products` | Referenced product |
| `products[N].vendorId` | ObjectId → `Vendors` | Denormalized for vendor-scoped queries |
| `products[N].quantity` | integer (min 1) | Units ordered |
| `products[N].priceAtPurchase` | number (min 0) | Server-computed price snapshot |
| `products[N].isCommissioned` | boolean | Default: `false`; set to `true` when vendor is paid |
| `status` | string (enum) | `pending` → `ready` → `completed` / `cancelled` / `abandoned` |
| `shippingAddress` | string (max 200) | Delivery address |
| `paymentMethod` | string (enum) | `credit_card`, `paypal`, `cash_on_delivery` |

**Computed `summary` object** (appended by controllers, not stored):

| Field | Calculation |
|---|---|
| `totalPriceBeforeDiscount` | `Σ (basePrice + commission) × quantity` |
| `totalDiscount` | `Σ (discount% × price / 100) × quantity` |
| `finalPrice` | `totalPriceBeforeDiscount − totalDiscount` (floored at `0`) |

---

### 6.1 `POST /api/orders`

#### Description

Creates a new order from a cart payload. For every item the server:

1. Fetches the product from the DB and verifies the vendor is active.
2. Validates `quantity` (min 1, max available stock).
3. Computes `priceAtPurchase` server-side: `price + commission − (price × discount / 100)`.

After the order is saved, each product's `quantity` is decremented atomically.

**Shipping address fallback:** If `shippingAddress` is omitted, the customer's profile address is assembled automatically. Returns `400` if the profile address is incomplete.

**Payment method default:** `"cash_on_delivery"` if `paymentMethod` is omitted.

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/orders` |
| **Auth required** | Yes — role: `customer`; status: `active` |
| **Content-Type** | `application/json` |
| **Cookie** | `token=<JWT>` |

**Request Body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `products` | array | Yes | Non-empty array |
| `products[N].productId` | ObjectId string | Yes | Must reference an existing product |
| `products[N].quantity` | integer | Yes | Min 1, max available stock |
| `shippingAddress` | string | No | Max 200 chars. If omitted, built from customer profile address. |
| `paymentMethod` | string | No | `"credit_card"`, `"paypal"`, `"cash_on_delivery"`. Default: `"cash_on_delivery"` |

**Request Example**

```json
POST /api/orders

{
  "products": [
    { "productId": "664a1f3e2b7c8d9e0f123456", "quantity": 2 },
    { "productId": "664a1f3e2b7c8d9e0f654321", "quantity": 1 }
  ],
  "shippingAddress": "12 El-Nozha St, Nasr City, Cairo",
  "paymentMethod": "credit_card"
}
```

#### Success Response — `201 Created`

```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "_id": "666c3d...",
    "customerId": "665b2c...",
    "products": [
      {
        "productId": "664a1f...",
        "vendorId": "663b2c...",
        "quantity": 2,
        "priceAtPurchase": 22.50,
        "isCommissioned": false,
        "_id": "..."
      },
      {
        "productId": "664a1f...654321",
        "vendorId": "663b2c...",
        "quantity": 1,
        "priceAtPurchase": 15.00,
        "isCommissioned": false,
        "_id": "..."
      }
    ],
    "status": "pending",
    "shippingAddress": "12 El-Nozha St, Nasr City, Cairo",
    "paymentMethod": "credit_card",
    "createdAt": "2024-06-01T10:00:00.000Z",
    "updatedAt": "2024-06-01T10:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `products` missing, empty, or not an array | `"Missing required fields"` |
| `400` | Profile address incomplete and no `shippingAddress` provided | `"Your profile address is incomplete. Please provide a full shipping address."` |
| `400` | Vendor of a product is not active | `"Product <name> is currently unavailable because the vendor shop is inactive"` |
| `400` | `quantity` < 1 or exceeds available stock | `"Invalid quantity for product ID <id>"` |
| `401` | Missing or invalid JWT | `"Unauthorized: Authentication token is missing"` |
| `403` | Role is not `customer` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `403` | Account status is not `active` | `"Forbidden. Your account status does not have permission to access this resource."` |
| `404` | Product not found | `"Product with ID <id> not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 6.2 `GET /api/orders/my-orders`

#### Description

Returns a paginated, descending-chronological list of the authenticated customer's orders. Each order includes a computed `summary` object. Supports optional status filtering; the values `"all"` and `"undefined"` are silently ignored to guard against frontend serialization bugs.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/orders/my-orders` |
| **Auth required** | Yes — role: `customer`; status: `active` or `suspended` |
| **Cookie** | `token=<JWT>` |

**Query Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `status` | string | No | `pending`, `ready`, `completed`, `cancelled`, or `abandoned`. `"all"` and `"undefined"` are ignored. |
| `page` | integer | No | Default: `1` |
| `limit` | integer | No | Default: `10` |

**Request Example**

```
GET /api/orders/my-orders?status=completed&page=1&limit=10
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "count": 2,
  "totalOrders": 2,
  "totalPages": 1,
  "currentPage": 1,
  "orders": [
    {
      "_id": "666c3d...",
      "customerId": "665b2c...",
      "products": [
        {
          "productId": {
            "_id": "664a1f...",
            "price": 25,
            "discount": 20,
            "commission": 2.5
          },
          "vendorId": {
            "_id": "663b2c...",
            "shopName": "Fresh Basket",
            "address": { "...": "vendor address" },
            "pickupTime": { "...": "pickup schedule" }
          },
          "quantity": 2,
          "priceAtPurchase": 22.50
        }
      ],
      "status": "completed",
      "shippingAddress": "12 El-Nozha St, Nasr City, Cairo",
      "paymentMethod": "credit_card",
      "summary": {
        "totalPriceBeforeDiscount": 55.0,
        "totalDiscount": 10.0,
        "finalPrice": 45.0
      },
      "createdAt": "2024-06-01T10:00:00.000Z"
    }
  ]
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or invalid JWT / customer ID not in session | `"Unauthorized: Customer ID not found"` |
| `403` | Role is not `customer` | `"Forbidden. Your account role does not have permission to access this resource."` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 6.3 `GET /api/orders/vendor`

#### Description

Returns a paginated, descending-chronological list of orders that contain at least one product belonging to the authenticated vendor. Supports status filtering using the same guardrails as `my-orders`. The full order document is returned — the products array is not filtered to the vendor's items only.

> **Route ordering note:** Defined before `GET /api/orders/:id` in the router to prevent the `:id` wildcard from consuming the literal string `"vendor"`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/orders/vendor` |
| **Auth required** | Yes — role: `vendor`; status: `active` or `suspended` |
| **Cookie** | `token=<JWT>` |

**Query Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `status` | string | No | Same filtering behaviour as `my-orders` |
| `page` | integer | No | Default: `1` |
| `limit` | integer | No | Default: `10` |

**Request Example**

```
GET /api/orders/vendor?status=ready&page=1&limit=10
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "count": 2,
  "totalOrders": 2,
  "totalPages": 1,
  "currentPage": 1,
  "orders": [
    {
      "_id": "666c3d...",
      "customerId": {
        "_id": "665b2c...",
        "name": { "firstName": "Sara", "lastName": "Hassan" },
        "phoneNumber": "01198765432",
        "address": { "...": "customer address" }
      },
      "products": [
        {
          "productId": {
            "productName": "Whole Wheat Loaf",
            "category": "bakery"
          },
          "quantity": 2,
          "priceAtPurchase": 22.50
        }
      ],
      "status": "ready",
      "shippingAddress": "12 El-Nozha St, Nasr City, Cairo",
      "paymentMethod": "credit_card"
    }
  ]
}
```

#### Success Response — `200 OK` (vendor has no products)

```json
{
  "success": true,
  "count": 0,
  "totalPages": 0,
  "currentPage": 1,
  "orders": []
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `401` | Vendor ID missing from session | `"Unauthorized: Vendor ID not found"` |
| `403` | Role is not `vendor` | `"Forbidden: Only vendors can access this endpoint"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 6.4 `GET /api/orders/:id`

#### Description

Returns full details for a single order. Implements a **multi-role access guardrail** — access is permitted only if the caller satisfies at least one of:

- Is an **admin**
- Is the **customer** who originally placed the order
- Is a **vendor** who owns at least one product within the order

The response includes a populated customer profile, nested vendor info on each product, and a computed `summary` object.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/orders/:id` |
| **Auth required** | Yes — roles: `vendor`, `customer`, `admin`; status: `active` or `suspended` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | `_id` of the order |

**Request Example**

```
GET /api/orders/666c3d4e5f6a7b8c9d0e1f2a
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "order": {
    "_id": "666c3d...",
    "customerId": {
      "_id": "665b2c...",
      "name": { "firstName": "Sara", "lastName": "Hassan" },
      "phoneNumber": "01198765432",
      "address": { "governorate": "cairo", "city": "cairo city", "neighborhood": "Heliopolis", "detailedAddress": "5 El-Merghany St" }
    },
    "products": [
      {
        "productId": {
          "_id": "664a1f...",
          "price": 25,
          "discount": 20,
          "commission": 2.5,
          "vendorId": {
            "shopName": "Fresh Basket",
            "phoneNumber": "01012345678",
            "address": { "...": "vendor address" },
            "pickupTime": { "...": "pickup schedule" }
          }
        },
        "vendorId": "663b2c...",
        "quantity": 2,
        "priceAtPurchase": 22.50
      }
    ],
    "status": "pending",
    "shippingAddress": "12 El-Nozha St, Nasr City, Cairo",
    "paymentMethod": "credit_card",
    "summary": {
      "totalPriceBeforeDiscount": 55.0,
      "totalDiscount": 10.0,
      "finalPrice": 45.0
    },
    "createdAt": "2024-06-01T10:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `:id` is not a valid ObjectId | `"Invalid order ID"` |
| `403` | Caller is not the customer, an involved vendor, or admin | `{ "success": false, "message": "Forbidden: You do not have permission to view this order" }` |
| `404` | No order found | `"Order not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 6.5 `PATCH /api/orders/:id/cancel`

#### Description

Cancels an active order. Only the customer who placed the order can cancel it. Cancellation is permitted only if the current status is `"pending"` or `"ready"`. On success, all product quantities are atomically restocked via a MongoDB `bulkWrite`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `PATCH /api/orders/:id/cancel` |
| **Auth required** | Yes — role: `customer`; status: `active` or `suspended` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | `_id` of the order |

**Request Body:** None.

**Request Example**

```
PATCH /api/orders/666c3d4e5f6a7b8c9d0e1f2a/cancel
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Order cancelled successfully",
  "order": {
    "_id": "666c3d...",
    "status": "cancelled",
    "...": "full updated order document"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `:id` is not a valid ObjectId | `"Invalid order ID"` |
| `400` | Order is not in a cancellable state | `"Cannot cancel order. Order is currently '<status>' and cannot be altered."` |
| `403` | Caller is not the customer owner | `"Forbidden: You do not have permission to cancel this order"` |
| `404` | No order found | `"Order not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 6.6 `PATCH /api/orders/:id/status`

#### Description

Updates an order's lifecycle status. Accessible only by an `admin` or a `vendor` who owns at least one product in the order.

**Enforcement rules:**
- `"cancelled"` is **blocked** — use `PATCH /api/orders/:id/cancel` instead.
- Orders already in a terminal state (`completed`, `cancelled`, `abandoned`) are **immutable**.
- **On `"completed"`:** customer loyalty points are awarded (`floor(totalPrice × 0.01)`) and each involved vendor's `moneyOwed` is incremented by 10% of their gross sales (platform commission), both via `bulkWrite`.
- **On `"abandoned"`:** all product quantities are atomically restocked via `bulkWrite`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `PATCH /api/orders/:id/status` |
| **Auth required** | Yes — roles: `vendor` or `admin`; status: `active` or `suspended` |
| **Content-Type** | `application/json` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | `_id` of the order |

**Request Body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `status` | string | Yes | One of: `"pending"`, `"ready"`, `"completed"`, `"abandoned"`. `"cancelled"` is rejected. |

**Request Example**

```json
PATCH /api/orders/666c3d4e5f6a7b8c9d0e1f2a/status

{
  "status": "completed"
}
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Order status updated to 'completed' successfully",
  "order": {
    "_id": "666c3d...",
    "status": "completed",
    "...": "full updated order document"
  }
}
```

#### Success Response — `200 OK` (abandoned)

```json
{
  "success": true,
  "message": "Order marked as abandoned and inventory returned successfully",
  "order": { "...": "full updated order document" }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `:id` is not a valid ObjectId | `"Invalid order ID"` |
| `400` | `status` missing or not in allowed enum | `"Invalid or missing status value"` |
| `400` | `status` is `"cancelled"` | `"Use the cancel endpoint to cancel orders"` |
| `400` | Order is already in a terminal state | `"Cannot update status. This order has already been finalized as '<status>'."` |
| `403` | Role is neither `admin` nor `vendor` | `"Forbidden: Only admins and vendors can update order status"` |
| `403` | Vendor does not own any item in the order | `"Forbidden: You can only update status of orders that contain your products"` |
| `404` | No order found | `"Order not found"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

### 6.7 `POST /api/orders/:id/rate`

#### Description

Submits a 1–5 star rating for a completed order. The rating is distributed to every unique vendor involved in the order via a single `bulkWrite` that increments `rating.score` and `rating.totalRatingsNumber` on each `Vendors` document. The order is then flagged `isRated: true` using a `strict: false` Mongoose update to prevent duplicate ratings.

**Computed vendor rating** (for display in `GET /api/users/me`):
```
vendorRating = rating.score / rating.totalRatingsNumber
```

#### Request Details

| | |
|---|---|
| **Method & URL** | `POST /api/orders/:id/rate` |
| **Auth required** | Yes — role: `customer`; status: `active` |
| **Content-Type** | `application/json` |
| **Cookie** | `token=<JWT>` |

**Route Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | ObjectId string | Yes | `_id` of the order to rate |

**Request Body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `rating` | integer | Yes | Must be an integer between 1 and 5 (inclusive) |

**Request Example**

```json
POST /api/orders/666c3d4e5f6a7b8c9d0e1f2a/rate

{
  "rating": 4
}
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Order rated successfully! Vendor ratings have been updated.",
  "order": {
    "_id": "666c3d...",
    "status": "completed",
    "isRated": true,
    "...": "full updated order document"
  }
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `400` | `:id` is not a valid ObjectId | `"Invalid order ID"` |
| `400` | `rating` not an integer between 1 and 5 | `"Rating must be an integer between 1 and 5"` |
| `400` | Order not in `"completed"` state | `"Cannot rate order. Only completed orders can be rated, but this order is currently '<status>'."` |
| `400` | Order already rated | `"You have already submitted a rating for this order"` |
| `403` | Caller is not the customer owner | `"Forbidden: You do not have permission to rate this order"` |
| `404` | No order found | `"Order not found"` |
| `404` | No vendor IDs found in the order | `"No associated vendors found for this order"` |
| `500` | Unexpected DB error | `"Internal server error"` |

---

## 7. Locations Endpoint

**Base path:** `/api/locations` | Public — no authentication required.

---

### 7.1 `GET /api/locations`

#### Description

Returns the complete Egypt locations dataset covering **Cairo**, **Alexandria**, and **Giza** — structured as governorates → cities → neighborhoods. Used by the frontend for address form dropdowns and by the `validateAddress` utility to cross-validate user-submitted addresses on registration and profile updates.

Response is cached client-side for **24 hours** via `Cache-Control: public, max-age=86400`.

#### Request Details

| | |
|---|---|
| **Method & URL** | `GET /api/locations` |
| **Auth required** | No — public |

**Request Body:** None.

**Request Example**

```
GET /api/locations
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "results": 3,
  "data": [
    {
      "governorateId": "cairo",
      "governorateName": "Cairo",
      "cities": [
        {
          "cityId": "cairo_city",
          "cityName": "Cairo City",
          "neighborhoods": [
            "Maadi", "Zamalek", "Nasr City", "Heliopolis", "Korba",
            "Roxy", "Downtown Cairo", "Shubra", "Abbassia", "..."
          ]
        },
        {
          "cityId": "new_cairo",
          "cityName": "New Cairo",
          "neighborhoods": ["First Settlement", "Third Settlement", "Fifth Settlement", "Katameya", "Rehab City", "Madinaty"]
        },
        { "cityId": "shorouk_city", "cityName": "Shorouk City", "neighborhoods": [] },
        { "cityId": "badr_city",    "cityName": "Badr City",    "neighborhoods": [] }
      ]
    },
    {
      "governorateId": "alexandria",
      "governorateName": "Alexandria",
      "cities": [
        {
          "cityId": "alexandria_city",
          "cityName": "Alexandria City",
          "neighborhoods": ["Smouha", "Sidi Bishr", "Gleem", "San Stefano", "Attarin", "..."]
        },
        {
          "cityId": "borg_el_arab",
          "cityName": "Borg El Arab",
          "neighborhoods": ["New Borg El Arab City", "Industrial Zone", "Borg El Arab Village"]
        }
      ]
    },
    {
      "governorateId": "giza",
      "governorateName": "Giza",
      "cities": [
        {
          "cityId": "giza_city",
          "cityName": "Giza City",
          "neighborhoods": ["Dokki", "Mohandessin", "Agouza", "Faisal", "Haram", "Imbaba", "..."]
        },
        {
          "cityId": "october_city",
          "cityName": "6th of October City",
          "neighborhoods": ["1st District", "2nd District", "...", "October Gardens", "Hadayek Al Ahram"]
        },
        {
          "cityId": "sheikh_zayed",
          "cityName": "Sheikh Zayed City",
          "neighborhoods": ["District 1", "...", "Beverly Hills", "Allegria", "Green Belt"]
        },
        {
          "cityId": "giza_suburbs",
          "cityName": "Giza Suburbs / Centers",
          "neighborhoods": ["Kerdasa", "El Badrasheen", "El Ayyat", "Osim", "Abu Nomros", "..."]
        }
      ]
    }
  ]
}
```

#### Error Responses

| Status | Scenario | Message |
|---|---|---|
| `500` | Unexpected server error | `"Internal server error"` |

---

## 8. Reference Tables

### 8.1 Account Status Enum

| Status | Description | Who can have it |
|---|---|---|
| `active` | Full access | All roles |
| `pending` | Awaiting admin approval | Vendors only (initial state) |
| `incompleteData` | Approved but missing `map` or `pickupTime` | Vendors only |
| `suspended` | Access restricted by admin | All roles |

---

### 8.2 Order Status Lifecycle

```
                   ┌──────────────────────────────────────┐
                   │                                      │
             POST /orders                                 │
                   │                                      │
                   ▼                                      │
              [ pending ] ──── PATCH /:id/cancel ──► [ cancelled ]  (terminal)
                   │
         PATCH /:id/status
                   │
                   ▼
              [  ready  ] ──── PATCH /:id/cancel ──► [ cancelled ]  (terminal)
                   │
         PATCH /:id/status
                   │
                   ▼
            [ completed ] ──────────────────────────────► (terminal)
                   │
              (also from any non-terminal state)
         PATCH /:id/status { status: "abandoned" }
                   │
                   ▼
            [ abandoned ] ──────────────────────────────► (terminal)
```

**Side effects on status change:**

| Transition | Side Effects |
|---|---|
| Any → `completed` | Customer `loyaltyPoints` += `floor(totalPrice × 0.01)` |
| Any → `completed` | Vendor `moneyOwed` += 10% of gross sales per vendor (platform commission) |
| Any → `cancelled` or `abandoned` | All product `quantity` values are atomically restored |

---

### 8.3 Product Categories & Buffer Days

The `bufferDays` value is subtracted from `expiryDate` to compute `validDate`. A product whose `validDate` would fall before today is **rejected at creation time**.

| Category Key | Label | Buffer Days | Example: if today is June 5 and expiryDate is June 10 |
|---|---|---|---|
| `dairy` | Dairy | 10 | validDate = May 31 → **rejected** (before today) |
| `meat_seafood` | Meat & Seafood | 7 | validDate = June 3 → **rejected** |
| `bakery` | Bakery | 7 | validDate = June 3 → **rejected** |
| `frozen_food` | Frozen Food | 30 | validDate = May 11 → **rejected** |
| `ready_meals` | Ready Meals | 10 | validDate = May 31 → **rejected** |
| `snacks_desserts` | Snacks & Desserts | 30 | validDate = May 11 → **rejected** |
| `drinks` | Drinks | 30 | validDate = May 11 → **rejected** |
| `pantry` | Pantry | 30 | validDate = May 11 → **rejected** |

> **Real example:** A `bakery` product with `expiryDate: 2024-06-12` and today = `2024-06-04` gets `validDate: 2024-06-05`. Since `validDate >= today`, it is **accepted**.

---

### 8.4 Supported Egypt Locations

The `validateAddress` utility cross-checks address inputs against this dataset. Only the three governorates below are supported.

| Governorate | Cities |
|---|---|
| **Cairo** | Cairo City, New Cairo, Shorouk City, Badr City |
| **Alexandria** | Alexandria City, Borg El Arab |
| **Giza** | Giza City, 6th of October City, Sheikh Zayed City, Giza Suburbs / Centers |

For the full neighborhoods list per city, call `GET /api/locations`.

---

### 8.5 Validation Rules Quick Reference

| Validator | Rule |
|---|---|
| `validateUsername` | 5–30 chars; no whitespace |
| `validateEmail` | Must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `validatePassword` | Min 6 chars; no whitespace |
| `validateRole` | Must be `"customer"`, `"vendor"`, or `"admin"` |
| `validatePhoneNumber` | Non-empty; matches `+?[0-9]{7,15}` |
| `validateShopName` | Non-empty; 3–50 chars |
| `validateTaxNumber` | Non-empty string |
| `validateName` | `{ firstName, lastName }` — each 3–50 chars; Unicode letters, hyphens, apostrophes |
| `validateAddress` | All four sub-fields required; `governorate`/`city`/`neighborhood` cross-validated against `egyptLocations`; `detailedAddress` max 200 chars |
| `validatePickupTime` | Object with `days` (non-empty `string[]`), `from` and `to` in `HH:MM` 24h format |
| `validateMapCoordinates` | Exactly `[longitude, latitude]` — lng: −180 to 180, lat: −90 to 90 |

---

### 8.6 Product Tags Master List

Tags are auto-generated by the AI pipeline (or via static fallback) and stored on each product document. The full allowed set is:

**Occasions & Meal Context**

| Tag | Bridges |
|---|---|
| `quick breakfast (fetoor)` | Bakery, dairy, pantry |
| `lunch helper` | Meat/seafood, frozen food, pantry |
| `late night / suhoor` | Dairy, bakery, snacks |
| `tea time companion` | Snacks/desserts, bakery, drinks |
| `school lunchbox snack` | Drinks, dairy, snacks |
| `sweet tooth & dessert` | Bakery, dairy, pantry |

**Preparation State**

| Tag | Meaning |
|---|---|
| `ready to eat` | No prep needed |
| `heat & serve` | Microwave/oven 2 mins |
| `requires cooking` | Raw ingredients |

**Dietary & Fasting**

| Tag | Meaning |
|---|---|
| `siamee friendly` | Coptic fasting compatible |
| `vegetarian` | No meat/seafood |
| `healthy choice` | Low-fat, whole-grain, low-sugar |
| `sugar-free` | No added sugar |

**Storage & Urgency**

| Tag | Meaning |
|---|---|
| `requires continuous fridge` | Must stay refrigerated |
| `keep frozen` | Frozen cold chain required |
| `shelf-stable (pantry)` | Room temperature safe |
| `perishable / consume today` | High-urgency surplus |

**Flavor Profiles**

| Tag | Meaning |
|---|---|
| `savory & salty` | Salty/umami flavors |
| `sweet & syrupy` | Sweet pastries, honey, jams |
| `spicy kick` | Spiced or hot |
| `creamy texture` | Spreads, yogurts, creams |
| `crunchy bite` | Crackers, dry baked goods |

**Surplus Type & Deal Style**

| Tag | Meaning |
|---|---|
| `single-serve portion` | Individual serving size |
| `family pack / bulk` | Large/bulk format |
| `imperfect shape` | B-grade appearance, perfect taste |
| `clearance deal` | Near best-before date |
| `seasonal surplus (ramadan/eed)` | Seasonal items |

---

*Generated from source files: `index.js`, `auth.controller.js`, `auth.routes.js`, `auth.services.js`, `users.controller.js`, `users.routes.js`, `admin.controller.js`, `admin.routes.js`, `products.controller.js`, `products.service.js`, `products.recommendation.service.js`, `products.validation.js`, `products.routes.js`, `orders.controller.js`, `orders.routes.js`, `locations.controller.js`, `locations.routes.js`, all model files, all middleware files, and all utility/data files.*
