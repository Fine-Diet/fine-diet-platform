/**
 * Guards the media-library picker wiring on module field descriptors.
 *
 * Image URL fields must use the `image-url` type (which renders the shared
 * ImageFieldWithPicker → ImagePickerModal), while CTA/page/link fields must
 * stay plain `url` inputs. This applies centrally to BOTH the Programs
 * Marketing and Integrative Care composition editors, since both render through
 * ModuleContentPanel → ModuleFieldEditor → MODULE_FIELD_DESCRIPTORS.
 */
import { MODULE_FIELD_DESCRIPTORS } from '../fieldDescriptors';
import type { FieldDescriptor } from '../fieldDescriptors';
import { START_RUNTIME_MODULE_TYPE_KEYS } from '@/lib/startPages/startRuntimeModules';

/** Flatten descriptors including nested object-list `fields` (slides/cards/repeaters). */
function flatten(descriptors: FieldDescriptor[]): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  for (const d of descriptors) {
    out.push(d);
    if (d.fields) out.push(...flatten(d.fields));
  }
  return out;
}

const ALL = Object.values(MODULE_FIELD_DESCRIPTORS).flatMap(flatten);

/** Keys that are image URLs and should use the media picker. */
const IMAGE_KEYS = ['imageDesktop', 'imageMobile', 'imageUrl', 'image'];

describe('media-library picker wiring (image-url field type)', () => {
  it('routes every image URL field through the media picker (image-url)', () => {
    const imageFields = ALL.filter((d) => IMAGE_KEYS.includes(d.key));
    expect(imageFields.length).toBeGreaterThan(0);
    const wrong = imageFields.filter((d) => d.type !== 'image-url');
    expect(wrong.map((d) => `${d.key}:${d.type}`)).toEqual([]);
  });

  it('covers nested object-list image fields (cards/slides/steps repeaters)', () => {
    // grid.cards + pricing.tiers card images and case-study/process step images
    // all live inside object-list fields and must still be image-url.
    const nestedImageTypes = new Set(
      Object.values(MODULE_FIELD_DESCRIPTORS)
        .flatMap((mod) => mod.filter((d) => d.type === 'object-list'))
        .flatMap((list) => flatten(list.fields ?? []))
        .filter((d) => IMAGE_KEYS.includes(d.key))
        .map((d) => d.type),
    );
    expect(Array.from(nestedImageTypes)).toEqual(['image-url']);
  });

  it('keeps CTA/page/link fields as plain url inputs (never image-url)', () => {
    const linkFields = ALL.filter((d) => d.key === 'href' || d.key.endsWith('Href'));
    expect(linkFields.length).toBeGreaterThan(0);
    for (const f of linkFields) {
      expect(f.type).toBe('url');
    }
  });

  it('only image keys were converted to the picker (no link/text leaked in)', () => {
    const pickerFields = ALL.filter((d) => d.type === 'image-url');
    const offenders = pickerFields.filter((d) => !IMAGE_KEYS.includes(d.key));
    expect(offenders.map((d) => d.key)).toEqual([]);
  });

  it('keeps structured background images as image-slot (storage format unchanged)', () => {
    const heroImages = MODULE_FIELD_DESCRIPTORS['hero.standard.v1'].find(
      (d) => d.key === 'images',
    );
    expect(heroImages?.type).toBe('image-slot');
  });
});

/**
 * Start Pages parity: every module type in the Start runtime allowlist renders
 * through the SAME ModuleContentPanel → ModuleFieldEditor → descriptors path as
 * the Programs / Integrative Care composition editors. So image-bearing fields
 * on Start-allowed modules must also route through the media picker
 * (image-url / image-slot), and link fields must stay `url`. This guards that
 * adding a module type to START_RUNTIME_MODULE_TYPE_KEYS cannot silently
 * introduce a plain-text image input on /admin/start-pages/[slug]/modules.
 */
describe('Start runtime module allowlist — media picker parity', () => {
  const IMAGE_TYPES = new Set(['image-url', 'image-slot']);

  it('every Start-allowed module type has a descriptor entry', () => {
    const missing = START_RUNTIME_MODULE_TYPE_KEYS.filter(
      (type) => !MODULE_FIELD_DESCRIPTORS[type],
    );
    expect(missing).toEqual([]);
  });

  it('image-bearing fields on Start-allowed modules use the media picker', () => {
    for (const type of START_RUNTIME_MODULE_TYPE_KEYS) {
      const descriptors = MODULE_FIELD_DESCRIPTORS[type];
      if (!descriptors) continue;
      const imageFields = flatten(descriptors).filter((d) =>
        IMAGE_KEYS.includes(d.key),
      );
      const wrong = imageFields.filter((d) => !IMAGE_TYPES.has(d.type));
      expect(wrong.map((d) => `${type}.${d.key}:${d.type}`)).toEqual([]);
    }
  });

  it('link fields on Start-allowed modules stay plain url inputs', () => {
    for (const type of START_RUNTIME_MODULE_TYPE_KEYS) {
      const descriptors = MODULE_FIELD_DESCRIPTORS[type];
      if (!descriptors) continue;
      const linkFields = flatten(descriptors).filter(
        (d) => d.key === 'href' || d.key.endsWith('Href'),
      );
      for (const f of linkFields) {
        expect(f.type).toBe('url');
      }
    }
  });
});
