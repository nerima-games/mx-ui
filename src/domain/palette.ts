/**
 * Compatibility entry point for mx-ui's palette.
 *
 * Tokens, colour arithmetic, and the accessibility survey are kept in separate
 * modules so callers can retain this stable import path without coupling them.
 */
export * from './palette-tokens'
export * from './palette-math'
export * from './palette-survey'
