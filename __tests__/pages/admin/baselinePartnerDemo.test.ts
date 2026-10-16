import { describe, expect, jest, test } from '@jest/globals';

jest.mock('@/lib/authServer', () => ({
  getCurrentUserWithRoleFromSSR: jest.fn(),
}));

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { getServerSideProps } from '@/pages/admin/baseline-partner-demo';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '@/lib/programs/baselineDay0To21Candidate';

const mockedGetUser = getCurrentUserWithRoleFromSSR as jest.MockedFunction<
  typeof getCurrentUserWithRoleFromSSR
>;

const leakedMarkers = [
  'baseline-candidate-day-1-practice',
  'Let’s get you set up for Baseline',
  'Set the tone',
];

function context(query: Record<string, string> = {}) {
  return {
    query,
    req: {},
    res: {
      setHeader: jest.fn(),
    },
    resolvedUrl: '/admin/baseline-partner-demo',
  } as any;
}

describe('/admin/baseline-partner-demo', () => {
  test('denies anonymous users without Baseline content', async () => {
    mockedGetUser.mockResolvedValueOnce(null);
    const result = await getServerSideProps(context());
    expect(result).toMatchObject({
      redirect: {
        destination: '/login?redirect=/admin/baseline-partner-demo',
        permanent: false,
      },
    });
    const serialized = JSON.stringify(result);
    for (const marker of leakedMarkers) {
      expect(serialized).not.toContain(marker);
    }
    expect(result).not.toHaveProperty('props');
  });

  test('denies non-editor members without Baseline content', async () => {
    mockedGetUser.mockResolvedValueOnce({
      id: 'user-id',
      email: 'member@example.com',
      role: 'user',
    } as any);
    const result = await getServerSideProps(context({ day: '7' }));
    expect(result).toMatchObject({
      redirect: {
        destination: '/login?redirect=/admin/baseline-partner-demo',
        permanent: false,
      },
    });
    const serialized = JSON.stringify(result);
    for (const marker of leakedMarkers) {
      expect(serialized).not.toContain(marker);
    }
  });

  test('renders the source blueprint for an editor across 22 positions', async () => {
    mockedGetUser.mockResolvedValueOnce({
      id: 'editor-id',
      email: 'editor@example.com',
      role: 'editor',
    } as any);
    const result = await getServerSideProps(context({ day: '14' }));
    expect(result).toHaveProperty('props');
    if (!('props' in result)) return;
    const props = await result.props;
    expect(props.blueprint.modules).toHaveLength(50);
    expect(props.blueprint.days).toHaveLength(22);
    expect(props.selectedDay).toBe(14);
    expect(props.runtimeSummary.version.version_key).toBe(
      BASELINE_DAY_0_TO_21_BLUEPRINT.version.key,
    );
    expect(JSON.stringify(props)).not.toContain('/api/journal/programs/enrollments');
  });

  test('allows admins and clamps the selected day to the authored range', async () => {
    mockedGetUser.mockResolvedValueOnce({
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'admin',
    } as any);
    const result = await getServerSideProps(context({ day: '99' }));
    if (!('props' in result)) throw new Error('expected props');
    const props = await result.props;
    expect(props.selectedDay).toBe(21);
    expect(props.blueprint.identity.slug).toBe('baseline');
  });
});
