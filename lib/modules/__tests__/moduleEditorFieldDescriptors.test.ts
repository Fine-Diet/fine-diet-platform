/**
 * Guards the module-editor field descriptor changes for the module-library fix:
 *   - comparison.table.v1 `columns` is a singleton object (writes back an object,
 *     not an array) — distinct from object-list.
 *   - process.numbered-cards.v1 and system.cards-scroller.v1 have descriptors so
 *     ModuleContentPanel can render their editable fields.
 *   - grid.program-collections-rail.v1 exposes an authored `cards` object-list
 *     group with priceLine + optional note controls.
 */
import { MODULE_FIELD_DESCRIPTORS, type FieldDescriptor } from '../fieldDescriptors';
import { PROGRAM_COLLECTIONS_RAIL_FIELD_DESCRIPTORS } from '../programCollectionsRailFieldDescriptors';

function findDescriptor(
  descriptors: FieldDescriptor[],
  key: string,
): FieldDescriptor | undefined {
  return descriptors.find((d) => d.key === key);
}

describe('singleton object field type', () => {
  it('is part of the FieldType vocabulary', () => {
    const columns = findDescriptor(
      MODULE_FIELD_DESCRIPTORS['comparison.table.v1'],
      'columns',
    );
    expect(columns?.type).toBe('object');
  });

  it('comparison.table.v1 columns is a singleton object, NOT object-list (writes back an object)', () => {
    const columns = findDescriptor(
      MODULE_FIELD_DESCRIPTORS['comparison.table.v1'],
      'columns',
    );
    expect(columns?.type).toBe('object');
    expect(columns?.type).not.toBe('object-list');
    expect(columns?.fields?.map((f) => f.key)).toEqual(['left', 'right']);
  });

  it('keeps comparison.table.v1 rows as object-list (unaffected)', () => {
    const rows = findDescriptor(MODULE_FIELD_DESCRIPTORS['comparison.table.v1'], 'rows');
    expect(rows?.type).toBe('object-list');
  });
});

describe('process.numbered-cards.v1 descriptors', () => {
  const descriptors = MODULE_FIELD_DESCRIPTORS['process.numbered-cards.v1'];

  it('defines descriptors so the editor can render fields', () => {
    expect(descriptors).toBeDefined();
    expect(descriptors.length).toBeGreaterThan(0);
  });

  it('includes eyebrow, heading, intro, surface, and steps fields', () => {
    const keys = descriptors.map((d) => d.key);
    expect(keys).toEqual(
      expect.arrayContaining(['eyebrow', 'heading', 'intro', 'surface', 'steps']),
    );
  });

  it('steps is an object-list with number/title/body sub-fields', () => {
    const steps = findDescriptor(descriptors, 'steps');
    expect(steps?.type).toBe('object-list');
    expect(steps?.fields?.map((f) => f.key)).toEqual(['number', 'title', 'body']);
  });

  it('surface is a select with dark/light options', () => {
    const surface = findDescriptor(descriptors, 'surface');
    expect(surface?.type).toBe('select');
    expect(surface?.options).toEqual(['dark', 'light']);
  });
});

describe('system.cards-scroller.v1 descriptors', () => {
  const descriptors = MODULE_FIELD_DESCRIPTORS['system.cards-scroller.v1'];

  it('defines descriptors so the editor can render fields', () => {
    expect(descriptors).toBeDefined();
    expect(descriptors.length).toBeGreaterThan(0);
  });

  it('cards is an object-list with editable copy + image fields', () => {
    const cards = findDescriptor(descriptors, 'cards');
    expect(cards?.type).toBe('object-list');
    expect(
      cards?.fields?.map((f) => f.key),
    ).toEqual(
      expect.arrayContaining([
        'eyebrow',
        'headline',
        'description',
        'image',
        'imageAlt',
      ]),
    );
  });

  it('card image uses the media-library picker (image-url)', () => {
    const cards = findDescriptor(descriptors, 'cards');
    const image = cards?.fields?.find((f) => f.key === 'image');
    expect(image?.type).toBe('image-url');
  });
});

describe('grid.program-collections-rail.v1 authored cards descriptor', () => {
  const descriptors =
    PROGRAM_COLLECTIONS_RAIL_FIELD_DESCRIPTORS['grid.program-collections-rail.v1'];

  it('exposes a cards object-list group for authored mode', () => {
    const cards = findDescriptor(descriptors, 'cards');
    expect(cards?.type).toBe('object-list');
    expect(cards?.group).toBe('Authored cards');
  });

  it('authored card fields include priceLine, note, and showNote', () => {
    const cards = findDescriptor(descriptors, 'cards');
    const keys = cards?.fields?.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'title',
        'priceLine',
        'description',
        'image',
        'ctaLabel',
        'ctaHref',
        'showNote',
        'note',
      ]),
    );
  });

  it('keeps the resolver-era section fields intact', () => {
    const keys = descriptors.map((d) => d.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'heading',
        'intro',
        'collectionSlugs',
        'featuredCollectionSlug',
        'showFeaturedCta',
      ]),
    );
  });
});
