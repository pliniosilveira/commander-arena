/**
 * Lowerings of the Hofri Ghostforge deck (stage P68, D-229): the instructions the grammar reads for this deck that no other file lowers.
 */
import type {
  Ability,
  CardType,
  Color,
  Effect,
  ManaColor,
  ObjectFilter,
  TokenDefinition,
} from '@commander-arena/engine';
import type { IrAbility, IrClause, IrNoun, IrStaticEffect } from '../ir/types';
import {
  isGrantable,
  keywordKind,
  plainKeyword,
  type SimpleKeyword,
} from '../rules/keyword/vocabulary';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { type FeatureRef, missingFeatures } from './features';
import { colorLetter, lowerFilter, objectRefOf, playerSelectorOf } from './nouns';
import { lowerTokenAbility } from './tokens';
import type { LowerContext, LowerFailure, Lowering, LowerResult } from './types';

const COLORS: readonly (readonly [ManaColor, string])[] = [
  ['W', 'white'],
  ['U', 'blue'],
  ['B', 'black'],
  ['R', 'red'],
  ['G', 'green'],
];

/**
 * "Target player adds one mana of any color" (CR 106.1b, 605.3b): the player the noun names chooses one of the five colors (the engine's `chooseOne` with that
 * player as the chooser), and one mana of it goes into their pool (`addMana` for that player).
 */
const PLAYER_ADDS_MANA: Lowering<IrClause, Effects> = {
  head: 'addManaToPlayer',
  id: 'lower.player-adds-mana',
  needs: ['effect:chooseOne', 'effect:addMana', 'selector:target'],
  lower: (clause, ctx) => {
    const who = operand(clause, 'player');
    if (who === undefined || who.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who as IrNoun, ctx);
    if (!player.ok) return player;
    if (player.value.kind !== 'target') return failure(clause);
    const options = COLORS.map(([color, label]) => ({
      label,
      effect: {
        kind: 'addMana',
        mana: { kind: 'fixed', mana: [color] },
        player: player.value,
      } as Effect,
    }));
    return {
      ok: true,
      value: [{ kind: 'chooseOne', options, chooser: player.value }],
      rule: clause.rule,
    };
  },
};

/** "Copy ~ and may choose a new target for the copy" (CR 707.10, 707.10c): the engine's `copySpell` of the spell that is resolving. */
const COPY_THIS_SPELL: Lowering<IrClause, Effects> = {
  head: 'copyThisSpell',
  id: 'lower.copy-this-spell',
  needs: ['effect:copySpell', 'effect:may'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'may',
        effect: { kind: 'copySpell', spell: { kind: 'thisSpell' }, newTargets: 'may' },
      },
    ],
    rule: clause.rule,
  }),
};

/**
 * "It's a 1/1 Spirit creature with flying in addition to its other types" (CR 205.1b, 613.1d, 613.4b, 613.1f): the permanents the instruction before put onto the
 * battlefield (`moved`) get the types, the base power and toughness and the keywords for good (`setTypes` with `basePt`, `grantKeyword` for each).
 */
const BECOMES_IN_ADDITION: Lowering<IrClause, Effects> = {
  head: 'becomesInAddition',
  id: 'lower.becomes-in-addition',
  needs: ['effect:setTypes', 'effect:grantKeyword', 'selector:moved'],
  lower: (clause) => {
    const types = arg(clause, 'types');
    const pt = arg(clause, 'basePt');
    const words = arg(clause, 'keywords');
    if (types?.kind !== 'typeList' || types.additive !== true) return failure(clause);
    const kinds: SimpleKeyword[] = [];
    for (const name of words?.kind === 'keywordList' ? words.names : []) {
      const kind = keywordKind(name);
      if (kind === undefined || !isGrantable(kind)) return failure(clause);
      kinds.push(kind);
    }
    const moved = { kind: 'moved' } as const;
    const effects: Effect[] = [
      {
        kind: 'setTypes',
        objects: moved,
        subtypes: [...types.subtypes],
        // A base power and toughness go with the type creature (the engine's rule): "Each of them is a 1/1 Spirit" names a creature type, which only a creature has (CR 205.3d).
        ...(types.cardTypes !== undefined
          ? { types: types.cardTypes as CardType[] }
          : pt?.kind === 'basePt'
            ? { types: ['creature' as const] }
            : {}),
        additive: true,
        ...(pt?.kind === 'basePt' ? { basePt: { power: pt.power, toughness: pt.toughness } } : {}),
        duration: 'permanent',
      },
      ...kinds.map(
        (kind): Effect => ({
          kind: 'grantKeyword',
          objects: moved,
          keyword: plainKeyword(kind),
          duration: 'permanent',
        }),
      ),
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/**
 * "Create a token that's a copy of that creature, except it's a Spirit in addition to its other types and it has "When ~ leaves the battlefield, return the exiled card to its
 * owner's graveyard."" (CR 707.2, 707.9b): the engine's `createToken` of a copy of the creature the trigger is about (read from last-known information), with the creature type
 * and the ability the exceptions add, and the card the instruction before exiled as its linked exile.
 */
const CREATE_COPY_TOKEN: Lowering<IrClause, Effects> = {
  head: 'createCopyToken',
  id: 'lower.create-copy-token',
  needs: ['effect:createToken', 'selector:triggerSubject'],
  lower: (clause, ctx) => {
    const source = operand(clause, 'source');
    const quoted = clause.args.quoted;
    const types = arg(clause, 'types');
    if (source?.kind !== 'noun' || quoted?.kind !== 'quoted' || types?.kind !== 'typeList') {
      return failure(clause);
    }
    const ref = objectRefOf(source, ctx, { triggerSubject: true });
    if (!ref.ok) return ref;
    if (ref.value.kind !== 'triggerSubject') return failure(clause);
    const ability = lowerTokenAbility(quoted, ['creature'], [...types.subtypes], ctx);
    if (!ability.ok) return ability;
    return {
      ok: true,
      value: [
        {
          kind: 'createToken',
          token: {
            kind: 'copyOf',
            object: ref.value,
            addSubtypes: [...types.subtypes],
            abilities: [ability.value],
            linkExiled: true,
          },
          count: 1,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top seven cards of your library. Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield. Put the
 * rest on the bottom of your library in a random order." (CR 401.2, 202.3): the engine's `lookAtTop` of the controller's library, any number of nonland permanent cards
 * (up to the number looked at) whose mana values add up to the limit, put onto the battlefield, the rest on the bottom in a random order.
 */
const LOOK_PUT_TOTAL: Lowering<IrClause, Effects> = {
  head: 'lookPutTotal',
  id: 'lower.look-put-total',
  needs: ['effect:lookAtTop', 'selector:anyOf'],
  lower: (clause) => {
    const count = arg(clause, 'count');
    const total = arg(clause, 'total');
    if (count?.kind !== 'number' || total?.kind !== 'number') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: {
            filter: {
              anyOf: [
                { types: ['artifact'] },
                { types: ['creature'] },
                { types: ['enchantment'] },
                { types: ['planeswalker'] },
                { types: ['battle'] },
              ],
            },
            max: count.value,
            to: 'battlefield',
            totalManaValue: total.value,
          },
          rest: 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "The exiled card's owner creates an X/X blue Illusion creature token, where X is the mana value of the exiled card" (CR 607.2a, 111.2, 202.3): the owner of the card the
 * permanent exiled with its linked ability creates the token; its power and toughness are that card's mana value as the token is created.
 */
const CREATE_LINKED_EXILE_TOKEN: Lowering<IrClause, Effects> = {
  head: 'createLinkedExileToken',
  id: 'lower.create-linked-exile-token',
  needs: ['effect:createToken', 'token:custom'],
  lower: (clause) => {
    const token = arg(clause, 'token');
    if (token === undefined || token.kind !== 'token') return failure(clause);
    const colors: Color[] = [];
    for (const word of token.colors ?? []) {
      const letter = colorLetter(word);
      if (letter === undefined) return failure(clause);
      colors.push(letter);
    }
    const subtypes = [...(token.subtypes ?? [])];
    const definition: TokenDefinition = {
      name: subtypes.join(' '),
      manaCost: null,
      supertypes: [],
      types: ['creature'],
      subtypes,
      colors,
      power: 0,
      toughness: 0,
      loyalty: null,
      defense: null,
      oracleText: '',
      abilities: [],
    };
    const exiled = { kind: 'linkedExile' } as const;
    return {
      ok: true,
      value: [
        {
          kind: 'createToken',
          token: { kind: 'custom', definition, ptAmount: { kind: 'manaValueOf', of: exiled } },
          count: 1,
          controller: { kind: 'ownerOf', of: exiled },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature"
 * (CR 701.13, 603.12): the exile of every player and the reflexive ability that counts the nonland cards exiled, with its own target.
 */
const EACH_EXILES_THEN_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'eachExilesThenCounters',
  id: 'lower.each-exiles-then-counters',
  needs: ['effect:exileOwnGraveyardCard', 'effect:reflexive', 'effect:addCounters'],
  lower: (clause, ctx) => {
    const before = ctx.targets.length;
    const counters = eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'addCounters',
        objects,
        counter: '+1/+1',
        count: { kind: 'thisWay', what: 'exiledNonland' },
      }),
      'objects',
      {},
    );
    if (!counters.ok) return counters;
    const own = ctx.targets.splice(before);
    const [only, ...more] = counters.value;
    if (only === undefined || more.length > 0) return failure(clause);
    return {
      ok: true,
      value: [
        { kind: 'exileOwnGraveyardCard', players: { kind: 'eachPlayer' } },
        {
          kind: 'reflexive',
          ifThisWay: 'exiledNonland',
          ...(own.length > 0 ? { targets: own } : {}),
          effect: only,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "For each player, you choose from among the permanents that player controls an artifact, a creature, ... Then each player sacrifices all other nonland permanents they
 * control" (CR 608.2d, 701.21a): the engine's `sparePermanents` with the card types in the order of the text.
 */
const SPARE_PERMANENTS: Lowering<IrClause, Effects> = {
  head: 'sparePermanents',
  id: 'lower.spare-permanents',
  needs: ['effect:sparePermanents'],
  lower: (clause) => {
    const types = arg(clause, 'types');
    if (types === undefined || types.kind !== 'typeList' || types.cardTypes === undefined) {
      return failure(clause);
    }
    // D-484 (Liliana, Dreadhorde General): "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest": each opponent chooses for themselves.
    const own = arg(clause, 'eachOpponent')?.kind === 'flag';
    return {
      ok: true,
      value: [
        {
          kind: 'sparePermanents',
          types: types.cardTypes as CardType[],
          ...(own ? { own: { players: { kind: 'eachOpponent' as const } } } : {}),
        },
      ],
      rule: clause.rule,
    };
  },
};

type GraveyardPlayStatic = Extract<IrStaticEffect, { kind: 'graveyardPlay' }>;

export function isGraveyardPlayStatic(effect: IrStaticEffect): effect is GraveyardPlayStatic {
  return effect.kind === 'graveyardPlay';
}

/**
 * "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains ..."
 * (CR 601.2a, 305.1): the engine's `playFromGraveyardOnceEachTurn`. The ability the permanent gains is lowered as the ability of a token is (the permanent it names is
 * "this permanent").
 */
export function lowerGraveyardPlayStatic(
  ability: Extract<IrAbility, { kind: 'static' }>,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  const fail = (needs: readonly FeatureRef[] = []): LowerFailure => ({
    ok: false,
    needs,
    at: ability.span,
    rule: ability.rule,
  });
  if (
    effect === undefined ||
    !isGraveyardPlayStatic(effect) ||
    more.length > 0 ||
    statement.subject.det !== 'you' ||
    statement.condition !== undefined ||
    statement.also !== undefined
  ) {
    return fail();
  }
  const blocked = missingFeatures(['ability:static', 'static:playFromGraveyardOnceEachTurn']);
  if (blocked.length > 0) return fail(blocked);
  let cast: ObjectFilter | undefined;
  if (effect.cast !== undefined) {
    const { zone, stackKind, ...described } = effect.cast;
    void zone;
    void stackKind;
    const lowered = lowerFilter({
      kind: 'noun',
      det: 'a',
      filter: described,
      upTo: false,
      plural: true,
      other: false,
      span: ability.span,
      rule: ability.rule,
    });
    if (!lowered.ok) return lowered;
    cast = lowered.value;
  }
  let gains: Ability | undefined;
  if (effect.gains !== undefined) {
    const own = lowerTokenAbility(effect.gains, [], [], ctx);
    if (!own.ok) return own;
    gains = own.value;
  }
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'playFromGraveyardOnceEachTurn',
          ...(cast === undefined ? {} : { cast }),
          ...(effect.land ? { land: true as const } : {}),
          ...(effect.entersTapped ? { entersTapped: true as const } : {}),
          ...(gains === undefined ? {} : { gains }),
        },
      },
    ],
    rule: ability.rule,
  };
}

/** "An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped" (CR 608.2d): the engine's `splitCostExiled`. */
const SPLIT_COST_EXILED: Lowering<IrClause, Effects> = {
  head: 'splitCostExiled',
  id: 'lower.split-cost-exiled',
  needs: ['effect:splitCostExiled'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'splitCostExiled', chosenTo: 'libraryBottom', otherTo: 'battlefieldTapped' }],
    rule: clause.rule,
  }),
};

/**
 * "You may have ~ become a copy of an artifact or creature card from among those cards until end of turn" (CR 707.2, 400.7): the engine's `becomeCopyOfCard` of the permanent
 * itself, in a `may` when the text says "you may". Only in a trigger about the cards that left a graveyard (`validateCard`).
 */
const BECOME_COPY_OF_CARDS: Lowering<IrClause, Effects> = {
  head: 'becomeCopyOfCards',
  id: 'lower.become-copy-of-cards',
  needs: ['effect:becomeCopyOfCard', 'effect:may'],
  lower: (clause) => {
    const may = arg(clause, 'may');
    const effect: Effect = {
      kind: 'becomeCopyOfCard',
      objects: { kind: 'this' },
      types: ['artifact', 'creature'],
      duration: 'untilEndOfTurn',
    };
    return {
      ok: true,
      value: [may?.kind === 'flag' && may.value ? { kind: 'may', effect } : effect],
      rule: clause.rule,
    };
  },
};

/** "Any number of other target creatures you control phase out" (CR 702.26): the engine's `phaseOut` of what the operand names. */
const PHASE_OUT: Lowering<IrClause, Effects> = {
  head: 'phaseOut',
  id: 'lower.phase-out',
  needs: ['effect:phaseOut'],
  lower: (clause, ctx) =>
    eachObject(clause, ctx, (objects) => ({ kind: 'phaseOut', objects }), 'objects', {}),
};

/** "Level 2" (CR 716.2a): the engine's `gainLevel`, the effect of a class level bar. */
const GAIN_LEVEL: Lowering<IrClause, Effects> = {
  head: 'gainLevel',
  id: 'lower.gain-level',
  needs: ['effect:gainLevel'],
  lower: (clause) => {
    const level = arg(clause, 'level');
    if (level === undefined || level.kind !== 'number') return failure(clause);
    return { ok: true, value: [{ kind: 'gainLevel', level: level.value }], rule: clause.rule };
  },
};

/** "Exile a card from your graveyard at random. You may play the exiled card this turn" (CR 701.13, 601.2, 611.2a): `exileRandomFromGraveyard`, then `mayPlay` of what it exiled. */
const EXILE_RANDOM_AND_PLAY: Lowering<IrClause, Effects> = {
  head: 'exileRandomAndPlay',
  id: 'lower.exile-random-and-play',
  needs: ['effect:exileRandomFromGraveyard', 'effect:mayPlay'],
  lower: (clause) => ({
    ok: true,
    value: [
      { kind: 'exileRandomFromGraveyard' },
      { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
    ],
    rule: clause.rule,
  }),
};

export const HOFRI_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  GAIN_LEVEL,
  EXILE_RANDOM_AND_PLAY,
  PHASE_OUT,
  BECOME_COPY_OF_CARDS,
  SPLIT_COST_EXILED,
  SPARE_PERMANENTS,
  EACH_EXILES_THEN_COUNTERS,
  CREATE_LINKED_EXILE_TOKEN,
  LOOK_PUT_TOTAL,
  CREATE_COPY_TOKEN,
  PLAYER_ADDS_MANA,
  COPY_THIS_SPELL,
  BECOMES_IN_ADDITION,
];
