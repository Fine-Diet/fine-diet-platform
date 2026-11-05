import type { User } from '@supabase/supabase-js';
import { logEvent } from '@/lib/peopleService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export class PersonIdentityConflictError extends Error {
  constructor() {
    super('The person record is already linked to another identity.');
    this.name = 'PersonIdentityConflictError';
    Object.setPrototypeOf(this, PersonIdentityConflictError.prototype);
  }
}

async function ensureDefaultProfile(authUserId: string): Promise<void> {
  try {
    const { data: profile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', authUserId)
      .maybeSingle();

    if (checkError) {
      console.warn('[link-person] Optional profile lookup failed:', checkError.message);
      return;
    }
    if (profile) return;

    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: authUserId, role: 'user' });
    if (insertError) {
      console.warn('[link-person] Optional profile creation failed:', insertError.message);
    }
  } catch (error) {
    console.warn('[link-person] Optional profile creation failed:', error);
  }
}

/**
 * Link a server-verified Supabase Auth user to People.
 * Callers must obtain `user` from auth.getUser() or a successful code exchange;
 * never pass identity fields supplied by a browser request.
 */
export async function linkPersonForVerifiedUser(
  user: Pick<User, 'id' | 'email'>,
): Promise<{ linked: true }> {
  if (!user.id || !user.email) {
    throw new Error('The authenticated account has no email identity.');
  }
  const normalizedEmail = user.email.trim().toLowerCase();

  const { data: byAuthId, error: authLookupError } = await supabaseAdmin
    .from('people')
    .select('id, email, auth_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (authLookupError) throw new Error(`Failed to resolve linked person: ${authLookupError.message}`);

  let personId = byAuthId?.id as string | undefined;
  let linkageAction: 'linked_existing' | 'created_new' | null = null;

  if (!personId) {
    const { data: byEmail, error: emailLookupError } = await supabaseAdmin
      .from('people')
      .select('id, email, auth_user_id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (emailLookupError) throw new Error(`Failed to resolve person by email: ${emailLookupError.message}`);

    if (byEmail?.auth_user_id && byEmail.auth_user_id !== user.id) {
      throw new PersonIdentityConflictError();
    }

    if (byEmail?.auth_user_id === user.id) {
      personId = byEmail.id as string;
    } else if (byEmail) {
      const { data: linkedPerson, error: linkError } = await supabaseAdmin
        .from('people')
        .update({
          auth_user_id: user.id,
          status: 'active_user',
          last_source: 'account_creation',
          updated_at: new Date().toISOString(),
        })
        .eq('id', byEmail.id)
        .is('auth_user_id', null)
        .select('id, auth_user_id')
        .maybeSingle();

      if (linkError) throw new Error(`Failed to link existing person: ${linkError.message}`);
      if (linkedPerson) {
        personId = linkedPerson.id as string;
        linkageAction = 'linked_existing';
      } else {
        // Another request may have completed the same link. Accept only our
        // identity; never report another account's linkage as successful.
        const { data: currentPerson, error: recheckError } = await supabaseAdmin
          .from('people')
          .select('id, auth_user_id')
          .eq('id', byEmail.id)
          .maybeSingle();
        if (recheckError) throw new Error(`Failed to verify person linkage: ${recheckError.message}`);
        if (currentPerson?.auth_user_id !== user.id) throw new PersonIdentityConflictError();
        personId = currentPerson.id as string;
      }
    } else {
      const { data: newPerson, error: insertError } = await supabaseAdmin
        .from('people')
        .insert({
          email: normalizedEmail,
          auth_user_id: user.id,
          status: 'active_user',
          last_source: 'account_creation',
        })
        .select('id, auth_user_id')
        .single();

      if (insertError?.code === '23505') {
        // A concurrent signup/link may have inserted the email after the
        // initial lookup. Reuse only a record already owned by this user.
        const { data: racedPerson, error: raceLookupError } = await supabaseAdmin
          .from('people')
          .select('id, auth_user_id')
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (raceLookupError) throw new Error(`Failed to verify concurrent person link: ${raceLookupError.message}`);
        if (racedPerson?.auth_user_id !== user.id) throw new PersonIdentityConflictError();
        personId = racedPerson.id as string;
      } else if (insertError) {
        throw new Error(`Failed to create person record: ${insertError.message}`);
      } else {
        if (newPerson?.auth_user_id !== user.id) throw new PersonIdentityConflictError();
        personId = newPerson.id as string;
        linkageAction = 'created_new';
      }
    }
  }

  if (linkageAction) {
    await logEvent({
      personId,
      eventType: 'profile_update',
      source: 'auth_linkage',
      channel: 'web',
      metadata: { authUserId: user.id, action: linkageAction },
    });
  }

  await ensureDefaultProfile(user.id);
  return { linked: true };
}
