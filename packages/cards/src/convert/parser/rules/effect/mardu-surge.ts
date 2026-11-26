/**
 * Effect rules of the Mardu Surge deck (issue 101).
 *
 * - `effect.create-tokens-per-opponent-tapped-attacking`: "For each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they
 *   control." (CR 508.4, 111.2, 101.4). The engine's `createToken` with `forEachOpponent: { attacking: true }`: the tokens made for each opponent enter tapped and attacking that
 *   opponent (the choice of a planeswalker is not offered, `docs/ROADMAP.md`).
 */
import { choice, fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrClause, IrDuration, IrFlag, IrNoun, IrToken } from '../../ir/types';
import { positiveCount, quantity } from '../amount/index';
import { defineRule, family, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

export const EFFECT_CREATE_TOKENS_PER_OPPONENT_TAPPED_ATTACKING = defineRule<Clauses>({
  id: 'effect.create-tokens-per-opponent-tapped-attacking',
  family: 'effect',
  leading: ['for'],
  cites: ['CR 508.4 (Declare Attackers Step)', 'CR 111.2 (Tokens)', 'CR 101.4 (Golden Rules)'],
  examples: [
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control",
    "for each opponent, create a 1/1 red Goblin creature token that's tapped and attacking that player",
    'for each opponent, create two 1/1 white Soldier creature tokens that are tapped and attacking that player',
  ],
  rejects: [
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking",
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking a player",
    "for each player, create a 1/1 white Human creature token that's tapped and attacking that player",
    "create a 1/1 white Human creature token that's tapped and attacking that player",
    'for each opponent, create a 1/1 white Human creature token that attacks that player',
    "for each opponent, create a Treasure token that's tapped and attacking that player",
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player and draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.create-tokens-per-opponent-tapped-attacking';
    const head = literal('for each opponent, create ')(ctx, pos);
    if (!head.ok) return head;
    const token = family<IrToken>('token')(ctx, head.pos);
    if (!token.ok) return token;
    if (token.value.tappedAndAttacking !== true) return fail(ctx, pos);
    const tail = pattern(
      new RegExp(` that player(?: or a planeswalker they control)?${BOUNDARY}`, 'iu'),
    )(ctx, token.pos);
    if (!tail.ok) return fail(ctx, pos);
    if (token.value.copyOf !== undefined || token.value.predefined !== undefined) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: tail.pos };
    const clause: IrClause = makeClause(
      id,
      'createToken',
      { token: token.value, perOpponentTappedAttacking: flag(id, true, span) },
      span,
    );
    return { ok: true, value: [clause], pos: tail.pos };
  },
});

/**
 * `effect.opponents-may-create-tokens`: "Each opponent may create X 1/1 red Elemental creature tokens with haste. For each opponent who does, create X 1/1 red Elemental creature tokens
 * with haste." (Tempt with Vengeance; CR 101.4, 111.2, 608.2d): the two sentences of the offer are one instruction (`segment.ts` keeps them together). Each opponent, in turn order, is
 * asked; one who accepts creates the tokens of the first sentence and the controller of the spell creates the tokens of the second for them. The tokens are the ones the token family reads.
 * Not read: another kind of player, "each player", a second sentence that does not count the opponents who did, no second sentence.
 */
export const EFFECT_OPPONENTS_MAY_CREATE_TOKENS = defineRule<Clauses>({
  id: 'effect.opponents-may-create-tokens',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Golden Rules)',
    'CR 111.2 (Tokens)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'each opponent may create X 1/1 red Elemental creature tokens with haste. for each opponent who does, create X 1/1 red Elemental creature tokens with haste',
    'Each opponent may create X 1/1 red Elemental creature tokens with haste. For each opponent who does, create X 1/1 red Elemental creature tokens with haste',
  ],
  rejects: [
    'each opponent may create X 1/1 red Elemental creature tokens with haste',
    'each opponent may create X 1/1 red Elemental creature tokens with haste. for each opponent, create X 1/1 red Elemental creature tokens with haste',
    'each player may create X 1/1 red Elemental creature tokens with haste. for each player who does, create X 1/1 red Elemental creature tokens with haste',
    'each opponent may create X 1/1 red Elemental creature tokens with haste. for each opponent who does, create X 1/1 red Elemental creature tokens with haste and draw a card',
    'each opponent may create X 1/1 red Elemental creature tokens with haste and draw a card. for each opponent who does, create X 1/1 red Elemental creature tokens with haste',
    'each opponent creates X 1/1 red Elemental creature tokens with haste. for each opponent who does, create X 1/1 red Elemental creature tokens with haste',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.opponents-may-create-tokens';
    const head = literal('each opponent may create ')(ctx, pos);
    if (!head.ok) return head;
    const first = family<IrToken>('token')(ctx, head.pos);
    if (!first.ok) return first;
    const mid = pattern(/\. for each opponent who does, create /iu)(ctx, first.pos);
    if (!mid.ok) return fail(ctx, pos);
    const second = family<IrToken>('token')(ctx, mid.pos);
    if (!second.ok) return fail(ctx, pos);
    const span = { start: pos, end: second.pos };
    const clause: IrClause = makeClause(
      id,
      'opponentsMayCreateTokens',
      { token: first.value, bonus: second.value },
      span,
    );
    return { ok: true, value: [clause], pos: second.pos };
  },
});

/**
 * `effect.its-controller-may-pay-draw`: "Its controller may pay 1 life. If they do, they draw a card." (Gix, Yawgmoth Praetor; CR 118.3, 119.4, 608.2c): the player who controls the creature the
 * trigger is about is asked, pays the life and draws. The two sentences are one instruction (`segment.ts`). The engine's `mayPay` with `by`. Not read: another cost, another number of
 * cards, "you", "that player", "they may pay", a second sentence that does something else.
 */
export const EFFECT_ITS_CONTROLLER_MAY_PAY_DRAW = defineRule<Clauses>({
  id: 'effect.its-controller-may-pay-draw',
  family: 'effect',
  leading: ['its'],
  cites: [
    'CR 118.3 (Costs)',
    'CR 119.4 (Life)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 121.1 (Drawing a Card)',
  ],
  examples: [
    'its controller may pay 1 life. if they do, they draw a card',
    'Its controller may pay 2 life. If they do, they draw two cards',
  ],
  rejects: [
    'its controller may pay 1 life',
    'its controller may pay {1}. if they do, they draw a card',
    'its controller may pay 1 life. if they do, you draw a card',
    'you may pay 1 life. if they do, they draw a card',
    'its controller may pay 1 life. if they do, they draw a card and lose 1 life',
    'that player may pay 1 life. if they do, they draw a card',
    'its controller may pay 0 life. if they do, they draw a card',
    'its controller may pay 1 life. if they do, they discard a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.its-controller-may-pay-draw';
    const r = sequence(
      literal('its controller may pay '),
      spanned(positiveCount),
      pattern(/ life\. if they do, they draw /iu),
      spanned(positiveCount),
      pattern(/ cards?(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, life, , cards] = r.value;
    const span = { start: pos, end: r.pos };
    const clause: IrClause = makeClause(
      id,
      'controllerMayPayDraw',
      {
        life: { kind: 'number', value: life.value, span: life.span },
        cards: { kind: 'number', value: cards.value, span: cards.span },
      },
      span,
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

/**
 * `effect.exile-top-of-target-library`: "Exile the top X cards of target opponent's library." (Gix, Yawgmoth Praetor; CR 701.13, 401.1, 406.3): the cards are exiled one after the other, face
 * up, from the top of the library of a target player or opponent, and are what "those cards" and "cards exiled this way" name afterwards. The engine's `exileTop` with `from`. Not
 * read: your own library, each player's, face down (`effect.exile-top-face-down`), a count of 0 or 1 in the plural, a graveyard.
 */
export const EFFECT_EXILE_TOP_OF_TARGET_LIBRARY = defineRule<Clauses>({
  id: 'effect.exile-top-of-target-library',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 115.1 (Targets)'],
  examples: [
    "exile the top X cards of target opponent's library",
    'exile the top card of target player’s library',
    "exile the top three cards of target opponent's library",
  ],
  rejects: [
    "exile the top X cards of target opponent's library face down",
    "exile the top X cards of target opponent's library, then draw a card",
    "exile the top X cards of target opponent's library, where X is the number of outlaws you control",
    'exile the top X cards of your library',
    "exile the top X cards of each opponent's library",
    "exile the top one cards of target opponent's library",
    "exile the top card of target opponent's graveyard",
    "exile the top X cards of target opponent's library and draw a card",
    "exile the top cards of target opponent's library",
    "exile top X cards of target opponent's library",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top-of-target-library';
    const head = literal('exile the top ')(ctx, pos);
    if (!head.ok) return head;
    const counted = spanned(
      choice<number | 'x'>(
        map(pattern(new RegExp(`card${BOUNDARY}`, 'iu')), () => 1),
        map(
          sequence(
            satisfy(quantity, (n) => n >= 2),
            pattern(new RegExp(` cards${BOUNDARY}`, 'iu')),
          ),
          ([n]) => n,
        ),
        map(pattern(new RegExp(`X cards${BOUNDARY}`, 'u')), () => 'x' as const),
      ),
    )(ctx, head.pos);
    if (!counted.ok) return counted;
    const owner = sequence(
      literal(' of '),
      family<IrNoun>('noun', { only: ['noun.player'] }),
      // Laughing Jasper Flint (issue 685): the count may be defined after the place, ", where X is the number of outlaws you control" (the sentence reads the definition).
      pattern(/['’]s library(?![\p{L}\p{N}])(?!,(?! where X is )| face down| and\b| then\b)/iu),
    )(ctx, counted.pos);
    if (!owner.ok) return owner;
    const [, who] = owner.value;
    if (who.det !== 'target') return fail(ctx, pos);
    const { value, span } = counted.value;
    const count: IrAmount = value === 'x' ? { kind: 'x', span } : { kind: 'number', value, span };
    return {
      ok: true,
      value: [makeClause(id, 'exileTop', { count, from: who }, { start: pos, end: owner.pos })],
      pos: owner.pos,
    };
  },
});

/**
 * `effect.may-play-lands-cast-spells-free`: "You may play lands and cast spells from among cards exiled this way without paying their mana costs." (Gix, Yawgmoth Praetor; CR 601.2,
 * 305.1, 118.9, 611.2a): the cards an earlier instruction of the text exiled may be played as lands and cast for no mana cost for as long as they stay in exile. The engine's `mayPlay`
 * with `free`. Not read: another length, only lands or only spells, "those cards", paying costs, a trailing instruction.
 */
export const EFFECT_MAY_PLAY_LANDS_CAST_SPELLS_FREE = defineRule<Clauses>({
  id: 'effect.may-play-lands-cast-spells-free',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 601.2 (Casting Spells)', 'CR 305.1 (Lands)', 'CR 118.9 (Alternative Costs)'],
  examples: [
    'you may play lands and cast spells from among cards exiled this way without paying their mana costs',
    'You may play lands and cast spells from among cards exiled this way without paying their mana costs',
  ],
  rejects: [
    'you may play lands from among cards exiled this way',
    'you may cast spells from among cards exiled this way without paying their mana costs',
    'you may play lands and cast spells from among cards exiled this way',
    'you may play lands and cast spells from among cards exiled this way without paying their mana costs this turn',
    'you may play lands and cast spells from among those cards without paying their mana costs',
    'you may play lands and cast spells from among cards exiled this way without paying their mana costs and draw a card',
    'you may play lands and cast spells from among cards exiled this way by paying their mana costs',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.may-play-lands-cast-spells-free';
    const r = spanned(
      pattern(
        new RegExp(
          `you may play lands and cast spells from among cards exiled this way without paying their mana costs${BOUNDARY}(?!,| and\\b| then\\b| this turn)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const flag: IrFlag = { kind: 'flag', value: true, span: r.value.span, rule: id };
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'whileExiled',
      span: r.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [{ ...makeClause(id, 'mayPlay', { free: flag }, r.value.span), duration }],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-top-equal-to-different-names`: "Exile a number of cards from the top of your library equal to the number of differently named tokens you control." (Neriv, Crackling
 * Vanguard; CR 701.13, 201.2, 111.4): the controller exiles that many cards from their library, one after the other, face up; they are what "those cards" names afterwards. The
 * engine's `exileTop` with the amount `differentNamesAmong`. Not read: another count, another group, "creatures", your opponent's library, face down.
 */
export const EFFECT_EXILE_TOP_EQUAL_TO_DIFFERENT_NAMES = defineRule<Clauses>({
  id: 'effect.exile-top-equal-to-different-names',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 201.2 (Name)', 'CR 111.4 (Tokens)'],
  examples: [
    'exile a number of cards from the top of your library equal to the number of differently named tokens you control',
  ],
  rejects: [
    'exile a number of cards from the top of your library equal to the number of tokens you control',
    'exile a number of cards from the top of your library equal to the number of differently named creatures you control',
    'exile a number of cards from the top of your library equal to the number of differently named tokens your opponents control',
    "exile a number of cards from the top of target opponent's library equal to the number of differently named tokens you control",
    'exile a number of cards from the top of your library equal to the number of differently named tokens you control face down',
    'exile a number of cards from the top of your library equal to the number of differently named tokens',
    'exile cards from the top of your library equal to the number of differently named tokens you control',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top-equal-to-different-names';
    const head = literal(
      'exile a number of cards from the top of your library equal to the number of differently named ',
    )(ctx, pos);
    if (!head.ok) return head;
    const group = family<IrNoun>('noun', { only: ['noun.token-permanents'] })(ctx, head.pos);
    if (!group.ok) return group;
    const span = { start: head.pos, end: group.pos };
    const count: IrAmount = { kind: 'differentNamesAmong', of: group.value, span };
    return {
      ok: true,
      value: [makeClause(id, 'exileTop', { count }, { start: pos, end: group.pos })],
      pos: group.pos,
    };
  },
});

/**
 * `effect.may-play-during-commander-attack-turns`: "During any turn you attacked with a commander, you may play those cards." (Neriv, Crackling Vanguard; CR 903.3, 508.1, 601.2,
 * 305.1): the cards an earlier instruction exiled may be played, cast or played as lands, for as long as they stay in exile, in the turns the controller attacked with a commander.
 * The engine's `mayPlay` with `duringTurnsAttackedWithCommander`. Not read: another turn condition, "a creature", "this turn", "cast", no "any".
 */
export const EFFECT_MAY_PLAY_DURING_COMMANDER_ATTACK_TURNS = defineRule<Clauses>({
  id: 'effect.may-play-during-commander-attack-turns',
  family: 'effect',
  leading: ['during'],
  cites: ['CR 903.3 (Commander)', 'CR 508.1 (Declare Attackers Step)', 'CR 601.2 (Casting Spells)'],
  examples: [
    'during any turn you attacked with a commander, you may play those cards',
    'During any turn you attacked with a commander, you may play those cards',
  ],
  rejects: [
    'during any turn you attacked with a creature, you may play those cards',
    'during this turn you attacked with a commander, you may play those cards',
    'during any turn you attacked with a commander, you may cast those cards',
    'during any turn you attacked with a commander, you may play those cards and draw a card',
    'during any turn you attacked with a commander, you may play that card',
    'during any turn you attacked with your commander, you may play those cards',
    'during any turn you attacked with a commander you may play those cards',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.may-play-during-commander-attack-turns';
    const r = spanned(
      pattern(
        new RegExp(
          `during any turn you attacked with a commander, you may play those cards${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const flag: IrFlag = { kind: 'flag', value: true, span: r.value.span, rule: id };
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'whileExiled',
      span: r.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'mayPlay', { duringCommanderAttackTurns: flag }, r.value.span),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.double-tokens-this-turn`: "Until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead." (CR 614.1a,
 * 614.5, 611.2a; Kaya, Geist Hunter): the replacement effect of the doubling permanents, as an effect that lasts until the turn ends. The engine's `doubleTokens`. Not read: another
 * duration, a kind of token, "an opponent's", a different count, no "instead".
 */
export const EFFECT_DOUBLE_TOKENS_THIS_TURN = defineRule<Clauses>({
  id: 'effect.double-tokens-this-turn',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 614.5 (Replacement Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 111.2 (Tokens)',
  ],
  examples: [
    'until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'Until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead',
  ],
  rejects: [
    'until your next turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under your control, three times that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under an opponent’s control, twice that many of those tokens are created instead',
    'until end of turn, if one or more artifact tokens would be created under your control, twice that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created',
    'if one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause('effect.double-tokens-this-turn', 'doubleTokensThisTurn', {}, span)],
      pos: r.pos,
    };
  },
});

export const MARDU_SURGE_EFFECT_RULES = [
  EFFECT_CREATE_TOKENS_PER_OPPONENT_TAPPED_ATTACKING,
  EFFECT_OPPONENTS_MAY_CREATE_TOKENS,
  EFFECT_ITS_CONTROLLER_MAY_PAY_DRAW,
  EFFECT_EXILE_TOP_OF_TARGET_LIBRARY,
  EFFECT_MAY_PLAY_LANDS_CAST_SPELLS_FREE,
  EFFECT_EXILE_TOP_EQUAL_TO_DIFFERENT_NAMES,
  EFFECT_MAY_PLAY_DURING_COMMANDER_ATTACK_TURNS,
  EFFECT_DOUBLE_TOKENS_THIS_TURN,
];
