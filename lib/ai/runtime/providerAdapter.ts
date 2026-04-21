/**
 * Plans Phase 16 — Provider adapter registry.
 *
 * Every provider that the runtime can execute against registers an
 * adapter here. Feature code does NOT import provider SDKs directly;
 * instead it passes an `execute` callback to `runAITask` which
 * receives the resolved route (provider + model + config) and can
 * branch on provider_key if it needs to do anything provider-specific.
 *
 * In V1 only the `stub` provider is registered, and the stub adapter
 * returns `{ handled: false }` for every task — that's the signal to
 * the runtime that execution is delegated to the caller's `execute`
 * callback (which calls the existing deterministic PlansAIGateway).
 *
 * When a real provider is added later (openai, anthropic, google), an
 * adapter can provide a default `execute` for common tasks so feature
 * code shrinks further. Until then, the adapter is a registration
 * point and a health-probe surface.
 */

import type { AIModelConfig, AITaskType } from './types';

export interface AIProviderExecuteArgs<TInput = unknown> {
  taskType: AITaskType;
  modelKey: string;
  input: TInput;
  personId: string;
  planId: string | null;
  /**
   * Full resolved model config. Added in Packet 18 so adapters can
   * honour admin-configured token caps, temperature, and notes
   * without reaching into env vars. Optional for backwards
   * compatibility with the stub adapter.
   */
  modelConfig?: AIModelConfig;
}

export interface AIProviderExecuteResult<TOutput = unknown> {
  /**
   * `true` when the adapter produced `output`. `false` means the
   * runtime should fall back to the caller's `execute` callback (or
   * the deterministic path).
   */
  handled: boolean;
  output?: TOutput;
}

export interface AIProviderAdapter {
  readonly provider_key: string;
  /**
   * Return `true` if this adapter claims responsibility for the given
   * task. The runtime will still call `execute` which is allowed to
   * return `{ handled: false }` as a soft decline.
   */
  supports(taskType: AITaskType): boolean;
  execute<TInput, TOutput>(
    args: AIProviderExecuteArgs<TInput>,
  ): Promise<AIProviderExecuteResult<TOutput>>;
}

const registry = new Map<string, AIProviderAdapter>();

export function registerProviderAdapter(adapter: AIProviderAdapter): void {
  registry.set(adapter.provider_key, adapter);
}

export function getProviderAdapter(
  provider_key: string,
): AIProviderAdapter | null {
  return registry.get(provider_key) ?? null;
}

export function listRegisteredProviderKeys(): string[] {
  return Array.from(registry.keys()).sort();
}

// ---------------------------------------------------------------------------
// Stub adapter — registered at module load so the runtime always has
// at least one provider available. The stub is a soft no-op: it
// advertises support for every task type but always returns
// `handled: false`, which keeps the existing deterministic feature
// code (PlansAIGateway, import flows) as the actual executor.
// ---------------------------------------------------------------------------
const stubAdapter: AIProviderAdapter = {
  provider_key: 'stub',
  supports: () => true,
  async execute() {
    return { handled: false };
  },
};
registerProviderAdapter(stubAdapter);
