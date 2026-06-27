/**
 * P1a — generic check-in payload builder.
 *
 * Reproduces the former BaselineCheckinPanel `toPayload` behavior, driven by the
 * resolved question set instead of a hardcoded field list:
 *   - number  → '' becomes null, otherwise Number(value)
 *   - string_array → '' or the question's `noneValue` becomes [], otherwise [value]
 *   - string  → '' becomes null, otherwise the value
 */

import type { CheckinQuestion } from './checkinQuestionTypes';

export type CheckinResponses = Record<string, string>;

export function buildCheckinPayload(
  questions: CheckinQuestion[],
  responses: CheckinResponses,
): Record<string, unknown> {
  return questions.reduce<Record<string, unknown>>((payload, question) => {
    const raw = responses[question.key] ?? '';
    if (question.valueType === 'number') {
      payload[question.key] = raw === '' ? null : Number(raw);
    } else if (question.valueType === 'string_array') {
      const isNone =
        raw === '' ||
        (question.noneValue != null && raw === question.noneValue);
      payload[question.key] = isNone ? [] : [raw];
    } else {
      payload[question.key] = raw === '' ? null : raw;
    }
    return payload;
  }, {});
}
