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

export const DEATH_TOLL_D_TRIGGER_RULES = [TRIGGER_PLAY_CARD].map(quietly);
