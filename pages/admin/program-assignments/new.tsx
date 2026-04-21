/**
 * Admin Page: New Program Assignment (Plans Phase 8)
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import AssignmentEditor, {
  emptyAssignmentForm,
  type AssignmentFormValues,
} from '@/components/admin/programAssignments/AssignmentEditor';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type { ProgramAssignment } from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
  prefillPersonId: string | null;
}

function payloadFromForm(form: AssignmentFormValues) {
  return {
    person_id: form.person_id,
    program_slug: form.program_slug.trim(),
    acquisition_source: form.acquisition_source,
    status: form.status,
    active_from: form.active_from ? form.active_from : null,
    active_to: form.active_to ? form.active_to : null,
    priority: form.priority,
    source_ref: form.source_ref.trim() || null,
    notes: form.notes.trim() || null,
  };
}

export default function NewProgramAssignmentPage({
  user,
  prefillPersonId,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<AssignmentFormValues>(() => ({
    ...emptyAssignmentForm(),
    person_id: prefillPersonId ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!form.person_id) {
      setError('Select a person.');
      return;
    }
    if (!form.program_slug.trim()) {
      setError('Program slug is required.');
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch('/api/admin/program-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromForm(form)),
      });
      const data = (await resp.json()) as
        | ProgramAssignment
        | { error: string; issues?: unknown };
      if (!resp.ok) {
        throw new Error('error' in data ? data.error : 'Create failed.');
      }
      if ('id' in data) {
        await router.replace(`/admin/program-assignments/${data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>New Program Assignment · Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 min-h-screen pb-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link
            href="/admin/program-assignments"
            className="text-sm text-gray-600 hover:text-gray-900 inline-block mb-3"
          >
            ← Back to assignments
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            New assignment
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Assign a program to a person. While active and in-window the
            assignment contributes inheritance into the Plans consumer
            path for this person. Signed in as {user.email}.
          </p>
          <AssignmentEditor
            value={form}
            onChange={setForm}
            onSubmit={handleSubmit}
            saving={saving}
            error={error}
            submitLabel="Create assignment"
          />
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/program-assignments/new',
        permanent: false,
      },
    };
  }
  const prefillPersonId =
    typeof context.query.person_id === 'string' && context.query.person_id
      ? context.query.person_id
      : null;
  return { props: { user, prefillPersonId } };
};
