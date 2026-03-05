import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { getJournalPageContent } from '@/lib/contentApi';
import { JournalPageContent } from '@/lib/contentTypes';
import { ImageFieldWithPicker } from '@/components/admin/ImageFieldWithPicker';

const TILE_DEFS: { id: string; label: string }[] = [
  { id: 'hydration', label: 'Hydration' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'mood', label: 'Mood' },
  { id: 'bowel', label: 'Bowel' },
  { id: 'movement', label: 'Movement' },
  { id: 'cycle', label: 'Cycle' },
];

interface JournalEditorProps {
  user: AuthenticatedUser;
  initialContent: JournalPageContent;
}

export default function JournalEditor({ user, initialContent }: JournalEditorProps) {
  const [formState, setFormState] = useState<JournalPageContent>(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateHeroImage = (field: 'desktop' | 'mobile', value: string) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        images: { ...prev.hero.images, [field]: value },
      },
    }));
  };

  const updateTileImage = (tileId: string, value: string) => {
    setFormState((prev) => ({
      ...prev,
      summaryTiles: {
        ...prev.summaryTiles,
        [tileId]: { image: value },
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Journal content saved successfully!' });
      } else {
        setSaveMessage({ type: 'error', text: data.error || 'Failed to save journal content' });
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Edit Journal Content · Admin · Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Edit Journal Content</h1>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Journal Content'}
              </button>
            </div>
            {saveMessage && (
              <div className={`p-3 rounded-md mb-4 ${saveMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {saveMessage.text}
              </div>
            )}
          </div>

          {/* Hero Images */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Journal Hero Background</h2>
            <p className="text-sm text-gray-500 mb-4">Full-bleed hero image behind the date nav, score gauge, and meal blocks. Blurred at 8px, overlaid with gradient.</p>
            <div className="space-y-4">
              <ImageFieldWithPicker
                value={formState.hero.images.desktop}
                onChange={(url) => updateHeroImage('desktop', url)}
                label="Desktop Image"
                spec="1440×900 px · 16:10 · JPG · ≤ 300 KB"
                placeholder="/images/home/hero-desktop.jpg"
              />
              <div>
                <ImageFieldWithPicker
                  value={formState.hero.images.mobile}
                  onChange={(url) => updateHeroImage('mobile', url)}
                  label="Mobile Image"
                  spec="750×1334 px · 9:16 · JPG · ≤ 200 KB"
                  placeholder="/images/home/hero-mobile.jpg"
                />
                {formState.hero.images.desktop && (
                  <button
                    type="button"
                    onClick={() => updateHeroImage('mobile', formState.hero.images.desktop)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Copy desktop to mobile
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Summary Tile Images */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Daily Summary Tile Images</h2>
            <p className="text-sm text-gray-500 mb-4">Background images for the Grid Section App tiles on the journal day page. One image per tile, full-width with gradient overlay.</p>
            <div className="space-y-4">
              {TILE_DEFS.map((tile) => (
                <ImageFieldWithPicker
                  key={tile.id}
                  value={formState.summaryTiles[tile.id]?.image ?? ''}
                  onChange={(url) => updateTileImage(tile.id, url)}
                  label={tile.label}
                  spec="1200×400 px · 3:1 · JPG · ≤ 150 KB"
                  placeholder={`/images/journal/${tile.id}.jpg`}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<JournalEditorProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return { redirect: { destination: '/login?redirect=/admin/journal', permanent: false } };
  }

  if (user.role !== 'admin') {
    return { redirect: { destination: '/admin/unauthorized', permanent: false } };
  }

  const journalContent = await getJournalPageContent();

  return { props: { user, initialContent: journalContent } };
};
