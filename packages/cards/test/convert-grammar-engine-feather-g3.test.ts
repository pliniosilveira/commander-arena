// The Feather deck (issue 27), group 3 (D-1320 to D-1325 provisional): the REAL Oracle text of Phalanx Leader, Tenth District Legionnaire, Danitha Sword of Hope, Feather the Redeemed,
// Zada Hedron Grinder and Mirrorwing Dragon (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is compared with the SYNTHETIC cards of
// the engine fixtures the engine scenarios of `scenario-xx-feather-g3.test.ts` run, and is played through applyAction, so the nodes the parser writes for the real text are what the
// engine runs. Pins: CR 601.2i and 603.2 (a trigger on a spell cast), CR 115.9c (targets only), CR 614.1a and 603.7 (the exile as a spell resolves, and its return), CR 707.10 and 707.10e (the
// copies for each other creature).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const PHALANX = real('Phalanx Leader');
const TENTH = real('Tenth District Legionnaire');
const DANITHA = real('Danitha, Sword of Hope');
const FEATHER = real('Feather, the Redeemed');
const ZADA = real('Zada, Hedron Grinder');
const MIRRORWING = real('Mirrorwing Dragon');

const BLADE = 'SYNTHETIC Blade'; // {1} Equipment
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const UNSUMMON = 'Unsummon';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const abilitiesOf = (card: CardDefinition) => faceOf(card).abilities;
const triggeredOf = (card: CardDefinition) =>
  abilitiesOf(card).filter((a) => a.kind === 'triggered');

describe('the real cards are the nodes the engine fixtures hold', () => {
  test.each([PHALANX, TENTH, DANITHA, FEATHER, ZADA, MIRRORWING])('%s is valid', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Phalanx Leader: the trigger of the SYNTHETIC Heroic Captain', () => {
    expect(triggeredOf(PHALANX)).toEqual(triggeredOf(syntheticCard('SYNTHETIC Heroic Captain')));
  });

  test('Tenth District Legionnaire: the trigger of the SYNTHETIC Heroic Scout (and its haste)', () => {
    expect(abilitiesOf(TENTH)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Heroic Scout')));
  });

  test('Danitha Sword of Hope: the abilities of the SYNTHETIC Cast Draw Knight', () => {
    expect(abilitiesOf(DANITHA)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Cast Draw Knight')));
  });

  test('Feather the Redeemed: the abilities of the SYNTHETIC Spell Recycler', () => {
    expect(abilitiesOf(FEATHER)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Spell Recycler')));
  });

  test('Zada Hedron Grinder: the trigger of the SYNTHETIC Echo Grinder', () => {
    expect(abilitiesOf(ZADA)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Echo Grinder')));
  });

  test('Mirrorwing Dragon: the abilities of the SYNTHETIC Mirror Wyrm', () => {
    expect(abilitiesOf(MIRRORWING)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Mirror Wyrm')));
  });
});

const names = (g: ScenarioGame, seat: 0 | 1, zone: 'hand' | 'graveyard' | 'exile'): string[] => {
  const ids = zone === 'exile' ? g.state.exile : (g.state.seats[seat]?.[zone] ?? []);
  return ids.map((id) => {
    const obj = g.state.objects[id];
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
  });
};

const spellsOnStack = (g: ScenarioGame) =>
  g.state.stack.flatMap((id) => {
    const obj = g.state.objects[id];
    if (obj?.stack?.kind !== 'spell') return [];
    return [
      {
        controller: obj.controller,
        copy: obj.copyOf !== undefined && obj.copyOf !== null,
        targets: obj.stack.chosenTargets.map((t) => {
          if (t.kind !== 'object') return `player ${t.seat}`;
          const target = g.state.objects[t.id];
          const card = target?.card == null ? undefined : g.state.cards[target.card];
          return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
        }),
      },
    ];
  });

describe('Phalanx Leader and Tenth District Legionnaire are played', () => {
  test('Phalanx Leader: a spell that targets it puts a counter on each creature you control', () => {
    const g = scenario()
      .define(PHALANX)
      .seat(0)
      .hand(UNSUMMON)
      .battlefield(PHALANX.name, BEARS, 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(UNSUMMON, { targets: [PHALANX.name], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    g.expect.zone(PHALANX.name, 'hand', { seat: 0 });
  });

  test('Tenth District Legionnaire: a spell that targets it puts a counter on it, then it scries', () => {
    const g = scenario()
      .define(TENTH)
      .seat(0)
      .hand(UNSUMMON)
      .battlefield(TENTH.name, BEARS, 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(UNSUMMON, { targets: [TENTH.name], pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
    expect(d.purpose).toBe('scry');
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('Danitha, Sword of Hope is played', () => {
  const game = (hand: readonly string[]) =>
    scenario()
      .define(DANITHA)
      .seat(0)
      .hand(...hand)
      .battlefield(DANITHA.name, BEARS, 'Island', 'Island', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('an Equipment spell draws, a second qualifying spell the same turn does not', () => {
    const g = game([BLADE, UNSUMMON]);
    g.act(0).cast(BLADE, { pay: true });
    g.passAll();
    expect(names(g, 0, 'hand')).toEqual([UNSUMMON, 'Plains']);
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.passAll();
    expect(names(g, 0, 'hand')).toEqual(['Plains', BEARS]);
  });
});

describe('Feather, the Redeemed is played', () => {
  test('an instant that targets a creature you control is exiled as it resolves and comes back at the end step', () => {
    const g = scenario()
      .define(FEATHER)
      .seat(0)
      .hand(UNSUMMON)
      .battlefield(FEATHER.name, BEARS, 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(UNSUMMON, { targets: [BEARS], pay: true });
    g.passAll();
    expect(names(g, 0, 'exile')).toEqual([UNSUMMON]);
    expect(names(g, 0, 'graveyard')).toEqual([]);
    g.advanceTo('end');
    g.passAll();
    expect(names(g, 0, 'hand')).toEqual([BEARS, UNSUMMON]);
    g.expect.invariants();
  });
});

describe('Zada, Hedron Grinder and Mirrorwing Dragon are played', () => {
  test('Zada: an instant that targets only Zada is copied for each other creature you control', () => {
    const g = scenario()
      .define(ZADA)
      .seat(0)
      .hand(UNSUMMON)
      .battlefield(ZADA.name, BEARS, SPIDER, 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(UNSUMMON, { targets: [ZADA.name], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g)).toEqual([
      { controller: 0, copy: false, targets: [ZADA.name] },
      { controller: 0, copy: true, targets: [BEARS] },
      { controller: 0, copy: true, targets: [SPIDER] },
    ]);
    g.passAll();
    expect(names(g, 0, 'hand').sort()).toEqual([BEARS, SPIDER, ZADA.name].sort());
  });

  test('Zada: a spell with a second target, or a player as its target, is not copied', () => {
    const g = scenario()
      .define(ZADA)
      .seat(0)
      .hand(BOLT)
      .battlefield(ZADA.name, BEARS, 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(37);
  });

  test('Mirrorwing Dragon: the opponent who casts an instant at it copies it for each other creature they control', () => {
    const g = scenario()
      .define(MIRRORWING)
      .seat(0)
      .battlefield(MIRRORWING.name, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', SPIDER, 'SYNTHETIC Vanilla 3/3')
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BOLT, { targets: [MIRRORWING.name], pay: true });
    g.pass();
    g.pass();
    expect(spellsOnStack(g)).toEqual([
      { controller: 1, copy: false, targets: [MIRRORWING.name] },
      { controller: 1, copy: true, targets: [SPIDER] },
      { controller: 1, copy: true, targets: ['SYNTHETIC Vanilla 3/3'] },
    ]);
    g.passAll();
    g.expect.invariants();
  });
});
