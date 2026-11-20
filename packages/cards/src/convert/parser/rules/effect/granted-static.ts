/**
 * Effect rule of stage P69 (D-276): an object gains a static ability for good, "It gains \"You can't lose the game and your opponents can't win the
 * game.\"" (The Book of Exalted Deeds). The words say no duration, so the effect lasts until the end of the game (CR 611.2a), and the ability is a
 * layer 6 grant (CR 613.1f). The text in the quotes is read as an ability of its own (`rules/static/quoted.ts`); only a static one is read here, and
 * the lowering gives only the two the engine reads from the abilities an object has after the layers (`cantLoseGame`, `opponentsCantWin`).
 */
import { fail, literal, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrQuotedAbility, IrTypeList } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, makeClause, single } from './operands';

/** What a single object is named by in "gains": a target, or "it" or "that creature" for the one an earlier sentence named. */
const SUBJECTS: readonly string[] = ['noun.target-permanent', 'noun.it', 'noun.that-object'];

/** A static ability in quotes, ending the sentence with its period inside the quotes. */
const QUOTED_STATIC: Parser<IrQuotedAbility> = satisfy(
  (ctx, pos) => readQuotedAbility(ctx, pos, { mana: false, statics: true }),
  (quoted) => quoted.ability.kind === 'static',
);

/**
 * `effect.gain-static-ability`: "It gains \"You can't lose the game and your opponents can't win the game.\"", "Target Angel gains \"You can't lose
 * the game.\"" (CR 611.2a, 613.1f, 104.3): one object, the quoted static ability and no duration. The object is fixed as the effect begins (CR 611.2c);
 * a spell or ability that names it by "it" reads the target an instruction before it chose. A duration ("until end of turn"), a group ("creatures you
 * control gain"), "has" (a state, not a change) and a quoted ability that is not static are not read.
 */
export const EFFECT_GAIN_STATIC_ABILITY = defineRule<Clauses>({
  id: 'effect.gain-static-ability',
  family: 'effect',
  leading: ['it', 'target', 'that', 'her', 'him'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 104.3 (Ending the Game)',
  ],
  examples: [
    'it gains "You can\'t lose the game and your opponents can\'t win the game."',
    'It gains "You can\'t lose the game and your opponents can\'t win the game."',
    'target Angel gains "You can\'t lose the game and your opponents can\'t win the game."',
    'target creature you control gains "You can\'t lose the game."',
    'that creature gains "Your opponents can\'t win the game."',
  ],
  rejects: [
    'it gains "You can\'t lose the game and your opponents can\'t win the game." until end of turn',
    'it gains "You can\'t lose the game and your opponents can\'t win the game"',
    "it gains You can't lose the game and your opponents can't win the game.",
    'it has "You can\'t lose the game and your opponents can\'t win the game."',
    'it gain "You can\'t lose the game and your opponents can\'t win the game."',
    'it also gains "You can\'t lose the game."',
    'creatures you control gain "You can\'t lose the game."',
    'target creatures gain "You can\'t lose the game."',
    'it gains "{T}: You gain 1 life."',
    'it gains "Whenever ~ attacks, you gain 1 life."',
    'it gains "Draw a card."',
    'it gains flying',
    'it gains "You can\'t lose the game." and flying',
    'it gains "You can\'t lose the game and your opponents can\'t win the game." and "You have hexproof."',
    'it gains ""',
  ],
  parse: single(
    'effect.gain-static-ability',
    sequence(family<IrNoun>('noun', { only: SUBJECTS }), literal(' gains '), QUOTED_STATIC),
    ([objects, , ability]) => ({ verb: 'gainStaticAbility', args: { objects, ability } }),
  ),
});

/**
 * `effect.becomes-creature-gains-static`: "~ becomes a Bear creature in addition to its other types and gains \"~'s power and toughness are each equal to the number of lands you control.\"" (issue
 * 345, Beorn's Hospitality; CR 205.1b, 613.1d, 613.1f, 613.4a, 611.2a: the permanent itself is a creature of the type besides its types and has a characteristic-defining ability, both for
 * good, since the words say no duration; the reminder "(This effect doesn't end.)" says so). The engine's additive `setTypes` and `grantAbility`, both `permanent`. Not read: a duration, another
 * subject than `~`, a creature type that is not one word, no "creature", a quoted ability that is not static, a second ability.
 */
export const EFFECT_BECOMES_CREATURE_GAINS_STATIC = defineRule<Clauses>({
  id: 'effect.becomes-creature-gains-static',
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 205.1b (Type Line)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4a (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    '~ becomes a Bear creature in addition to its other types and gains "~\'s power and toughness are each equal to the number of lands you control."',
  ],
  rejects: [
    '~ becomes a Bear creature in addition to its other types and gains "~\'s power and toughness are each equal to the number of lands you control." until end of turn',
    '~ becomes a Bear creature and gains "~\'s power and toughness are each equal to the number of lands you control."',
    'target creature becomes a Bear creature in addition to its other types and gains "~\'s power and toughness are each equal to the number of lands you control."',
    '~ becomes a Bear in addition to its other types and gains "~\'s power and toughness are each equal to the number of lands you control."',
    '~ becomes a bear creature in addition to its other types and gains "~\'s power and toughness are each equal to the number of lands you control."',
    '~ becomes a Bear creature in addition to its other types and gains flying',
    '~ becomes a Bear creature in addition to its other types and gains "{T}: You gain 1 life."',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.becomes-creature-gains-static';
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      pattern(/[A-Z][a-z]+(?= creature in addition to its other types and gains )/u),
      literal(' creature in addition to its other types and gains '),
      QUOTED_STATIC,
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , subtype, , ability] = r.value;
    const span = { start: pos, end: r.pos };
    const types: IrTypeList = {
      kind: 'typeList',
      subtypes: [subtype[0]],
      cardTypes: ['creature'],
      additive: true,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'becomesForGood', { objects: subject, types }, span),
          connector: 'and',
        },
        makeClause(id, 'gainStaticAbility', { objects: subject, ability }, span),
      ],
      pos: r.pos,
    };
  },
});

/** A mana ability in quotes with no period inside the quotes, as Vraska, Betrayal's Sting writes the ability of a Treasure. */
const QUOTED_MANA_UNPUNCTUATED: Parser<IrQuotedAbility> = satisfy(
  (ctx, pos) => readQuotedAbility(ctx, pos, { mana: true, unpunctuated: true }),
  (quoted) => quoted.ability.kind === 'activated',
);

/**
 * `effect.becomes-subtype-artifact-loses-all`: "Target creature becomes a Treasure artifact with \"{T}, Sacrifice this artifact: Add one mana of any color\" and loses all other card types and
 * abilities." (CR 205.1a, 205.3d, 613.1d, 613.1f, 611.2a; Vraska, Betrayal's Sting): no duration, so it lasts for the rest of the game. One target permanent becomes an artifact of the one subtype
 * and nothing else (its other card types and the subtypes of them are gone), has no other ability (layer 6) and has the quoted mana ability. Not read: a duration, another subject than a
 * target, a second card type, "in addition", a quoted ability that is not a mana ability, a different ending.
 */
export const EFFECT_BECOMES_ARTIFACT_LOSES_ALL = defineRule<Clauses>({
  id: 'effect.becomes-subtype-artifact-loses-all',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 205.1a (Type Line)',
    'CR 205.3d (Subtypes)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 605.1a (Mana Abilities)',
  ],
  examples: [
    'target creature becomes a Treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types and abilities',
    'target permanent becomes a Treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types and abilities',
  ],
  rejects: [
    'target creature becomes a Treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types and abilities until end of turn',
    'target creature becomes a Treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types',
    'target creature becomes a Treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all abilities',
    'target creature becomes a Treasure artifact creature with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types and abilities',
    'target creature becomes a treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types and abilities',
    'target creature becomes a Treasure artifact with "Draw a card" and loses all other card types and abilities',
    'target creatures become a Treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types and abilities',
    'it becomes a Treasure artifact with "{T}, Sacrifice ~: Add one mana of any color" and loses all other card types and abilities',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.becomes-subtype-artifact-loses-all';
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      literal(' becomes a '),
      pattern(/[A-Z][a-z]+(?= artifact with )/u),
      literal(' artifact with '),
      QUOTED_MANA_UNPUNCTUATED,
      literal(' and loses all other card types and abilities'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [objects, , subtype, , ability] = r.value;
    const span = { start: pos, end: r.pos };
    const types: IrTypeList = {
      kind: 'typeList',
      subtypes: [subtype[0]],
      cardTypes: ['artifact'],
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'becomesLosesAll', { objects, types, ability }, span)],
      pos: r.pos,
    };
  },
});

const POISON_LIMITS: Readonly<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * `effect.poison-difference`: "If target player has fewer than nine poison counters, they get a number of poison counters equal to the difference." (CR 122.1, 107.1b, 704.5c;
 * Vraska, Betrayal's Sting): the player gets as many poison counters as bring them to the number. The condition and the amount say the same thing (a player with that many or more
 * gets none: the difference is 0 or less, and a negative number counts as 0), so one instruction reads both: the engine's `givePoison` of the number less the player's poison counters.
 * Not read: another sentence shape ("at least", "or more"), a subject that is not one target player, another number of counters than the difference.
 */
export const EFFECT_POISON_DIFFERENCE = defineRule<Clauses>({
  id: 'effect.poison-difference',
  family: 'effect',
  leading: ['if'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 107.1b (Numbers)',
    'CR 704.5c (State-Based Actions)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'if target player has fewer than nine poison counters, they get a number of poison counters equal to the difference',
    'if target opponent has fewer than ten poison counters, they get a number of poison counters equal to the difference',
  ],
  rejects: [
    'if target player has fewer than nine poison counters, they get a number of poison counters equal to the difference.',
    'if target player has fewer than nine poison counters, they get two poison counters',
    'if target player has more than nine poison counters, they get a number of poison counters equal to the difference',
    'if target player has fewer than nine poison counters, you get a number of poison counters equal to the difference',
    'if each player has fewer than nine poison counters, they get a number of poison counters equal to the difference',
    'if target player has fewer than nine energy counters, they get a number of poison counters equal to the difference',
    'if target player has fewer than one poison counters, they get a number of poison counters equal to the difference',
    'target player has fewer than nine poison counters, they get a number of poison counters equal to the difference',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.poison-difference';
    const r = sequence(
      literal('if '),
      family<IrNoun>('noun', { only: ['noun.player'] }),
      literal(' has fewer than '),
      pattern(/(two|three|four|five|six|seven|eight|nine|ten)(?= poison counters, )/u),
      literal(' poison counters, they get a number of poison counters equal to the difference'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, subject, , word] = r.value;
    const limit = POISON_LIMITS[word[0]];
    if (limit === undefined || subject.det !== 'target') return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'givePoison',
          { player: subject, limit: { kind: 'number', value: limit, span } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const GRANTED_STATIC_EFFECT_RULES = [
  EFFECT_POISON_DIFFERENCE,
  EFFECT_GAIN_STATIC_ABILITY,
  EFFECT_BECOMES_CREATURE_GAINS_STATIC,
  EFFECT_BECOMES_ARTIFACT_LOSES_ALL,
].map(quietly);
