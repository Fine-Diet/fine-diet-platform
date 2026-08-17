import { pantryPresenceFromCount } from '../pantryPresence';

describe('pantryPresenceFromCount', () => {
  it('treats a successful zero-item read as empty, not unknown', () => {
    expect(pantryPresenceFromCount(0)).toBe('empty');
    expect(pantryPresenceFromCount(1)).toBe('present');
  });
});
