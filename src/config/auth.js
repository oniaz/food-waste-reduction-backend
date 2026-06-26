// Centralizes all JWT signing options and cookie configuration.
// Previously these values were hardcoded inline inside auth.controller.js.

export const JWT_CONFIG = {
  expiresIn: "7d",
};

export const RESET_TOKEN_CONFIG = {
  expiresIn: "15m",
};

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

export const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "none",
};