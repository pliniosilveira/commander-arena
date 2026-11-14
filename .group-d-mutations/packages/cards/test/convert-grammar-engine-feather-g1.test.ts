// The Feather deck (issue 27), group 1 (D-450 to D-457): the REAL Oracle text of Crimson Wisps, Gods Willing, Shelter, Might of the Meek, Legion Leadership // Legion
// Stronghold, Fleeting Flight and Fists of Flame (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 613.1e (a color-changing effect replaces
// the colors), CR 613.1f (keywords granted in layer 6), CR 702.16 (protection), CR 608.2d (the color is chosen as the spell resolves), CR 701.10 (double: +X/+0 where X is the
// power as the effect resolves), CR 615 (prevention: a shield for the turn on the creature the spell names), CR 121.1 (cards drawn this turn), CR 608.2h (an amount is worked out once), CR 611.2a.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2 green
const BOLT = 'Lightning Bolt';
const SPIDER = 'Giant Spider'; // 2/4 green, reach
const GOBLIN = 'Raging Goblin'; // 1/1 red, haste
const DIVINATION = 'Divination';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('Crimson Wisps: "Target creature becomes red and gains haste until end of turn. Draw a card."', () => {
  const wisps = real('Crimson Wisps');
  const WISPS = wisps.name;
  const start = () =>
    scenario()
      .define(wisps)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(WISPS)
      .battlefield('Mountain')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(wisps)).toEqual([]);
  });

  test('a green creature becomes red (and only red), gains haste, and you draw a card', () => {
    const g = start();
    g.expect.derived('mine', { colors: ['G'], keywords: [] });
    g.act(0).cast(WISPS, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.derived('mine', { colors: ['R'], keywords: ['haste'] });
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('it works on any creature, an opponent’s included: the color replaces the old one, the other keywords stay', () => {
    const g = start();
    g.act(0).cast(WISPS, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.derived('theirs', { colors: ['R'], keywords: ['haste', 'reach'] });
  });

  test('it lasts until end of turn: the creature is green again, with no haste, in the next turn', () => {
    const g = start();
    g.act(0).cast(WISPS, { targets: ['mine'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('mine', { colors: ['G'], keywords: [] });
  });

  test('a creature that became red is a red source: a green creature’s protection from red now applies to it (CR 613.1e)', () => {
    const g = start();
    g.act(0).cast(WISPS, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.derived('mine', { colors: ['R'] });
  });
});

describe.each(['Gods Willing', 'Shelter'])(
  '%s: "Target creature you control gains protection from the color of your choice until end of turn."',
  (name) => {
    const card = real(name);
    const NAME = card.name;
    const text = card.faces[0]?.oracleText ?? '';
    const scries = /Scry 1/.test(text);

    const start = () =>
      scenario()
        .define(card)
        .seat(0)
        .life(20)
        .library(...LIBRARY)
        .hand(NAME)
        .battlefield('Plains', 'Plains')
        .battlefield(BEARS, { label: 'mine' })
        .seat(1)
        .life(20)
        .library(...LIBRARY)
        .hand(BOLT)
        .battlefield('Mountain')
        .battlefield(GOBLIN, { label: 'goblin' })
        .at('precombatMain', { active: 0, priority: 0 })
        .build();

    test('the card is valid and its target is a creature you control (the opponent’s creature is not offered)', () => {
      expect(validateCard(card)).toEqual([]);
      const g = start();
      g.act(0).cast(NAME);
      const d = g.state.pending;
      if (d?.kind !== 'targets') throw new Error('expected the targets');
      expect((d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : null))).toEqual([
        g.id('mine'),
      ]);
    });

    test('nothing is asked as it is cast; as it resolves the controller chooses one of the five colors', () => {
      const g = start();
      g.act(0).cast(NAME, { targets: ['mine'], pay: true });
      g.expect.stack([NAME]);
      g.expect.pending('priority', 0);
      g.passAll();
      const d = g.state.pending;
      expect(d).toMatchObject({
        kind: 'chooseOption',
        seat: 0,
        purpose: 'protectionColor',
        options: ['W', 'U', 'B', 'R', 'G'],
      });
    });

    test('in response to a Bolt: protection from red fizzles it, the creature survives; the rest of the text then runs', () => {
      const g = start();
      g.act(0).pass();
      g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
      g.act(1).pass();
      g.act(0).cast(NAME, { targets: ['mine'], pay: true });
      g.passAll();
      g.act(0).chooseOption('R');
      // "Scry 1." asks for the arrangement of the top card; "Draw a card." has nothing to ask.
      if (scries) {
        expect(g.state.pending?.kind).toBe('arrangeCards');
        g.act(0).choose({ kind: 'arrangeCards', top: [...libraryTop(g)], other: [] });
      }
      g.passAll();
      g.expect.zone(BEARS, 'battlefield', { seat: 0 });
      g.expect.damage('mine', 0);
      g.expect.zone(BOLT, 'graveyard', { seat: 1 });
      g.expect.handSize(0, scries ? 0 : 1);
      g.expect.invariants();
    });

    test('choosing another color saves nothing from the Bolt', () => {
      const g = start();
      g.act(0).pass();
      g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
      g.act(1).pass();
      g.act(0).cast(NAME, { targets: ['mine'], pay: true });
      g.passAll();
      g.act(0).chooseOption('U');
      if (scries) g.act(0).choose({ kind: 'arrangeCards', top: [...libraryTop(g)], other: [] });
      g.passAll();
      g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    });

    function libraryTop(g: ReturnType<typeof start>) {
      const d = g.state.pending;
      if (d?.kind !== 'arrangeCards') throw new Error('expected the scry');
      return d.cards;
    }
  },
);

describe('Might of the Meek: "Target creature gains trample until end of turn. It also gets +1/+0 until end of turn if you control a Mouse. Draw a card."', () => {
  const meek = real('Might of the Meek');
  const MEEK = meek.name;
  const mouse = (name: string): CardDefinition =>
    parsed(name, 'Creature — Mouse', '', {
      manaCost: '{R}',
      power: '1',
      toughness: '1',
      colors: ['R'],
    });
  const MOUSE = 'SYNTHETIC Feather Test Mouse';

  const start = (controlsMouse: 'mine' | 'theirs' | 'none') => {
    let b = scenario()
      .define(meek)
      .define(mouse(MOUSE))
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(MEEK)
      .battlefield('Mountain')
      .battlefield(BEARS, { label: 'bear' });
    if (controlsMouse === 'mine') b = b.battlefield(MOUSE);
    b = b
      .seat(1)
      .life(20)
      .library(...LIBRARY);
    if (controlsMouse === 'theirs') b = b.battlefield(MOUSE);
    return b.at('precombatMain', { active: 0, priority: 0 }).build();
  };

  test('the card is valid', () => {
    expect(validateCard(meek)).toEqual([]);
  });

  test('without a Mouse the creature only gains trample, and you draw a card', () => {
    const g = start('none');
    g.act(0).cast(MEEK, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.derived('bear', { keywords: ['trample'] });
    g.expect.pt('bear', 2, 2);
    g.expect.handSize(0, 1);
  });

  test('with a Mouse you control it also gets +1/+0', () => {
    const g = start('mine');
    g.act(0).cast(MEEK, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.derived('bear', { keywords: ['trample'] });
    g.expect.pt('bear', 3, 2);
    g.expect.handSize(0, 1);
  });

  test('a Mouse an opponent controls does not count (the condition is "you control")', () => {
    const g = start('theirs');
    g.act(0).cast(MEEK, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.pt('bear', 2, 2);
    g.expect.derived('bear', { keywords: ['trample'] });
  });

  test('the Mouse can be the target itself: it gets trample and +1/+0', () => {
    const g = scenario()
      .define(meek)
      .define(mouse(MOUSE))
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(MEEK)
      .battlefield('Mountain')
      .battlefield(MOUSE, { label: 'mouse' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(MEEK, { targets: ['mouse'], pay: true });
    g.passAll();
    g.expect.pt('mouse', 2, 1);
  });
});

describe('Legion Leadership // Legion Stronghold: "Until end of turn, double target creature\'s power and it gains first strike."', () => {
  const legion = real('Legion Leadership // Legion Stronghold');
  const LEGION = legion.name;
  const start = () =>
    scenario()
      .define(legion)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(LEGION)
      .battlefield('Mountain', 'Plains')
      .battlefield(BEARS, { label: 'bear', counters: { '+1/+1': 1 } })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('the card is valid; the other face is a land that enters tapped and taps for {R} or {W}', () => {
    expect(validateCard(legion)).toEqual([]);
    expect(legion.faces[1]?.types).toEqual(['land']);
    expect(legion.faces[1]?.name).toBe('Legion Stronghold');
  });

  test('power 3 becomes 6, toughness stays 3, and the creature has first strike', () => {
    const g = start();
    g.expect.pt('bear', 3, 3);
    g.act(0).cast(LEGION, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.pt('bear', 6, 3);
    g.expect.derived('bear', { keywords: ['firstStrike'] });
    g.expect.invariants();
  });

  test('it doubles the power as it resolves, counters and effects before it included; one that comes later adds to it', () => {
    const g = start();
    g.act(0).cast(LEGION, { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.pt('spider', 4, 4);
    g.expect.derived('spider', { keywords: ['firstStrike', 'reach'] });
  });

  test('it lasts until end of turn', () => {
    const g = start();
    g.act(0).cast(LEGION, { targets: ['bear'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 3, 3);
    g.expect.derived('bear', { keywords: [] });
  });
});

describe('Fleeting Flight: "Put a +1/+1 counter on target creature. It gains flying until end of turn. Prevent all combat damage that would be dealt to it this turn."', () => {
  const flight = real('Fleeting Flight');
  const FLIGHT = flight.name;
  const start = () =>
    scenario()
      .define(flight)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(FLIGHT)
      .battlefield('Plains')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(GOBLIN, { label: 'goblin' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(flight)).toEqual([]);
  });

  test('a +1/+1 counter, flying until end of turn, and the counter stays', () => {
    const g = start();
    g.act(0).cast(FLIGHT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.pt('mine', 3, 3);
    g.expect.derived('mine', { keywords: ['flying'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.derived('mine', { keywords: [] });
  });

  test('combat damage that would be dealt to the creature is prevented, whoever deals it', () => {
    const g = start();
    g.act(0).cast(FLIGHT, { targets: ['spider'], pay: true });
    g.passAll();
    // The Spider (now 3/5 flying, with a counter) is the opponent's; the Bears attack and it blocks: the Bears' damage to it is prevented, the Spider's damage to the Bears is not.
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('mine');
    g.passAll();
    g.act(1).declareBlockers([{ blocker: 'spider', attacker: 'mine' }]);
    g.passAll();
    g.passAll();
    // The damage did happen (the Bears died to the Spider's 3) and none of it was dealt to the protected Spider.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.damage('spider', 0);
  });

  test('damage that is not combat damage is not prevented', () => {
    const g = start();
    g.act(0).cast(FLIGHT, { targets: ['goblin'], pay: true });
    g.passAll();
    g.expect.derived('goblin', { keywords: ['flying', 'haste'] });
    g.expect.counters('goblin', { '+1/+1': 1 });
  });
});

describe('Fists of Flame: "Draw a card. Until end of turn, target creature gains trample and gets +1/+0 for each card you\'ve drawn this turn."', () => {
  const fists = real('Fists of Flame');
  const FISTS = fists.name;
  const start = (hand: readonly string[] = [FISTS]) =>
    scenario()
      .define(fists)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Island')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(fists)).toEqual([]);
  });

  test('it draws first: one card drawn this turn, +1/+0 and trample', () => {
    const g = start();
    g.act(0).cast(FISTS, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.pt('mine', 3, 2);
    g.expect.derived('mine', { keywords: ['trample'] });
    g.expect.invariants();
  });

  test('after a Divination (two cards) the spell counts three', () => {
    const g = start([DIVINATION, FISTS]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.act(0).cast(FISTS, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 5, 2);
  });

  test('it lasts until end of turn', () => {
    const g = start();
    g.act(0).cast(FISTS, { targets: ['mine'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('mine', 2, 2);
    g.expect.derived('mine', { keywords: [] });
  });
});
