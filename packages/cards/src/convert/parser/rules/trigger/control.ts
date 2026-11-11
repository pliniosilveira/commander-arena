/**
 * Trigger rules of stage P42 (D-190): the control-change slice of the Korvold deck. "An opponent taps an artifact for mana" (CR 106.12, 603.2): an
 * ordinary triggered ability that uses the stack, which is the other reading of tapping a permanent for mana than the triggered mana ability of
 * `trigger.tapped-for-mana` (CR 605.1b: one that adds mana).
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrTrigger } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.taps-for-mana`: "an opponent taps an artifact for mana", "a player taps a land for mana" (CR 106.12: tapping a permanent for mana is
 * activating a mana ability of it with {T} in its cost; CR 603.2: an ability that triggers when it happens; CR 605.1b: it is a mana ability only
 * when it adds mana, which this one does not). The player is relative to the controller of the ability, the permanent a plain "a/an" phrase with no
 * owner or controller (the one who taps it controls it). "You tap ... for mana" is `trigger.tapped-for-mana`, whose lowering takes the abilities that
 * add mana; the type of mana made ("for {C}") and several permanents are not read.
 */
export const TRIGGER_TAPS_FOR_MANA = defineRule<IrTrigger>({
  id: 'trigger.taps-for-mana',
  family: 'trigger',
  leading: ['an', 'a'],
  cites: [
    'CR 106.12 (Mana)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 605.1b (Mana Abilities)',
  ],
  examples: [
    'an opponent taps an artifact for mana',
    'an opponent taps a land for mana',
    'an opponent taps a creature for mana',
    'an opponent taps a permanent for mana',
    'a player taps an artifact for mana',
    'an opponent taps a Forest for mana',
  ],
  rejects: [
    'an opponent taps an artifact',
    'an opponent taps an artifact for {C}',
    'an opponent taps two artifacts for mana',
    'an opponent taps target artifact for mana',
    'an opponent taps an artifact an opponent controls for mana',
    'an opponent taps an artifact you control for mana',
    'an opponent taps an artifact for mana or',
    'an opponent taps an artifact for mana and',
    'an opponent tap an artifact for mana',
    'each opponent taps an artifact for mana',
    'you tap an artifact for mana',
    'an opponent untaps an artifact for mana',
    'an opponent taps an artifact or a land for mana',
  ],
  parse: (ctx, pos) => {
    const who = spanned(
      choice(
        map(pattern(/an opponent(?= taps )/iu), () => 'opponent' as const),
        map(pattern(/a player(?= taps )/iu), () => 'any' as const),
      ),
    )(ctx, pos);
    if (!who.ok) return who;
    const r = sequence(
      literal(' taps '),
      spanned(
        sequence(
          pattern(/an? /iu),
          satisfy(
            map(permanentPhrase(false, 'all'), withoutZone),
            (filter) => filter.controller === undefined && filter.anyOf === undefined,
          ),
        ),
      ),
      pattern(new RegExp(` for mana${NOT_IN_WORD}`, 'iu')),
    )(ctx, who.pos);
    if (!r.ok) return r;
    const [, tapped] = r.value;
    const kind = who.value.value;
    const actor: IrNoun = makeNoun(
      'trigger.taps-for-mana',
      who.value.span,
      kind === 'opponent' ? 'eachOpponent' : 'eachPlayer',
      { raw: kind === 'opponent' ? 'an opponent' : 'a player' },
    );
    const subject = makeNoun('trigger.taps-for-mana', tapped.span, 'a', tapped.value[1]);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'tapsForMana',
        actor,
        subject,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.taps-for-mana',
      },
      pos: r.pos,
    };
  },
});

export const CONTROL_TRIGGER_RULES = [TRIGGER_TAPS_FOR_MANA];
