// The Grand Larceny deck, group C (costs): the real Oracle wordings of Doc Aurlock, Grizzled Genius, the static ability of Gonti, Canny Acquisitor and Savvy Trader (names replaced by ~
// where the text said its own) go through the grammar as SYNTHETIC cards with no override and are played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 601.2f and 118.7a (a reduction takes generic mana off the total cost, never colored mana), CR 601.2a, 404.1 and 406.1 (the zone a spell is cast from), CR 108.3 (the owner of
// a card), CR 406.3 and 611.2b ("for as long as it remains exiled"), CR 702.170a (plot: a special action with a cost of its own), CR 604.2 and 113.6d.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const doc = parsed(
  'SYNTHETIC Doc Aurlock',
  'Legendary Creature — Bear Druid',
  'Spells you cast from your graveyard or from exile cost {2} less to cast.\nPlotting cards from your hand costs {2} less.',
  { manaCost: '{2}{G}{U}', power: '3', toughness: '3', colors: ['G', 'U'] },
);
const gonti = parsed(
  'SYNTHETIC Gonti Static',
  'Legendary Creature — Aetherborn Rogue',
  "Spells you cast but don't own cost {1} less to cast.",
  { manaCost: '{2}{B}{B}', power: '2', toughness: '3', colors: ['B'] },
);
const trader = parsed(
  'SYNTHETIC Savvy Trader',
  'Creature — Human Citizen',
  'When ~ enters, exile target permanent card from your graveyard. You may play that card for as long as it remains exiled.\nSpells you cast from anywhere other than your hand cost {1} less to cast.',
  { manaCost: '{U}', power: '3', toughness: '3', colors: ['U'] },
);
const thief = parsed(
  'SYNTHETIC Grave Thief',
  'Creature — Human Rogue',
  "When ~ enters, exile target creature card from an opponent's graveyard. You may play that card for as long as it remains exiled.",
  { manaCost: '{1}{B}', power: '1', toughness: '1', colors: ['B'] },
);

test.each([doc, gonti, trader, thief])('$name is a valid card', (card) => {
  expect(validateCard(card)).toEqual([]);
});

const BEARS = 'Grizzly Bears'; // {1}{G}
const STUDY = 'SYNTHETIC Flash Study'; // {1}{U} sorcery, draw; flashback {4}{U}
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

describe('Doc Aurlock: spells you cast from your graveyard or from exile cost {2} less', () => {
  const board = (islands: number, withDoc: boolean, zone: 'graveyard' | 'hand') =>
    scenario()
      .define(doc)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(...(withDoc ? [doc.name] : []))
      .battlefield('Island', { count: islands })
      [zone](STUDY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the flashback cost {4}{U} is {2}{U} from the graveyard: three Islands pay it', () => {
    const g = board(3, true, 'graveyard');
    g.act(0).cast(STUDY, { alternative: 'flashback', pay: true });
    g.passAll();
    g.expect.zone(STUDY, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('without Doc Aurlock the same three Islands cannot pay {4}{U}', () => {
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

describe('Doc Aurlock: a spell cast from exile (a card of an opponent, in the hands of any table) costs {2} less', () => {
  for (const seats of [2, 4] as const) {
    test(`with ${seats} seats the exiled Bears cost {G}`, () => {
      let b = scenario({ seats })
        .define(thief)
        .define(doc)
        .seat(0)
        .library(...LIBRARY)
        .hand(thief.name)
        .battlefield(doc.name)
        .battlefield('Swamp', 'Forest', 'Forest');
      for (let seat = 1; seat < seats; seat++) {
        b = b.seat(seat as 1 | 2 | 3).library(...LIBRARY);
        if (seat === 1) b = b.graveyard(BEARS);
      }
      const g = b.at('precombatMain', { active: 0 }).build();
      g.act(0).cast(thief.name, { pay: true });
      g.passAll();
      g.act(0).cast({ name: BEARS, zone: 'exile', seat: 1 }, { pay: true });
      g.passAll();
      g.expect.zone(BEARS, 'battlefield', { seat: 0 });
      g.expect.invariants();
    });
  }
});

describe('Savvy Trader: exile a permanent card from your graveyard and play it; spells not cast from hand cost {1} less', () => {
  const board = (zone: 'graveyard' | 'hand') =>
    scenario()
      .define(trader)
      .seat(0)
      .library(...LIBRARY)
      .hand(trader.name)
      .battlefield('Island', 'Forest')
      .graveyard(...(zone === 'graveyard' ? [BEARS] : []))
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card exiled can be cast from exile, for {G} (the reduction applies to it), for as long as it remains there', () => {
    const g = board('graveyard');
    g.act(0).cast(trader.name, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: BEARS });
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe("Gonti, Canny Acquisitor: spells you cast but don't own cost {1} less", () => {
  const board = (seats: 2 | 3 | 4) => {
    let b = scenario({ seats })
      .define(thief)
      .define(gonti)
      .seat(0)
      .library(...LIBRARY)
      .hand(thief.name, 'Lightning Bolt')
      .battlefield(gonti.name)
      .battlefield('Swamp', 'Forest', 'Forest');
    for (let seat = 1; seat < seats; seat++) {
      b = b.seat(seat as 1 | 2 | 3).library(...LIBRARY);
      if (seat === seats - 1) b = b.graveyard(BEARS);
    }
    return b.at('precombatMain', { active: 0 }).build();
  };

  for (const seats of [2, 3, 4] as const) {
    test(`with ${seats} seats an opponent's card cast from exile costs {1} less: {G} pays {1}{G}; a card of your own does not`, () => {
      const g = board(seats);
      g.act(0).cast(thief.name, { pay: true });
      g.passAll();
      g.expect.zone(BEARS, 'exile', { seat: seats - 1 });
      // One Forest is left untapped: it pays the {G} of the Bears, not the {1}{G}.
      g.act(0).cast({ name: BEARS, zone: 'exile', seat: seats - 1 }, { pay: true });
      g.passAll();
      g.expect.zone(BEARS, 'battlefield', { seat: 0 });
      g.expect.invariants();
    });
  }

  test('a spell of your own cast from the hand is not reduced', () => {
    const g = scenario()
      .define(gonti)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(gonti.name)
      .battlefield('Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    expect(() => g.act(0).cast(BEARS, { pay: true })).toThrow(/engine rejected/);
  });
});

describe('Doc Aurlock: Plotting cards from your hand costs {2} less', () => {
  const PLOT = 'SYNTHETIC Plot Draw'; // {2}{U} sorcery, plot {1}{U}
  const board = (withDoc: boolean) =>
    scenario()
      .define(doc)
      .seat(0)
      .library(...LIBRARY)
      .hand(PLOT)
      .battlefield(...(withDoc ? [doc.name] : []))
      .battlefield('Island')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the plot cost {1}{U} is {U}: one Island plots the card', () => {
    const g = board(true);
    g.act(0).plot(PLOT, { pay: true });
    g.expect.zone(PLOT, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('without Doc Aurlock one Island cannot pay {1}{U}', () => {
    const g = board(false);
    g.expect.illegal(0, { plot: PLOT });
  });
});

describe("Thieving Varmint: {T}, Pay 1 life: Add two mana of any one color. Spend this mana only to cast spells you don't own", () => {
  const varmint = parsed(
    'SYNTHETIC Thieving Varmint',
    'Creature — Varmint',
    "Deathtouch, lifelink\n{T}, Pay 1 life: Add two mana of any one color. Spend this mana only to cast spells you don't own.",
    { manaCost: '{3}{B}', power: '2', toughness: '2', colors: ['B'] },
  );
  test('is a valid card', () => expect(validateCard(varmint)).toEqual([]));

  const board = (seats: 2 | 3 | 4) => {
    let b = scenario({ seats })
      .define(varmint)
      .define(thief)
      .seat(0)
      .library(...LIBRARY)
      .hand(thief.name, BEARS)
      .battlefield(varmint.name)
      .battlefield('Swamp', 'Swamp');
    for (let seat = 1; seat < seats; seat++) {
      b = b.seat(seat as 1 | 2 | 3).library(...LIBRARY);
      if (seat === seats - 1) b = b.graveyard('Raging Goblin');
    }
    return b.at('precombatMain', { active: 0 }).build();
  };

  for (const seats of [2, 3, 4] as const) {
    test(`with ${seats} seats the two mana pay for the opponent's card cast from exile, and cost 1 life`, () => {
      const g = board(seats);
      g.act(0).cast(thief.name, { pay: true });
      g.passAll();
      g.expect.zone('Raging Goblin', 'exile', { seat: seats - 1 });
      g.act(0).tapForMana(varmint.name, { color: 'R' });
      g.expect.life(0, 39);
      // Raging Goblin costs {R}: one of the two red mana pays it, the other stays in the pool.
      g.act(0).cast({ name: 'Raging Goblin', zone: 'exile', seat: seats - 1 }, { pay: true });
      g.passAll();
      g.expect.zone('Raging Goblin', 'battlefield', { seat: 0 });
      g.expect.invariants();
    });
  }

  test('the same mana cannot pay for a spell of your own', () => {
    const g = board(2);
    g.act(0).tapForMana(varmint.name, { color: 'G' });
    g.expect.life(0, 39);
    expect(() => g.act(0).cast(BEARS, { pay: true })).toThrow(/engine rejected/);
  });
});
