/**
 * Admin Page: Create Program Guidance (Plans Phase 7)
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import GuidanceEditor, {
  emptyFormValues,
  type GuidanceFormValues,
} from '@/components/admin/programGuidance/GuidanceEditor';
import type { ProgramPlanGuidance } from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
}

export default function ProgramGuidanceNewPage({ user }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<GuidanceFormValues>(emptyFormValues());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!values.person_id) {
        setError('Select a person before saving.');
        setSaving(false);
        return;
      }
      if (!values.program_slug.trim()) {
        setError('Program slug is required.');
        setSaving(false);
        return;
      }

      const body = {
        person_id: values.person_id,
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

      const resp = await fetch('/api/admin/program-guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? 'Failed to save.');
        setSaving(false);
        return;
      }
      const created = data as ProgramPlanGuidance;
      await router.push(`/admin/program-guidance/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error.');
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>New Program Guidance · Fine Diet Admin</title>
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
            <h1 className="text-3xl font-bold text-gray-900">
              New program guidance
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Signed in as {user.email}.
            </p>
          </div>

          <GuidanceEditor
            value={values}
            onChange={setValues}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/admin/program-guidance')}
            saving={saving}
            submitLabel="Create guidance"
            error={error}
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
        destination: '/login?redirect=/admin/program-guidance/new',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
