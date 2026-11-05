const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: { from: mockFrom } }));
jest.mock('@/lib/peopleService', () => ({ logEvent: jest.fn() }));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logEvent } from '@/lib/peopleService';
import {
  linkPersonForVerifiedUser,
  PersonIdentityConflictError,
} from '@/lib/account/linkPersonForVerifiedUser';

const CALLER = { id: '80ec2f53-4bbb-4ac0-b4a4-111a71112345', email: 'member@example.com' };
const OTHER_USER_ID = '39e600c4-571b-475e-9f65-2b4b211a6479';

function maybeSingleResult(data: unknown, error: unknown = null) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data, error })) })),
    })),
  };
}

describe('linkPersonForVerifiedUser', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    (logEvent as jest.Mock).mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  it('refuses an email whose People identity is linked to another Auth user', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleResult(null))
      .mockReturnValueOnce(maybeSingleResult({ id: 'person-other', auth_user_id: OTHER_USER_ID }));

    await expect(linkPersonForVerifiedUser(CALLER)).rejects.toBeInstanceOf(PersonIdentityConflictError);
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('keeps an existing verified link successful when the optional profiles table is unavailable', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleResult({ id: 'person-current', email: CALLER.email, auth_user_id: CALLER.id }))
      .mockReturnValueOnce(maybeSingleResult(null, { message: "Could not find table 'public.profiles'" }));

    await expect(linkPersonForVerifiedUser(CALLER)).resolves.toEqual({ linked: true });
  });

  it('does not update a person if a conditional link loses a race to another identity', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleResult(null))
      .mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({
            data: { id: 'person-race', auth_user_id: null }, error: null,
          })) })),
        })),
      })
      .mockReturnValueOnce({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            is: jest.fn(() => ({
              select: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: null, error: null })) })),
            })),
          })),
        })),
      })
      .mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({
            data: { id: 'person-race', auth_user_id: OTHER_USER_ID }, error: null,
          })) })),
        })),
      });

    await expect(linkPersonForVerifiedUser(CALLER)).rejects.toBeInstanceOf(PersonIdentityConflictError);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
