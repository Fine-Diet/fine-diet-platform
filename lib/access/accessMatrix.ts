/**
 * Package 2 access matrix (provable cells only).
 *
 * Product-access truth: person_entitlements
 * Payment rail: Stripe (not direct authorization)
 * Legacy compat: subscriptions.journal_access (read-only shim)
 *
 * Unresolved founder cells remain fail-closed and are listed below.
 */

import { PACKAGE_2_ACCESS_MATRIX } from '@/lib/access/accessRouting';

export const ACCESS_MATRIX_DOC = PACKAGE_2_ACCESS_MATRIX;

export const UNRESOLVED_ACCESS_CELLS = PACKAGE_2_ACCESS_MATRIX.unresolved_founder_cells;
