const getDefaultMessage = (statusCode) => {
    if (statusCode === 201) return 'Created successfully';
    if (statusCode === 204) return 'No content';
    if (statusCode >= 200 && statusCode < 300) return 'Request successful';
    if (statusCode >= 400 && statusCode < 500) return 'Request failed';
    return 'Internal server error';
};

export const normalizeResponseBody = (statusCode, body) => {
    const isSuccess = statusCode < 400;
    const defaultMessage = getDefaultMessage(statusCode);

    if (body == null) {
        return {
            success: isSuccess,
            message: defaultMessage,
        };
    }

    if (typeof body !== 'object' || Array.isArray(body)) {
        return {
            success: isSuccess,
            message: typeof body === 'string' ? body : defaultMessage,
            data: Array.isArray(body) ? body : undefined,
        };
    }

    const normalized = { ...body };

    if (!Object.prototype.hasOwnProperty.call(normalized, 'success')) {
        normalized.success = isSuccess;
    }

    if (Object.prototype.hasOwnProperty.call(normalized, 'status')) {
        delete normalized.status;
    }

    if (!Object.prototype.hasOwnProperty.call(normalized, 'message')) {
        normalized.message = defaultMessage;
    }

    return normalized;
};

export const sendJsonResponse = (res, statusCode, body) => {
    return res.status(statusCode).json(normalizeResponseBody(statusCode, body));
};