/**
 * Effect rules of group C of the Counter Blitz deck (Saga creatures, modal and choice text):
 *
 * - `effect.creatures-cant-attack-you-unless-pay`: "Until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures." (Summon: Yojimbo).
 * - `effect.put-two-kinds-from-hand`: "You may put a creature card and/or a land card from your hand onto the battlefield." (Yuna's Decision).
 * - `effect.each-opponent-chooses-return`: "Each opponent chooses a creature with the greatest mana value among creatures they control. Return those creatures to their owners' hands." (Summon: Valefor).
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrCost, IrDuration, IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const END = '(?![\\p{L}\\p{N}])';

/**
 * `effect.creatures-cant-attack-you-unless-pay`: "until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures" (CR 508.1d: a player is
 * never required to pay a cost to attack; CR 508.1h: the total cost is the sum of the costs of each attacker; CR 611.2a, 611.2c: the effect of a spell or ability lasts for its duration and
 * reaches creatures that arrive later; CR 500.1: "your next turn" begins after the turn it resolves in). The engine's `creaturesCantAttackYou` of all creatures with a `tax`. Not read: another
 * duration, a group (a controller, a type, "other"), "or planeswalkers you control", a cost that is not mana, "for each creature they control that's attacking you" (the static wording of a
 * permanent), another verb.
 */
export const EFFECT_CREATURES_CANT_ATTACK_YOU_UNLESS_PAY = defineRule<Clauses>({
  id: 'effect.creatures-cant-attack-you-unless-pay',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 508.1a (Declare Attackers Step)',
    'CR 508.1d (Declare Attackers Step)',
    'CR 508.1h (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    "until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures",
    "Until your next turn, creatures can't attack you unless their controller pays {1} for each of those creatures",
    'until your next turn, creatures can’t attack you unless their controller pays {2} for each of those creatures',
  ],
  rejects: [
    "creatures can't attack you unless their controller pays {2} for each of those creatures",
    "until end of turn, creatures can't attack you unless their controller pays {2} for each of those creatures",
    "until your next turn, creatures can't attack you unless their controller pays {2}",
    "until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures.",
    "until your next turn, creatures can't attack you or planeswalkers you control unless their controller pays {2} for each of those creatures",
    "until your next turn, creatures your opponents control can't attack you unless their controller pays {2} for each of those creatures",
    "until your next turn, creatures can't attack you unless their controller pays {X} for each of those creatures",
    "until your next turn, creatures can't attack you unless their controller pays 2 life for each of those creatures",
    "until your next turn, creatures can't attack you unless you pay {2} for each of those creatures",
    "until your next turn, creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you",
    "until your next turn, creatures can't attack you",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.creatures-cant-attack-you-unless-pay';
    const lead = pattern(/until your next turn, /iu)(ctx, pos);
    if (!lead.ok) return lead;
    const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, lead.pos);
    if (!subject.ok) return subject;
    const noun = subject.value;
    // "Creatures" and nothing else about them (as `effect.creatures-cant-attack-you` reads them).
    const f = noun.filter;
    const onlyCreatures =
      noun.plural &&
      noun.det === 'each' &&
      !noun.other &&
      f.anyOf === undefined &&
      f.subtypes === undefined &&
      f.controller === undefined &&
      f.types?.length === 1 &&
      f.types[0] === 'creature';
    if (!onlyCreatures) return fail(ctx, lead.pos);
    const r = sequence(
      pattern(/\s+can['’]t attack you unless their controller pays /iu),
      spanned(family<IrCost>('cost', { only: ['cost.mana'] })),
      pattern(new RegExp(` for each of those creatures${END}`, 'iu')),
    )(ctx, subject.pos);
    if (!r.ok) return r;
    const { value: cost } = r.value[1];
    const span = { start: pos, end: r.pos };
    const duration: IrDuration = { kind: 'duration', scope: 'untilYourNextTurn', span, rule: id };
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            id,
            'creaturesCantAttackYouUnlessPay',
            { objects: noun, cost: { kind: 'costList', costs: [cost], span, rule: id } },
            span,
          ),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

const KINDS = 'creature|artifact|enchantment|land|planeswalker|permanent';

/**
 * `effect.each-opponent-chooses-return`: "each opponent chooses a creature with the greatest mana value among creatures they control. Return those creatures to their owners' hands" (CR 608.2d,
 * 101.4: each opponent chooses among the permanents they control, in turn order; CR 603.10a: what is returned together; CR 400.3: a card goes to its owner's hand). Two sentences that
 * `splitSentences` keeps together (`segment-counter-blitz-c.ts`). The engine's `moveToZone` to the hand of a `choose` with `player` each opponent, with `greatest` or `least` of a stat when the
 * choice says so. Not read: another group ("each player", "target opponent"), another number or kind of choice, an option ("may"), another verb or place, a kind of the second sentence that is not
 * the first's, "they control" missing from the first, a trailing clause.
 */
export const EFFECT_EACH_OPPONENT_CHOOSES_RETURN = defineRule<Clauses>({
  id: 'effect.each-opponent-chooses-return',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 400.3 (General)',
  ],
  examples: [
    "each opponent chooses a creature with the greatest mana value among creatures they control. Return those creatures to their owners' hands",
    'each opponent chooses a creature with the greatest power among creatures they control. Return those creatures to their owners’ hands',
    "each opponent chooses a creature with the least toughness among creatures they control. Return those creatures to their owners' hands",
    "each opponent chooses a creature they control. Return those creatures to their owners' hands",
    "each opponent chooses a permanent they control. Return those permanents to their owners' hands",
  ],
  rejects: [
    'each opponent chooses a creature with the greatest mana value among creatures they control',
    "each opponent chooses a creature with the greatest mana value among creatures they control. Return those creatures to their owners' hands.",
    "each player chooses a creature they control. Return those creatures to their owners' hands",
    "each opponent may choose a creature they control. Return those creatures to their owners' hands",
    "each opponent chooses two creatures they control. Return those creatures to their owners' hands",
    "each opponent chooses a creature they control. Return those artifacts to their owners' hands",
    "each opponent chooses a creature with the greatest mana value among creatures you control. Return those creatures to their owners' hands",
    "each opponent chooses a creature with the greatest mana value among artifacts they control. Return those creatures to their owners' hands",
    'each opponent chooses a creature they control. Exile those creatures',
    'each opponent chooses a creature they control. Return those creatures to your hand',
    "each opponent chooses a creature with the highest mana value among creatures they control. Return those creatures to their owners' hands",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.each-opponent-chooses-return';
    const r = pattern(
      new RegExp(
        `each opponent chooses an? (${KINDS})(?: with the (greatest|least) (power|toughness|mana value) among (${KINDS})s they control| they control)\\. return those (${KINDS})s to their owners['’] hands${END}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, kind, extreme, stat, among, again] = r.value;
    if (kind === undefined || again?.toLowerCase() !== kind.toLowerCase()) return fail(ctx, pos);
    if (extreme !== undefined && among?.toLowerCase() !== kind.toLowerCase()) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    const name = (value: string) => ({
      kind: 'name' as const,
      name: value.toLowerCase(),
      span,
      rule: id,
    });
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'eachOpponentChoosesReturn',
          {
            what: name(kind),
            ...(extreme === undefined || stat === undefined
              ? {}
              : { extreme: name(extreme), stat: name(stat) }),
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const PUT_TWO_KINDS_ID = 'effect.put-two-kinds-from-hand';
const HAND_KINDS = 'creature|land|artifact|enchantment|planeswalker|battle';

/**
 * `effect.put-two-kinds-from-hand`: "you may put a creature card and/or a land card from your hand onto the battlefield" (CR 608.2d, 110.2a, 400.7: the player chooses as the instruction runs and
 * the cards enter under their control; "and/or" lets them put a card of each kind, or only one kind, or none). Read as two offers in a row, each "you may put a card of the kind from your hand onto the
 * battlefield" (the engine's optional `moveToZone` of a `choose`), the second made after the first card has moved, so one card is never put twice. Not read: "or" (one card), "and" (not a choice),
 * the same kind twice, a kind that is not a permanent type, another place, a state ("tapped"), no "you may", a trailing clause.
 */
export const EFFECT_PUT_TWO_KINDS_FROM_HAND = defineRule<Clauses>({
  id: PUT_TWO_KINDS_ID,
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
    'CR 400.7 (General)',
  ],
  examples: [
    'you may put a creature card and/or a land card from your hand onto the battlefield',
    'You may put an artifact card and/or a land card from your hand onto the battlefield',
  ],
  rejects: [
    'you may put a creature card or a land card from your hand onto the battlefield',
    'you may put a creature card and a land card from your hand onto the battlefield',
    'you may put a creature card and/or a creature card from your hand onto the battlefield',
    'you may put a creature card and/or a land card from your graveyard onto the battlefield',
    'you may put a creature card and/or a land card from your hand onto the battlefield tapped',
    'put a creature card and/or a land card from your hand onto the battlefield',
    'you may put a creature card and/or an instant card from your hand onto the battlefield',
    'you may put a creature card and/or a land card from your hand onto the battlefield and draw a card',
    'you may put a creature card and/or a land card from your hand onto the battlefield.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `you may put an? (${HAND_KINDS}) card and/or an? (${HAND_KINDS}) card from your hand onto the battlefield${END}(?! tapped)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const first = r.value[1]?.toLowerCase();
    const second = r.value[2]?.toLowerCase();
    if (first === undefined || second === undefined || first === second) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const clauseFor = (type: string) => {
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: { zone: 'hand', types: [type], controller: 'you', card: true, raw: `${type} card` },
        upTo: false,
        plural: false,
        other: false,
        span,
        rule: PUT_TWO_KINDS_ID,
      };
      const to: IrZoneSpec = { kind: 'zoneSpec', zone: 'battlefield', span, rule: PUT_TWO_KINDS_ID };
      const may: IrFlag = { kind: 'flag', value: true, span, rule: PUT_TWO_KINDS_ID };
      return makeClause(PUT_TWO_KINDS_ID, 'putFromZone', { objects, to, may }, span);
    };
    return {
      ok: true,
      value: [clauseFor(first), { ...clauseFor(second), connector: 'and' as const }],
      pos: r.pos,
    };
  },
});

export const COUNTER_BLITZ_C_EFFECT_RULES = [
  EFFECT_CREATURES_CANT_ATTACK_YOU_UNLESS_PAY,
  EFFECT_EACH_OPPONENT_CHOOSES_RETURN,
  EFFECT_PUT_TWO_KINDS_FROM_HAND,
].map(quietly);
