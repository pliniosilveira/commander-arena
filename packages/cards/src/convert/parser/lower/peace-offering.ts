/**
 * Lowerings of the Peace Offering deck (issue 112): the offers to each player or each opponent and what is done for those who took them (Kwain, Itinerant Meddler; Tempt with Bunnies; Tempt
 * with Discovery; CR 101.4, 608.2d), and Selvala, Explorer Returned's reveal (CR 701.20a, 608.2c).
 */
import type { Effect, ManaColor, ObjectFilter } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { LowerContext, Lowering, LowerResult } from './types';

const MANA_COLORS: readonly string[] = ['W', 'U', 'B', 'R', 'G', 'C'];

/** A whole number of life the rule read. */
function lifeOf(clause: IrClause): number | null {
  const life = arg(clause, 'life');
  return life?.kind === 'number' && life.value > 0 ? life.value : null;
}

/**
 * "Each player may draw a card, then each player who drew a card this way gains 1 life." (Kwain, Itinerant Meddler; CR 101.4, 608.2d, 121.1): every player answers in turn order (the
 * engine's `playersMay` holds the answers until the last, then the draws happen); then the players who drew a card gain the life, each once. A player who accepted with an empty
 * library drew nothing and gains nothing.
 */
const PLAYERS_MAY_DRAW_THEN_DREW_GAIN: Lowering<IrClause, Effects> = {
  head: 'playersMayDrawThenDrewGain',
  id: 'lower.players-may-draw-then-drew-gain',
  needs: [
    'effect:playersMay',
    'effect:draw',
    'effect:gainLife',
    'selector:eachPlayer',
    'selector:actedThisWay',
  ],
  lower(clause) {
    const life = lifeOf(clause);
    if (life === null) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'playersMay',
          players: { kind: 'eachPlayer' },
          runsAs: 'chooser',
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
        { kind: 'gainLife', player: { kind: 'actedThisWay', act: 'drew' }, amount: life },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Then each opponent may draw a card and create a 1/1 white Rabbit creature token. For each opponent who does, you draw a card and you create a 1/1 white Rabbit creature token."
 * (Tempt with Bunnies; CR 101.4, 608.2d): the opponents decide in turn order, the effect happens for each who accepted (as that player: "you" is the player asked), and then it
 * happens for the controller once for each opponent who accepted (the Tempting offer rulings): a `playersMay` of `eachOpponent` and a `repeat` of `thisWay` `playersAccepted`.
 */
function opponentsMayForEachWhoDoes(
  lowerToken: (clause: IrClause, ctx: LowerContext) => LowerResult<Effects>,
): Lowering<IrClause, Effects> {
  return {
    head: 'opponentsMayDrawCreateForEachWhoDoes',
    id: 'lower.opponents-may-for-each-who-does',
    needs: [
      'effect:playersMay',
      'effect:repeat',
      'effect:draw',
      'effect:createToken',
      'selector:eachOpponent',
      'amount:thisWay',
    ],
    lower(clause, ctx) {
      const made: Effect[] = [];
      for (const name of ['token', 'bonus'] as const) {
        const token = arg(clause, name);
        if (token?.kind !== 'token') return failure(clause);
        const lowered = lowerToken({ ...clause, verb: 'createToken', args: { token } }, ctx);
        if (!lowered.ok) return lowered;
        const [only, ...rest] = lowered.value;
        // The token goes to the player who creates it ("you"), never to a player the words name.
        if (only?.kind !== 'createToken' || rest.length > 0 || only.controller !== undefined) {
          return failure(clause);
        }
        made.push(only);
      }
      const [offered, given] = made;
      if (offered === undefined || given === undefined) return failure(clause);
      const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
      return {
        ok: true,
        value: [
          {
            kind: 'playersMay',
            players: { kind: 'eachOpponent' },
            runsAs: 'chooser',
            effect: { kind: 'sequence', effects: [draw, offered] },
          },
          {
            kind: 'repeat',
            times: { kind: 'thisWay', what: 'playersAccepted' },
            effect: { kind: 'sequence', effects: [draw, given] },
          },
        ],
        rule: clause.rule,
      };
    },
  };
}

/**
 * "Each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put
 * it onto the battlefield. Then each player who searched a library this way shuffles." (Tempt with Discovery; CR 101.4, 701.23, 701.24): the opponents decide in turn order and those who
 * accept search together (`search` of `eachOpponent`, `optional`, CR 701.23i); the controller searches once for each of them (the number of opponents of `actedThisWay` `searched`); then
 * every player who searched shuffles their library, once. No search shuffles on its own.
 */
const OPPONENTS_MAY_SEARCH_FOR_EACH_WHO_SEARCHES: Lowering<IrClause, Effects> = {
  head: 'opponentsMaySearchForEachWhoSearches',
  id: 'lower.opponents-may-search-for-each-who-searches',
  needs: [
    'effect:search',
    'effect:repeat',
    'effect:shuffle',
    'selector:eachOpponent',
    'selector:actedThisWay',
    'amount:playerCount',
    'searchDestination:battlefield',
  ],
  lower(clause) {
    const basic = arg(clause, 'basic');
    if (basic?.kind !== 'flag') return failure(clause);
    const filter: ObjectFilter = {
      types: ['land'],
      ...(basic.value ? { supertypes: ['basic'] } : {}),
    };
    const search = (player: 'you' | 'eachOpponent', optional: boolean): Effect => ({
      kind: 'search',
      player: { kind: player },
      ...(optional ? { optional: true as const } : {}),
      filter,
      max: 1,
      destinations: [{ zone: 'battlefield', count: 1 }],
      reveal: false,
      shuffle: false,
    });
    const searched = { kind: 'actedThisWay', act: 'searched' } as const;
    return {
      ok: true,
      value: [
        search('eachOpponent', true),
        {
          kind: 'repeat',
          times: { kind: 'playerCount', of: { ...searched, of: { kind: 'eachOpponent' } } },
          effect: search('you', false),
        },
        { kind: 'shuffle', player: searched },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player draws a card." (Selvala, Explorer Returned;
 * CR 701.20a, 608.2c, 106.4, 121.1): the engine's `revealTopBranches` of every player, one branch for the cards that are not lands, done by the controller (`asController`), then a draw
 * of every player. The mana stays in the controller's pool as any mana does (CR 106.4).
 */
const REVEAL_EACH_MANA_LIFE_THEN_DRAW: Lowering<IrClause, Effects> = {
  head: 'revealEachManaLifeThenDraw',
  id: 'lower.reveal-each-mana-life-then-draw',
  needs: [
    'effect:revealTopBranches',
    'effect:addMana',
    'effect:gainLife',
    'effect:draw',
    'selector:eachPlayer',
  ],
  lower(clause) {
    const mana = arg(clause, 'mana');
    const life = lifeOf(clause);
    if (mana?.kind !== 'manaSpec' || mana.what.kind !== 'symbols' || life === null) {
      return failure(clause);
    }
    const symbols = mana.what.symbols.filter((s): s is ManaColor => MANA_COLORS.includes(s));
    if (symbols.length === 0 || symbols.length !== mana.what.symbols.length) return failure(clause);
    const everyone = { kind: 'eachPlayer' } as const;
    return {
      ok: true,
      value: [
        {
          kind: 'revealTopBranches',
          player: everyone,
          branches: [
            {
              ifMatches: { notTypes: ['land'] },
              asController: true,
              onMatch: {
                kind: 'sequence',
                effects: [
                  { kind: 'addMana', mana: { kind: 'fixed', mana: [...symbols] } },
                  { kind: 'gainLife', player: { kind: 'you' }, amount: life },
                ],
              },
            },
          ],
        },
        { kind: 'draw', player: everyone, count: 1 },
      ],
      rule: clause.rule,
    };
  },
};

export function peaceOfferingLowerings(
  lowerToken: (clause: IrClause, ctx: LowerContext) => LowerResult<Effects>,
): readonly Lowering<IrClause, Effects>[] {
  return [
    PLAYERS_MAY_DRAW_THEN_DREW_GAIN,
    opponentsMayForEachWhoDoes(lowerToken),
    OPPONENTS_MAY_SEARCH_FOR_EACH_WHO_SEARCHES,
    REVEAL_EACH_MANA_LIFE_THEN_DRAW,
  ];
}
