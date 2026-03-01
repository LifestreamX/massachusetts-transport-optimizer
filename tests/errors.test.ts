/**
 * Tests for typed error classes.
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  MbtaApiError,
  InternalError,
  TimeoutError,
  toError,
} from '@/lib/utils/errors';

describe('AppError', () => {
  it('sets message and statusCode', () => {
    const err = new AppError('test', 418);
    expect(err.message).toBe('test');
    expect(err.statusCode).toBe(418);
    expect(err.isOperational).toBe(true);
  });

  it('is instanceof Error', () => {
    expect(new AppError('x', 500)).toBeInstanceOf(Error);
  });

  it('preserves stack trace', () => {
    const err = new AppError('x', 500);
    expect(err.stack).toBeDefined();
  });
});

describe('BadRequestError', () => {
  it('defaults to 400 and "Bad request"', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad request');
  });

  it('accepts custom message', () => {
    const err = new BadRequestError('Missing field');
    expect(err.message).toBe('Missing field');
    expect(err.statusCode).toBe(400);
  });

  it('is instanceof AppError', () => {
    expect(new BadRequestError()).toBeInstanceOf(AppError);
  });
});

describe('MbtaApiError', () => {
  it('defaults to 502', () => {
    const err = new MbtaApiError();
    expect(err.statusCode).toBe(502);
    expect(err.message).toBe('MBTA API request failed');
  });

  it('accepts custom message', () => {
    const err = new MbtaApiError('Gateway timeout');
    expect(err.message).toBe('Gateway timeout');
  });

  it('is operational', () => {
    expect(new MbtaApiError().isOperational).toBe(true);
  });
});

describe('InternalError', () => {
  it('defaults to 500 and non-operational', () => {
    const err = new InternalError();
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(false);
  });
});

describe('TimeoutError', () => {
  it('defaults to 504', () => {
    const err = new TimeoutError();
    expect(err.statusCode).toBe(504);
  });

  it('is instanceof AppError', () => {
    expect(new TimeoutError()).toBeInstanceOf(AppError);
  });
});

describe('toError', () => {
  it('returns the same Error if given an Error', () => {
    const original = new Error('original');
    expect(toError(original)).toBe(original);
  });

  it('wraps a string in an Error', () => {
    const result = toError('string error');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('string error');
  });

  it('wraps a number', () => {
    const result = toError(404);
    expect(result.message).toBe('404');
  });

  it('wraps null', () => {
    const result = toError(null);
    expect(result.message).toBe('null');
  });

  it('wraps undefined', () => {
    const result = toError(undefined);
    expect(result.message).toBe('undefined');
  });

  it('wraps an object', () => {
    const result = toError({ code: 'ERR' });
    expect(result).toBeInstanceOf(Error);
  });

  it('preserves AppError subclass', () => {
    const err = new BadRequestError('test');
    expect(toError(err)).toBe(err);
    expect(toError(err)).toBeInstanceOf(BadRequestError);
  });
});
