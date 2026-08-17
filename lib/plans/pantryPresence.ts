import type { PantryPresence } from './types';

export function pantryPresenceFromCount(count: number): PantryPresence {
  return count > 0 ? 'present' : 'empty';
}
