/**
 * Static ability rule of the Miracle Worker deck (issue 109, Fear of Sleep Paralysis): "Stun counters can't be removed from permanents your opponents control." (CR 122.1d, 701.26b).
 * It is one whole line, whose subject is a group of permanents; the engine's `cantRemoveCounters` reads the group as the counters are about to come off.
 */
import { fail, literal, pattern } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';
import { staticOf } from './angels-words';

/**
 * `static.stun-counters-cant-be-removed`: "Stun counters can't be removed from permanents your opponents control." (CR 122.1d: stun counters stop a permanent untapping by being removed
 * instead; the ability keeps them on the group of permanents it names, so those stay tapped; CR 604.1: a static ability of the permanent). The group is a plural type phrase with its
 * controller ("permanents your opponents control", "creatures you control"). Not read: another kind of counter, "all counters", a group with no controller, "target", a duration, a
 * condition, another sentence.
 */
export const STATIC_STUN_COUNTERS_CANT_BE_REMOVED = defineRule<IrStatic>({
  id: 'static.stun-counters-cant-be-removed',
  family: 'static',
  leading: ['stun'],
  cites: [
    'CR 122.1d (Counters)',
    'CR 701.26b (Tap and Untap)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "Stun counters can't be removed from permanents your opponents control.",
    'Stun counters can’t be removed from permanents your opponents control.',
    "Stun counters can't be removed from creatures your opponents control.",
    "Stun counters can't be removed from permanents you control.",
  ],
  rejects: [
    "Stun counters can't be removed from permanents your opponents control",
    "Stun counters can't be removed from permanents.",
    "Stun counters can't be removed from target permanent.",
    "Stun counters can't be put on permanents your opponents control.",
    "Counters can't be removed from permanents your opponents control.",
    "Stun counters can't be removed from permanents your opponents control until end of turn.",
    "Stun counters can't be removed from permanents your opponents control. Draw a card.",
    "Stun counters can't be removed from each permanent your opponents control.",
    "Stun counters can't be removed from permanents your opponents control and you gain 1 life.",
  ],
  parse: (ctx, pos) => {
    const head = pattern(/stun counters can['’]t be removed from /iu)(ctx, pos);
    if (!head.ok) return head;
    const group = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, head.pos);
    if (!group.ok) return group;
    // The group must name who controls it: with no controller the line would cover every permanent, which no card says.
    if (group.value.filter.controller === undefined) return fail(ctx, group.pos);
    const end = literal('.')(ctx, group.pos);
    if (!end.ok) return end;
    return {
      ok: true,
      value: staticOf(
        'static.stun-counters-cant-be-removed',
        group.value,
        [{ kind: 'cantRemoveCounters', counter: 'stun' }],
        pos,
        end.pos,
      ),
      pos: end.pos,
    };
  },
});

export const STUN_LOCK_STATIC_RULES = [STATIC_STUN_COUNTERS_CANT_BE_REMOVED];
