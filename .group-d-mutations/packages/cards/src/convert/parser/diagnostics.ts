import type { UnparsedAbility } from '../../types';
import { templateOf } from '../template';
import type { LineFailure } from './compile';

/**
 * The diagnostic of one dropped ability (D-064): the schema 1 fields (`face`, `ability`, `text`,
 * `stoppedAt`, `closestRule`) and the v2 ones, set only when they have something to say.
 */
export function unparsedAbility(
  face: number,
  ability: number,
  text: string,
  failure: LineFailure,
): UnparsedAbility {
  return {
    face,
    ability,
    text,
    stoppedAt: failure.stoppedAt,
    closestRule: failure.closestRule,
    reason: failure.reason,
    ...(failure.slot === undefined ? {} : { slot: failure.slot }),
    ...(failure.recognised.length > 0 ? { recognised: [...failure.recognised] } : {}),
    ...(failure.needs === undefined ? {} : { needs: [...failure.needs] }),
    ...(failure.reference === undefined ? {} : { reference: failure.reference }),
    template: templateOf(text),
  };
}
