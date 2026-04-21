/**
 * Admin Page: Edit Program Assignment (Plans Phase 8)
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AssignmentEditor, {
  formValuesFromAssignment,
  type AssignmentFormValues,
} from '@/components/admin/programAssignments/AssignmentEditor';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type { ProgramAssignment } from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
  assignmentId: string;
}

function patchFromForm(form: AssignmentFormValues) {
  return {
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

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function EditProgramAssignmentPage({
  user,
  assignmentId,
}: Props) {
  const [row, setRow] = useState<ProgramAssignment | null>(null);
  const [form, setForm] = useState<AssignmentFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/admin/program-assignments/${assignmentId}`);
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Failed to load.');
      }
      const data = (await resp.json()) as ProgramAssignment;
      setRow(data);
      setForm(formValuesFromAssignment(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const resp = await fetch(
        `/api/admin/program-assignments/${assignmentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchFromForm(form)),
        },
      );
      const data = (await resp.json()) as
        | ProgramAssignment
        | { error: string };
      if (!resp.ok) {
        throw new Error('error' in data ? data.error : 'Update failed.');
      }
      if ('id' in data) {
        setRow(data);
        setForm(formValuesFromAssignment(data));
        setToast('Saved.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Edit Program Assignment · Fine Diet Admin</title>
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
            Edit assignment
          </h1>
          <p className="text-xs text-gray-500 font-mono mb-6">
            id: {assignmentId} · signed in as {user.email}
          </p>

          {loading && (
            <p className="text-sm text-gray-500">Loading assignment…</p>
          )}

          {row && form && (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="uppercase text-gray-500 mb-0.5">
                    Created
                  </div>
                  <div className="text-gray-800">
                    {fmtTs(row.created_at)}
                  </div>
                </div>
                <div>
                  <div className="uppercase text-gray-500 mb-0.5">
                    Updated
                  </div>
                  <div className="text-gray-800">
                    {fmtTs(row.updated_at)}
                  </div>
                </div>
                <div>
                  <div className="uppercase text-gray-500 mb-0.5">Author</div>
                  <div className="text-gray-800 font-mono">
                    {row.created_by_user_id
                      ? row.created_by_user_id.slice(0, 8) + '…'
                      : '—'}
                  </div>
                </div>
                <div className="md:col-span-3">
                  <Link
                    href={`/admin/program-assignments/inspect?person_id=${row.person_id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Inspect this person&rsquo;s full inheritance →
                  </Link>
                </div>
              </div>

              {toast && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                  {toast}
                </div>
              )}

              <AssignmentEditor
                value={form}
                onChange={setForm}
                onSubmit={save}
                saving={saving}
                error={error}
                submitLabel="Save changes"
                disabledPersonId
              />
            </>
          )}
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
        destination: '/login?redirect=/admin/program-assignments',
        permanent: false,
      },
    };
  }
  const assignmentId =
    typeof context.params?.id === 'string' ? context.params.id : null;
  if (!assignmentId) return { notFound: true };
  return { props: { user, assignmentId } };
};
