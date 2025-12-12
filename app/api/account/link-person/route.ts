import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  upsertPerson,
  logEvent,
} from '@/lib/peopleService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

// Validation schema
const linkPersonSchema = z.object({
  authUserId: z.string().uuid('Invalid auth user ID'),
  email: z.string().email('Invalid email address'),
});

type LinkPersonData = z.infer<typeof linkPersonSchema>;

/**
 * POST /api/account/link-person
 * 
 * Links an authenticated user (auth.users) to a people record.
 * 
 * Behavior:
 * - Finds existing person by email (normalized)
 * - If found: updates auth_user_id if not already set
 * - If not found: creates new person record with auth_user_id
 * - Logs a 'profile_update' event with source 'auth_linkage'
 * 
 * This should be called after successful login/signup to ensure
 * the auth user is linked to their profile data.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = linkPersonSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data: LinkPersonData = validationResult.data;

    // Log incoming request (in development or with explicit logging)
    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGGING === 'true') {
      console.log('[link-person] Incoming request:', {
        authUserId: data.authUserId,
        email: data.email,
      });
    }

    // Verify the auth user exists
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      data.authUserId
    );

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: 'Invalid auth user' },
        { status: 404 }
      );
    }

    // Verify the email matches (security check)
    const normalizedEmail = data.email.trim().toLowerCase();
    if (authUser.user.email?.toLowerCase() !== normalizedEmail) {
      return NextResponse.json(
        { error: 'Email mismatch' },
        { status: 400 }
      );
    }

    // Check if person already exists with this auth_user_id
    const { data: existingByAuthId } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('auth_user_id', data.authUserId)
      .maybeSingle();

    if (existingByAuthId) {
      // Person already linked to this auth user
      // Still ensure profile exists (will be handled below)
      const person = existingByAuthId;
      
      // Ensure a profiles row exists for this user (for role management)
      let profileCreated = false;
      let profileError: string | null = null;
      let profileExisted = false;

      try {
        const normalizedEmailForProfile =
          typeof data.email === 'string' ? data.email.trim().toLowerCase() : null;

        if (normalizedEmailForProfile) {
          const { data: existingProfile, error: checkError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, email')
            .eq('id', data.authUserId)
            .maybeSingle();

          if (checkError) {
            profileError = `Failed to check existing profile: ${checkError.message}`;
            console.error('[link-person] Error checking profile:', checkError);
          } else if (existingProfile) {
            profileExisted = true;
            if (existingProfile.email !== normalizedEmailForProfile) {
              const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({ email: normalizedEmailForProfile })
                .eq('id', data.authUserId);
              if (updateError) {
                console.warn('[link-person] Failed to update email on existing profile:', updateError.message);
              }
            }
          } else {
            // Profile doesn't exist - create it
            const { error: insertError } = await supabaseAdmin
              .from('profiles')
              .insert({
                id: data.authUserId,
                email: normalizedEmailForProfile,
                role: 'user',
              });

            if (insertError) {
              profileError = insertError.message;
              console.error('[link-person] Failed to create profile:', insertError);
            } else {
              profileCreated = true;
            }
          }
        } else {
          profileError = 'Email is required for profile creation';
        }
      } catch (profileErr) {
        profileError = profileErr instanceof Error ? profileErr.message : 'Unknown error';
        console.error('[link-person] Exception ensuring profile exists:', profileErr);
      }

      return NextResponse.json({
        ok: true,
        routeVersion: 'link-person-v2-profiles',
        person,
        linked: true,
        profileCreated,
        profileExisted,
        profileError: profileError || undefined,
      });
    }

    // Check if person exists by email (but not yet linked)
    const { data: existingByEmail } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    let person;
    let wasExisting = false;
    
    if (existingByEmail) {
      // Person exists but not linked - update to link them
      if (existingByEmail.auth_user_id) {
        // This shouldn't happen, but handle gracefully
        // Still ensure profile exists
        const person = existingByEmail;
        
        // Ensure a profiles row exists for this user
        let profileCreated = false;
        let profileError: string | null = null;
        let profileExisted = false;

        try {
          const normalizedEmailForProfile =
            typeof data.email === 'string' ? data.email.trim().toLowerCase() : null;

          if (normalizedEmailForProfile) {
            const { data: existingProfile, error: checkError } = await supabaseAdmin
              .from('profiles')
              .select('id, role, email')
              .eq('id', data.authUserId)
              .maybeSingle();

            if (checkError) {
              profileError = `Failed to check existing profile: ${checkError.message}`;
            } else if (existingProfile) {
              profileExisted = true;
              if (existingProfile.email !== normalizedEmailForProfile) {
                const { error: updateError } = await supabaseAdmin
                  .from('profiles')
                  .update({ email: normalizedEmailForProfile })
                  .eq('id', data.authUserId);
                if (updateError) {
                  console.warn('[link-person] Failed to update email:', updateError.message);
                }
              }
            } else {
              const { error: insertError } = await supabaseAdmin
                .from('profiles')
                .insert({
                  id: data.authUserId,
                  email: normalizedEmailForProfile,
                  role: 'user',
                });

              if (insertError) {
                profileError = insertError.message;
              } else {
                profileCreated = true;
              }
            }
          } else {
            profileError = 'Email is required for profile creation';
          }
        } catch (profileErr) {
          profileError = profileErr instanceof Error ? profileErr.message : 'Unknown error';
        }

        return NextResponse.json({
          ok: true,
          routeVersion: 'link-person-v2-profiles',
          person,
          linked: true,
          profileCreated,
          profileExisted,
          profileError: profileError || undefined,
        });
      }

      wasExisting = true;

      // Update existing person with auth_user_id
      const { data: updatedPerson, error: updateError } = await supabaseAdmin
        .from('people')
        .update({
          auth_user_id: data.authUserId,
          status: 'active_user', // Upgrade to active_user when they create account
          last_source: 'account_creation',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingByEmail.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to link existing person: ${updateError.message}`);
      }

      person = updatedPerson;
    } else {
      // Create new person with auth_user_id
      person = await upsertPerson({
        email: normalizedEmail,
        authUserId: data.authUserId,
        status: 'active_user', // Upgrade to active_user when they create account
        source: 'account_creation',
      });
    }

    // Log the linkage event
    await logEvent({
      personId: person.id,
      eventType: 'profile_update',
      source: 'auth_linkage',
      channel: 'web',
      metadata: {
        authUserId: data.authUserId,
        action: wasExisting ? 'linked_existing' : 'created_new',
      },
    });

    // Ensure a profiles row exists for this user (for role management)
    // This runs after person linking so login doesn't break if it fails
    let profileCreated = false;
    let profileError: string | null = null;
    let profileExisted = false;

    try {
      // Normalize email for profile (required field)
      const normalizedEmail =
        typeof data.email === 'string' ? data.email.trim().toLowerCase() : null;

      if (!normalizedEmail) {
        profileError = 'Email is required for profile creation';
        console.error('[link-person] Cannot create profile without email:', {
          authUserId: data.authUserId,
          email: data.email,
        });
      } else {
        // Check if profile already exists
        const { data: existingProfile, error: checkError } = await supabaseAdmin
          .from('profiles')
          .select('id, role, email')
          .eq('id', data.authUserId)
          .maybeSingle();

        if (checkError) {
          profileError = `Failed to check existing profile: ${checkError.message}`;
          console.error('[link-person] Error checking profile:', checkError);
        } else if (existingProfile) {
          profileExisted = true;
          // Optionally update email if it's different (keep role unchanged)
          if (existingProfile.email !== normalizedEmail) {
            const { error: updateError } = await supabaseAdmin
              .from('profiles')
              .update({ email: normalizedEmail })
              .eq('id', data.authUserId);

            if (updateError) {
              console.warn('[link-person] Failed to update email on existing profile:', {
                authUserId: data.authUserId,
                error: updateError.message,
              });
            } else {
              if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGGING === 'true') {
                console.log('[link-person] Updated email on existing profile:', {
                  authUserId: data.authUserId,
                  oldEmail: existingProfile.email,
                  newEmail: normalizedEmail,
                });
              }
            }
          }
          if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGGING === 'true') {
            console.log('[link-person] Profile already exists:', {
              authUserId: data.authUserId,
              existingRole: existingProfile.role,
              email: existingProfile.email,
            });
          }
        } else {
          // Profile doesn't exist - insert with id, email, and default role 'user'
          if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGGING === 'true') {
            console.log('[link-person] Creating new profile for user:', {
              authUserId: data.authUserId,
              email: normalizedEmail,
            });
          }

          const { error: insertError } = await supabaseAdmin
            .from('profiles')
            .insert({
              id: data.authUserId,
              email: normalizedEmail, // Required field - must be non-null
              role: 'user', // Default role for new users
            });

          if (insertError) {
            profileError = insertError.message;
            console.error('[link-person] Failed to create profile:', {
              authUserId: data.authUserId,
              email: normalizedEmail,
              error: insertError.message,
              code: insertError.code,
              details: insertError.details,
              hint: insertError.hint,
            });
          } else {
            profileCreated = true;
            if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGGING === 'true') {
              console.log('[link-person] Successfully created profile for user:', {
                authUserId: data.authUserId,
                email: normalizedEmail,
              });
            }
          }
        }
      }
    } catch (profileErr) {
      profileError = profileErr instanceof Error ? profileErr.message : 'Unknown error';
      console.error('[link-person] Exception ensuring profile exists:', {
        authUserId: data.authUserId,
        error: profileErr,
      });
    }

    return NextResponse.json({
      ok: true,
      routeVersion: 'link-person-v2-profiles',
      person,
      linked: true,
      profileCreated,
      profileExisted,
      profileError: profileError || undefined,
    });
  } catch (error) {
    console.error('Link person API error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}

