/**
 * Conditions of stage P34 (D-151, D-152): what the engine's Dragons slice reads. "It's attacking the player with the most life or tied for
 * most life" (Dethrone, CR 702.105a), "you attacked with creatures with total power 6 or greater this combat" (CR 508.1), "an opponent was dealt
 * 7 or more damage this turn" (CR 120.3) and "two or more nonland permanents entered the battlefield under your control this turn" (CR 400.7).
 * The first two are tests of a combat, the last two read the log of the turn; the lowering says which of them a place may have.
 */
import {
  choice,
  fail,
  many,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrCondition, IrFilter } from '../../ir/types';
import { quantity } from '../amount/index';
import {
  BOUNDARY,
  type FilterParts,
  MODIFIER,
  NO_PARTS,
  PERMANENT_TYPES,
  permanentPhrase,
  toFilter,
  typeWords,
  withoutZone,
} from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';

function conditionOf(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/**
 * `condition.attacking-most-life`: "it's attacking the player with the most life or tied for most life" (CR 702.105a, 508.1b, 603.4: the
 * creature is attacking a player, not a planeswalker or a battle, who has at least as much life as every other player). Said of the creature
 * the ability is about, which is `~` or the creature that attacked.
 */
export const CONDITION_ATTACKING_MOST_LIFE = defineRule<IrCondition>({
  id: 'condition.attacking-most-life',
  family: 'condition',
  leading: ["it's", 'it’s', '~'],
  cites: [
    'CR 702.105a (Dethrone)',
    'CR 508.1b (Declare Attackers Step)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    "it's attacking the player with the most life or tied for most life",
    'it’s attacking the player with the most life or tied for most life',
    '~ is attacking the player with the most life or tied for most life',
  ],
  rejects: [
    "it's attacking the player with the most life",
    "it's attacking the player with the least life",
    "it's attacking a player",
    "it's attacking the player with the most life or tied for the most life",
    "it's attacking the player with the most life or tied for most life and",
    "it's attacking you",
    'it is attacking the player with the most life or tied for most life',
    "they're attacking the player with the most life or tied for most life",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `(?:it['’]s|~ is) attacking the player with the most life or tied for most life${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: conditionOf('condition.attacking-most-life', pos, r.pos, {
        kind: 'attackingMostLife',
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.attackers-total-power`: "you attacked with creatures with total power 6 or greater this combat" (CR 508.1, 208.1: the creatures
 * the controller has attacking now have that much power among them). "Or greater" only, the number of the text.
 */
export const CONDITION_ATTACKERS_TOTAL_POWER = defineRule<IrCondition>({
  id: 'condition.attackers-total-power',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 208.1 (Power/Toughness)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    'you attacked with creatures with total power 6 or greater this combat',
    'you attacked with creatures with total power 10 or greater this combat',
  ],
  rejects: [
    'you attacked with creatures with total power 6 or greater',
    'you attacked with creatures with total power 6 or less this combat',
    'you attacked with creatures with total power 6 this combat',
    'you attacked with creatures with total toughness 6 or greater this combat',
    'you attacked with creatures with total power X or greater this combat',
    'you attacked with creatures with total power 0 or greater this combat',
    'you attacked with creatures with total power 6 or greater this turn',
    'you attacked with a creature with total power 6 or greater this combat',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you attacked with creatures with total power /iu),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(new RegExp(` or greater this combat${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count] = r.value;
    return {
      ok: true,
      value: conditionOf('condition.attackers-total-power', pos, r.pos, {
        kind: 'attackersTotalPower',
        atLeast: count.value,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.player-dealt-damage`: "an opponent was dealt 7 or more damage this turn", "you were dealt 3 or more damage this turn" (CR 120.3,
 * 120.2: the damage a player was dealt by any source, combat or not, as it was dealt after prevention). "An opponent" is some one opponent of
 * the controller.
 */
export const CONDITION_PLAYER_DEALT_DAMAGE = defineRule<IrCondition>({
  id: 'condition.player-dealt-damage',
  family: 'condition',
  leading: ['an', 'you'],
  cites: ['CR 120.3 (Damage)', 'CR 120.2 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'an opponent was dealt 7 or more damage this turn',
    'you were dealt 3 or more damage this turn',
    'an opponent was dealt 1 or more damage this turn',
  ],
  rejects: [
    'an opponent was dealt 7 or more damage',
    'an opponent was dealt 7 or less damage this turn',
    'an opponent was dealt 7 or more combat damage this turn',
    'an opponent was dealt 7 or more damage this turn and',
    'a player was dealt 7 or more damage this turn',
    'an opponent was dealt damage this turn',
    'an opponent were dealt 7 or more damage this turn',
    'you was dealt 7 or more damage this turn',
    'an opponent was dealt X or more damage this turn',
    'an opponent was dealt 0 or more damage this turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      choice(
        map(pattern(/an opponent was dealt /iu), () => 'opponent' as const),
        map(pattern(/you were dealt /iu), () => 'you' as const),
      ),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(new RegExp(` or more damage this turn${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [who, count] = r.value;
    return {
      ok: true,
      value: conditionOf('condition.player-dealt-damage', pos, r.pos, {
        kind: 'playerDealtDamage',
        who,
        atLeast: count.value,
      }),
      pos: r.pos,
    };
  },
});

/**
 * What entered: a phrase of permanents ("nonland permanents", "creatures") or, since it is what the turn log tells apart, of tokens ("tokens",
 * "creature tokens"), without a zone.
 */
function kindOf(plural: boolean): Parser<IrFilter> {
  const tokens: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      many(MODIFIER),
      optional(
        map(sequence(typeWords(PERMANENT_TYPES, false), pattern(/ /)), ([types]) => types),
        [] as string[],
      ),
      pattern(new RegExp(`token${plural ? 's' : ''}${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [modifiers, types] = r.value;
    const parts = modifiers.reduce<FilterParts>((acc, m) => m(acc), { ...NO_PARTS, types });
    const { zone, ...filter } = toFilter('battlefield', parts, ctx.text.slice(pos, r.pos));
    void zone;
    return { ok: true, value: { ...filter, token: true }, pos: r.pos };
  };
  // The tokens first: "a creature token" starts like "a creature", which would read it and leave "token" behind.
  return choice(tokens, map(permanentPhrase(plural, false), withoutZone));
}

/**
 * `condition.entered-this-turn`: "two or more nonland permanents entered the battlefield under your control this turn", "a creature entered the
 * battlefield under your control this turn", "a token entered ..." (CR 400.7, 603.4: permanents that entered under the control of the player this
 * turn, counting those that have left since). A count and a kind of permanent (types, "non" types, token or not), nothing else.
 */
export const CONDITION_ENTERED_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.entered-this-turn',
  family: 'condition',
  leading: [],
  cites: [
    'CR 400.7 (General)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
  ],
  examples: [
    'two or more nonland permanents entered the battlefield under your control this turn',
    'a creature entered the battlefield under your control this turn',
    'three or more creatures entered the battlefield under your control this turn',
    'a nontoken creature entered the battlefield under your control this turn',
    'an artifact entered the battlefield under your control this turn',
    'two or more tokens entered the battlefield under your control this turn',
    'a creature token entered the battlefield under your control this turn',
  ],
  rejects: [
    'two or more nonland permanents entered the battlefield under your control',
    'two nonland permanents entered the battlefield under your control this turn',
    'two or more nonland permanents entered the battlefield under an opponent’s control this turn',
    'two or more nonland permanents entered the battlefield this turn',
    'a creature you control entered the battlefield under your control this turn',
    'a red creature entered the battlefield under your control this turn',
    'a creature entered the battlefield under your control this turn and',
    'a creature entered under your control this turn',
    'two or more creature entered the battlefield under your control this turn',
    'a creatures entered the battlefield under your control this turn',
  ],
  parse: (ctx, pos) => {
    const id = 'condition.entered-this-turn';
    const entered = pattern(
      new RegExp(` entered the battlefield under your control this turn${BOUNDARY}`, 'iu'),
    );
    // Two or more: "two or more nonland permanents". One: "a creature", "an artifact".
    const several = sequence(
      spanned(satisfy(quantity, (n) => n >= 2)),
      pattern(/ or more /iu),
      kindOf(true),
      entered,
    )(ctx, pos);
    let count: number;
    let filter: IrFilter;
    let end: number;
    if (several.ok) {
      count = several.value[0].value;
      filter = several.value[2];
      end = several.pos;
    } else {
      const single = sequence(pattern(/an? /iu), kindOf(false), entered)(ctx, pos);
      if (!single.ok) return single;
      count = 1;
      filter = single.value[1];
      end = single.pos;
    }
    // What the engine reads of a permanent that entered: its card types, the types it is not, and whether it is a token. Nothing else.
    if (Object.keys(filter).some((key) => !['types', 'notTypes', 'token', 'raw'].includes(key))) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: conditionOf(id, pos, end, {
        kind: 'enteredThisTurn',
        count,
        ...(filter.types === undefined ? {} : { types: filter.types }),
        ...(filter.notTypes === undefined ? {} : { notTypes: filter.notTypes }),
        ...(filter.token === undefined ? {} : { token: filter.token }),
      }),
      pos: end,
    };
  },
});

export const DRAGON_CONDITION_RULES = [
  CONDITION_ATTACKING_MOST_LIFE,
  CONDITION_ATTACKERS_TOTAL_POWER,
  CONDITION_PLAYER_DEALT_DAMAGE,
  CONDITION_ENTERED_THIS_TURN,
].map(quietly);
