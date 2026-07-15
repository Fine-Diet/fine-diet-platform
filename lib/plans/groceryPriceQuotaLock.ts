/**
 * Per-person async lock to serialize quota-sensitive search paths.
 */

const personLocks = new Map<string, Promise<void>>();
const personResolvers = new Map<string, () => void>();

export async function withPersonSearchLock<T>(
  personId: string,
  fn: () => Promise<T>,
): Promise<T> {
  while (personLocks.has(personId)) {
    await personLocks.get(personId);
  }

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  personLocks.set(personId, gate);
  personResolvers.set(personId, release);

  try {
    return await fn();
  } finally {
    personLocks.delete(personId);
    const resolver = personResolvers.get(personId);
    personResolvers.delete(personId);
    resolver?.();
  }
}

export function __resetPersonSearchLocksForTests(): void {
  personLocks.clear();
  personResolvers.clear();
}
