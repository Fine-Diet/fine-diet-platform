/**
 * POST /api/journal/decision-events
 *
 * Packet 1–10 instrumentation. Writes structured Plans NBA, Meal Rhythm,
 * Meal Creation, Plan Today, Pantry Quick Start, Plan Week, Plan Structure,
 * Plan Repeat, Plan Grocery Handoff, and Grocery List Readiness events to
 * existing people_events (event_type `other`) without schema changes.
 *
 * Body: PlansDecisionEvent | MealRhythmDecisionEvent | MealCreationDecisionEvent
 * | PlanTodayDecisionEvent | PantryQuickStartDecisionEvent | PlanWeekDecisionEvent
 * | PlanStructureDecisionEvent | PlanRepeatDecisionEvent
 * | PlanGroceryHandoffDecisionEvent | GroceryListReadinessDecisionEvent
 * | GroceryHaulDecisionEvent
 * (identifiers only; meal/health/food/grocery-item free text is not persisted).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { logEvent } from '@/lib/peopleService';
import {
  DECISION_EVENT_CHANNEL,
  DECISION_EVENT_SOURCE,
  PEOPLE_EVENTS_COMPAT_TYPE,
  parsePlansDecisionEvent,
  toPeopleEventMetadata,
} from '@/lib/plans/decisioning/events';
import {
  MEAL_RHYTHM_EVENT_SOURCE,
  parseMealRhythmDecisionEvent,
  toMealRhythmEventMetadata,
} from '@/lib/plans/mealRhythm/events';
import {
  MEAL_CREATION_EVENT_SOURCE,
  parseMealCreationDecisionEvent,
  toMealCreationEventMetadata,
} from '@/lib/plans/mealCreation/events';
import {
  PLAN_TODAY_EVENT_SOURCE,
  parsePlanTodayDecisionEvent,
  toPlanTodayEventMetadata,
} from '@/lib/plans/planToday/events';
import {
  PANTRY_QUICK_START_EVENT_SOURCE,
  parsePantryQuickStartDecisionEvent,
  toPantryQuickStartEventMetadata,
} from '@/lib/plans/pantryQuickStart/events';
import {
  PLAN_WEEK_EVENT_SOURCE,
  parsePlanWeekDecisionEvent,
  toPlanWeekEventMetadata,
} from '@/lib/plans/planWeek/events';
import {
  PLAN_STRUCTURE_EVENT_SOURCE,
  parsePlanStructureDecisionEvent,
  toPlanStructureEventMetadata,
} from '@/lib/plans/planStructure/events';
import {
  PLAN_REPEAT_EVENT_SOURCE,
  parsePlanRepeatDecisionEvent,
  toPlanRepeatEventMetadata,
} from '@/lib/plans/planRepeat/events';
import {
  PLAN_GROCERY_HANDOFF_EVENT_SOURCE,
  parsePlanGroceryHandoffDecisionEvent,
  toPlanGroceryHandoffEventMetadata,
} from '@/lib/plans/planGroceryHandoff/events';
import {
  GROCERY_LIST_READINESS_EVENT_SOURCE,
  parseGroceryListReadinessDecisionEvent,
  toGroceryListReadinessEventMetadata,
} from '@/lib/plans/groceryListReadiness/events';
import {
  GROCERY_HAUL_EVENT_SOURCE,
  parseGroceryHaulDecisionEvent,
  toGroceryHaulEventMetadata,
} from '@/lib/plans/groceryHaul/events';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;

    const nbaEvent = parsePlansDecisionEvent(req.body);
    if (nbaEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: DECISION_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toPeopleEventMetadata(nbaEvent),
      });
      return res.status(204).end();
    }

    const rhythmEvent = parseMealRhythmDecisionEvent(req.body);
    if (rhythmEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: MEAL_RHYTHM_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toMealRhythmEventMetadata(rhythmEvent),
      });
      return res.status(204).end();
    }

    const creationEvent = parseMealCreationDecisionEvent(req.body);
    if (creationEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: MEAL_CREATION_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toMealCreationEventMetadata(creationEvent),
      });
      return res.status(204).end();
    }

    const planTodayEvent = parsePlanTodayDecisionEvent(req.body);
    if (planTodayEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: PLAN_TODAY_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toPlanTodayEventMetadata(planTodayEvent),
      });
      return res.status(204).end();
    }

    const pantryQuickStartEvent = parsePantryQuickStartDecisionEvent(req.body);
    if (pantryQuickStartEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: PANTRY_QUICK_START_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toPantryQuickStartEventMetadata(pantryQuickStartEvent),
      });
      return res.status(204).end();
    }

    const planWeekEvent = parsePlanWeekDecisionEvent(req.body);
    if (planWeekEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: PLAN_WEEK_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toPlanWeekEventMetadata(planWeekEvent),
      });
      return res.status(204).end();
    }

    const planStructureEvent = parsePlanStructureDecisionEvent(req.body);
    if (planStructureEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: PLAN_STRUCTURE_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toPlanStructureEventMetadata(planStructureEvent),
      });
      return res.status(204).end();
    }

    const planRepeatEvent = parsePlanRepeatDecisionEvent(req.body);
    if (planRepeatEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: PLAN_REPEAT_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toPlanRepeatEventMetadata(planRepeatEvent),
      });
      return res.status(204).end();
    }

    const groceryHandoffEvent = parsePlanGroceryHandoffDecisionEvent(req.body);
    if (groceryHandoffEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: PLAN_GROCERY_HANDOFF_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toPlanGroceryHandoffEventMetadata(groceryHandoffEvent),
      });
      return res.status(204).end();
    }

    const groceryListReadinessEvent = parseGroceryListReadinessDecisionEvent(req.body);
    if (groceryListReadinessEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: GROCERY_LIST_READINESS_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toGroceryListReadinessEventMetadata(groceryListReadinessEvent),
      });
      return res.status(204).end();
    }

    const groceryHaulEvent = parseGroceryHaulDecisionEvent(req.body);
    if (groceryHaulEvent) {
      await logEvent({
        personId: ctx.personId,
        eventType: PEOPLE_EVENTS_COMPAT_TYPE,
        source: GROCERY_HAUL_EVENT_SOURCE,
        channel: DECISION_EVENT_CHANNEL,
        metadata: toGroceryHaulEventMetadata(groceryHaulEvent),
      });
      return res.status(204).end();
    }

    return res.status(400).json({ error: 'Invalid decision event payload.' });
  } catch (err) {
    console.error('[API /journal/decision-events] error:', err);
    return res.status(204).end();
  }
}
