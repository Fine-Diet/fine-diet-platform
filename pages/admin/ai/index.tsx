/**
 * Admin Page: AI Runtime (Plans Phase 16)
 *
 * Single-page control surface for the AI runtime layer. Shows:
 *
 *   - All provider/model configs with tier, task affinity, and an
 *     enabled toggle (service-role backed).
 *   - All task policies with their resolved preferred / fallback
 *     configs, and a deterministic-fallback indicator per task.
 *
 * Admins can answer, on one screen:
 *   - which model handles each task,
 *   - which provider is fallback,
 *   - which tasks still have a deterministic fallback only.
 *
 * Intentionally compact — the packet explicitly rejects a full
 * provider-management console for V1.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  AIModelConfig,
  AIModelTier,
  AITaskPolicyWithConfigs,
  AITaskType,
} from '@/lib/ai/runtime/types';
import { AI_MODEL_TIERS, AI_TASK_TYPES } from '@/lib/ai/runtime/types';

interface Props {
  user: AuthenticatedUser;
}

function tierPill(tier: AIModelTier): string {
  switch (tier) {
    case 'quality':
      return 'bg-indigo-100 text-indigo-800';
    case 'fallback':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function boolPill(val: boolean, onLabel: string, offLabel: string) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
        val
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-gray-200 text-gray-700'
      }`}
    >
      {val ? onLabel : offLabel}
    </span>
  );
}

export default function AIRuntimeAdminPage({ user: _user }: Props) {
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [policies, setPolicies] = useState<AITaskPolicyWithConfigs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [pendingTaskType, setPendingTaskType] = useState<AITaskType | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, p] = await Promise.all([
        fetch('/api/admin/ai/models'),
        fetch('/api/admin/ai/task-policies'),
      ]);
      if (!m.ok || !p.ok) throw new Error('Failed to load AI runtime config.');
      const mData = (await m.json()) as { rows: AIModelConfig[] };
      const pData = (await p.json()) as { rows: AITaskPolicyWithConfigs[] };
      setModels(mData.rows);
      setPolicies(pData.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const patchModel = useCallback(
    async (id: string, patch: Partial<AIModelConfig>) => {
      setPendingModelId(id);
      try {
        const resp = await fetch(`/api/admin/ai/models/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          throw new Error(d.error ?? 'Update failed.');
        }
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed.');
      } finally {
        setPendingModelId(null);
      }
    },
    [reload],
  );

  const patchPolicy = useCallback(
    async (
      taskType: AITaskType,
      patch: {
        preferred_model_config_id?: string | null;
        fallback_model_config_id?: string | null;
        deterministic_fallback_available?: boolean;
      },
    ) => {
      setPendingTaskType(taskType);
      try {
        const resp = await fetch(`/api/admin/ai/task-policies/${taskType}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          throw new Error(d.error ?? 'Update failed.');
        }
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed.');
      } finally {
        setPendingTaskType(null);
      }
    },
    [reload],
  );

  const enabledModelOptions = models.filter((m) => m.enabled);

  return (
    <>
      <Head>
        <title>AI Runtime • Fine Diet Admin</title>
      </Head>
      <main className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Runtime</h1>
              <p className="text-sm text-gray-600 mt-1">
                Provider / model configs and task routing governed by the
                runtime layer (Plans Phase 16). Disabled models are not
                routable. Tasks with deterministic fallback remain
                functional when every model is disabled.
              </p>
            </div>
            <Link
              href="/admin/app-settings"
              className="text-sm text-blue-700 hover:underline"
            >
              ← App Settings
            </Link>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-sm text-red-800">
              {error}
            </div>
          )}
          {loading && !models.length && (
            <div className="p-4 rounded bg-white border border-gray-200 text-sm text-gray-600">
              Loading…
            </div>
          )}

          {/* ===== Models ===== */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Provider / Model Configs</h2>
              <span className="text-xs text-gray-500">{models.length} configs</span>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Provider / Model</th>
                    <th className="px-4 py-2 text-left">Tier</th>
                    <th className="px-4 py-2 text-left">Task types</th>
                    <th className="px-4 py-2 text-left">Limits</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => {
                    const isPending = pendingModelId === m.id;
                    return (
                      <tr key={m.id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">
                            {m.display_name ?? `${m.provider_key} · ${m.model_key}`}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {m.provider_key}/{m.model_key}
                          </div>
                          {m.notes && (
                            <div className="text-xs text-gray-500 mt-1">
                              {m.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            disabled={isPending}
                            value={m.tier}
                            onChange={(e) =>
                              patchModel(m.id, {
                                tier: e.target.value as AIModelTier,
                              })
                            }
                            className="border border-gray-300 rounded px-2 py-1 text-xs"
                          >
                            {AI_MODEL_TIERS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${tierPill(m.tier)}`}
                            >
                              {m.tier}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {m.task_types.length === 0 ? (
                            <span className="text-xs text-gray-500 italic">
                              any
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {m.task_types.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-700 font-mono"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <div>
                            in: {m.max_input_tokens ?? '—'}
                          </div>
                          <div>out: {m.max_output_tokens ?? '—'}</div>
                          <div>temp: {m.temperature ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          {boolPill(m.enabled, 'enabled', 'disabled')}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              patchModel(m.id, { enabled: !m.enabled })
                            }
                            className={`px-2 py-1 text-xs font-semibold rounded border ${
                              m.enabled
                                ? 'border-gray-400 text-gray-700 hover:bg-gray-50'
                                : 'border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                            } disabled:opacity-50`}
                          >
                            {m.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && models.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-sm text-gray-500 text-center"
                      >
                        No model configs yet. Seed via the Plans Phase 16
                        migration.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ===== Task policies ===== */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Task Routing</h2>
              <span className="text-xs text-gray-500">
                {policies.length} tasks
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Task</th>
                    <th className="px-4 py-2 text-left">Preferred</th>
                    <th className="px-4 py-2 text-left">Fallback</th>
                    <th className="px-4 py-2 text-left">Deterministic</th>
                  </tr>
                </thead>
                <tbody>
                  {AI_TASK_TYPES.map((taskType) => {
                    const policy = policies.find((p) => p.task_type === taskType);
                    const isPending = pendingTaskType === taskType;
                    return (
                      <tr
                        key={taskType}
                        className="border-t border-gray-100 align-top"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {taskType}
                          {policy?.notes && (
                            <div className="text-[10px] text-gray-500 mt-1 font-sans">
                              {policy.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            disabled={isPending}
                            value={policy?.preferred_model_config_id ?? ''}
                            onChange={(e) =>
                              patchPolicy(taskType, {
                                preferred_model_config_id: e.target.value || null,
                              })
                            }
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-56"
                          >
                            <option value="">— none —</option>
                            {enabledModelOptions.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.display_name ??
                                  `${m.provider_key}/${m.model_key}`}
                              </option>
                            ))}
                          </select>
                          {policy?.preferred_config &&
                            !policy.preferred_config.enabled && (
                              <div className="text-[10px] text-amber-700 mt-1">
                                ⚠ currently disabled
                              </div>
                            )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            disabled={isPending}
                            value={policy?.fallback_model_config_id ?? ''}
                            onChange={(e) =>
                              patchPolicy(taskType, {
                                fallback_model_config_id: e.target.value || null,
                              })
                            }
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-56"
                          >
                            <option value="">— none —</option>
                            {enabledModelOptions.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.display_name ??
                                  `${m.provider_key}/${m.model_key}`}
                              </option>
                            ))}
                          </select>
                          {policy?.fallback_config &&
                            !policy.fallback_config.enabled && (
                              <div className="text-[10px] text-amber-700 mt-1">
                                ⚠ currently disabled
                              </div>
                            )}
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              disabled={isPending}
                              checked={
                                policy?.deterministic_fallback_available ?? false
                              }
                              onChange={(e) =>
                                patchPolicy(taskType, {
                                  deterministic_fallback_available:
                                    e.target.checked,
                                })
                              }
                            />
                            {policy?.deterministic_fallback_available
                              ? 'available'
                              : 'none'}
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const user = await getCurrentUserWithRoleFromSSR(ctx);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/ai',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
