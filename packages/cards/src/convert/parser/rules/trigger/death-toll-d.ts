/**
 * Trigger rules of group D of the Death Toll deck: "whenever you play a card with two or more card types" (Rendmaw, Creaking Nest). What the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
]);

/**
 * `trigger.play-card`: "you play a card with two or more card types" (CR 305.1, 601.2, 205.2a, 603.2: a land is played and a spell is cast, and either is playing a card; the card
 * types are artifact, battle, creature, enchantment, instant, kindred, land, planeswalker and sorcery, a supertype or a subtype is none). The engine's `playsCard`, once for each card the
 * controller plays. Not read: another player ("an opponent plays"), "a card" with no card types said, "cast", one card type ("a card with one card type"), "exactly", the past tense, a
 * card of a named type ("a land card").
 */
export const TRIGGER_PLAY_CARD = defineRule<IrTrigger>({
  id: 'trigger.play-card',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 305.1 (Lands)',
    'CR 601.2 (Casting Spells)',
    'CR 205.2a (Card Types)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'you play a card with two or more card types',
    'you play a card with three or more card types',
  ],
  rejects: [
    'you play a card',
    'you play a card with two card types',
    'you play a card with one or more card types',
    'you play a card with two or more card type',
    'you played a card with two or more card types',
    'an opponent plays a card with two or more card types',
    'a player plays a card with two or more card types',
    'you cast a card with two or more card types',
    'you play a card with two or more card types or',
    'you play cards with two or more card types',
    'you play a land card with two or more card types',
    'you play a card with two or more types',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you play a card with (two|three|four|five|six|seven|eight|nine) or more card types(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const atLeast = NUMBER_WORDS.get((r.value[1] ?? '').toLowerCase());
    if (atLeast === undefined) return { ok: false };
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'playsCard',
        actor: makeNoun('trigger.play-card', { start: pos, end: pos + 3 }, 'you', { raw: 'you' }),
        atLeast,
        args: {},
        span,
        rule: 'trigger.play-card',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.play-land-or-cast-spell-from-exile`: "you play a land from exile or cast a spell from exile" (CR 305.1, 601.2a, 603.2: a land played from exile, or a spell cast from exile, by the
 * controller). The engine's `playsCard` with `fromExile`. Not read: another player, the past tense, only a land or only a spell, another zone ("from your graveyard"), cards of one kind.
 */
export const TRIGGER_PLAY_LAND_OR_CAST_SPELL_FROM_EXILE = defineRule<IrTrigger>({
  id: 'trigger.play-land-or-cast-spell-from-exile',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 305.1 (Lands)',
    'CR 601.2a (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['you play a land from exile or cast a spell from exile'],
  rejects: [
    'you play a land from exile',
    'you cast a spell from exile',
    'you cast a spell from exile or play a land from exile',
    'an opponent plays a land from exile or casts a spell from exile',
    'you played a land from exile or cast a spell from exile',
    'you play a land from your graveyard or cast a spell from your graveyard',
    'you play a land from exile or cast a spell from exile or',
    'you play a land from exile or cast a creature spell from exile',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you play a land from exile or cast a spell from exile(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'playsCard',
        actor: makeNoun(
          'trigger.play-land-or-cast-spell-from-exile',
          { start: pos, end: pos + 3 },
          'you',
          { raw: 'you' },
        ),
        fromExile: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.play-land-or-cast-spell-from-exile',
      },
      pos: r.pos,
    };
  },
});

export const DEATH_TOLL_D_TRIGGER_RULES = [
  TRIGGER_PLAY_CARD,
  TRIGGER_PLAY_LAND_OR_CAST_SPELL_FROM_EXILE,
].map(quietly);
