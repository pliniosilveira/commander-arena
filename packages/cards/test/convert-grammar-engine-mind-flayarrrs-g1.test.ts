// Mind Flayarrrs deck, group 1 (Creeping Tar Pit, Dimir Keyrune, River of Tears), read by the grammar and run by the engine. The first block parses the REAL Oracle
// text of each card from the golden corpus, whole; the rest play the real cards through `applyAction` with the scenario DSL, with three seats where the opponents
// matter ("can't be blocked" holds against every opponent's creatures), plus the near misses the grammar must not read. Pins: CR 509.1b (a creature that can't be
// blocked has no legal blocker), CR 611.2a and 514.2 (a continuous effect of a resolving ability lasts until the turn ends), CR 205.1b (a land that becomes a
// creature is still a land), CR 613.4b (the base power and toughness), CR 305.1 (playing a land is the player's special action), CR 605.3b (a mana ability reads
// the game as it is activated).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const real = (name: string): CardDefinition => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
};

const LIB = Array.from({ length: 12 }, () => 'Plains');
const TAR_PIT = real('Creeping Tar Pit');
const KEYRUNE = real('Dimir Keyrune');
const RIVER = real('River of Tears');

describe('the real cards, whole', () => {
  test('all three are supported', () => {
    expect([TAR_PIT.name, KEYRUNE.name, RIVER.name]).toEqual([
      'Creeping Tar Pit',
      'Dimir Keyrune',
      'River of Tears',
    ]);
  });
});

describe('the grammar reads the lines', () => {
  test('the land that becomes a creature is a becomes effect and a restriction of the turn', () => {
    const [ability] = readAll(
      "{1}{U}{B}: Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn.",
      'land',
    ).abilities;
    const text = JSON.stringify(ability);
    expect(text).toContain('"kind":"setTypes"');
    expect(text).toContain('"additive":true');
    expect(text).toContain('"kind":"setPt"');
    expect(text).toContain('"restriction":"cantBeBlocked"');
  });

  test('the artifact that becomes an artifact creature adds both types', () => {
    const [ability] = readAll(
      "{U}{B}: ~ becomes a 2/2 blue and black Horror artifact creature until end of turn and can't be blocked this turn.",
      'artifact',
    ).abilities;
    const text = JSON.stringify(ability);
    expect(text).toContain('"types":["artifact","creature"]');
    expect(text).toContain('"subtypes":["Horror"]');
    expect(text).toContain('"restriction":"cantBeBlocked"');
  });

  test('"if you played a land this turn" is the condition of the replacing production', () => {
    const [ability] = readAll(
      '{T}: Add {U}. If you played a land this turn, add {B} instead.',
      'land',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'mana',
      production: { kind: 'fixed', mana: ['U'] },
      instead: {
        condition: { kind: 'playedLandThisTurn' },
        production: { kind: 'fixed', mana: ['B'] },
      },
    });
  });

  test.each([
    [
      'the sentence "It can\'t be blocked this turn" left out',
      "{1}{U}{B}: Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land.",
    ],
    [
      'a land that stops being a land',
      "{1}{U}{B}: Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It can't be blocked this turn.",
    ],
    [
      'another duration',
      "{1}{U}{B}: Until your next turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn.",
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'land')).toBeDefined();
  });

  test.each([
    [
      'an opponent played a land',
      '{T}: Add {U}. If an opponent played a land this turn, add {B} instead.',
    ],
    ['a count', '{T}: Add {U}. If you played two lands this turn, add {B} instead.'],
    ['no time', '{T}: Add {U}. If you played a land, add {B} instead.'],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'land')).toBeDefined();
  });
});

const view = (g: { state: Parameters<typeof getView>[0] }, seat: 0 | 1 | 2, name: string) =>
  getView(g.state, seat).battlefield.find((o) => o.name === name);

describe('Creeping Tar Pit: a 3/2 land creature that nobody can block', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(TAR_PIT)
      .seat(0)
      .library(...LIB)
      .battlefield(TAR_PIT.name, 'Island', 'Swamp', 'Island')
      .seat(1)
      .library(...LIB)
      .battlefield('Grizzly Bears', 'Serra Angel')
      .seat(2)
      .library(...LIB)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it becomes a blue and black 3/2 Elemental creature and is still a land (CR 205.1b, 613.4b)', () => {
    const g = build();
    g.act(0).activate(TAR_PIT.name, { pay: true });
    g.passAll();
    g.expect.pt(TAR_PIT.name, 3, 2);
    const o = view(g, 0, TAR_PIT.name);
    expect(o?.types).toEqual(expect.arrayContaining(['land', 'creature']));
    expect(o?.subtypes).toContain('Elemental');
    expect(o?.colors).toEqual(expect.arrayContaining(['U', 'B']));
  });

  test('no creature of any opponent can block it (CR 509.1b), in a game of three seats', () => {
    const g = build();
    g.act(0).activate(TAR_PIT.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(TAR_PIT.name, { player: 1 });
    g.advanceTo('declareBlockers');
    const bears1 = { name: 'Grizzly Bears', seat: 1 } as const;
    g.expect.illegal(1, { declareBlockers: [{ blocker: bears1, attacker: TAR_PIT.name }] });
    g.expect.illegal(1, { declareBlockers: [{ blocker: 'Serra Angel', attacker: TAR_PIT.name }] });
  });

  test('an attack at the other opponent is unblockable for that opponent too', () => {
    const g = build();
    g.act(0).activate(TAR_PIT.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(TAR_PIT.name, { player: 2 });
    g.advanceTo('declareBlockers');
    const bears2 = { name: 'Grizzly Bears', seat: 2 } as const;
    g.expect.illegal(2, { declareBlockers: [{ blocker: bears2, attacker: TAR_PIT.name }] });
  });

  test("a land that did not use the ability can be blocked as any creature (control: the restriction is the ability's)", () => {
    const g = scenario({ seats: 3 })
      .define(TAR_PIT)
      .seat(0)
      .library(...LIB)
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...LIB)
      .battlefield('Grizzly Bears')
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears', { player: 1 });
    g.advanceTo('declareBlockers');
    g.expect.legal(1, {
      declareBlockers: [
        {
          blocker: { name: 'Grizzly Bears', seat: 1 },
          attacker: { name: 'Grizzly Bears', seat: 0 },
        },
      ],
    });
  });

  test('it is a land and a creature only until the end of the turn (CR 514.2)', () => {
    const g = build();
    g.act(0).activate(TAR_PIT.name, { pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(view(g, 0, TAR_PIT.name)?.types).toEqual(['land']);
  });
});

describe('Dimir Keyrune: a 2/2 artifact creature that nobody can block', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(KEYRUNE)
      .seat(0)
      .library(...LIB)
      .battlefield(KEYRUNE.name, 'Island', 'Swamp')
      .seat(1)
      .library(...LIB)
      .battlefield('Grizzly Bears')
      .seat(2)
      .library(...LIB)
      .battlefield('Serra Angel')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it becomes a blue and black Horror artifact creature 2/2', () => {
    const g = build();
    g.act(0).activate(KEYRUNE.name, { ability: 1, pay: true });
    g.passAll();
    g.expect.pt(KEYRUNE.name, 2, 2);
    const o = view(g, 0, KEYRUNE.name);
    expect(o?.types).toEqual(expect.arrayContaining(['artifact', 'creature']));
    expect(o?.subtypes).toContain('Horror');
    expect(o?.colors).toEqual(expect.arrayContaining(['U', 'B']));
  });

  test('no creature of either opponent can block it', () => {
    const g = build();
    g.act(0).activate(KEYRUNE.name, { ability: 1, pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(KEYRUNE.name, { player: 1 });
    g.advanceTo('declareBlockers');
    g.expect.illegal(1, {
      declareBlockers: [{ blocker: { name: 'Grizzly Bears', seat: 1 }, attacker: KEYRUNE.name }],
    });
    g.expect.illegal(2, {
      declareBlockers: [{ blocker: { name: 'Serra Angel', seat: 2 }, attacker: KEYRUNE.name }],
    });
  });
});

describe('River of Tears: {U}, or {B} instead if I played a land this turn', () => {
  test('before any land play it makes {U}', () => {
    const g = scenario({ seats: 3 })
      .define(RIVER)
      .seat(0)
      .library(...LIB)
      .battlefield(RIVER.name)
      .seat(1)
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).tapForMana(RIVER.name);
    g.expect.pool(0, 'U');
  });

  test('after I play a land it makes {B}', () => {
    const g = scenario({ seats: 3 })
      .define(RIVER)
      .seat(0)
      .hand('Forest')
      .library(...LIB)
      .battlefield(RIVER.name)
      .seat(1)
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).playLand('Forest');
    g.act(0).tapForMana(RIVER.name);
    g.expect.pool(0, 'B');
  });

  test("another player's land play does not count: it makes {U} in their turn", () => {
    const g = scenario({ seats: 3 })
      .define(RIVER)
      .seat(0)
      .library(...LIB)
      .battlefield(RIVER.name)
      .seat(1)
      .hand('Forest')
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.act(1).playLand('Forest');
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).tapForMana(RIVER.name);
    g.expect.pool(0, 'U');
  });
});
