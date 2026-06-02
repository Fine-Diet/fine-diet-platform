/**
 * Meal Object Foundation — public surface (Packet 1, contract only).
 *
 * Re-exports the canonical meal contract, pure adapters, and validators. These
 * are not yet wired into any runtime path; they exist for future packets to
 * unify recipes, saved meals, imported meals, planned meals, eat-out meals,
 * and grouped logged meals behind one shape.
 */

export * from './types';
export * from './adapters';
export * from './validators';
export * from './storage';
export * from './recompute';
