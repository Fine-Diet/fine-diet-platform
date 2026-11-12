const treeMock = jest.fn();
const progressHeadlinesMock = jest.fn();
const progressSummaryMock = jest.fn();
const listAssignmentsMock = jest.fn();
const guidanceMock = jest.fn();
const availabilityMock = jest.fn();
const accessMock = jest.fn();
let mockFrom: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return { supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) } };
});

jest.mock('../programCurriculumAccess', () => {
  const actual = jest.requireActual('../programCurriculumAccess');
  return {
    ...actual,
    personHasCurrentProgramCurriculumAccess: (...args: unknown[]) => accessMock(...args),
  };
});

jest.mock('../programContentDeliveryServerService', () => ({
  getPublishedProgramTreeBySlug: (...args: unknown[]) => treeMock(...args),
}));

jest.mock('../programProgressServerService', () => ({
  listProgressHeadlinesForPerson: (...args: unknown[]) => progressHeadlinesMock(...args),
  getProgramProgressSummary: (...args: unknown[]) => progressSummaryMock(...args),
}));

jest.mock('@/lib/plans/programAssignmentServerService', () => ({
  listAssignments: (...args: unknown[]) => listAssignmentsMock(...args),
  resolveInheritedGuidanceForPerson: (...args: unknown[]) => guidanceMock(...args),
}));

jest.mock('../programAvailabilityServerService', () => ({
  computeProgramAvailabilityForPerson: (...args: unknown[]) => availabilityMock(...args),
}));

jest.mock('../catalogue', () => ({
  getProgramCatalogueEntry: (slug: string) => ({
    slug,
    title: 'Guided',
    tagline: null,
    description: 'Public catalogue description',
    modules: [],
    storefront_href: null,
    is_stub: true,
  }),
  resolveProgramCatalogueEntry: async (slug: string) => ({
    slug,
    title: 'Guided',
    tagline: null,
    description: 'Public catalogue description',
    modules: [],
    storefront_href: null,
    is_stub: true,
  }),
  resolveProgramCatalogueEntries: async (slugs: string[]) =>
    slugs.map((slug) => ({
      slug,
      title: 'Guided',
      tagline: null,
      description: 'Public catalogue description',
      modules: [],
      storefront_href: null,
      is_stub: true,
    })),
}));

import {
  getLibraryDetailForPerson,
  listLibraryForPerson,
} from '../programLibraryServerService';

const SECRET_TREE = {
  id: 'program-1',
  slug: 'guided',
  title: 'Guided',
  tagline: null,
  description: 'Managed description',
  storefront_href: null,
  modules: [
    {
      id: 'module-1',
      title: 'Week 1',
      description: null,
      ordinal: 1,
      items: [
        {
          id: 'item-1',
          item_type: 'article',
          title: 'Paid lesson',
          summary: null,
          body: 'secret curriculum',
          video_url: null,
          video_provider: null,
          estimated_minutes: null,
          ordinal: 1,
        },
      ],
    },
  ],
};

function entitlementQuery(data: unknown[] = []) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'lte', 'or']) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.then = jest.fn((resolve, reject) =>
    Promise.resolve({ data, error: null }).then(resolve, reject),
  );
  return chain;
}

function purchaseAssignment() {
  return {
    id: 'assignment-purchase',
    person_id: 'person-b',
    program_slug: 'guided',
    acquisition_source: 'purchase',
    status: 'active',
    active_from: '2026-11-01T00:00:00.000Z',
    active_to: null,
    priority: 0,
    source_ref: 'sub_old',
    notes: null,
    created_by_user_id: null,
    auto_created: true,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };
}

function adminAssignment() {
  return {
    ...purchaseAssignment(),
    id: 'assignment-admin',
    acquisition_source: 'admin_grant',
    source_ref: 'admin:guided',
  };
}

describe('library curriculum access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => entitlementQuery([]));
    guidanceMock.mockResolvedValue({
      resolved: [],
      active_assignments: [],
      resolved_at: '2026-11-09T18:00:00.000Z',
    });
    availabilityMock.mockResolvedValue({ entries: [] });
    progressHeadlinesMock.mockResolvedValue(new Map());
    progressSummaryMock.mockResolvedValue({
      program_slug: 'guided',
      items_total: 1,
      items_completed: 0,
      items_in_progress: 0,
      percent_complete: 0,
      aggregate_status: 'not_started',
      modules: [],
      resume_content_item_id: 'item-1',
      resume_module_id: 'module-1',
      last_viewed_at: null,
    });
    treeMock.mockResolvedValue(SECRET_TREE);
    listAssignmentsMock.mockResolvedValue({
      rows: [],
      total: 0,
      limit: 200,
      offset: 0,
    });
  });

  it('does not load the published tree for a stale purchase assignment', async () => {
    accessMock.mockResolvedValue(false);

    const detail = await getLibraryDetailForPerson('person-b', 'guided');

    expect(detail).toBeNull();
    expect(treeMock).not.toHaveBeenCalled();
    expect(progressSummaryMock).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalledWith('program_content_items');
    expect(mockFrom).not.toHaveBeenCalledWith('program_modules');
  });

  it('loads the published tree for an allowed independent grant', async () => {
    accessMock.mockResolvedValue(true);
    listAssignmentsMock.mockResolvedValue({
      rows: [adminAssignment()],
      total: 1,
      limit: 200,
      offset: 0,
    });

    const detail = await getLibraryDetailForPerson('person-b', 'guided');

    expect(detail?.managed_content?.modules[0].items[0].body).toBe('secret curriculum');
    expect(treeMock).toHaveBeenCalledWith('guided');
  });

  it('does not request progress curriculum for a library card backed only by a stale purchase', async () => {
    listAssignmentsMock.mockResolvedValue({
      rows: [purchaseAssignment()],
      total: 1,
      limit: 200,
      offset: 0,
    });

    const library = await listLibraryForPerson('person-b');

    expect(library.entries.map((entry) => entry.slug)).toEqual(['guided']);
    expect(library.entries[0].progress).toBeNull();
    expect(progressHeadlinesMock).toHaveBeenCalledWith('person-b', []);
    expect(treeMock).not.toHaveBeenCalled();
  });

  it('requests progress only for a library program with an independent grant', async () => {
    listAssignmentsMock.mockResolvedValue({
      rows: [purchaseAssignment(), adminAssignment()],
      total: 2,
      limit: 200,
      offset: 0,
    });

    await listLibraryForPerson('person-b');

    expect(progressHeadlinesMock).toHaveBeenCalledWith('person-b', ['guided']);
  });
});
