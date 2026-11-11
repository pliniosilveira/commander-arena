/**
 * Static ability rules of stage P33 (D-149, D-150): the protections of a player ("You have hexproof.", "You can't lose the game and your
 * opponents can't win the game.", CR 702.11b, 104.3, 104.2), damage prevented before it is dealt to the permanent ("Prevent all combat
 * damage that would be dealt to ~.", CR 615.1) and a card that can't be cast early ("You can't cast ~ during your first, second, or third
 * turns of the game.", CR 101.2). Each is one whole line (the rest of the slice is in `angels-play.ts`).
 */
import { fail, literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

const PERIOD = literal('.');

/**
 * `static.player-hexproof`: "You have hexproof." (CR 702.11b: hexproof says its controller's opponents can't target it; the same for a
 * player, who is the controller of the permanent with the ability; CR 113.6: a static ability of the permanent). Not read: "You have
 * shroud" (a different ability), another player ("Each opponent has hexproof"), "~ has hexproof" (a keyword of the permanent) and a condition.
 */
export const STATIC_PLAYER_HEXPROOF = defineRule<IrStatic>({
  id: 'static.player-hexproof',
  family: 'static',
  leading: ['you'],
  cites: ['CR 702.11b (Hexproof)', 'CR 702.11a (Hexproof)', 'CR 604.1 (Handling Static Abilities)'],
  examples: ['You have hexproof.', 'you have hexproof.'],
  rejects: [
    'You have hexproof',
    'You have shroud.',
    'You have hexproof from red.',
    'You have hexproof and shroud.',
    'You have hexproof as long as you control a Dragon.',
    'You have hexproof until end of turn.',
    'You gain hexproof.',
    'You have hexproof. Draw a card.',
    '~ has hexproof.',
    'Each opponent has hexproof.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(pattern(/you(?![\p{L}\p{N}])/iu)),
      literal(' have hexproof'),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [you] = r.value;
    return {
      ok: true,
      value: staticOf(
        'static.player-hexproof',
        subjectNoun('you', 'you', you.span, 'static.player-hexproof'),
        [{ kind: 'playerHexproof' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * `static.cant-lose-win`: "You can't lose the game and your opponents can't win the game.", "You can't lose the game.", "Your opponents
 * can't win the game." (CR 104.3b: a player with 0 or less life or a player who is required to draw from an empty library does not lose
 * while an effect says they can't; CR 104.2: a player can't win while an effect says so, though the last player left wins, 104.2a).
 * The subject is the controller of the permanent. Not read: "Each player can't lose", "target player can't lose the game", a duration
 * ("until end of turn") and a condition.
 */
export const STATIC_CANT_LOSE_WIN = defineRule<IrStatic>({
  id: 'static.cant-lose-win',
  family: 'static',
  leading: ['you', 'your'],
  cites: [
    'CR 104.3b (Ending the Game)',
    'CR 104.2 (Ending the Game)',
    'CR 104.2a (Ending the Game)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "You can't lose the game and your opponents can't win the game.",
    'You can’t lose the game and your opponents can’t win the game.',
    "You can't lose the game.",
    "Your opponents can't win the game.",
  ],
  rejects: [
    "You can't lose the game and your opponents can't win the game",
    "You can't lose the game and your opponents can't win the game until end of turn.",
    "Your opponents can't win the game and you can't lose the game.",
    "You can't win the game.",
    "You can't lose the game or win the game.",
    "Each player can't lose the game.",
    "Target player can't lose the game.",
    "You can't lose the game and your opponents can't lose the game.",
    "Your opponents can't lose the game.",
    "You can't lose the game and draw a card.",
    "You can't lose the game as long as you control a Dragon.",
    "You can't lose the game and you can't win the game.",
  ],
  parse: (ctx, pos) => {
    const id = 'static.cant-lose-win';
    const both = sequence(
      spanned(literal('you')),
      pattern(/ can['’]t lose the game and your opponents can['’]t win the game/iu),
      PERIOD,
    )(ctx, pos);
    if (both.ok) {
      const [you] = both.value;
      return {
        ok: true,
        value: staticOf(
          id,
          subjectNoun('you', 'you', you.span, id),
          [{ kind: 'cantLoseGame' }, { kind: 'opponentsCantWin' }],
          pos,
          both.pos,
        ),
        pos: both.pos,
      };
    }
    const lose = sequence(
      spanned(literal('you')),
      pattern(/ can['’]t lose the game/iu),
      PERIOD,
    )(ctx, pos);
    if (lose.ok) {
      const [you] = lose.value;
      return {
        ok: true,
        value: staticOf(
          id,
          subjectNoun('you', 'you', you.span, id),
          [{ kind: 'cantLoseGame' }],
          pos,
          lose.pos,
        ),
        pos: lose.pos,
      };
    }
    const win = sequence(
      literal('your opponents'),
      pattern(/ can['’]t win the game/iu),
      PERIOD,
    )(ctx, pos);
    if (!win.ok) return win;
    // The permanent's controller is the player who is the subject of the line; "your opponents" is said of them.
    return {
      ok: true,
      value: staticOf(
        id,
        subjectNoun('you', 'you', { start: pos, end: pos + 'your'.length }, id),
        [{ kind: 'opponentsCantWin' }],
        pos,
        win.pos,
      ),
      pos: win.pos,
    };
  },
});

const SCOPE_WORDS = '(all|all combat|all noncombat) damage';

/**
 * `static.prevent-damage-to-self`: "Prevent all combat damage that would be dealt to ~.", "Prevent all damage that would be dealt to ~.",
 * "Prevent all noncombat damage that would be dealt to ~." (CR 615.1, 615.6: damage that would be dealt is not dealt; a static ability of
 * the permanent, so it is lost with the abilities). Only all of it, to the permanent itself, with no duration. Not read: "the next 3
 * damage", a source ("by creatures"), another recipient ("to you", "to creatures you control") and a duration (that is the effect
 * `effect.prevent-all`).
 */
export const STATIC_PREVENT_DAMAGE_TO_SELF = defineRule<IrStatic>({
  id: 'static.prevent-damage-to-self',
  family: 'static',
  leading: ['prevent'],
  cites: [
    'CR 615.1 (Prevention Effects)',
    'CR 615.6 (Prevention Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'Prevent all combat damage that would be dealt to ~.',
    'Prevent all damage that would be dealt to ~.',
    'Prevent all noncombat damage that would be dealt to ~.',
  ],
  rejects: [
    'Prevent all combat damage that would be dealt to ~',
    'Prevent all combat damage that would be dealt to you.',
    'Prevent all combat damage that would be dealt to creatures you control.',
    'Prevent all combat damage that would be dealt to ~ this turn.',
    'Prevent all combat damage that would be dealt this turn.',
    'Prevent the next 3 damage that would be dealt to ~.',
    'Prevent all combat damage that would be dealt to ~ by creatures.',
    'Prevent all combat damage that would be dealt to ~ and draw a card.',
    'Prevent all combat damage that would be dealt by ~.',
    'Prevent all combat damage that would be dealt to target creature.',
    'Prevent all damage that would be dealt to ~ unless you control a Dragon.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(new RegExp(`prevent ${SCOPE_WORDS} that would be dealt to `, 'iu')),
      spanned(literal('~')),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [head, self] = r.value;
    const word = (head[1] ?? '').toLowerCase();
    const scope = word === 'all combat' ? 'combat' : word === 'all noncombat' ? 'noncombat' : 'all';
    return {
      ok: true,
      value: staticOf(
        'static.prevent-damage-to-self',
        subjectNoun('self', '~', self.span, 'static.prevent-damage-to-self'),
        [{ kind: 'preventDamageToThis', scope }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
] as const;

/** "first", "first or second", "first, second, or third": the first N turns, in order, from the first. */
const TURN_ORDINALS: Parser<number> = (ctx, pos) => {
  const word = `(${ORDINALS.join('|')})`;
  const r = pattern(new RegExp(`${word}(?:(?:, ${word})*,? or ${word})?`, 'iu'))(ctx, pos);
  if (!r.ok) return r;
  const names = [...r.value[0].toLowerCase().matchAll(new RegExp(word, 'g'))].map(
    (m) => m[1] ?? '',
  );
  const numbers = names.map((n) => ORDINALS.indexOf(n as (typeof ORDINALS)[number]) + 1);
  // The turns listed are the first ones, one after another: "first, third" or "second" alone is not a count the engine reads.
  const consecutive = numbers.every((n, i) => n === i + 1);
  // A list of two or more takes "or" before the last: "first or second", "first, second, or third".
  const shaped = names.length === 1 || /,? or /.test(r.value[0]);
  if (!consecutive || !shaped) return fail(ctx, pos);
  return { ok: true, value: names.length, pos: r.pos };
};

/**
 * `static.cant-cast-early`: "You can't cast ~ during your first, second, or third turns of the game.", "You can't cast ~ during your
 * first turn of the game." (CR 101.2: a "can't" effect wins; CR 601.2: the card can't be cast, by any means, while it holds; CR 500.1: a
 * player's turns are counted, the turn in progress included). The card itself, by the player who would cast it, during their own first
 * turns. Not read: another card, another count ("your fourth turn"), a list that skips a turn, "each player's turns" and other conditions.
 */
export const STATIC_CANT_CAST_EARLY = defineRule<IrStatic>({
  id: 'static.cant-cast-early',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 101.2 (Golden Rules)',
    'CR 601.2 (Casting Spells)',
    'CR 500.1 (Beginning of the Turn)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "You can't cast ~ during your first, second, or third turns of the game.",
    'You can’t cast ~ during your first, second, or third turns of the game.',
    "You can't cast ~ during your first turn of the game.",
    "You can't cast ~ during your first or second turns of the game.",
    "You can't cast ~ during your first, second, third, or fourth turns of the game.",
  ],
  rejects: [
    "You can't cast ~ during your first, second, or third turns of the game",
    "You can't cast ~ during your second turn of the game.",
    "You can't cast ~ during your first, third, or fourth turns of the game.",
    "You can't cast ~ during your first, second, third turns of the game.",
    "You can't cast ~ during your first and second turns of the game.",
    "You can't cast ~ during your turns of the game.",
    "You can't cast ~ during each player's first turn of the game.",
    "You can't cast creature spells during your first turn of the game.",
    "You can't cast ~ during your first turn.",
    "You can't cast ~ unless it's your fourth turn.",
    "You can't cast ~ during your first, second, or third turns of the game and draw a card.",
    "Your opponents can't cast ~ during your first turn of the game.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you can['’]t cast /iu),
      spanned(literal('~')),
      literal(' during your '),
      TURN_ORDINALS,
      pattern(/ turns? of the game/iu),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, self, , turns, words] = r.value;
    // "turn" goes with one, "turns" with two or more.
    if (/turns/i.test(words[0]) !== turns > 1) return fail(ctx, pos);
    return {
      ok: true,
      value: staticOf(
        'static.cant-cast-early',
        subjectNoun('self', '~', self.span, 'static.cant-cast-early'),
        [{ kind: 'cantCastThis', turns }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const ANGEL_PROTECTION_RULES = [
  STATIC_PLAYER_HEXPROOF,
  STATIC_CANT_LOSE_WIN,
  STATIC_PREVENT_DAMAGE_TO_SELF,
  STATIC_CANT_CAST_EARLY,
].map(quietly);
