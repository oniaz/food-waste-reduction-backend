export const notFoundMiddleware = (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
};


export const errorMiddleware = (err, req, res, next) => {
    let statusCode = err.statusCode || err.status || 500;
    let message = err.message || 'Internal server error';

    if (
        err?.type === 'entity.parse.failed' ||
        err instanceof SyntaxError
    ) {
        statusCode = 400;
        message =
            'Invalid JSON body. Check syntax (missing quotes, trailing commas, etc).';
    }

    if (err?.code === 11000) {
        statusCode = 409;
        message = 'Resource already exists (duplicate key error)';
    }

    if (err?.name === 'ValidationError') {
        statusCode = 400;
        message = err.message;
    }

    if (res.headersSent) {
        return next(err);
    }

    console.error('Request error:', err);

    res.status(statusCode).json({
        success: false,
        message,
    });
};
