/**
 * Typed error classes for production-level error handling.
 * Each error class carries an HTTP status code and structured context.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 – client sent an invalid request */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

/** 502 – upstream MBTA API failed */
export class MbtaApiError extends AppError {
  constructor(message = 'MBTA API request failed') {
    super(message, 502);
  }
}

/** 500 – unexpected internal failure */
export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, false);
  }
}

/** 504 – upstream timeout */
export class TimeoutError extends AppError {
  constructor(message = 'Request timed out') {
    super(message, 504);
  }
}

/**
 * Narrows an unknown caught value to an Error instance.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(String(value));
}
