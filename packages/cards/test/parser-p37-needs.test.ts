// Stage P37 (M52): a line of the Korvold deck's triggers and small statics slice that the grammar reads whose engine feature is not listed is
// reported as "recognised, not runnable" naming that feature, never built (D-068, D-179, D-180). The engine lists every feature below, so the
// support check is replaced here by one that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the
// seven cards (names replaced by ~).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const CYCLE = 'Cycling {3}{R}\nWhen you cycle this card, create two Treasure tokens.';
const KAERVEK =
  "Whenever an opponent casts a spell, ~ deals damage equal to that spell's mana value to any target.";
const LAVALANCHE =
  "~ deals X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls.";
const LOBELIA =
  "When ~ enters, exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card's power.";
const SPELUNKING =
  'When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.';
const UNTAPPED = 'Lands you control enter untapped.';
const KARDUR =
  'When ~ enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.';
const PUMP = 'Equipped creature gets +1/+1 for each color among permanents you control.';
const SEAL =
  "As long as ~ is attached to a creature, your opponents can't cast spells during your turn.";

const CASES = [
  ['trigger:cycled', CYCLE, 'creature', []],
  ['selector:triggerSubject', KAERVEK, 'creature', []],
  ['amount:manaValueOf', KAERVEK, 'creature', []],
  ['selector:controllerRef', LAVALANCHE, 'sorcery', []],
  ['selector:putFromBattlefieldThisTurn', LOBELIA, 'creature', []],
  ['condition:objectMatches', SPELUNKING, 'enchantment', []],
  ['replacement:groupEntersUntapped', UNTAPPED, 'enchantment', []],
  ['effect:requireAttack', KARDUR, 'creature', []],
  ['duration:untilYourNextTurn', KARDUR, 'creature', []],
  ['amount:colorsAmong', PUMP, 'artifact', ['Equipment']],
  ['static:opponentsCantCastOnYourTurn', SEAL, 'artifact', ['Equipment']],
  ['selector:attached', SEAL, 'artifact', ['Equipment']],
] as const;

describe('the lines of the Korvold slice 4 name the feature the engine lacks (D-179, D-180)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type, subtypes) => {
    const missing = withoutFeature(ref, text, type, subtypes);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type, subtypes] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, subtypes);
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
