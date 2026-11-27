/**
 * Lowering of stage P42 (D-190): "gain control of target creature until end of turn" and the like (CR 613.1b, 611.2). The engine's `gainControl`, a
 * layer 2 effect of the controller of the ability for the one permanent the clause names, with the duration the clause states.
 */
import type { ControlDuration } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { objectSelectorOf, playerSelectorOf } from './nouns';
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
    case 'whileSelfRemains':
      return 'forAsLongAsThisRemains';
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
    if (duration === 'forAsLongAsThisRemains') {
      // CR 611.2b (issue 103): "for as long as ~ remains on the battlefield", the duration of an ability of a permanent.
      const blocked = missingFeatures(['duration:forAsLongAsThisRemains']);
      if (blocked.length > 0)
        return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    }
    const playerArg = clause.args.player;
    const player =
      playerArg === undefined
        ? undefined
        : playerArg.kind === 'noun'
          ? playerSelectorOf(playerArg, ctx)
          : failure(clause);
    if (player !== undefined && !player.ok) return player;
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'gainControl',
        objects,
        ...(player === undefined ? {} : { player: player.value }),
        duration,
      }),
      'objects',
      TRIGGER_SUBJECT,
    );
  },
};

/**
 * "You gain control of that creature for as long as it has a shield counter on it" (Shield Broker; CR 611.2b, 122.1, 613.1b): the engine's `gainControl` of the permanent an earlier
 * instruction named (a target), with `whileHasCounter`. The controller of the ability takes it.
 */
export const GAIN_CONTROL_WHILE_COUNTER: Lowering<IrClause, Effects> = {
  head: 'gainControlWhileCounter',
  id: 'lower.gain-control-while-counter',
  needs: ['effect:gainControl', 'duration:whileHasCounter'],
  lower(clause, ctx) {
    const subject = operand(clause, 'objects');
    const counter = arg(clause, 'counter');
    if (subject?.kind !== 'noun' || counter?.kind !== 'name') return failure(clause);
    const objects = objectSelectorOf(subject, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'gainControl',
          objects: objects.value,
          duration: 'permanent',
          whileHasCounter: counter.name,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You and that opponent each gain control of all creatures the other controls until end of turn." (CR 701.12a, 613.1b, 611.2a): the engine's `exchangeControlOfAll` for the group
 * and the other player the text named. "Those creatures" of a later sentence are the permanents exchanged, the engine's `moved` (`ctx.eachMentions`, CR 400.7j).
 */
export const EXCHANGE_CONTROL_OF_ALL: Lowering<IrClause, Effects> = {
  head: 'exchangeControlOfAll',
  id: 'lower.exchange-control-of-all',
  needs: ['effect:exchangeControlOfAll', 'selector:each', 'selector:moved'],
  takesDuration: true,
  lower(clause, ctx) {
    const duration = clause.duration?.scope;
    if (duration !== undefined && duration !== 'untilEndOfTurn') return failure(clause);
    const playerArg = clause.args.player;
    const objectsArg = clause.args.objects;
    if (playerArg?.kind !== 'noun' || objectsArg?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(playerArg, ctx);
    if (!player.ok) return player;
    const objects = objectSelectorOf(objectsArg, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'each') return failure(clause);
    // "Those creatures" of the sentences after this one: the permanents that were exchanged, not the group the filter names (it names other permanents once they have changed hands).
    if (objectsArg.ref !== undefined) ctx.eachMentions.set(objectsArg.ref, { kind: 'moved' });
    return {
      ok: true,
      value: [
        {
          kind: 'exchangeControlOfAll',
          objects: objects.value,
          player: player.value,
          duration: duration === undefined ? 'permanent' : 'untilEndOfTurn',
        },
      ],
      rule: clause.rule,
    };
  },
};
