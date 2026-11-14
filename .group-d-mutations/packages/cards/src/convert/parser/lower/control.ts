/**
 * Lowering of stage P42 (D-190): "gain control of target creature until end of turn" and the like (CR 613.1b, 611.2). The engine's `gainControl`, a
 * layer 2 effect of the controller of the ability for the one permanent the clause names, with the duration the clause states.
 */
import type { ControlDuration } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

/** "It" or "that artifact" may be the permanent whose event caused the trigger (D-133). */
const TRIGGER_SUBJECT = { triggerSubject: true } as const;

/** The engine's duration for what the clause says: none is no duration (CR 611.2a). */
function durationOf(clause: IrClause): ControlDuration | null {
  switch (clause.duration?.scope) {
    case undefined:
      return 'permanent';
    case 'untilEndOfTurn':
      return 'untilEndOfTurn';
    case 'untilEndOfNextTurn':
      return 'untilEndOfYourNextTurn';
    case 'whileYouControlSelf':
      return 'forAsLongAsYouControlThis';
    default:
      return null;
  }
}

export const GAIN_CONTROL: Lowering<IrClause, Effects> = {
  head: 'gainControl',
  id: 'lower.gain-control',
  needs: ['effect:gainControl'],
  takesDuration: true,
  lower(clause, ctx) {
    const duration = durationOf(clause);
    if (duration === null) return failure(clause);
    return eachObject(
      clause,
      ctx,
      (objects) => ({ kind: 'gainControl', objects, duration }),
      'objects',
      TRIGGER_SUBJECT,
    );
  },
};
