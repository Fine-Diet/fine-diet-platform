import fs from 'fs';
import path from 'path';

import { APP_DRAWER_HUBS } from '@/lib/navigation/appDrawerNavigation';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Programs navigation cleanup', () => {
  const programs = APP_DRAWER_HUBS.find((hub) => hub.id === 'programs');

  it('shows only Explore, My Programs, and a disabled Assessments item', () => {
    expect(programs?.items?.map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href ?? null,
      disabled: item.disabled ?? false,
      match: item.match ?? null,
    }))).toEqual([
      {
        id: 'programs-explore',
        label: 'Explore',
        href: APP_ROUTES.programs,
        disabled: false,
        match: 'exact',
      },
      {
        id: 'my-programs',
        label: 'My Programs',
        href: APP_ROUTES.programsMy,
        disabled: false,
        match: null,
      },
      {
        id: 'assessments',
        label: 'Assessments',
        href: null,
        disabled: true,
        match: null,
      },
    ]);
    expect(programs?.items?.find((item) => item.id === 'assessments')?.status).toBe('coming-soon');
  });

  it('removes Fine Diet Method / Baseline, Program Library, and Integrative Care from the left nav', () => {
    const labels = programs?.items?.map((item) => item.label) ?? [];
    expect(labels).not.toContain('Programs Home');
    expect(labels).not.toContain('Active Program');
    expect(labels).not.toContain('Fine Diet Method / Baseline');
    expect(labels).not.toContain('Program Library');
    expect(labels).not.toContain('Integrative Care');
    expect(labels).toEqual(['Explore', 'My Programs', 'Assessments']);
  });

  it('keeps Explore on the existing Programs Home route and adds My Programs beside it', () => {
    expect(read('pages/app/programs/index.tsx')).toContain('ProgramsHomeView');
    expect(read('pages/app/programs/my/index.tsx')).toContain('MyProgramsView');
    expect(read('components/programs/my/MyProgramsView.tsx')).toContain('/api/journal/programs/runtime-summary');
    expect(read('components/programs/my/MyProgramsView.tsx')).toContain('/api/journal/programs/library');
    expect(read('components/programs/my/MyProgramsView.tsx')).toContain('MY_PROGRAMS_GROUPS');
    const grouping = read('lib/programs/myProgramsGrouping.ts');
    expect(grouping).toContain("title: 'Current'");
    expect(grouping).toContain("title: 'Ready to Start'");
    expect(grouping).toContain("title: 'Completed'");
    const menu = read('components/journal/AppSideMenu.tsx');
    const disabledBlock = menu.slice(
      menu.indexOf('if (item.disabled)'),
      menu.indexOf('const variantClass'),
    );
    expect(disabledBlock).toContain('aria-disabled="true"');
    expect(disabledBlock).toContain('{item.label}');
    expect(disabledBlock).not.toContain('SoonBadge');
  });
});
