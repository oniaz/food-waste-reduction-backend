/**
 * A typed error that carries an HTTP status code.
 * Services throw this instead of returning { error, status } objects,
 * keeping them transport-agnostic while still providing status context
 * for the controller layer.
 *
 * Usage:
 *   throw new AppError("Vendor not found", 404);
 *   throw new AppError("Cannot activate from this state", 400);
 */
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = "AppError";

        // Maintains proper stack trace in V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }
}

export default AppError;