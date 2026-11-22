// The Scions of Spellcraft deck, group D (cost changes): the real Oracle wordings of Alisaie Leveilleur's "Dualcast", Emet-Selch of the Third Seat's first ability and Into the Story's
// cost reduction and Lyse Hext's conditional double strike and Snuff Out's life cost (names replaced by ~ where the text said its own) go through the grammar as SYNTHETIC cards with no override, are defined in an engine scenario and played through
// applyAction, so the nodes the parser writes are what the engine runs. Pins: CR 601.2f and 118.7a (a reduction of generic mana as the total cost is determined), CR 601.2i (the spells
// cast before this one this turn), CR 601.2a and 404.1 (cast from your own graveyard), CR 102.2 and 404.1 (an opponent's graveyard, each counted on its own), CR 604.2 and 113.6d.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const alisaie = parsed(
  'SYNTHETIC Dualcast Elf',
  'Legendary Creature — Elf Wizard',
  'Dualcast — The second spell you cast each turn costs {2} less to cast.',
  { manaCost: '{2}{W}', power: '3', toughness: '2', colors: ['W'] },
);
const emet = parsed(
  'SYNTHETIC Graveyard Seat',
  'Legendary Creature — Elder Wizard',
  'Spells you cast from your graveyard cost {2} less to cast.',
  { manaCost: '{2}{U}{B}', power: '3', toughness: '4', colors: ['U', 'B'] },
);
const story = parsed(
  'SYNTHETIC Into the Story',
  'Instant',
  '~ costs {3} less to cast if an opponent has seven or more cards in their graveyard.\nDraw four cards.',
  { manaCost: '{5}{U}{U}', colors: ['U'] },
);

const lyse = parsed(
  'SYNTHETIC Lyse Monk',
  'Legendary Creature — Human Rebel Monk',
  "As long as you've cast two or more noncreature spells this turn, ~ has double strike.",
  { manaCost: '{1}{W}{U}', power: '2', toughness: '2', colors: ['W', 'U'] },
);

const snuff = parsed(
  'SYNTHETIC Snuff Out',
  'Instant',
  "If you control a Swamp, you may pay 4 life rather than pay ~'s mana cost.\nDestroy target nonblack creature. It can't be regenerated.",
  { manaCost: '{3}{B}', colors: ['B'] },
);

test.each([alisaie, emet, story, lyse, snuff])('$name is a valid card', (card) => {
  expect(validateCard(card)).toEqual([]);
});

const BEARS = 'Grizzly Bears'; // {1}{G}
const STUDY = 'SYNTHETIC Flash Study'; // {1}{U} sorcery, draw; flashback {4}{U}
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

describe('Alisaie Leveilleur: the second spell you cast each turn costs {2} less', () => {
  const board = (forests: number) =>
    scenario()
      .define(alisaie)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS, BEARS)
      .battlefield(alisaie.name)
      .battlefield('Forest', { count: forests })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the first Bears costs {1}{G}; the second costs {G}, so three Forests pay both', () => {
    const g = board(3);
    g.act(0).cast({ name: BEARS, nth: 0 }, { pay: true });
    g.passAll();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.invariants();
  });

  test('with two Forests only the first can be cast: the second is not free of its {G}', () => {
    const g = board(2);
    g.act(0).cast({ name: BEARS, nth: 0 }, { pay: true });
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(1);
    expect(() => g.act(0).cast(BEARS, { pay: true })).toThrow(/engine rejected/);
  });
});

describe('Emet-Selch of the Third Seat: spells you cast from your graveyard cost {2} less', () => {
  const board = (islands: number, withEmet: boolean, studyZone: 'graveyard' | 'hand') =>
    scenario()
      .define(emet)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(...(withEmet ? [emet.name] : []))
      .battlefield('Island', { count: islands })
      [studyZone](STUDY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the flashback cost {4}{U} is {2}{U}: three Islands pay it', () => {
    const g = board(3, true, 'graveyard');
    g.act(0).cast(STUDY, { alternative: 'flashback', pay: true });
    g.passAll();
    g.expect.zone(STUDY, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('without Emet-Selch the same three Islands cannot pay {4}{U}', () => {
    const g = board(3, false, 'graveyard');
    expect(() => g.act(0).cast(STUDY, { alternative: 'flashback', pay: true })).toThrow(
      /engine rejected/,
    );
  });

  test('a spell cast from the hand is not reduced: {1}{U} needs two Islands', () => {
    const g = board(1, true, 'hand');
    expect(() => g.act(0).cast(STUDY, { pay: true })).toThrow(/engine rejected/);
  });
});

describe('Into the Story: costs {3} less if an opponent has seven or more cards in their graveyard', () => {
  const GRAVEYARD = Array.from({ length: 7 }, () => 'Forest');
  const board = (seats: 2 | 3, graveyards: readonly (readonly string[])[]) => {
    let b = scenario({ seats })
      .define(story)
      .seat(0)
      .library(...LIBRARY)
      .hand(story.name)
      .battlefield('Island', { count: 4 });
    graveyards.forEach((names, i) => {
      b = b.seat(i + 1).library(...LIBRARY);
      if (names.length > 0) b = b.graveyard(...names);
    });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('with seven cards in an opponent graveyard the {5}{U}{U} costs {2}{U}{U}: four Islands pay it', () => {
    const g = board(2, [GRAVEYARD]);
    g.act(0).cast(story.name, { pay: true });
    g.passAll();
    g.expect.zone(story.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with six it is not reduced, and four Islands cannot pay {5}{U}{U}', () => {
    const g = board(2, [GRAVEYARD.slice(1)]);
    expect(() => g.act(0).cast(story.name, { pay: true })).toThrow(/engine rejected/);
  });

  test('the cards in your own graveyard do not count', () => {
    const g = scenario()
      .define(story)
      .seat(0)
      .library(...LIBRARY)
      .hand(story.name)
      .graveyard(...GRAVEYARD)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    expect(() => g.act(0).cast(story.name, { pay: true })).toThrow(/engine rejected/);
  });

  test('three seats: the one opponent with seven cards is enough, the others may have none', () => {
    const g = board(3, [[], GRAVEYARD]);
    g.act(0).cast(story.name, { pay: true });
    g.passAll();
    g.expect.zone(story.name, 'graveyard', { seat: 0 });
  });

  test('three seats: seven cards in all, spread over two opponents, is not seven cards in a graveyard', () => {
    const g = board(3, [GRAVEYARD.slice(0, 4), GRAVEYARD.slice(0, 3)]);
    expect(() => g.act(0).cast(story.name, { pay: true })).toThrow(/engine rejected/);
  });
});

describe('Lyse Hext: double strike as long as you have cast two or more noncreature spells this turn', () => {
  const BOLT = 'Lightning Bolt';
  const board = (seat1Casts: boolean) =>
    scenario()
      .define(lyse)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT, BEARS)
      .battlefield(lyse.name, { label: 'lyse' })
      .battlefield('Mountain', { count: 2 })
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .hand(...(seat1Casts ? [BOLT, BOLT] : []))
      .battlefield(...(seat1Casts ? ['Mountain', 'Mountain'] : []))
      .at('precombatMain', { active: 0 })
      .build();

  test('no double strike before two noncreature spells, double strike after the second (CR 601.2i)', () => {
    const g = board(false);
    g.expect.derived('lyse', { keywords: [] });
    g.act(0)
      .cast({ name: BOLT, nth: 0 }, { targets: [{ player: 1 }] })
      .pay();
    g.expect.derived('lyse', { keywords: [] });
    g.act(0)
      .cast(BOLT, { targets: [{ player: 1 }] })
      .pay();
    g.expect.derived('lyse', { keywords: ['doubleStrike'] });
    g.expect.invariants();
  });

  test('a creature spell is not a noncreature spell: it does not count', () => {
    const g = board(false);
    g.act(0).cast(BEARS).pay();
    g.act(0)
      .cast({ name: BOLT, nth: 0 }, { targets: [{ player: 1 }] })
      .pay();
    g.expect.derived('lyse', { keywords: [] });
  });

  test("an opponent's spells do not count: only the spells you cast", () => {
    const g = board(true);
    g.act(0)
      .cast({ name: BOLT, nth: 0 }, { targets: [{ player: 1 }] })
      .pay();
    g.pass(0);
    g.act(1)
      .cast({ name: BOLT, nth: 0 }, { targets: [{ player: 0 }] })
      .pay();
    g.expect.derived('lyse', { keywords: [] });
  });
});

describe('Snuff Out: if you control a Swamp, pay 4 life rather than pay the mana cost', () => {
  const board = (lands: readonly string[], seat0Life = 40) =>
    scenario({ seats: 3 })
      .define(snuff)
      .seat(0)
      .life(seat0Life)
      .library(...LIBRARY)
      .hand(snuff.name)
      .battlefield(...lands)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('with a Swamp the creature is destroyed for 4 life and no mana', () => {
    const g = board(['Swamp']);
    g.expect.legal(0, { cast: snuff.name, alternative: 'payLife' });
    g.act(0).cast(snuff.name, { alternative: 'payLife', targets: [BEARS], pay: true });
    g.expect.life(0, 36);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('without a Swamp the life cost is not offered', () => {
    const g = board(['Forest']);
    g.expect.illegal(0, { cast: snuff.name, alternative: 'payLife' });
    g.expect.life(0, 40);
  });

  test('the ordinary cast pays {3}{B} and no life', () => {
    const g = board(['Swamp', 'Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(snuff.name, { targets: [BEARS], pay: true });
    g.expect.life(0, 40);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });
});
