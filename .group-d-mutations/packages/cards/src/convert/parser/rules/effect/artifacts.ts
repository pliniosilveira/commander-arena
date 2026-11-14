/**
 * Effect rules of stage P31 (D-139, D-140): tapping a chosen number of one's own untapped permanents ("tap X untapped Myr you control",
 * CR 701.26a), the damage a creature deals to what it is attacking ("deals X damage to the player or planeswalker it's attacking", CR
 * 508.1b, 120.3) and reselecting what an attacker attacks ("reselect which player or permanent target attacking creature is attacking",
 * CR 508.7). Each says what the text says; what the engine can run is the lowering's business.
 */
import { choice, fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { DAMAGE_AMOUNT } from './bite';
import { type Clauses, single } from './operands';

/**
 * `effect.tap-chosen`: "tap X untapped Myr you control", "tap two untapped creatures you control", "tap an untapped artifact you control"
 * (stage P31, D-140, CR 701.26a: to tap; CR 608.2d: the player chooses which as the instruction runs; CR 302.6: summoning sickness does
 * not matter). The permanents are the player's own and untapped; "X" is the number the player chooses (any number, none to all), which
 * the instructions after it read as "X".
 */
export const EFFECT_TAP_CHOSEN = defineRule<Clauses>({
  id: 'effect.tap-chosen',
  family: 'effect',
  leading: ['tap'],
  cites: [
    'CR 701.26a (Tap and Untap)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 302.6 (Summoning Sickness)',
  ],
  examples: [
    'tap X untapped Myr you control',
    'tap X untapped creatures you control',
    'tap two untapped artifacts you control',
    'tap an untapped creature you control',
  ],
  rejects: [
    'tap X untapped Myr',
    'tap X Myr you control',
    'tap X untapped Myr an opponent controls',
    'tap X target creatures',
    'tap target creature',
    'tap one untapped creature you control',
  ],
  parse: single(
    'effect.tap-chosen',
    (ctx, pos) => {
      const head = sequence(
        literal('tap '),
        choice<{ count: IrAmount | null; plural: boolean }>(
          map(spanned(literal('X')), ({ span }) => ({
            count: { kind: 'x', span } as IrAmount,
            plural: true,
          })),
          map(spanned(satisfy(quantity, (n) => n >= 2)), ({ value, span }) => ({
            count: { kind: 'number', value, span } as IrAmount,
            plural: true,
          })),
          map(pattern(/an?(?= )/i), () => ({ count: null, plural: false })),
        ),
        literal(' untapped '),
      )(ctx, pos);
      if (!head.ok) return head;
      const { count, plural } = head.value[1];
      const phrase = spanned(
        satisfy(
          map(permanentPhrase(plural, 'all'), withoutZone),
          (filter) => filter.controller === 'you' && filter.anyOf === undefined,
        ),
      )(ctx, head.pos);
      if (!phrase.ok) return phrase;
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: phrase.value.value,
        upTo: false,
        plural,
        other: false,
        ...(count === null ? {} : { count }),
        ...(count?.kind === 'x' ? { anyNumber: true as const } : {}),
        span: phrase.value.span,
        rule: 'effect.tap-chosen',
      };
      return { ok: true, value: objects, pos: phrase.pos };
    },
    (objects) => ({ verb: 'tapChosen', args: { objects } }),
  ),
});

/**
 * `effect.untap-chosen`: "untap up to three lands" (stage P63, D-216, CR 701.26a: to untap; CR 608.2d: the player chooses which as the instruction
 * runs, none up to the count). Not a target, so any tapped permanent of the kind qualifies, whoever controls it ("you control" narrows it).
 */
export const EFFECT_UNTAP_CHOSEN = defineRule<Clauses>({
  id: 'effect.untap-chosen',
  family: 'effect',
  leading: ['untap'],
  cites: ['CR 701.26a (Tap and Untap)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'untap up to three lands',
    'untap up to two lands you control',
    'untap up to 2 artifacts',
  ],
  rejects: [
    'untap up to three target lands',
    'untap three lands',
    'untap up to one lands',
    'untap up to three tapped lands',
    'untap all lands you control',
    'untap target land',
  ],
  parse: single(
    'effect.untap-chosen',
    (ctx, pos) => {
      const head = sequence(
        literal('untap up to '),
        satisfy(quantity, (n) => n >= 2),
        literal(' '),
      )(ctx, pos);
      if (!head.ok) return head;
      const count = head.value[1];
      const phrase = spanned(map(permanentPhrase(true, 'all'), withoutZone))(ctx, head.pos);
      if (!phrase.ok) return phrase;
      if (phrase.value.value.anyOf !== undefined || phrase.value.value.tapped !== undefined) {
        return fail(ctx, pos);
      }
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: phrase.value.value,
        upTo: true,
        plural: true,
        other: false,
        count: { kind: 'number', value: count, span: { start: pos, end: head.pos } },
        span: phrase.value.span,
        rule: 'effect.untap-chosen',
      };
      return { ok: true, value: objects, pos: phrase.pos };
    },
    (objects) => ({ verb: 'untapChosen', args: { objects } }),
  ),
});

/**
 * `effect.untap-those`: "untap those creatures" (stage P64, D-217, CR 701.26a, 611.2c): the creatures the instruction before it gave something ("creatures you
 * control get +1/+1 until end of turn. Untap those creatures."). The group is the one that instruction named as it resolved; the lowering reads it from that
 * instruction and refuses the sentence after any other.
 */
export const EFFECT_UNTAP_THOSE = defineRule<Clauses>({
  id: 'effect.untap-those',
  family: 'effect',
  leading: ['untap'],
  cites: ['CR 701.26a (Tap and Untap)', 'CR 611.2c (Continuous Effects)'],
  examples: ['untap those creatures'],
  rejects: [
    'untap those',
    'untap those lands',
    'untap them',
    'untap those creature',
    'untap those creatures you control',
  ],
  parse: single('effect.untap-those', literal('untap those creatures'), () => ({
    verb: 'untapThose',
    args: {},
  })),
});

/**
 * `effect.deals-damage-and`: "deals X damage to the player or planeswalker it's attacking" with no subject of its own, as the second
 * instruction of "~ gets +X/+0 until end of turn and deals X damage to ..." (stage P31, D-140, CR 120.3): the subject of the instruction
 * before it deals the damage. The lowering reads it only after an instruction about `~` in the same sentence.
 */
export const EFFECT_DEALS_DAMAGE_AND = defineRule<Clauses>({
  id: 'effect.deals-damage-and',
  family: 'effect',
  leading: ['deals'],
  cites: ['CR 120.3 (Damage)', 'CR 508.1b (Declare Attackers Step)'],
  examples: [
    "deals X damage to the player or planeswalker it's attacking",
    "deals 2 damage to the player or planeswalker it's attacking",
  ],
  rejects: ['deals X damage', "deal X damage to the player or planeswalker it's attacking"],
  parse: single(
    'effect.deals-damage-and',
    sequence(
      literal('deals '),
      DAMAGE_AMOUNT,
      literal(' to '),
      family<IrNoun>('noun', { only: ['noun.attacked-by-it'] }),
    ),
    ([, amount, , to]) => ({
      verb: 'dealDamage',
      args: {
        amount,
        to,
        elliptical: {
          kind: 'flag',
          value: true,
          span: to.span,
          rule: 'effect.deals-damage-and',
        },
      },
    }),
  ),
});

/**
 * `effect.reselect-attack`: "reselect which player or permanent target attacking creature is attacking" (stage P31, D-140, CR 508.7: an
 * effect may let a player choose again what an attacking creature attacks, among the players, planeswalkers and battles it could have
 * attacked). The creature is a target.
 */
export const EFFECT_RESELECT_ATTACK = defineRule<Clauses>({
  id: 'effect.reselect-attack',
  family: 'effect',
  leading: ['reselect'],
  cites: ['CR 508.7 (Declare Attackers Step)', 'CR 508.7c (Declare Attackers Step)'],
  examples: ['reselect which player or permanent target attacking creature is attacking'],
  rejects: [
    'reselect which player target attacking creature is attacking',
    'reselect which player or permanent target creature is attacking',
    'reselect which player or permanent each attacking creature is attacking',
  ],
  parse: single(
    'effect.reselect-attack',
    sequence(
      literal('reselect which player or permanent '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (noun) => noun.filter.attacking === true && !noun.plural && !noun.upTo,
      ),
      literal(' is attacking'),
    ),
    ([, objects]) => ({ verb: 'reselectAttack', args: { objects } }),
  ),
});

export const ARTIFACT_EFFECT_RULES = [
  EFFECT_TAP_CHOSEN,
  EFFECT_UNTAP_CHOSEN,
  EFFECT_UNTAP_THOSE,
  EFFECT_DEALS_DAMAGE_AND,
  EFFECT_RESELECT_ATTACK,
];
