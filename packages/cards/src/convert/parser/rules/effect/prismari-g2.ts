/**
 * Effect rules of group 2 of the Prismari deck (issue 87, D-647 and later): the tokens made for each opponent that attack it, the mana that stays through steps and phases, the spell
 * that exiles itself with time counters, and the exile of a card and the copy of it that may be cast.
 *
 * - `effect.create-tokens-per-opponent-attacking`: "For each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able."
 *   (CR 111.2, 508.1d, 101.4). The engine's `createToken` with `forEachOpponent`.
 * - `effect.add-mana-stays`: "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end." (CR 500.5, 106.4): the two sentences of
 *   one instruction, joined by `segment.ts`. The engine's `addMana` with `staysUntilEndOfTurn`.
 * - `effect.exile-self-time-counters`: "Exile ~ with three time counters on it." (CR 608.2n, 122.1, 702.62b). The engine's `exileSpellWithTimeCounters`.
 * - `effect.exile-copy-cast`: "Exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost." (CR 707.12, 608.2g): the two
 *   sentences of one instruction, joined by `segment.ts`. The engine's `exile` of the target and `copyCardAndCast` of the card exiled.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type {
  IrAmount,
  IrBasePt,
  IrClause,
  IrColorSpec,
  IrDuration,
  IrNoun,
  IrToken,
  IrTypeList,
} from '../../ir/types';
import { positiveCount } from '../amount/index';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/**
 * `effect.create-tokens-per-opponent-attacking`: "For each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able."
 * (CR 111.2: the player creating a token controls it; CR 508.1d: a requirement to attack, obeyed if able; CR 101.4). The tokens are the ones the token family reads
 * (a custom token with keywords), made once for each opponent, each of which must attack the opponent it was made for. Not read: "for each player", a token that is a copy, "that attack
 * a player", "this turn" left out, "if able" left out, a count after "for each".
 */
export const EFFECT_CREATE_TOKENS_PER_OPPONENT_ATTACKING = defineRule<Clauses>({
  id: 'effect.create-tokens-per-opponent-attacking',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 111.2 (Tokens)',
    'CR 508.1d (Declare Attackers Step)',
    'CR 101.4 (Golden Rules)',
    'CR 603.7 (Delayed Triggered Abilities)',
  ],
  examples: [
    'for each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able',
    'for each opponent, create a 2/2 red Goblin creature token that attacks that opponent this turn if able',
    'for each opponent, create two 1/1 white Soldier creature tokens that attack that opponent this turn if able',
  ],
  rejects: [
    'for each opponent, create two 3/3 blue and red Elemental creature tokens with flying',
    'for each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent',
    'for each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn',
    'for each player, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able',
    'for each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack a player this turn if able',
    'for each opponent, create a Treasure token that attacks that opponent this turn if able',
    'for each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able and draw a card',
    'for each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent next turn if able',
    'create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able',
    'for each opponent, create a token that is a copy of target creature that attacks that opponent this turn if able',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.create-tokens-per-opponent-attacking';
    const head = literal('for each opponent, create ')(ctx, pos);
    if (!head.ok) return head;
    const token = family<IrToken>('token')(ctx, head.pos);
    if (!token.ok) return token;
    // "tokens ... that attack", "a token ... that attacks": the verb agrees with the number of tokens.
    const plural = token.value.count.kind !== 'number' || token.value.count.value !== 1;
    const tail = pattern(
      new RegExp(
        ` that ${plural ? 'attack' : 'attacks'} that opponent this turn if able${BOUNDARY}`,
        'iu',
      ),
    )(ctx, token.pos);
    if (!tail.ok) return fail(ctx, pos);
    // Only a token the engine makes plain: a custom creature token (the lowering refuses anything else).
    if (token.value.copyOf !== undefined || token.value.predefined !== undefined) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: tail.pos };
    const clause: IrClause = makeClause(
      id,
      'createToken',
      { token: token.value, perOpponentAttack: flag(id, true, span) },
      span,
    );
    return { ok: true, value: [clause], pos: tail.pos };
  },
});

/**
 * `effect.add-mana-stays`: "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end." (CR 500.5: mana empties as each step and
 * phase ends unless an effect says otherwise; CR 106.4). The two sentences are one instruction (`segment.ts` keeps them together): the mana the first adds stays in the pool until the
 * turn ends. Any way of saying what is added that `effect.add-mana` reads may come first. Not read: another duration ("until your next turn"), another words for "this mana", "all of your
 * mana", a second sentence apart from the first.
 */
export const EFFECT_ADD_MANA_STAYS = defineRule<Clauses>({
  id: 'effect.add-mana-stays',
  family: 'effect',
  leading: ['add'],
  cites: [
    'CR 500.5 (Beginning of Turn)',
    'CR 106.4 (Mana)',
    'CR 514.2 (Cleanup Step)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    "add {R} for each card in target opponent's hand. until end of turn, you don't lose this mana as steps and phases end",
    'add {R}{R}. until end of turn, you don’t lose this mana as steps and phases end',
    "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end",
  ],
  rejects: [
    "add {R} for each card in target opponent's hand. until end of turn, you don't lose this mana",
    "add {R} for each card in target opponent's hand. until your next turn, you don't lose this mana as steps and phases end",
    "add {R} for each card in target opponent's hand. until end of turn, you don't lose mana as steps and phases end",
    "add {R} for each card in target opponent's hand. until end of turn, you don't lose this mana as steps and phases end and draw a card",
    "add {R} for each card in target opponent's hand. you don't lose this mana as steps and phases end",
    "add {R} for each card in target opponent's hand. until end of turn, you don't lose this mana as steps end",
    "add {R} for each card in target opponent's hand",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.add-mana-stays';
    // Only a text that carries the second sentence is this rule's: any other "Add ..." is left to
    // the rules that read it, so their diagnostics (the closest rule) stay as they were.
    if (
      !/\. until end of turn, you don['’]t lose this mana as steps and phases end/iu.test(
        ctx.text.slice(pos),
      )
    )
      return fail(ctx, pos);
    const added = family<Clauses>('effect', { only: ['effect.add-mana'] })(ctx, pos);
    if (!added.ok) return added;
    const [only, ...more] = added.value;
    if (only === undefined || more.length > 0) return fail(ctx, pos);
    const stays = spanned(
      pattern(
        new RegExp(
          `\\. until end of turn, you don['’]t lose this mana as steps and phases end${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, added.pos);
    if (!stays.ok) return fail(ctx, pos);
    const span = { start: pos, end: stays.pos };
    const clause: IrClause = {
      ...only,
      span,
      rule: id,
      args: { ...only.args, stays: flag(id, true, stays.value.span) },
    };
    return { ok: true, value: [clause], pos: stays.pos };
  },
});

/**
 * `effect.exile-self-time-counters`: "Exile ~ with three time counters on it." (CR 608.2n: the last instruction of the spell decides where it goes; CR 122.1: counters; CR 702.62b: a card
 * with Suspend that is in exile with a time counter is suspended). The spell's own text, `~` being the spell itself. The engine's `exileSpellWithTimeCounters`. Not read: another kind of
 * counter, "a time counter", no number, another object than the card itself, "this turn".
 */
export const EFFECT_EXILE_SELF_TIME_COUNTERS = defineRule<Clauses>({
  id: 'effect.exile-self-time-counters',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 608.2n (Resolving Spells and Abilities)',
    'CR 122.1 (Counters)',
    'CR 702.62b (Suspend)',
  ],
  examples: [
    'exile ~ with three time counters on it',
    'Exile ~ with three time counters on it',
    'exile ~ with two time counters on it',
    'exile ~ with 4 time counters on it',
  ],
  rejects: [
    'exile ~ with a time counter on it',
    'exile ~ with three time counters',
    'exile ~ with three charge counters on it',
    'exile ~ with three time counter on it',
    'exile target card with three time counters on it',
    'exile it with three time counters on it',
    'exile ~ with three time counters on it and draw a card',
    'exile ~ with time counters on it',
    'exile ~',
    'exile ~ with zero time counters on it',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-self-time-counters';
    const r = sequence(
      literal('exile ~ with '),
      spanned(positiveCount),
      pattern(new RegExp(` time counters on it${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count] = r.value;
    // "a time counter" is one counter, said in the singular: left to another rule if one ever reads it.
    if (count.value < 2) return fail(ctx, pos);
    const amount: IrAmount = { kind: 'number', value: count.value, span: count.span };
    return {
      ok: true,
      value: [
        makeClause(id, 'exileSelfTimeCounters', { count: amount }, { start: pos, end: r.pos }),
      ],
      pos: r.pos,
    };
  },
});

/**
 * The words after the exile of `effect.exile-copy-cast`: " and copy it. You may cast the copy without paying its mana cost" or, since Mizzix's Mastery (issue 121), ". For each card exiled
 * this way, copy it, and you may cast the copy without paying its mana cost" (the card exiled is copied and the copy cast, once for each card the exile moved).
 */
const COPY_TAIL = new RegExp(
  `(?: and copy it\\. you may cast the copy|\\. for each card exiled this way, copy it, and you may cast the copy) without paying its mana cost${BOUNDARY}`,
  'iu',
);
const COPY_TAIL_TEST =
  /(?: and copy it\. you may cast the copy|\. for each card exiled this way, copy it, and you may cast the copy) without paying its mana cost/iu;

/**
 * `effect.exile-copy-cast`: "Exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost." (CR 707.12: an effect
 * can have a player cast a copy of a card; CR 608.2g: during resolution, with no priority; CR 118.9: without paying its mana cost). The two sentences are one instruction (`segment.ts`
 * keeps them together). Any "exile up to one target ... card from your graveyard" that the exile rule reads comes first; the copy is of the card that was exiled. Not read: a copy
 * that is not cast, "it" cast instead of the copy, a cost, another number of cards, another zone.
 */
export const EFFECT_EXILE_COPY_CAST = defineRule<Clauses>({
  id: 'effect.exile-copy-cast',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 707.12 (Copying Objects)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 707.2 (Copying Objects)',
  ],
  examples: [
    'exile up to one target instant or sorcery card from your graveyard and copy it. you may cast the copy without paying its mana cost',
    'Exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost',
    'exile target instant card from your graveyard and copy it. you may cast the copy without paying its mana cost',
    'exile target instant or sorcery card from your graveyard. for each card exiled this way, copy it, and you may cast the copy without paying its mana cost',
  ],
  rejects: [
    'exile up to one target instant or sorcery card from your graveyard and copy it',
    'exile up to one target instant or sorcery card from your graveyard and copy it. you may cast it without paying its mana cost',
    'exile up to one target instant or sorcery card from your graveyard and copy it. you may cast the copy',
    'exile up to one target instant or sorcery card from your graveyard and copy it. you may cast the copy by paying its mana cost',
    'exile up to one target instant or sorcery card from your graveyard and copy it. you may cast the copy without paying its mana cost and draw a card',
    'exile up to one target instant or sorcery card from your graveyard. you may cast the copy without paying its mana cost',
    'exile up to one target instant or sorcery card from your graveyard and copy it. you must cast the copy without paying its mana cost',
    'exile target instant or sorcery card from your graveyard. for each card exiled this way, copy it, and you may cast the copy',
    'exile target instant or sorcery card from your graveyard. for each card exiled this way, copy it and cast the copy without paying its mana cost',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-copy-cast';
    // Only a text that carries the copy sentence is this rule's (see `effect.add-mana-stays`).
    if (!COPY_TAIL_TEST.test(ctx.text.slice(pos))) return fail(ctx, pos);
    const exiled = family<Clauses>('effect', { only: ['effect.exile'] })(ctx, pos);
    if (!exiled.ok) return exiled;
    const [only, ...more] = exiled.value;
    if (only === undefined || more.length > 0) return fail(ctx, pos);
    const tail = pattern(COPY_TAIL)(ctx, exiled.pos);
    if (!tail.ok) return fail(ctx, pos);
    const span = { start: pos, end: tail.pos };
    const copy: IrClause = makeClause(id, 'copyCardAndCast', {}, span);
    return {
      ok: true,
      value: [
        { ...only, span, rule: id, connector: 'and' as const },
        { ...copy, optional: false },
      ],
      pos: tail.pos,
    };
  },
});

/**
 * `effect.lead-becomes-land-creature`: "Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with \"During your turn, ~ has first strike.\" It's still a land." (CR 613.1d, 613.1e,
 * 613.1f, 613.4b, 205.1b, 604.1, 109.5, 611.2a): a land that is also a creature until the end of the turn, with the base power and toughness, the colors and the creature types the text
 * says, and a keyword that works on its controller's turn only (the static ability in the quotes, a granted ability "during your turn"). "It's still a land" says that its types are
 * added to, not replaced (CR 205.1b). Only `~` itself, one keyword, the words of the quotes exactly. Not read: another duration, another subject, no colors, no creature type, another
 * words in the quotes ("has", "gets"), more than one keyword, "that's still a land", the quotes without "It's still a land".
 */
export const EFFECT_LEAD_BECOMES_LAND_CREATURE = defineRule<Clauses>({
  id: 'effect.lead-becomes-land-creature',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 109.5 (Objects)',
  ],
  examples: [
    'until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike." It’s still a land',
    'Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike." It\'s still a land',
    'Until end of turn, ~ becomes a 3/3 green Elemental creature with "During your turn, ~ has trample." It\'s still a land',
  ],
  rejects: [
    'Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike."',
    'Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ gets first strike." It\'s still a land',
    'Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike and trample." It\'s still a land',
    'Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During each turn, ~ has first strike." It\'s still a land',
    'Until your next turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike." It\'s still a land',
    'Until end of turn, target land becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike." It\'s still a land',
    'Until end of turn, ~ becomes a blue and red Elemental creature with "During your turn, ~ has first strike." It\'s still a land',
    'Until end of turn, ~ becomes a 2/1 Elemental creature with "During your turn, ~ has first strike." It\'s still a land',
    'Until end of turn, ~ becomes a 2/1 blue and red creature with "During your turn, ~ has first strike." It\'s still a land',
    'Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike." It\'s still a planeswalker',
    'Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike." It\'s still a land and you draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.lead-becomes-land-creature';
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(
        pattern(
          /(white|blue|black|red|green)(?: and (white|blue|black|red|green))?(?![\p{L}\p{N}]) /iu,
        ),
      ),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature with "During your turn, ~ has '),
      spanned(KEYWORD_WORDS),
      pattern(/\."(?: )It['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, colorWords, types, , keywords] = r.value;
    // One keyword: "has first strike and trample" is two abilities the engine would have to give on the controller's turn each; not read.
    const [word, ...others] = keywords.value;
    if (word === undefined || others.length > 0) return fail(ctx, pos);
    const colors = [colorWords.value[1], colorWords.value[2]]
      .filter((c): c is string => c !== undefined)
      .map((c) => c.toLowerCase());
    if (new Set(colors).size !== colors.length) return fail(ctx, pos);
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: id,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: id,
    };
    const colorSpec: IrColorSpec = { kind: 'colorSpec', colors, span: colorWords.span, rule: id };
    const becomes: IrClause = {
      ...makeClause(
        id,
        'becomes',
        { objects: subject, types: typeList, colors: colorSpec, basePt },
        types.span,
      ),
      duration,
      connector: 'and' as const,
    };
    const grant: IrClause = {
      ...makeClause(
        id,
        'grantKeywordYourTurn',
        {
          objects: subject,
          keyword: { kind: 'keywordName', name: word, span: keywords.span, rule: id },
        },
        keywords.span,
      ),
      duration,
    };
    return { ok: true, value: [becomes, grant], pos: r.pos };
  },
});

/**
 * `effect.switch-self-pt`: "Switch ~'s power and toughness until end of turn" (Wandering Fumarole's granted ability; CR 613.4d, 611.2a, 514.2): the object's own power and toughness are
 * switched until the turn ends, a layer 7d effect (the engine's `switchPt`). Only `~` itself, only "until end of turn". Not read: another subject, a missing or other duration, "its",
 * a target.
 */
export const EFFECT_SWITCH_SELF_PT = defineRule<Clauses>({
  id: 'effect.switch-self-pt',
  family: 'effect',
  leading: ['switch'],
  cites: [
    'CR 613.4d (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    "switch ~'s power and toughness until end of turn",
    'Switch ~’s power and toughness until end of turn',
  ],
  rejects: [
    "switch ~'s power and toughness",
    "switch ~'s power and toughness until your next turn",
    "switch target creature's power and toughness until end of turn",
    "switch ~'s power and toughness until end of turn and draw a card",
    "switch ~'s power and toughness until end of turns",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('switch '),
      // Read here and not as `noun.self`: the rules of the noun family are found by the word they start with, and "~'s" is not "~".
      map(
        spanned(literal('~')),
        ({ span }): IrNoun => ({
          kind: 'noun',
          det: 'self',
          filter: { raw: '~' },
          upTo: false,
          plural: false,
          other: false,
          span,
          rule: 'effect.switch-self-pt',
        }),
      ),
      pattern(/['’]s power and toughness /iu),
      family<IrDuration>('duration', { only: ['duration.until-end-of-turn'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, subject, , duration] = r.value;
    const span = { start: pos, end: r.pos };
    const clause: IrClause = {
      ...makeClause('effect.switch-self-pt', 'switchPt', { objects: subject }, span),
      duration,
    };
    return { ok: true, value: [clause], pos: r.pos };
  },
});

export const PRISMARI_G2_EFFECT_RULES = [
  EFFECT_CREATE_TOKENS_PER_OPPONENT_ATTACKING,
  EFFECT_ADD_MANA_STAYS,
  EFFECT_EXILE_SELF_TIME_COUNTERS,
  EFFECT_EXILE_COPY_CAST,
  EFFECT_LEAD_BECOMES_LAND_CREATURE,
  EFFECT_SWITCH_SELF_PT,
];
