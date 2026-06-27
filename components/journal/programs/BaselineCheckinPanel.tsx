/**
 * @deprecated Baseline-named wrapper retained for backward compatibility.
 *
 * The check-in panel is now generic and registry-driven. Import
 * `ProgramCheckinPanel` directly for new code. This alias keeps existing
 * callers (e.g. the admin program-state preview) working with identical
 * behavior — Baseline resolves to its code question set.
 */

export { ProgramCheckinPanel as BaselineCheckinPanel } from './ProgramCheckinPanel';
