import { normalizeResponseBody } from '../utils/response.js';

// Intercepts all res.json() calls and normalizes the response body shape.
// Extracted from index.js to keep the entry point clean and free of monkey-patching.
const responseInterceptor = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => originalJson(normalizeResponseBody(res.statusCode, body));

  next();
};

export default responseInterceptor;