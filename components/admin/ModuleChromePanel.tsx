/**
 * ModuleChromePanel
 *
 * Editor for a single module instance's optional SECTION CHROME — the wrapper
 * styling applied by ModuleRenderer (rounded top, vertical overlap, surface/
 * background, top/bottom borders + tone, optional text tone).
 *
 * Chrome is intentionally separate from module CONTENT (ModuleContentPanel):
 * content is per-type and validated by Zod content schemas; chrome is a shared,
 * instance-level concern with a fixed safe-token vocabulary
 * (lib/modules/sectionChrome.ts). This panel only ever emits enum/boolean
 * values — never raw class strings — so saved composition data stays safe.
 *
 * Backward compatible: when no chrome is set, ModuleRenderer keeps the
 * order-derived stacked defaults. "Clear" removes chrome entirely.
 */

import {
  MODULE_CHROME_SURFACES,
  MODULE_CHROME_BORDER_TONES,
  MODULE_CHROME_TEXT_TONES,
  type ModuleChrome,
} from '@/lib/modules/sectionChrome';

interface Props {
  chrome: ModuleChrome | undefined;
  onChange: (chrome: ModuleChrome | undefined) => void;
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

export function ModuleChromePanel({ chrome, onChange }: Props) {
  const c = chrome ?? {};

  const update = (patch: Partial<ModuleChrome>) => {
    onChange({ ...c, ...patch });
  };

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 border-b border-purple-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">
          Section style (chrome)
        </p>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs font-medium text-purple-500 hover:text-purple-700"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
        <Toggle
          label="Rounded top"
          hint="Round the top corners and clip the section."
          checked={Boolean(c.roundedTop)}
          onChange={(v) => update({ roundedTop: v })}
        />
        <Toggle
          label="Rounded bottom"
          hint="Round the bottom corners and clip the section."
          checked={Boolean(c.roundedBottom)}
          onChange={(v) => update({ roundedBottom: v })}
        />
        <Toggle
          label="Overlap previous"
          hint="Pull the section up to overlap the layer above."
          checked={Boolean(c.overlap)}
          onChange={(v) => update({ overlap: v })}
        />
        <Toggle
          label="Top border"
          checked={Boolean(c.topBorder)}
          onChange={(v) => update({ topBorder: v })}
        />
        <Toggle
          label="Bottom border"
          checked={Boolean(c.bottomBorder)}
          onChange={(v) => update({ bottomBorder: v })}
        />

        <label className="text-sm text-gray-700">
          <span className="font-medium">Surface / background</span>
          <select
            value={c.surface ?? 'none'}
            onChange={(e) =>
              update({ surface: e.target.value as ModuleChrome['surface'] })
            }
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {MODULE_CHROME_SURFACES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-700">
          <span className="font-medium">Border tone</span>
          <select
            value={c.borderTone ?? 'subtle'}
            onChange={(e) =>
              update({ borderTone: e.target.value as ModuleChrome['borderTone'] })
            }
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {MODULE_CHROME_BORDER_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-700">
          <span className="font-medium">Text tone</span>
          <select
            value={c.textTone ?? 'inherit'}
            onChange={(e) =>
              update({ textTone: e.target.value as ModuleChrome['textTone'] })
            }
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {MODULE_CHROME_TEXT_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="px-4 pb-3 text-[11px] text-purple-500">
        Safe presets only — no custom CSS. Saved with the composition draft.
      </p>
    </div>
  );
}
