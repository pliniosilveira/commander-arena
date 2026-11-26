/**
 * Effect rules of the Revival Trance deck (issue 97), group D: "that player chooses up to two creatures they control, then sacrifices the rest" (Archfiend of Depravity, CR 608.2d,
 * 701.21a, 101.4). The lowering is in `lower/keeps-up-to.ts`.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const COUNT_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

const EXACT_COUNT_WORDS: Readonly<Record<string, number>> = {
  ...COUNT_WORDS,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * `effect.player-keeps-up-to-and-sacrifices-the-rest`: "that player chooses up to two creatures they control, then sacrifices the rest" (CR 608.2d: the player chooses as the effect
 * resolves, the choice does not target; CR 701.21a: the rest are sacrificed by their controller; CR 101.4). The engine's `keepOrSacrifice` with `keepAtMost` for the player the subject
 * names, which the lowering reads as the player the trigger is about. Not read: another subject ("each player", "you"), "any number", a number above five, a kind of permanent other than
 * creatures, "the others", more words after it.
 */
export const EFFECT_PLAYER_KEEPS_UP_TO_AND_SACRIFICES_THE_REST = defineRule<Clauses>({
  id: 'effect.player-keeps-up-to-and-sacrifices-the-rest',
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21a (Sacrifice)',
    'CR 101.4 (Strict Timing Order)',
  ],
  examples: [
    'that player chooses up to two creatures they control, then sacrifices the rest',
    'that player chooses up to one creature they control, then sacrifices the rest',
    'that player chooses up to three creatures they control, then sacrifices the rest',
  ],
  rejects: [
    'that player chooses any number of creatures they control, then sacrifices the rest',
    'that player chooses two creatures they control, then sacrifices the rest',
    'that player chooses up to two artifacts they control, then sacrifices the rest',
    'that player chooses up to two creatures they control, then sacrifices the others',
    'that player chooses up to two creatures you control, then sacrifices the rest',
    'that player chooses up to nine creatures they control, then sacrifices the rest',
    'that player chooses up to two creatures they control, then sacrifices the rest and draws a card',
    'each opponent chooses up to two creatures they control, then sacrifices the rest',
    'that player chooses up to two creatures they control, then discards the rest',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        family<IrNoun>('noun', { only: ['noun.that-player'] }),
        pattern(
          / chooses up to (one|two|three|four|five) creatures? they control, then sacrifices the rest(?![\p{L}\p{N}]| and )/iu,
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [player, m] = r.value.value;
    const word = m[1]?.toLowerCase();
    const limit = word === undefined ? undefined : COUNT_WORDS[word];
    if (limit === undefined) return fail(ctx, pos);
    const count: IrAmount = { kind: 'number', value: limit, span: r.value.span };
    return {
      ok: true,
      value: [
        makeClause(
          'effect.player-keeps-up-to-and-sacrifices-the-rest',
          'keepUpToAndSacrifice',
          { player, limit: count },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.each-player-keeps-exactly-and-sacrifices-the-rest`: "each player chooses six lands they control, then sacrifices the rest" (Planetary Annihilation; CR 608.2d: the choice is
 * made as the effect resolves; CR 101.4: the players choose in APNAP order, each knowing the earlier choices; CR 701.21a: the rest are sacrificed by their controller). The engine's
 * `keepOrSacrifice` of every player with `keepExactly`: a player who controls no more than that many keeps them all. Not read: another subject ("each opponent", "that player"), "up to",
 * "any number", a number above ten or a digit, a kind of permanent other than land, creature, artifact or enchantment, "you control", "the others", more words after it.
 */
export const EFFECT_EACH_PLAYER_KEEPS_EXACTLY_AND_SACRIFICES_THE_REST = defineRule<Clauses>({
  id: 'effect.each-player-keeps-exactly-and-sacrifices-the-rest',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21a (Sacrifice)',
    'CR 101.4 (Strict Timing Order)',
  ],
  examples: [
    'each player chooses six lands they control, then sacrifices the rest',
    'each player chooses one creature they control, then sacrifices the rest',
    'each player chooses three artifacts they control, then sacrifices the rest',
  ],
  rejects: [
    'each player chooses up to six lands they control, then sacrifices the rest',
    'each player chooses any number of lands they control, then sacrifices the rest',
    'each player chooses 6 lands they control, then sacrifices the rest',
    'each player chooses eleven lands they control, then sacrifices the rest',
    'each player chooses six cards they control, then sacrifices the rest',
    'each player chooses six lands you control, then sacrifices the rest',
    'each player chooses six lands they control, then sacrifices the others',
    'each player chooses six lands they control, then sacrifices the rest and draws a card',
    'each opponent chooses six lands they control, then sacrifices the rest',
    'that player chooses six lands they control, then sacrifices the rest',
    'each player chooses six lands they control, then discards the rest',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /each player chooses (one|two|three|four|five|six|seven|eight|nine|ten) (lands?|creatures?|artifacts?|enchantments?) they control, then sacrifices the rest(?![\p{L}\p{N}]| and )/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, word, kind] = r.value.value;
    const limit = word === undefined ? undefined : EXACT_COUNT_WORDS[word.toLowerCase()];
    if (limit === undefined || kind === undefined) return fail(ctx, pos);
    const span = r.value.span;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.each-player-keeps-exactly-and-sacrifices-the-rest',
          'keepExactlyAndSacrifice',
          {
            limit: { kind: 'number', value: limit, span } as IrAmount,
            what: {
              kind: 'name',
              name: kind.toLowerCase().replace(/s$/u, ''),
              span,
              rule: 'effect.each-player-keeps-exactly-and-sacrifices-the-rest',
            },
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.players-each-discard-or-sacrifice`: "you and defending player each discard a card or sacrifice a permanent" (Eumidian Wastewaker; CR 701.9: discard, CR 701.21a: sacrifice,
 * CR 101.4: the players choose in APNAP order, CR 608.2d). Each player the subject names chooses to discard a card or to sacrifice a permanent: the engine's `playersMay` of the discard,
 * run as the player asked, with the sacrifice of a permanent of their choice as the other way. A player with no card in hand sacrifices, one with no permanent discards. Not read: a
 * subject other than "you and <player> each", another number or kind of card or permanent, "at random", more words after it.
 */
export const EFFECT_PLAYERS_EACH_DISCARD_OR_SACRIFICE = defineRule<Clauses>({
  id: 'effect.players-each-discard-or-sacrifice',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 701.9 (Discard)',
    'CR 701.21a (Sacrifice)',
    'CR 101.4 (Strict Timing Order)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'you and defending player each discard a card or sacrifice a permanent',
    'you and target opponent each discard a card or sacrifice a permanent',
  ],
  rejects: [
    'you and defending player each discard two cards or sacrifice a permanent',
    'you and defending player each discard a card or sacrifice a creature',
    'you and defending player each discard a card at random or sacrifice a permanent',
    'you and defending player each discard a card or sacrifice two permanents',
    'you and defending player each discard a card or sacrifice a permanent and draw a card',
    'you and defending player each discard a card',
    'each player discards a card or sacrifices a permanent',
    'you each discard a card or sacrifice a permanent',
    'defending player discards a card or sacrifices a permanent',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        family<IrNoun>('noun', { only: ['noun.you-and-player'] }),
        pattern(/ discard a card or sacrifice a permanent(?![\p{L}\p{N}]| and )/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [players] = r.value.value;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.players-each-discard-or-sacrifice',
          'eachDiscardOrSacrifice',
          { player: players },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const KEEPS_UP_TO_EFFECT_RULES = [
  EFFECT_PLAYER_KEEPS_UP_TO_AND_SACRIFICES_THE_REST,
  EFFECT_EACH_PLAYER_KEEPS_EXACTLY_AND_SACRIFICES_THE_REST,
  EFFECT_PLAYERS_EACH_DISCARD_OR_SACRIFICE,
];
