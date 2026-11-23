import { type Parser, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/** Counts use event-time characteristics, not objects currently on the battlefield or in a graveyard. */
export const HISTORY_VALUE: Parser<IrAmount> = (ctx, pos) => {
  // CR 119.3 (Willowdusk, Essence Seer): the larger of the two, tried before the plain gain it starts with.
  const larger = pattern(
    /the amount of life you gained this turn or the amount of life you lost this turn, whichever is greater(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (larger.ok) {
    return {
      ok: true,
      value: { kind: 'lifeGainedOrLostThisTurn', span: { start: pos, end: larger.pos } },
      pos: larger.pos,
    };
  }
  // CR 608.2c, 701.8 (Deadly Tempest): "each player loses life equal to the number of creatures they controlled that were destroyed this way": each player's own count.
  const destroyedOwn = pattern(
    /the number of creatures they controlled that were destroyed this way(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (destroyedOwn.ok) {
    return {
      ok: true,
      value: {
        kind: 'thisWay',
        what: 'destroyedCreaturesOfAffected',
        words: ['creature'],
        span: { start: pos, end: destroyedOwn.pos },
      },
      pos: destroyedOwn.pos,
    };
  }
  // CR 119.3 (Betor): the life the controller lost this turn, as "gained" below is the life gained.
  const lost = pattern(/the amount of life you lost this turn(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (lost.ok) {
    return {
      ok: true,
      value: { kind: 'controllerLifeLostThisTurn', span: { start: pos, end: lost.pos } },
      pos: lost.pos,
    };
  }
  const gain = pattern(/the amount of life you gained this turn(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (gain.ok) {
    return {
      ok: true,
      value: { kind: 'lifeGainedThisTurn', span: { start: pos, end: gain.pos } },
      pos: gain.pos,
    };
  }
  // Field-Tested Frying Pan (CR 119.9, 603.2): "whenever you gain life, ... where X is the amount of life you gained": the life of the event that caused the trigger (`triggerDamage`,
  // read only in the body of a life gain trigger, which the lowering checks), as opposed to the life gained over the whole turn above.
  const event = pattern(/the amount of life you gained(?! this turn)(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (event.ok) {
    return {
      ok: true,
      value: { kind: 'triggerDamage', life: true, span: { start: pos, end: event.pos } },
      pos: event.pos,
    };
  }
  // D-638 (Prismari deck group 1, CR 601.2i): the spells the controller has cast this turn.
  const spells = pattern(
    /the number of (instant and sorcery )?spells you(?:['’]ve| have) cast this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (spells.ok) {
    return {
      ok: true,
      value: {
        kind: 'spellsCastThisTurn',
        ...(spells.value[1] === undefined ? {} : { ofTypes: ['instant', 'sorcery'] }),
        span: { start: pos, end: spells.pos },
      },
      pos: spells.pos,
    };
  }
  // Issue 102 (Welcome the Dead, CR 404.1): the cards put into the controller's graveyard this turn from the hand and/or the library.
  const toGraveyard = pattern(
    /the number of cards that were put into your graveyard from your (hand or library|library or hand|hand|library) this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (toGraveyard.ok) {
    const zones = (toGraveyard.value[1] ?? '').toLowerCase();
    return {
      ok: true,
      value: {
        kind: 'cardsToGraveyardThisTurn',
        from: zones === 'hand' ? ['hand'] : zones === 'library' ? ['library'] : ['hand', 'library'],
        span: { start: pos, end: toGraveyard.pos },
      },
      pos: toGraveyard.pos,
    };
  }
  // D-646 (Prismari deck group 2, CR 202.3, 601.2i): the greatest mana value among the spells the controller has cast this turn.
  const greatest = pattern(
    /the greatest mana value among (instant and sorcery )?spells you(?:['’]ve| have) cast this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (greatest.ok) {
    return {
      ok: true,
      value: {
        kind: 'greatestManaValueCast',
        ...(greatest.value[1] === undefined ? {} : { ofTypes: ['instant', 'sorcery'] }),
        span: { start: pos, end: greatest.pos },
      },
      pos: greatest.pos,
    };
  }
  // Grave Danger (issue 159, Liliana's Standard Bearer): "where X is the number of creatures that died under your control this turn".
  const died = pattern(
    /the number of creatures that died under your control this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (died.ok) {
    return {
      ok: true,
      value: {
        kind: 'diedThisTurn',
        controller: 'you',
        types: ['creature'],
        span: { start: pos, end: died.pos },
      },
      pos: died.pos,
    };
  }
  // CR 700.4 (issue 101, Bone Devourer): "the number of creatures that died this turn" counts the creatures that died under any player's control, tokens too.
  const diedAny = pattern(/the number of creatures that died this turn(?![\p{L}\p{N}])/iu)(
    ctx,
    pos,
  );
  if (diedAny.ok) {
    return {
      ok: true,
      value: {
        kind: 'diedThisTurn',
        controller: 'any',
        types: ['creature'],
        span: { start: pos, end: diedAny.pos },
      },
      pos: diedAny.pos,
    };
  }
  // CR 111.1, 603.6a (issue 101, Thalisse): "the number of tokens you created this turn" counts the tokens that entered the battlefield under your control this turn (a token is created
  // as it is put onto the battlefield, so every token created is one that entered).
  const created = pattern(/the number of tokens you created this turn(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (created.ok) {
    return {
      ok: true,
      value: {
        kind: 'enteredThisTurn',
        controller: 'you',
        token: true,
        span: { start: pos, end: created.pos },
      },
      pos: created.pos,
    };
  }
  const entries = pattern(
    /the number of (nontoken |token )?(creatures|permanents) you had enter the battlefield under your control this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (!entries.ok) return entries;
  return {
    ok: true,
    value: {
      kind: 'enteredThisTurn',
      controller: 'you',
      ...(entries.value[2]?.toLowerCase() === 'creatures' ? { types: ['creature'] } : {}),
      ...(entries.value[1] === undefined
        ? {}
        : { token: entries.value[1].toLowerCase() === 'token ' }),
      span: { start: pos, end: entries.pos },
    },
    pos: entries.pos,
  };
};

export const AMOUNT_FOR_EACH_DIED = defineRule<IrAmount>({
  id: 'amount.for-each-died',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 700.4 (General)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'for each creature that died under your control this turn',
    'for each nontoken creature that died this turn',
  ],
  rejects: [
    'for each creature that died this turn',
    'for each token creature that died this turn',
    'for each nontoken creature that died last turn',
    'for each creature that died under your control last turn',
    'for each creature that died under an opponent’s control this turn',
    'for each creature card that died under your control this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each creature that died under your control this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (r.ok) {
      return {
        ok: true,
        value: {
          kind: 'diedThisTurn',
          controller: 'you',
          types: ['creature'],
          span: { start: pos, end: r.pos },
        },
        pos: r.pos,
      };
    }
    // CR 700.4: "for each nontoken creature that died this turn" counts the creatures that died under any player's control; a token that died is not counted.
    const any = pattern(/for each nontoken creature that died this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!any.ok) return any;
    return {
      ok: true,
      value: {
        kind: 'diedThisTurn',
        controller: 'any',
        types: ['creature'],
        token: false,
        span: { start: pos, end: any.pos },
      },
      pos: any.pos,
    };
  },
});

/**
 * `amount.for-each-other-spell-cast`: "for each other instant and sorcery spell you've cast this turn" (Lock and Load, CR 601.2i, 608.2h): the spells the controller has cast so far this turn
 * of those types, counted as the effect resolves, not counting the spell that is resolving. Not read: spells of another type or of all types, another player's spells, "last turn".
 */
export const AMOUNT_FOR_EACH_OTHER_SPELL_CAST = defineRule<IrAmount>({
  id: 'amount.for-each-other-spell-cast',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 601.2i (Casting Spells)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    "for each other instant and sorcery spell you've cast this turn",
    'for each other instant and sorcery spell you have cast this turn',
    'for each other instant and sorcery spell you’ve cast this turn',
  ],
  rejects: [
    "for each instant and sorcery spell you've cast this turn",
    "for each other spell you've cast this turn",
    "for each other instant and sorcery spell you've cast",
    'for each other instant and sorcery spell an opponent has cast this turn',
    "for each other instant and sorcery spell you've cast last turn",
    "for each other creature spell you've cast this turn",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /for each other instant and sorcery spell you(?:['’]ve| have) cast this turn(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'spellsCastThisTurn',
        ofTypes: ['instant', 'sorcery'],
        otherThanThis: true,
        span: { start: pos, end: r.pos },
      },
      pos: r.pos,
    };
  },
});
