/**
 * Conditions of group 1 of the Gisa deck (issue 41, D-475): "a player was dealt combat damage by a Zombie this turn" (Lost Monarch of Ifnir), a test of the turn
 * that reads the log of the combat damage dealt to players (CR 120.2a, 510.2), with what the source was as it dealt the damage. Read after the "if" of an intervening
 * "if" (CR 603.4) like every condition.
 */
import { fail, map, pattern, sequence } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { BOUNDARY, permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/** The fields of a phrase of permanents that the turn log of combat damage keeps of the source (D-475). */
const KEPT_FIELDS: readonly string[] = ['types', 'subtypes', 'controller', 'raw', 'zone'];

/**
 * `condition.combat-damaged-by`: "a player was dealt combat damage by a Zombie this turn", "a player was dealt combat damage by a creature you control this turn"
 * (CR 120.2a, 510.2, 603.4: some combat damage a player was dealt this turn came from a source of the kind). The kind is a phrase of permanents (card types and
 * subtypes, and who controls it), read as the source was when it dealt the damage (it may have died since, CR 113.7a). The engine's `combatDamagedBy`. Not read: a
 * named player ("an opponent was dealt ..."), a count of damage, "by ~", a quality of the source that the log does not keep (tapped, a color, power), a plural source.
 */
export const CONDITION_COMBAT_DAMAGED_BY = defineRule<IrCondition>({
  id: 'condition.combat-damaged-by',
  family: 'condition',
  leading: ['a'],
  cites: [
    'CR 120.2a (Damage)',
    'CR 510.2 (Combat Damage Step)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 113.7a (Handling Triggered Abilities)',
  ],
  examples: [
    'a player was dealt combat damage by a Zombie this turn',
    'a player was dealt combat damage by a creature this turn',
    'a player was dealt combat damage by a creature you control this turn',
    'a player was dealt combat damage by an Elf you control this turn',
  ],
  rejects: [
    'a player was dealt combat damage by a Zombie',
    'a player was dealt combat damage by a Zombie this combat',
    'a player was dealt combat damage this turn',
    'a player was dealt damage by a Zombie this turn',
    'a player was dealt combat damage by Zombies this turn',
    'a player was dealt combat damage by ~ this turn',
    'a player was dealt combat damage by a tapped creature this turn',
    'a player was dealt combat damage by a white creature this turn',
    'a player was dealt combat damage by a creature with power 3 or greater this turn',
    'a player was dealt combat damage by a nontoken creature this turn',
    'an opponent was dealt combat damage by a Zombie this turn',
    'a player were dealt combat damage by a Zombie this turn',
    'a player was dealt combat damage by a Zombie this turn.',
    'a player was dealt combat damage by two Zombies this turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/a player was dealt combat damage by an? /iu),
      map(spanned(map(permanentPhrase(false, 'all'), withoutZone)), (p) => p),
      pattern(new RegExp(` this turn${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const phrase = r.value[1];
    // The turn log keeps the card types, the subtypes and the controller of the source; a quality it does not keep (tapped, a color, a power) is not read.
    if (Object.keys(phrase.value).some((k) => !KEPT_FIELDS.includes(k))) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: phrase.value,
      upTo: false,
      plural: false,
      other: false,
      span: phrase.span,
      rule: 'condition.combat-damaged-by',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'combatDamagedBy', noun },
        span: { start: pos, end: r.pos },
        rule: 'condition.combat-damaged-by',
      },
      pos: r.pos,
    };
  },
});

export const GISA_G1_CONDITION_RULES = [CONDITION_COMBAT_DAMAGED_BY];
