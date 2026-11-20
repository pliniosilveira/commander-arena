/**
 * Effect rules of group 3 of the Prismari deck (issue 87, D-660 and later): casting spells without paying their mana costs from among the cards an instruction exiled, and the
 * instructions that exile them.
 *
 * - `effect.exile-two-piles`: "Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of
 *   those piles. Put that pile into your graveyard. Look at the cards in the other pile." (CR 700.3, 406.3, 701.13): the four sentences of one instruction, joined by `segment.ts`.
 *   The engine's `exilePiles`.
 * - `effect.cast-from-among`: "You may cast a spell from among them without paying its mana cost.", "You may cast up to two spells from among the other cards exiled this way without
 *   paying their mana costs.", "... any number of spells from among those cards ..." (CR 608.2g, 118.9). The engine's `castFree` of the cards `moved`, with `max`.
 * - `effect.put-the-rest-into-your-hand`: "Put the rest into your hand." (CR 701.13): the cards the instructions before it exiled that are still in exile.
 * - `effect.shuffle-reveal-until-exile`: "Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of
 *   your library in a random order." (CR 701.24, 701.20, 701.13, 401.4): the two sentences of one instruction. The engine's `shuffle` and `revealUntil` into exile.
 * - `effect.exile-top-as-many-times`: "As many times as you choose, you may exile the top card of your library." (CR 701.13, 608.2d). The engine's `exileTopAnyNumber`.
 * - `effect.each-player-exiles-until-nonland`: "Each player exiles cards from the top of their library until they exile a nonland card." (CR 701.13, 101.4). The engine's `exileUntilFound`.
 * - `effect.opponent-chooses-nonland-exiled`: "An opponent chooses a nonland card exiled this way." (CR 608.2d). The engine's `opponentChoosesCard`.
 * - `effect.delayed-combat-damage-copy-exiled`: "Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying
 *   its mana cost." (CR 603.7, 510.3a, 707.12): the two sentences of one delayed ability, joined by `segment.ts`. The engine's `delayedCombatDamageTurn`.
 *
 * Quiet, like the effect rules that share their first words with them ("exile", "you", "put", "shuffle", "as", "each", "an", "whenever"): a line these rules do not read stops where it
 * always did. Their matches are recorded as usual.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrAmount, IrClause } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly } from '../registry';
import { flag, number } from './dragons';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/**
 * `effect.exile-two-piles` (CR 700.3: objects grouped into piles stay where they are, each in exactly one pile, a pile may hold no card; CR 406.3: a card exiled face down can't be
 * examined unless an instruction allows it; CR 701.13: exile). "N cards" is the same number in both halves, at least one. The opponent chooses, the chosen pile goes to the graveyard
 * and the other is looked at, in these words exactly. Not read: other numbers in the two halves, a pile into the hand, "you choose", the other pile put anywhere, no look at it.
 */
export const EFFECT_EXILE_TWO_PILES = defineRule<Clauses>({
  id: 'effect.exile-two-piles',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 700.3 (General)',
    'CR 406.3 (Exile)',
    'CR 701.13 (Exile)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your graveyard. look at the cards in the other pile',
    'Exile the top three cards of your library in a face-down pile, then exile the top three cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the cards in the other pile',
  ],
  rejects: [
    'exile the top four cards of your library in a face-down pile, then exile the top three cards of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your graveyard. look at the cards in the other pile',
    'exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your hand. look at the cards in the other pile',
    'exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. you choose one of those piles. put that pile into your graveyard. look at the cards in the other pile',
    'exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your graveyard',
    'exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your graveyard. look at the cards in the other pile and draw a card',
    'exile the top four cards of your library in a face-up pile, then exile the top four cards of your library in a face-down pile. an opponent chooses one of those piles. put that pile into your graveyard. look at the cards in the other pile',
    'exile the top card of your library in a face-down pile, then exile the top card of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your graveyard. look at the cards in the other pile',
    'exile the top zero cards of your library in a face-down pile, then exile the top zero cards of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your graveyard. look at the cards in the other pile',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-two-piles';
    const r = sequence(
      literal('exile the top '),
      quantity,
      literal(' cards of your library in a face-down pile, then exile the top '),
      quantity,
      pattern(
        new RegExp(
          ` cards of your library in a face-up pile\\. an opponent chooses one of those piles\\. put that pile into your graveyard\\. look at the cards in the other pile${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, down, , up] = r.value;
    if (down < 2 || down !== up) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const count: IrAmount = number(down, span);
    return { ok: true, value: [makeClause(id, 'exilePiles', { count }, span)], pos: r.pos };
  },
});

/**
 * `effect.cast-from-among` (CR 608.2g: spells cast during resolution, CR 118.9: without paying the mana cost): the cards are "them", "those cards" or "the other cards exiled this way"
 * (the cards the instructions before it moved; the lowering reads each only after the instruction that makes it true). "A spell" is one spell with "its mana cost"; "up to two spells" and
 * "any number of spells" agree with "their mana costs". Not read: another number ("up to three"), "a spell ... their mana costs", "any number of spells ... its mana cost", a spell from a
 * hand or a zone ("from your hand", "from your graveyard"), "this turn", a cost paid instead, "may" left out.
 */
export const EFFECT_CAST_FROM_AMONG = defineRule<Clauses>({
  id: 'effect.cast-from-among',
  family: 'effect',
  leading: ['you', 'cast'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 601.2 (Casting Spells)',
  ],
  examples: [
    'you may cast a spell from among them without paying its mana cost',
    'you may cast instant and sorcery spells with mana value X or less from among them without paying their mana costs',
    'you may cast instant and sorcery spells from among them without paying their mana costs',
    'you may cast up to two spells from among the other cards exiled this way without paying their mana costs',
    'you may cast any number of spells from among those cards without paying their mana costs',
    'You may cast a spell from among them without paying its mana cost',
    'cast up to two spells from among the other cards exiled this way without paying their mana costs',
  ],
  rejects: [
    'you may cast up to three spells from among them without paying their mana costs',
    'you may cast a spell from among them without paying their mana costs',
    'you may cast any number of spells from among them without paying its mana cost',
    'you may cast up to two spells from among them without paying its mana cost',
    'you may cast a spell from among them',
    'you may cast a spell from among them this turn without paying its mana cost',
    'you may cast a spell from among cards in your hand without paying its mana cost',
    'you may cast a spell from your graveyard without paying its mana cost',
    'you may cast a spell from among them by paying its mana cost',
    'you may cast a spell from among them without paying its mana cost and draw a card',
    'you may cast one spell from among them without paying its mana cost',
    'you may cast instant and sorcery spells from among them without paying its mana cost',
    'you may cast creature spells with mana value X or less from among them without paying their mana costs',
    'you may cast instant and sorcery spells with mana value Y or less from among them without paying their mana costs',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.cast-from-among';
    const head = pattern(
      /(you may )?cast (a spell|up to two spells|any number of spells|instant and sorcery spells(?: with mana value X or less)?) from among (them|those cards|the other cards exiled this way) without paying (its mana cost|their mana costs)(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!head.ok) return head;
    const [, may = '', count = '', from = '', cost = ''] = head.value;
    const single = count.toLowerCase() === 'a spell';
    // "a spell" goes with "its mana cost", the plural spells with "their mana costs".
    if (single !== (cost.toLowerCase() === 'its mana cost')) return fail(ctx, pos);
    const span = { start: pos, end: head.pos };
    const args: Record<string, IrAmount | ReturnType<typeof flag>> = {
      other: flag(id, from.toLowerCase() === 'the other cards exiled this way', span),
      // "you may" said inside the rule, or by the sentence before the rule (a trigger's "you may ..." is read as the sentence's own).
      may: flag(id, may !== '', span),
    };
    const lower = count.toLowerCase();
    if (lower === 'up to two spells') args.max = number(2, span);
    if (lower === 'any number of spells') args.any = flag(id, true, span);
    // Epic Experiment (issue 121): "instant and sorcery spells with mana value X or less": any number of them, of those types, with a mana value no more than the X of the spell.
    if (lower.startsWith('instant and sorcery spells')) {
      args.any = flag(id, true, span);
      args.instantOrSorcery = flag(id, true, span);
      if (lower.endsWith('with mana value x or less')) args.limitX = flag(id, true, span);
    }
    return { ok: true, value: [makeClause(id, 'castFromAmong', args, span)], pos: head.pos };
  },
});

/**
 * `effect.put-the-rest-into-your-hand` (CR 701.13, 400.7): the cards the instructions before it moved that were not cast stay in exile, and these go to the hand. Not read: "the rest on the
 * bottom of your library", "into your graveyard", another player's hand, "the rest" with other words after it.
 */
export const EFFECT_PUT_THE_REST_HAND = defineRule<Clauses>({
  id: 'effect.put-the-rest-into-your-hand',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 701.13 (Exile)', 'CR 400.7 (General)'],
  examples: ['put the rest into your hand', 'Put the rest into your hand'],
  rejects: [
    'put the rest into your graveyard',
    'put the rest on the bottom of your library',
    'put the rest into their hand',
    'put the rest into your hand and draw a card',
    'put them into your hand',
    'put the rest onto the battlefield',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.put-the-rest-into-your-hand';
    const r = pattern(
      /put the rest into your hand(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'putRestIntoHand', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.put-the-rest-into-your-graveyard` (CR 701.13, 400.7; Epic Experiment): "Then put all cards exiled this way that weren't cast into your graveyard." The cards the instructions before it
 * exiled that are still in exile go to their owner's graveyard. Not read: another zone, "that were cast", another player's graveyard, other words after it.
 */
export const EFFECT_PUT_THE_REST_GRAVEYARD = defineRule<Clauses>({
  id: 'effect.put-the-rest-into-your-graveyard',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 701.13 (Exile)', 'CR 400.7 (General)', 'CR 404.1 (Graveyard)'],
  examples: [
    'put all cards exiled this way that weren’t cast into your graveyard',
    "put all cards exiled this way that weren't cast into your graveyard",
  ],
  rejects: [
    "put all cards exiled this way that weren't cast into your hand",
    'put all cards exiled this way that were cast into your graveyard',
    "put all cards exiled this way that weren't cast into their graveyard",
    "put all cards exiled this way that weren't cast on the bottom of your library",
    "put all cards exiled this way that weren't cast into your graveyard and draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.put-the-rest-into-your-graveyard';
    const r = pattern(
      /put all cards exiled this way that weren['’]t cast into your graveyard(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'putRestIntoGraveyard', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.shuffle-reveal-until-exile` (CR 701.24: shuffle, CR 701.20: reveal, CR 701.13: exile, CR 401.4: the rest on the bottom in a random order): the two sentences of one
 * instruction. The card is "a nonland card" (the only filter read), and it is exiled, not put anywhere else. Not read: a land card, the card put into the hand or onto the battlefield,
 * the rest left anywhere but the bottom, a shuffle of another player's library, another order.
 */
export const EFFECT_SHUFFLE_REVEAL_UNTIL_EXILE = defineRule<Clauses>({
  id: 'effect.shuffle-reveal-until-exile',
  family: 'effect',
  leading: ['shuffle'],
  cites: ['CR 701.24 (Shuffle)', 'CR 701.20 (Reveal)', 'CR 701.13 (Exile)', 'CR 401.4 (Library)'],
  examples: [
    'shuffle your library, then reveal cards from the top of it until you reveal a nonland card. exile that card and put the rest on the bottom of your library in a random order',
    'Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'shuffle your library, then reveal cards from the top of it until you reveal a land card. exile that card and put the rest on the bottom of your library in a random order',
    'shuffle your library, then reveal cards from the top of it until you reveal a nonland card. put that card into your hand and the rest on the bottom of your library in a random order',
    'shuffle your library, then reveal cards from the top of it until you reveal a nonland card. exile that card and put the rest into your graveyard',
    'shuffle your library, then reveal cards from the top of it until you reveal a nonland card. exile that card and put the rest on the bottom of your library',
    "shuffle target player's library, then reveal cards from the top of it until you reveal a nonland card. exile that card and put the rest on the bottom of your library in a random order",
    'shuffle your library, then reveal cards from the top of it until you reveal a nonland card',
    'reveal cards from the top of your library until you reveal a nonland card. exile that card and put the rest on the bottom of your library in a random order',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.shuffle-reveal-until-exile';
    const r = pattern(
      /shuffle your library, then reveal cards from the top of it until you reveal a nonland card\. exile that card and put the rest on the bottom of your library in a random order(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'shuffleRevealUntilExile', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-top-as-many-times` (CR 701.13, 608.2d: a choice made as the effect resolves, asked again after each card). "You may" is part of it. Not read: a number of times, "up to",
 * another player's library, more than the top card, face down.
 */
export const EFFECT_EXILE_TOP_AS_MANY_TIMES = defineRule<Clauses>({
  id: 'effect.exile-top-as-many-times',
  family: 'effect',
  leading: ['as'],
  cites: ['CR 701.13 (Exile)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'as many times as you choose, you may exile the top card of your library',
    'As many times as you choose, you may exile the top card of your library',
  ],
  rejects: [
    'as many times as you choose, exile the top card of your library',
    'as many times as you choose, you may exile the top two cards of your library',
    "as many times as you choose, you may exile the top card of target player's library",
    'as many times as you choose, you may exile the top card of your library face down',
    'as many times as you choose, you may exile the top card of your library and draw a card',
    'as often as you choose, you may exile the top card of your library',
    'you may exile the top card of your library',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top-as-many-times';
    const r = pattern(
      /as many times as you choose, you may exile the top card of your library(?![\p{L}\p{N}])(?!\s+(?:and|then|face)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'exileTopAnyNumber', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.each-player-exiles-until-nonland` (CR 701.13, 101.4: the active player first, then in turn order; each exiles from their own library until a nonland card is exiled, or the
 * library is empty). Not read: "target player", "each opponent", a land card, "a creature card", "a card with ...", the cards put anywhere else.
 */
export const EFFECT_EACH_PLAYER_EXILES_UNTIL_NONLAND = defineRule<Clauses>({
  id: 'effect.each-player-exiles-until-nonland',
  family: 'effect',
  leading: ['each'],
  cites: ['CR 701.13 (Exile)', 'CR 101.4 (Golden Rules)'],
  examples: [
    'each player exiles cards from the top of their library until they exile a nonland card',
    'Each player exiles cards from the top of their library until they exile a nonland card',
  ],
  rejects: [
    'each opponent exiles cards from the top of their library until they exile a nonland card',
    'each player exiles cards from the top of their library until they exile a land card',
    'each player exiles cards from the top of their library until they exile a creature card',
    'each player exiles cards from the top of their library until they exile two nonland cards',
    'each player exiles the top card of their library',
    'each player exiles cards from the top of their library until they exile a nonland card and draws a card',
    'each player reveals cards from the top of their library until they reveal a nonland card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.each-player-exiles-until-nonland';
    const r = pattern(
      /each player exiles cards from the top of their library until they exile a nonland card(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'exileUntilNonland', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.opponent-chooses-nonland-exiled` (CR 608.2d: the opponent chooses, of the cards the instruction before exiled). Not read: "you choose", "target opponent", "each opponent", a
 * land card, "a creature card", "one of the exiled cards" (another rule's), more than one card.
 */
export const EFFECT_OPPONENT_CHOOSES_NONLAND_EXILED = defineRule<Clauses>({
  id: 'effect.opponent-chooses-nonland-exiled',
  family: 'effect',
  leading: ['an'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 701.13 (Exile)'],
  examples: [
    'an opponent chooses a nonland card exiled this way',
    'An opponent chooses a nonland card exiled this way',
  ],
  rejects: [
    'you choose a nonland card exiled this way',
    'target opponent chooses a nonland card exiled this way',
    'each opponent chooses a nonland card exiled this way',
    'an opponent chooses a land card exiled this way',
    'an opponent chooses a creature card exiled this way',
    'an opponent chooses one of the exiled cards',
    'an opponent chooses two nonland cards exiled this way',
    'an opponent chooses a nonland card exiled this way and you draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.opponent-chooses-nonland-exiled';
    const r = pattern(
      /an opponent chooses a nonland card exiled this way(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'opponentChoosesNonland', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.delayed-combat-damage-copy-exiled` (CR 603.7: a delayed triggered ability; CR 510.3a, 603.2c: it triggers for each creature that deals combat damage to a player; CR 707.12:
 * a copy of a card is cast from where the card is; CR 608.2g). The creatures are "a creature you control"; the copy is of "the exiled card", the card the instruction before it exiled,
 * and may be cast without paying its mana cost. Not read: "target creature", "that creature" (`effect.delayed-combat-prepare`), "each combat", "this combat", "an opponent", "deals damage",
 * "copy it", a cast with a cost, no cast sentence.
 */
export const EFFECT_DELAYED_COMBAT_DAMAGE_COPY_EXILED = defineRule<Clauses>({
  id: 'effect.delayed-combat-damage-copy-exiled',
  family: 'effect',
  leading: ['whenever'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 510.3a (Combat Damage Step)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 707.12 (Copying Objects)',
    'CR 608.2g (Resolving Spells and Abilities)',
  ],
  examples: [
    'whenever a creature you control deals combat damage to a player this turn, copy the exiled card. you may cast the copy without paying its mana cost',
    'Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost',
  ],
  rejects: [
    'whenever a creature you control deals combat damage to a player this turn, copy the exiled card',
    'whenever a creature you control deals combat damage to a player this turn, copy the exiled card. you may cast the copy',
    'whenever a creature you control deals damage to a player this turn, copy the exiled card. you may cast the copy without paying its mana cost',
    'whenever a creature you control deals combat damage to a player this combat, copy the exiled card. you may cast the copy without paying its mana cost',
    'whenever a creature you control deals combat damage to an opponent this turn, copy the exiled card. you may cast the copy without paying its mana cost',
    'whenever a creature you deals combat damage to a player this turn, copy the exiled card. you may cast the copy without paying its mana cost',
    'whenever a creature deals combat damage to a player this turn, copy the exiled card. you may cast the copy without paying its mana cost',
    'whenever a creature you control deals combat damage to a player this turn, copy it. you may cast the copy without paying its mana cost',
    'whenever a creature you control deals combat damage to a player this turn, copy the exiled card. you may cast the copy by paying its mana cost',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.delayed-combat-damage-copy-exiled';
    const r = pattern(
      /whenever a creature you control deals combat damage to a player this turn, copy the exiled card\. you may cast the copy without paying its mana cost(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const clause: IrClause = makeClause(
      id,
      'delayedCombatDamageCopyExiled',
      {},
      { start: pos, end: r.pos },
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

export const PRISMARI_G3_EFFECT_RULES = [
  quietly(EFFECT_EXILE_TWO_PILES),
  quietly(EFFECT_CAST_FROM_AMONG),
  quietly(EFFECT_PUT_THE_REST_HAND),
  quietly(EFFECT_PUT_THE_REST_GRAVEYARD),
  quietly(EFFECT_SHUFFLE_REVEAL_UNTIL_EXILE),
  quietly(EFFECT_EXILE_TOP_AS_MANY_TIMES),
  quietly(EFFECT_EACH_PLAYER_EXILES_UNTIL_NONLAND),
  quietly(EFFECT_OPPONENT_CHOOSES_NONLAND_EXILED),
  quietly(EFFECT_DELAYED_COMBAT_DAMAGE_COPY_EXILED),
];
