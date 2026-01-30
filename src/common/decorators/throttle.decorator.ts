import { Throttle, SkipThrottle } from '@nestjs/throttler';

/**
 * Rate limit for authentication endpoints (stricter)
 * 5 attempts per minute to prevent brute force
 */
export const AuthThrottle = () =>
  Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 5, ttl: 60000 },
    long: { limit: 20, ttl: 3600000 },
  });

/**
 * Rate limit for search endpoints
 * 30 searches per minute
 */
export const SearchThrottle = () =>
  Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 30, ttl: 60000 },
    long: { limit: 500, ttl: 3600000 },
  });

/**
 * Rate limit for chat endpoints
 * 20 messages per minute
 */
export const ChatThrottle = () =>
  Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60000 },
    long: { limit: 300, ttl: 3600000 },
  });

/**
 * Rate limit for AI-intensive operations
 * 10 requests per minute (expensive operations)
 */
export const AiThrottle = () =>
  Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
    long: { limit: 100, ttl: 3600000 },
  });

/**
 * Skip rate limiting for specific endpoints
 */
export const NoThrottle = () => SkipThrottle();
