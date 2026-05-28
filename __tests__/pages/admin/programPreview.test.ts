import { describe, expect, jest, test } from '@jest/globals';

jest.mock('@/lib/authServer', () => ({
  getCurrentUserWithRoleFromSSR: jest.fn(),
}));

jest.mock('@/pages/programs', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/pages/programs/[series]', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/pages/programs/[series]/[program]', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/admin/programPreview/ProgramPreviewShell', () => ({
  ProgramPreviewShell: () => null,
}));

jest.mock('@/components/admin/programPreview/ProgramStatePreview', () => ({
  ProgramStatePreview: () => null,
}));

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { getServerSideProps } from '@/pages/admin/program-preview';

const mockedGetUser = getCurrentUserWithRoleFromSSR as jest.MockedFunction<
  typeof getCurrentUserWithRoleFromSSR
>;

function context(query: Record<string, string> = {}) {
  return {
    query,
    req: {},
    res: {},
    resolvedUrl: '/admin/program-preview',
  } as any;
}

describe('/admin/program-preview', () => {
  test('redirects anonymous users', async () => {
    mockedGetUser.mockResolvedValueOnce(null);

    await expect(getServerSideProps(context())).resolves.toMatchObject({
      redirect: {
        destination: '/login?redirect=/admin/program-preview',
        permanent: false,
      },
    });
  });

  test('redirects non-editor users', async () => {
    mockedGetUser.mockResolvedValueOnce({
      id: 'user-id',
      email: 'member@example.com',
      role: 'user',
    } as any);

    await expect(getServerSideProps(context())).resolves.toMatchObject({
      redirect: {
        destination: '/login?redirect=/admin/program-preview',
        permanent: false,
      },
    });
  });

  test('allows editors and normalizes preview query controls', async () => {
    mockedGetUser.mockResolvedValueOnce({
      id: 'editor-id',
      email: 'editor@example.com',
      role: 'editor',
    } as any);

    await expect(
      getServerSideProps(
        context({
          surface: 'checkin-panel',
          state: 'active-day-7-checkin-due',
          program: 'baseline',
          capacity: 'high',
          day: '7',
          footer: '0',
        }),
      ),
    ).resolves.toMatchObject({
      props: {
        surface: 'checkin-panel',
        stateId: 'active-day-7-checkin-due',
        programSlug: 'baseline',
        capacity: 'high',
        day: 7,
        showFooter: false,
      },
    });
  });

  test('allows admins', async () => {
    mockedGetUser.mockResolvedValueOnce({
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'admin',
    } as any);

    const result = await getServerSideProps(context());

    expect(result).toHaveProperty('props');
    expect(result).not.toHaveProperty('redirect');
  });
});
