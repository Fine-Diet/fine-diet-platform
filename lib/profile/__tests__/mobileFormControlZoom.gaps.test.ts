import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Mobile form control zoom gaps (Pass 4)', () => {
  const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

  it('uses text-xl on NutritionCaptureDraft search in compact and comfortable modes', () => {
    expect(capture).toContain("'h-9 py-0 pl-9 pr-2 text-xl'");
    expect(capture).toContain("'h-14 rounded-2xl py-0 pl-12 pr-4 text-xl'");
    expect(capture).not.toContain("'h-14 rounded-2xl py-0 pl-12 pr-4 text-base'");
  });

  it('uses text-xl on NutritionCaptureDraft manual component, quantity, and unit inputs', () => {
    expect(capture).toContain(
      "placeholder:text-white/35 text-xl`}",
    );
    expect(capture).toContain(
      "'w-12 rounded-full px-2 py-1 text-center text-xl'",
    );
    expect(capture).toContain(
      "'w-full rounded-xl px-3 py-2 text-xl'",
    );
    expect(capture).toContain(
      "'min-w-20 rounded-full px-3 py-1 text-center text-xl'",
    );
    expect(capture).toMatch(
      /<p className=\{`truncate font-medium text-white \$\{compact \? 'text-xl' : 'text-sm'\}`\}>/,
    );
  });

  it('uses text-xl on NutritionCaptureDraft optional meal name and prep notes', () => {
    expect(capture).toContain(
      'py-2.5 text-xl text-white outline-none focus:border-[#d7ecff]/50',
    );
    expect(capture).toContain(
      'resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xl text-white',
    );
    expect(capture).toContain('mb-1 block text-xs text-white/45">Meal name</span>');
    expect(capture).toContain('mb-1 block text-xs text-white/45">Prep notes</span>');
  });

  it('uses text-xl on LogNutritionDraftPage Meal Rhythm occasion select', () => {
    const draft = read('components/journal/log/LogNutritionDraftPage.tsx');
    expect(draft).toContain('className="bg-transparent text-xl text-white/35 outline-none"');
    expect(draft).not.toContain('className="bg-transparent text-[11px] text-white/35 outline-none"');
  });

  it('uses text-xl on GroceryPricingUi editable fields but not buttons or copy', () => {
    const pricing = read('components/grocery/GroceryPricingUi.tsx');
    expect(pricing).toContain(
      'px-3 py-2 text-xl text-white antialiased focus:outline-none focus:border-denim-400',
    );
    expect(pricing).not.toMatch(
      /<input[\s\S]{0,260}text-sm/,
    );
    expect(pricing).toContain('text-sm text-denim-100 hover:bg-denim-500/30');
    expect(pricing).toContain('text-[10px] text-white/40 antialiased">Retailer</span>');
  });

  it('uses text-xl on ProgramDeliveryExperience Start date input and keeps label typography', () => {
    const program = read('components/journal/programs/ProgramDeliveryExperience.tsx');
    expect(program).toContain(
      'className="mt-2 h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-xl font-normal"',
    );
    expect(program).toContain('<label className="mt-5 block text-sm font-semibold">');
  });

  it('uses text-xl on canonical barcode manual entry and programs baseline custom date', () => {
    const scanner = read('components/journal/BarcodeScanner.tsx');
    const baseline = read('components/programs/home/BaselineStartFlowPanel.tsx');
    expect(scanner).toContain('placeholder-brand-50/40 text-xl tracking-wider');
    expect(baseline).toContain('py-2 text-xl text-white');
    expect(baseline).toContain('block text-xs text-white/70">');
  });
});
