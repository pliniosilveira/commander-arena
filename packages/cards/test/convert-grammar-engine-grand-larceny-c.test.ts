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

describe('Baleful Mastery: pay {1}{B} rather than its mana cost; if that cost was paid, an opponent draws a card', () => {
  const mastery = parsed(
    'SYNTHETIC Baleful Mastery',
    'Instant',
    "You may pay {1}{B} rather than pay ~'s mana cost.\nIf the {1}{B} cost was paid, an opponent draws a card.\nExile target creature or planeswalker.",
    { manaCost: '{3}{B}', colors: ['B'] },
  );
  test('is a valid card', () => expect(validateCard(mastery)).toEqual([]));

  const board = (seats: 2 | 3 | 4, lands: number) => {
    let b = scenario({ seats })
      .define(mastery)
      .seat(0)
      .library(...LIBRARY)
      .hand(mastery.name)
      .battlefield('Swamp', { count: lands });
    for (let seat = 1; seat < seats; seat++) {
      b = b
        .seat(seat as 1 | 2 | 3)
        .library(...LIBRARY)
        .hand('Plains');
      if (seat === 1) b = b.battlefield(BEARS);
    }
    return b.at('precombatMain', { active: 0 }).build();
  };
  const handSize = (g: ReturnType<typeof board>, seat: 0 | 1 | 2 | 3) =>
    g.state.seats[seat]?.hand.length;

  test('with two Swamps only the alternative cost can be paid: the creature is exiled and the opponent draws', () => {
    const g = board(2, 2);
    g.expect.illegal(0, { cast: mastery.name });
    g.act(0).cast(mastery.name, { alternative: 'payMana', targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(mastery.name, 'graveyard', { seat: 0 });
    expect(handSize(g, 1)).toBe(2);
    g.expect.invariants();
  });

  test('cast for its mana cost the opponent draws nothing', () => {
    const g = board(2, 4);
    g.act(0).cast(mastery.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    expect(handSize(g, 1)).toBe(1);
    g.expect.invariants();
  });

  for (const seats of [3, 4] as const) {
    test(`with ${seats} seats the caster chooses which opponent draws, and only that one does`, () => {
      const g = board(seats, 2);
      g.act(0).cast(mastery.name, { alternative: 'payMana', targets: [BEARS], pay: true });
      g.passAll();
      g.expect.pending('chooseOption', 0);
      g.act(0).chooseOption('seat:2');
      g.expect.zone(BEARS, 'exile', { seat: 1 });
      expect(handSize(g, 1)).toBe(1);
      expect(handSize(g, 2)).toBe(2);
      if (seats === 4) expect(handSize(g, 3)).toBe(1);
      g.expect.invariants();
    });
  }
});

describe("Plasm Capture: counter target spell; at the beginning of your next first main phase add X mana in any combination of colors, where X is that spell's mana value", () => {
  const capture = parsed(
    'SYNTHETIC Plasm Capture',
    'Instant',
    "Counter target spell. At the beginning of your next first main phase, add X mana in any combination of colors, where X is that spell's mana value.",
    { manaCost: '{G}{U}{U}', colors: ['G', 'U'] },
  );
  test('is a valid card', () => expect(validateCard(capture)).toEqual([]));

  const board = (seats: 2 | 3 | 4, caster: 1 | 2 | 3) => {
    let b = scenario({ seats })
      .define(capture)
      .seat(0)
      .library(...LIBRARY)
      .hand(capture.name)
      .battlefield('Island', 'Island', 'Forest');
    for (let seat = 1; seat < seats; seat++) {
      b = b.seat(seat as 1 | 2 | 3).library(...LIBRARY);
      if (seat === caster) b = b.hand(BEARS).battlefield('Forest', 'Forest');
    }
    return b.at('precombatMain', { active: caster }).build();
  };

  for (const [seats, caster] of [
    [2, 1],
    [3, 2],
    [4, 3],
  ] as const) {
    test(`with ${seats} seats: counters the spell of seat ${caster}, and seat 0 chooses the colors of 2 mana in its own next first main phase`, () => {
      const g = board(seats, caster);
      g.act(caster).cast(BEARS, { pay: true });
      g.act(caster).pass();
      g.act(0).cast(capture.name, { targets: [BEARS], pay: true });
      g.passAll();
      g.expect.zone(BEARS, 'graveyard', { seat: caster });
      // Nothing yet: the mana comes at the beginning of seat 0's first main phase, not this turn's.
      g.expect.pool(0, '');
      g.advanceTo('precombatMain', { turn: 'next' });
      while (g.state.turn.activeSeat !== 0) g.advanceTo('precombatMain', { turn: 'next' });
      g.expect.pool(0, '');
      g.passAll();
      // The mana value of the Bears is 2: white, blue, black, red are asked in turn (the last color takes the rest).
      g.expect.pending('chooseX', 0);
      g.act(0).chooseX(0); // white
      g.act(0).chooseX(0); // blue
      g.act(0).chooseX(0); // black
      g.act(0).chooseX(1); // red: one; the other mana is green
      g.expect.pool(0, 'RG');
      g.expect.invariants();
    });
  }

  test('an {X} in the mana cost of the countered spell counts as the value chosen for it (Scryfall ruling of 2013-04-15)', () => {
    const g = scenario()
      .define(capture)
      .seat(0)
      .library(...LIBRARY)
      .hand(capture.name)
      .battlefield('Island', 'Island', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .hand('SYNTHETIC X Burn')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('SYNTHETIC X Burn', { x: 3, targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    g.act(0).cast(capture.name, { targets: ['SYNTHETIC X Burn'], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.passAll();
    // {X}{R} with X = 3 has mana value 4.
    g.act(0).chooseX(4);
    g.expect.pool(0, 'WWWW');
  });

  test('the mana is all taken by the first color it is given to: nothing more is asked', () => {
    const g = board(2, 1);
    g.act(1).cast(BEARS, { pay: true });
    g.act(1).pass();
    g.act(0).cast(capture.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.passAll();
    g.act(0).chooseX(2);
    g.expect.pool(0, 'WW');
    expect(g.state.pending).not.toMatchObject({ kind: 'chooseX' });
  });
});

describe("Void Attendant: {1}{G}, put a card an opponent owns from exile into that player's graveyard: create a 1/1 Eldrazi Scion", () => {
  const attendant = parsed(
    'SYNTHETIC Void Attendant',
    'Creature — Eldrazi Processor',
    'Devoid\n{1}{G}, Put a card an opponent owns from exile into that player\'s graveyard: Create a 1/1 colorless Eldrazi Scion creature token. It has "Sacrifice this token: Add {C}."',
    { manaCost: '{2}{G}', power: '2', toughness: '2', colors: ['G'] },
  );
  test('is a valid card', () => expect(validateCard(attendant)).toEqual([]));

  const board = (seats: 2 | 3 | 4, exiled: readonly (readonly [number, string])[]) => {
    let b = scenario({ seats })
      .define(attendant)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(attendant.name)
      .battlefield('Forest', 'Forest');
    for (let seat = 1; seat < seats; seat++) {
      b = b.seat(seat as 1 | 2 | 3).library(...LIBRARY);
      for (const [owner, name] of exiled) if (owner === seat) b = b.exile(name);
    }
    return b.at('precombatMain', { active: 0 }).build();
  };
  const scions = (g: ReturnType<typeof board>) =>
    g.state.battlefield.filter((id) => g.state.objects[id]?.token !== null).length;

  for (const seats of [2, 3, 4] as const) {
    test(`with ${seats} seats the card goes to the graveyard of its owner, and a Scion is made`, () => {
      const owner = seats - 1;
      const g = board(seats, [[owner, BEARS]]);
      g.act(0).activate(attendant.name, { pay: true });
      g.expect.zone(BEARS, 'graveyard', { seat: owner });
      g.passAll();
      expect(scions(g)).toBe(1);
      g.expect.invariants();
    });
  }

  test('with two opponents the player chooses which card, and the other stays in exile', () => {
    const g = board(3, [
      [1, BEARS],
      [2, 'Raging Goblin'],
    ]);
    g.act(0).activate(attendant.name, { pay: true });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: 'Raging Goblin', zone: 'exile', seat: 2 });
    g.expect.zone('Raging Goblin', 'graveyard', { seat: 2 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.passAll();
    expect(scions(g)).toBe(1);
  });

  test('a card of your own in exile is not one an opponent owns: the ability cannot be activated', () => {
    const g = scenario({ seats: 3 })
      .define(attendant)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(attendant.name)
      .battlefield('Forest', 'Forest')
      .exile(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { activate: attendant.name });
  });

  test('the Scion can be sacrificed for {C}', () => {
    const g = board(2, [[1, BEARS]]);
    g.act(0).activate(attendant.name, { pay: true });
    g.passAll();
    const token = g.state.battlefield.find((id) => g.state.objects[id]?.token !== null);
    if (token === undefined) throw new Error('no Scion');
    g.act(0).tapForMana(token);
    g.expect.pool(0, 'C');
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
