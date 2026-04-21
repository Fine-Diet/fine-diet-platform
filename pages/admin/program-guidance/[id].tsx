/**
 * Admin Page: Edit Program Guidance (Plans Phase 7)
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import GuidanceEditor, {
  formValuesFromRow,
  type GuidanceFormValues,
} from '@/components/admin/programGuidance/GuidanceEditor';
import type { ProgramPlanGuidance } from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
  id: string;
}

export default function ProgramGuidanceEditPage({ user, id }: Props) {
  const router = useRouter();
  const [row, setRow] = useState<ProgramPlanGuidance | null>(null);
  const [values, setValues] = useState<GuidanceFormValues | null>(null);
  const [activeForPerson, setActiveForPerson] = useState<
    ProgramPlanGuidance[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/program-guidance/${id}`);
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Failed to load.');
      }
      const data = (await resp.json()) as ProgramPlanGuidance;
      setRow(data);
      setValues(formValuesFromRow(data));

      const resp2 = await fetch(
        `/api/admin/program-guidance/for-person?person_id=${encodeURIComponent(data.person_id)}`,
      );
      if (resp2.ok) {
        const d2 = (await resp2.json()) as { rows: ProgramPlanGuidance[] };
        setActiveForPerson(d2.rows);
      } else {
        setActiveForPerson([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async () => {
    if (!values) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        program_slug: values.program_slug.trim(),
        program_run_id: values.program_run_id.trim() || null,
        guidance_payload_json: values.payload,
        active: values.active,
        effective_from: values.effective_from || null,
        effective_until: values.effective_until || null,
        priority: values.priority,
        guidance_type: values.guidance_type || null,
        notes: values.notes.trim() || null,
      };
      const resp = await fetch(`/api/admin/program-guidance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? 'Failed to save.');
        setSaving(false);
        return;
      }
      const updated = data as ProgramPlanGuidance;
      setRow(updated);
      setValues(formValuesFromRow(updated));
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error.');
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!row) return;
    const url = row.active
      ? `/api/admin/program-guidance/${row.id}/deactivate`
      : `/api/admin/program-guidance/${row.id}/activate`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      const data = await resp.json();
      setError(data.error ?? 'Toggle failed.');
      return;
    }
    await load();
  };

  return (
    <>
      <Head>
        <title>Edit Program Guidance · Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 min-h-screen pb-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-6">
            <Link
              href="/admin/program-guidance"
              className="text-sm text-gray-600 hover:text-gray-900 inline-block mb-3"
            >
              ← Back to Program Guidance
            </Link>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Edit program guidance
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Signed in as {user.email}.
                </p>
              </div>
              {row && (
                <button
                  type="button"
                  onClick={toggleActive}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    row.active
                      ? 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {row.active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>

          {loading && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
              Loading…
            </div>
          )}

          {!loading && values && row && (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 text-xs text-gray-500 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="font-medium text-gray-700">Row id</div>
                  <div className="font-mono">{row.id}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-700">Created</div>
                  <div>{new Date(row.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-700">Updated</div>
                  <div>{new Date(row.updated_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-700">NDS stamp</div>
                  <div className="font-mono">{row.nds_version}</div>
                </div>
              </div>

              {activeForPerson && activeForPerson.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
                  <div className="text-xs font-medium text-blue-900 mb-2">
                    {activeForPerson.length} active guidance row
                    {activeForPerson.length === 1 ? '' : 's'} for this person
                    (priority DESC):
                  </div>
                  <ul className="text-xs text-blue-900 space-y-1">
                    {activeForPerson.map((r) => (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className="font-mono">{r.program_slug}</span>
                        <span className="text-blue-700">
                          · priority {r.priority}
                        </span>
                        {r.guidance_type && (
                          <span className="text-blue-700">
                            · {r.guidance_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {r.id === row.id && (
                          <span className="px-1.5 py-0.5 bg-blue-200 rounded">
                            this row
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <GuidanceEditor
                value={values}
                onChange={setValues}
                onSubmit={handleSubmit}
                onCancel={() => router.push('/admin/program-guidance')}
                saving={saving}
                submitLabel="Save changes"
                error={error}
                disabledPersonId
              />
            </>
          )}

          {!loading && !row && error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  const id = typeof context.params?.id === 'string' ? context.params.id : '';
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: `/login?redirect=/admin/program-guidance/${id}`,
        permanent: false,
      },
    };
  }
  if (!id) {
    return { notFound: true };
  }
  return { props: { user, id } };
};
