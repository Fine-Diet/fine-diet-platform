import fs from 'fs';
import path from 'path';

describe('pantry quick start write-path holds', () => {
  it('saves through existing pantry API with if_absent and no person_id in the client body', () => {
    const saveHelper = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/pantryQuickStart/save.ts'),
      'utf8',
    );
    expect(saveHelper).toContain('/api/journal/plans/pantry');
    expect(saveHelper).toContain('if_absent: true');
    expect(saveHelper).not.toContain('person_id');
    expect(saveHelper).not.toContain('supabase');
  });

  it('does not introduce a second pantry model or schema/DDL', () => {
    const files = [
      'lib/plans/pantryQuickStart/proposalPolicy.ts',
      'lib/plans/pantryQuickStart/save.ts',
      'pages/api/journal/plans/pantry/quick-start.ts',
      'components/food/pantry/PantryQuickStartView.tsx',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/create table/i);
      expect(source).not.toMatch(/alter table/i);
      expect(source).not.toMatch(/from\('pantry_quick_start/);
    }
  });

  it('does not show Quick Start unless saved pantry items loaded successfully', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'pages/app/food/pantry.tsx'),
      'utf8',
    );
    expect(page).toContain("loadState === 'ready' && items.length === 0");
    expect(page).toContain('Starting suggestions stay hidden until Pantry truth can be read');
    expect(page).not.toContain('from(\'pantry_on_hand_items\')');
  });

  it('does not generate grocery lists or change deduction from Quick Start', () => {
    const files = [
      'lib/plans/pantryQuickStart/proposalPolicy.ts',
      'lib/plans/pantryQuickStart/save.ts',
      'lib/plans/pantryQuickStart/resolveFoods.ts',
      'pages/api/journal/plans/pantry/quick-start.ts',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toContain('generateGrocery');
      expect(source).not.toContain('groceryReadModel');
      expect(source).not.toContain('searchFoods');
    }
  });

  it('does not persist habitual usually-have as a deductable pantry write', () => {
    const policy = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/pantryQuickStart/proposalPolicy.ts'),
      'utf8',
    );
    expect(policy).toContain("quantityMode === 'have_now' || item.quantityMode === 'tracked'");
    expect(policy).toContain('usually_have_not_persisted');
    expect(policy).toContain('confirmHaveNowForAcceptedStaples');

    const view = fs.readFileSync(
      path.join(process.cwd(), 'components/food/pantry/PantryQuickStartView.tsx'),
      'utf8',
    );
    expect(view).toContain('writesForAcceptedStaples(proposal).length');
    expect(view).toContain('I have this now');
    expect(view).not.toContain('saves a simple presence amount');
  });

  it('uses conflict-ignore if_absent so retries cannot overwrite existing quantity', () => {
    const store = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/groceryStateStore.ts'),
      'utf8',
    );
    expect(store).toContain('insertPantryOnHandItemIfAbsent');
    expect(store).toContain('PANTRY_IF_ABSENT_UPSERT');
    expect(store).toContain('resolvePantryIfAbsentWrite');

    const service = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/groceryServerService.ts'),
      'utf8',
    );
    const createFn = service.slice(
      service.indexOf('export async function createPantryOnHandItem'),
    );
    const ifAbsentBlock = createFn.slice(
      createFn.indexOf('if (options.ifAbsent)'),
      createFn.indexOf('await savePantryOnHandItem'),
    );
    expect(ifAbsentBlock).toContain('return insertPantryOnHandItemIfAbsent');
    expect(ifAbsentBlock).not.toContain('savePantryOnHandItem');

    const helper = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/pantryIfAbsent.ts'),
      'utf8',
    );
    expect(helper).toContain("onConflict: 'person_id,key'");
    expect(helper).toContain('ignoreDuplicates: true');
  });
});
