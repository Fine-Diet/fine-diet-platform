import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Food Home typography and width', () => {
  const surface = read('components/food/home/FoodHomeStatusSurface.tsx');
  const menu = read('components/food/home/RecipeEntryMenu.tsx');
  const stacked = read('components/layout/StackedPageSection.tsx');

  it('uses 950px structural widths on the hero and card grid', () => {
    expect(surface).toContain('mx-auto w-full max-w-[950px] text-center');
    expect(surface).toContain('grid w-full max-w-[950px] gap-3 sm:grid-cols-2');
    expect(surface).not.toContain('max-w-[404px]');
    expect(surface).not.toContain('max-w-[650px]');
  });

  it('sizes the hero eyebrow, headline, and description', () => {
    expect(surface).toContain('<FoodHomeViewSwitcher currentView="overview"');
    expect(surface).toContain('text-brand-50"');
    expect(surface).toContain('text-[2.5rem] font-normal');
    expect(surface).toContain('sm:text-[2.75rem]');
    expect(surface).toContain('text-sm font-normal text-white/30');
    expect(surface).not.toMatch(/Remain prepared[\s\S]{0,120}font-light/);
  });

  it('sizes status card titles, values, and CTAs', () => {
    expect(surface).toContain('text-2xl font-semibold text-brand-50">{title}</h2>');
    expect(surface).toContain('text-[2.5rem] font-normal leading-none text-white/50 sm:text-[2.75rem]');
    expect(surface).toContain('text-xl font-semibold text-brand-50');
    expect(surface).not.toContain('text-[28px]');
  });

  it('sizes the Recipes section locally to 950px without changing the shared default', () => {
    expect(surface).toContain('contentClassName="max-w-[950px]"');
    expect(surface).toContain('text-2xl font-semibold text-brand-50">Recipes</h2>');
    expect(surface).toContain('text-4xl font-normal leading-tight text-white/85');
    expect(stacked).toContain('max-w-[650px]');
  });

  it('uses regular weight on the primary recipe CTA', () => {
    expect(menu).toContain('text-sm font-normal text-white/45');
    expect(menu).toContain('text-lg font-normal">+</span>');
  });
});
