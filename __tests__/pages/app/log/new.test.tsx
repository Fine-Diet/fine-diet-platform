import { useRouter } from 'next/router';
import NewLogRoute from '@/pages/app/log/new';
import FoodDraftPage from '@/components/journal/log/LogNutritionDraftPage';
import { LogEntryCapturePage } from '@/components/journal/log/LogEntryCapturePage';
import { LOG_CAPTURE_FORMS } from '@/components/journal/log/LogEntryCapturePage';
import {
  BloodPressureForm,
  BowelForm,
  CycleForm,
  MoodForm,
  MovementForm,
  SleepForm,
  SupplementForm,
  WaterForm,
} from '@/components/journal/LogEntryForms';

jest.mock('next/router', () => ({ useRouter: jest.fn() }));
jest.mock('@/components/journal/log/LogNutritionDraftPage', () => ({ __esModule: true, default: () => null }));

describe('canonical New Log route dispatch', () => {
  it('waits for router hydration before selecting the Food draft route', () => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: false, query: {} });
    const result = NewLogRoute();
    expect(result.type).not.toBe(FoodDraftPage);
    expect(result.props['aria-live']).toBe('polite');
  });

  it.each([undefined, 'food'])('preserves the existing Nutrition draft for tab=%s', (tab) => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: tab ? { tab } : {} });
    const result = NewLogRoute();
    expect(result.type).toBe(FoodDraftPage);
  });

  it.each(['water', 'sleep', 'supplements', 'mood', 'bowel', 'cycle', 'movement', 'blood_pressure'])(
    'routes supported %s capture to the non-food capture page',
    (tab) => {
      (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { tab } });
      const result = NewLogRoute();
      expect(result.type).toBe(LogEntryCapturePage);
      expect(result.props).toEqual({ tab });
    },
  );

  it.each(['glucose', 'temperature', 'weight', 'unknown'])(
    'keeps unsupported %s off the Food draft route',
    (tab) => {
      (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { tab } });
      const result = NewLogRoute();
      expect(result.type).toBe(LogEntryCapturePage);
      expect(result.props).toEqual({ tab });
    },
  );

  it('fails closed for malformed duplicate tab query values', () => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { tab: ['water', 'mood'] } });
    const result = NewLogRoute();
    expect(result.type).toBe(LogEntryCapturePage);
    expect(result.props).toEqual({ tab: '' });
  });

  it('remounts capture state when the selected tracker route changes', () => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { tab: 'water', date: '2026-10-20' } });
    const water = NewLogRoute();
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { tab: 'sleep' } });
    const sleep = NewLogRoute();
    expect(water.key).not.toBe(sleep.key);
  });

  it('maps every supported capture tab to its existing form component', () => {
    expect(LOG_CAPTURE_FORMS).toEqual({
      water: WaterForm,
      sleep: SleepForm,
      supplements: SupplementForm,
      mood: MoodForm,
      bowel: BowelForm,
      cycle: CycleForm,
      movement: MovementForm,
      blood_pressure: BloodPressureForm,
    });
  });
});
