// Parsed text is only worth something if the engine runs it as written (stage P45). These tests import SYNTHETIC cards through the grammar (never through a
// fixture), define them in an engine scenario and play them through applyAction: There and Back Again of the Korvold deck of D-196 and D-197 (ENGINE_VERSION
// 47) with the type line, mana cost and Oracle text of the real card (the owner's request file of 2026-10-29; a Saga has no power or toughness and Smaug's
// are in its text, so nothing is invented), and the Ring on its own. The card names start with "SYNTHETIC". No ruling of the card could be read (Scryfall
// is not reachable from the sandbox).
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard as storedSynthetic } from './convert-helpers';

const FILLER = Array.from({ length: 14 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const WALL = 'Wall of Stone';

const SAGA_TEXT = `(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)
I — Up to one target creature can't block for as long as you control this Saga. The Ring tempts you.
II — Search your library for a Mountain card, put it onto the battlefield, then shuffle.
III — Create Smaug, a legendary 6/6 red Dragon creature token with flying, haste, and "When Smaug dies, create fourteen Treasure tokens."`;

/** A card through the grammar only, which must read it completely. */
function imported(
  name: string,
  typeLine: string,
  text: string,
  manaCost: string,
  layout?: string,
  pt?: { power: string; toughness: string },
) {
  const out = parseOnly({
    ...storedSynthetic({ name, typeLine, oracleText: text, manaCost, ...pt }),
    ...(layout === undefined ? {} : { layout }),
  } as never);
  expect(out.support.unparsed, name).toEqual([]);
  expect(out.support.reasons, name).toEqual([]);
  expect(out.support.status, name).toBe('supported');
  return out.definition;
}

const saga: CardDefinition = imported(
  'SYNTHETIC Parsed There and Back Again',
  'Enchantment — Saga',
  SAGA_TEXT.replaceAll('this Saga', '~'),
  '{3}{R}{R}',
  'saga',
);

describe('There and Back Again, the real wording through the grammar', () => {
  test('is valid and reads as the engine fixture of the same wording', () => {
    expect(validateCard(saga)).toEqual([]);
    expect(saga.faces[0]?.abilities).toEqual(
      syntheticCard('SYNTHETIC There and Back Again').faces[0]?.abilities,
    );
    expect(saga.faces[0]?.finalChapter).toBe(3);
  });

  const play = () =>
    scenario()
      .seat(0)
      .define(saga)
      .hand(saga.name)
      .pool('RRRRR')
      .battlefield(BEARS, 'Grizzly Bears')
      .library(...FILLER, 'Mountain')
      .seat(1)
      .battlefield(WALL)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('chapter I: the chosen creature can not block, and the Ring tempts the controller', () => {
    const g = play();
    g.act(0).cast(saga.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: WALL, seat: 1 });
    g.passAll();
    // two Grizzly Bears: the Ring-bearer is asked
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', purpose: 'ringBearer' });
    g.act(0).choosePermanents({ name: BEARS, seat: 0, nth: 0 });
    g.expect.ringLevel(0, 1);
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: BEARS, seat: 0, nth: 1 });
    g.advanceTo('declareBlockers');
    // the Wall is the only creature seat 1 has and it can't block: no declare blockers decision is asked, and the attacker is not blocked
    expect(g.state.pending?.kind).toBe('priority');
    g.advanceTo('combatDamage');
    g.expect.life(1, 38);
  });

  test('chapter III: Smaug, legendary 6/6 red Dragon with flying and haste', () => {
    const g = scenario()
      .seat(0)
      .define(saga)
      .battlefield(saga.name, { counters: { lore: 2 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.passAll();
    const v = g.view(0).battlefield.find((o) => o.name === 'Smaug');
    expect(v).toMatchObject({
      supertypes: ['legendary'],
      subtypes: ['Dragon'],
      colors: ['R'],
      power: 6,
      toughness: 6,
    });
    g.expect.zone(saga.name, 'graveyard', { seat: 0 });
  });

  // The owner saw a Smaug without its last ability: a token the card makes was given no rules text, so the card face, which
  // prints the text, showed only the keyword chips. The token's words are its keywords, then each ability in quotes as written.
  test('chapter III: the Smaug token shows its keywords and its death trigger as rules text', () => {
    const g = scenario()
      .seat(0)
      .define(saga)
      .battlefield(saga.name, { counters: { lore: 2 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.passAll();
    const v = g.view(0).battlefield.find((o) => o.name === 'Smaug');
    expect(v?.oracleText).toBe('Flying, haste\nWhen Smaug dies, create fourteen Treasure tokens.');
  });
});

describe('the Ring on its own, worded as the cards are', () => {
  const rite = imported('SYNTHETIC Parsed Ring Rite', 'Sorcery', 'The Ring tempts you.', '{1}{B}');
  const watcher = imported(
    'SYNTHETIC Parsed Ring Watcher',
    'Enchantment',
    'Whenever the Ring tempts you, you gain 1 life.',
    '{1}{W}',
  );
  const attacker = imported(
    'SYNTHETIC Parsed Ring Scout',
    'Creature — Halfling',
    'Whenever ~ attacks, if you control your Ring-bearer, you gain 2 life.',
    '{1}{G}',
    undefined,
    // INVENTED: a SYNTHETIC creature with no real card behind it
    { power: '2', toughness: '2' },
  );

  test('are valid', () => {
    for (const card of [rite, watcher, attacker]) expect(validateCard(card)).toEqual([]);
  });

  test('"whenever the Ring tempts you" and the Ring-bearer condition work as read', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(rite)
      .define(watcher)
      .hand(rite.name)
      .battlefield('Swamp', 'Swamp', watcher.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(rite.name, { pay: true });
    g.passAll();
    g.expect.life(0, 21);
    g.expect.ringLevel(0, 1);
  });

  test('the intervening "if" holds only for the Ring-bearer\'s player: the attack gains life with a Ring-bearer and not without', () => {
    const attack = (bearer: boolean) => {
      const g = scenario()
        .seat(0)
        .life(20)
        .define(attacker)
        .ring(1)
        .battlefield(attacker.name, bearer ? { ringBearer: true } : {})
        .library(...FILLER)
        .seat(1)
        .life(20)
        .library(...FILLER)
        .at('precombatMain')
        .build();
      g.advanceTo('declareAttackers');
      g.act(0).attack(attacker.name);
      g.passAll();
      return g.state.seats[0]?.life;
    };
    expect(attack(true)).toBe(22);
    expect(attack(false)).toBe(20);
  });
});
