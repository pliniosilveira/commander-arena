// The Squirreled Away deck (issue 113), group 2: the REAL Oracle text of Second Harvest and Rootcast Apprenticeship (the corpus's golden.jsonl, taken from the issue) and the
// end step trigger of Hazel of the Rootbloom (its line is read from the real card; the card itself stays unsupported for its mana ability, see docs/ROADMAP.md) go through the
// grammar with no override, are defined in an engine scenario and are played through applyAction. Pins: CR 707.2 and 111.4 (a token that is a copy has the copiable values of the
// original, so a copy of a Squirrel is a Squirrel), CR 707.2 (what is not copied: tapped state), CR 608.2c (a token for each token, the group decided as the instruction begins),
// CR 700.2d (the same mode chosen more than once, a target for each instance), CR 115.1 (targets), CR 109.4 (control of three or four players). The helper cards are SYNTHETIC
// (named so) or real engine fixtures.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const goldenCard = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return card;
};

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const imported = importCard(fromGoldenCard(goldenCard(name)), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const harvest = real('Second Harvest');
const apprenticeship = real('Rootcast Apprenticeship');
const HARVEST = harvest.name;
const APPRENTICESHIP = apprenticeship.name;

// The second line of the real Hazel of the Rootbloom, on a creature of its own (SYNTHETIC name).
const HAZEL_LINE =
  goldenCard('Hazel of the Rootbloom').faces[0]?.oracleText.split('\n')[1] ??
  (() => {
    throw new Error('Hazel has no second line');
  })();
const hazel = parsed(
  'SYNTHETIC Rootbloom Druid',
  'Legendary Creature — Squirrel Druid',
  HAZEL_LINE,
  {
    manaCost: '{2}{B}{G}',
    power: '3',
    toughness: '5',
  },
);
const HAZEL = hazel.name;

const SQUIRRELS = parsed(
  'SYNTHETIC Squirrel Maker',
  'Sorcery',
  'Create two 1/1 green Squirrel creature tokens.',
  { manaCost: '{G}' },
);
const GOBLIN = parsed(
  'SYNTHETIC Goblin Maker',
  'Sorcery',
  'Create a 1/1 red Goblin creature token.',
  { manaCost: '{R}' },
);
const FLASH_GOBLIN = parsed(
  'SYNTHETIC Goblin Flash',
  'Instant',
  'Create a 1/1 red Goblin creature token.',
  { manaCost: '{R}' },
);
const TREASURE = parsed('SYNTHETIC Treasure Maker', 'Sorcery', 'Create a Treasure token.', {
  manaCost: '{G}',
});
const ARTIFACT = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{1}' });
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Forest');

const define = (seats: 2 | 3 | 4, ...defs: readonly CardDefinition[]) =>
  defs.reduce((builder, def) => builder.define(def), scenario({ seats }));

const ALL = [
  harvest,
  apprenticeship,
  hazel,
  SQUIRRELS,
  GOBLIN,
  FLASH_GOBLIN,
  TREASURE,
  ARTIFACT,
] as const;

const tokens = (g: ScenarioGame, name: string, seat: number) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);

/** Casts a SYNTHETIC maker of tokens for seat 0 and lets it resolve. */
function make(g: ScenarioGame, card: CardDefinition): void {
  g.act(0).cast(card.name, { pay: true });
  g.passAll();
}

/** Seat `seat` makes a Goblin token with an instant while `g`'s seat 0 has a spell on the stack. */
function opponentMakesGoblin(g: ScenarioGame, seat: number): void {
  g.act(0).cast(SQUIRRELS.name, { pay: true });
  for (let holder = 0; holder < seat; holder += 1) g.pass(holder);
  g.act(seat).cast(FLASH_GOBLIN.name, { pay: true });
  g.passAll();
}

describe('the cards are valid', () => {
  test.each([harvest, apprenticeship, hazel])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('the real Hazel of the Rootbloom is still unsupported: its mana ability needs a cost that taps X tokens', () => {
    const imported = importCard(
      fromGoldenCard(goldenCard('Hazel of the Rootbloom')),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.closestRule)).toEqual(['cost.tap-permanents']);
  });

  test('Caretaker\'s Talent, whose level 2 ability copies "target token you control", now reads too', () => {
    const talent = real("Caretaker's Talent");
    expect(validateCard(talent)).toEqual([]);
  });

  test('"target token you control" is one target slot: a token of the controller, any type', () => {
    const trigger = hazel.faces[0]?.abilities[0];
    expect(trigger).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      targets: [{ id: 't1', what: { kind: 'object', filter: { token: true, controller: 'you' } } }],
    });
  });
});

describe('Second Harvest: "For each token you control, create a token that\'s a copy of that permanent."', () => {
  const start = (seats: 2 | 3 | 4 = 2) => {
    let b = define(seats, ...ALL)
      .seat(0)
      .hand(SQUIRRELS.name, TREASURE.name, HARVEST)
      .battlefield(BEARS)
      .battlefield('Forest', { count: 6 })
      .library(...FILLER);
    for (let s = 1; s < seats; s += 1) {
      b = b
        .seat(s)
        .hand(FLASH_GOBLIN.name)
        .battlefield('Mountain')
        .library(...FILLER);
    }
    return b;
  };

  test('two Squirrels and a Treasure: each gets a copy (a Squirrel is a Squirrel, a Treasure is a Treasure), a nontoken creature none', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    make(g, SQUIRRELS);
    make(g, TREASURE);
    expect(tokens(g, 'Squirrel', 0)).toHaveLength(2);
    expect(tokens(g, 'Treasure', 0)).toHaveLength(1);
    g.act(0).cast(HARVEST, { pay: true });
    g.passAll();
    // The tokens counted are those there were when the instruction began: 2 + 1 copies, not copies of copies.
    expect(tokens(g, 'Squirrel', 0)).toHaveLength(4);
    expect(tokens(g, 'Treasure', 0)).toHaveLength(2);
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    // The copy has the copiable values: a 1/1 green Squirrel creature.
    for (const o of tokens(g, 'Squirrel', 0)) {
      const shown = getView(g.state, 0).battlefield.find((v) => v.id === o.id);
      expect([shown?.power, shown?.toughness, shown?.colors]).toEqual([1, 1, ['G']]);
    }
    g.expect.invariants();
  });

  test('only the tokens of the controller are copied, with two, three and four seats', () => {
    for (const seats of [2, 3, 4] as const) {
      const g = start(seats).at('precombatMain', { active: 0, turn: 3 }).build();
      opponentMakesGoblin(g, seats - 1);
      expect(tokens(g, 'Goblin', seats - 1)).toHaveLength(1);
      expect(tokens(g, 'Squirrel', 0)).toHaveLength(2);
      g.act(0).cast(HARVEST, { pay: true });
      g.passAll();
      expect(tokens(g, 'Squirrel', 0)).toHaveLength(4);
      // The opponent's Goblin is not copied, and nobody else gets a copy.
      expect(tokens(g, 'Goblin', seats - 1)).toHaveLength(1);
      expect(tokens(g, 'Goblin', 0)).toHaveLength(0);
      for (let s = 1; s < seats; s += 1) expect(tokens(g, 'Squirrel', s)).toHaveLength(0);
    }
  });

  test('with no token there is nothing to copy and the spell does nothing', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(HARVEST, { pay: true });
    g.passAll();
    expect(g.find({ name: HARVEST, zone: 'graveyard', seat: 0 })).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.token != null)).toHaveLength(0);
  });
});

describe('Hazel of the Rootbloom: "At the beginning of your end step, create a token that\'s a copy of target token you control. If that token is a Squirrel, instead create two tokens that are copies of it."', () => {
  const start = (seats: 2 | 3 | 4 = 2) => {
    let b = define(seats, ...ALL)
      .seat(0)
      .hand(SQUIRRELS.name, GOBLIN.name, TREASURE.name)
      .battlefield(HAZEL)
      .battlefield('Forest', { count: 3 })
      .battlefield('Mountain')
      .library(...FILLER);
    for (let s = 1; s < seats; s += 1) {
      b = b
        .seat(s)
        .hand(FLASH_GOBLIN.name)
        .battlefield('Mountain')
        .library(...FILLER);
    }
    return b;
  };

  test('a Squirrel token is copied twice: three Squirrels', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(SQUIRRELS.name, { pay: true });
    g.passAll();
    const [first] = tokens(g, 'Squirrel', 0);
    g.advanceTo('end');
    g.act(0).chooseTargets(first?.id ?? '');
    g.passAll();
    // Two Squirrels, and two more copies of the one targeted.
    expect(tokens(g, 'Squirrel', 0)).toHaveLength(4);
    g.expect.invariants();
  });

  test('a token that is not a Squirrel is copied once', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(GOBLIN.name, { pay: true });
    g.passAll();
    const [goblin] = tokens(g, 'Goblin', 0);
    g.advanceTo('end');
    // The only token is the only legal target: the engine chooses it.
    expect(g.state.pending?.kind).toBe('priority');
    expect(goblin).toBeDefined();
    g.passAll();
    expect(tokens(g, 'Goblin', 0)).toHaveLength(2);
  });

  test('a noncreature token (a Treasure) is a legal target and is copied once', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(TREASURE.name, { pay: true });
    g.passAll();
    const [treasure] = tokens(g, 'Treasure', 0);
    g.advanceTo('end');
    expect(g.state.pending?.kind).toBe('priority');
    expect(treasure).toBeDefined();
    g.passAll();
    expect(tokens(g, 'Treasure', 0)).toHaveLength(2);
  });

  test('with no token the ability is not put on the stack (no target)', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('end');
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.pending?.kind).not.toBe('targets');
  });

  test('a token of an opponent is not a legal target, with two, three and four seats', () => {
    for (const seats of [2, 3, 4] as const) {
      const g = start(seats).at('precombatMain', { active: 0, turn: 3 }).build();
      opponentMakesGoblin(g, seats - 1);
      expect(tokens(g, 'Goblin', seats - 1)).toHaveLength(1);
      // Seat 0 has two Squirrels (made by the spell the opponent responded to): they are the legal targets, the Goblin of the opponent is not one.
      g.advanceTo('end');
      const d = g.state.pending;
      if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
      const legal = d.specs[0]?.legal.map((t) => (typeof t === 'object' && 'id' in t ? t.id : t));
      expect(legal).toHaveLength(2);
      const squirrels = tokens(g, 'Squirrel', 0).map((o) => o.id);
      expect([...(legal ?? [])].sort()).toEqual([...squirrels].sort());
      g.act(0).chooseTargets(squirrels[0] ?? '');
      g.passAll();
      expect(tokens(g, 'Goblin', seats - 1)).toHaveLength(1);
      expect(tokens(g, 'Goblin', 0)).toHaveLength(0);
      expect(tokens(g, 'Squirrel', 0)).toHaveLength(4);
    }
  });
});

describe('Rootcast Apprenticeship: "Choose three. You may choose the same mode more than once."', () => {
  const PUT_COUNTERS = 0;
  const COPY_TOKEN = 1;
  const SQUIRREL_FOR = 2;
  const SACRIFICE = 3;

  const start = (seats: 2 | 3 | 4 = 2) => {
    let b = define(seats, ...ALL)
      .seat(0)
      .hand(APPRENTICESHIP, SQUIRRELS.name)
      .battlefield(BEARS)
      .battlefield('Forest', { count: 8 })
      .library(...FILLER);
    for (let s = 1; s < seats; s += 1) {
      b = b
        .seat(s)
        .battlefield(BEARS)
        .battlefield(ARTIFACT.name)
        .library(...FILLER);
    }
    return b;
  };

  test('the whole card reads: four modes, a repeatable choice of three', () => {
    const spell = apprenticeship.faces[0]?.spell;
    expect(spell?.chooseModes).toEqual({ min: 3, max: 3, repeatable: true });
    expect(spell?.modes).toHaveLength(4);
  });

  test('the second mode three times: a copy of the same token for each instance (three copies of one Squirrel)', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    make(g, SQUIRRELS);
    const [squirrel] = tokens(g, 'Squirrel', 0);
    g.act(0)
      .cast(APPRENTICESHIP)
      .modes(COPY_TOKEN, COPY_TOKEN, COPY_TOKEN)
      .targets([squirrel?.id ?? '', squirrel?.id ?? '', squirrel?.id ?? ''])
      .pay();
    g.passAll();
    expect(tokens(g, 'Squirrel', 0)).toHaveLength(5);
    g.expect.invariants();
  });

  test('a different target for each instance: counters on two creatures and a Squirrel for a player', () => {
    const g = start().at('precombatMain', { active: 0, turn: 3 }).build();
    make(g, SQUIRRELS);
    const [squirrel] = tokens(g, 'Squirrel', 0);
    g.act(0)
      .cast(APPRENTICESHIP)
      .modes(PUT_COUNTERS, PUT_COUNTERS, SQUIRREL_FOR)
      .targets([{ name: BEARS, seat: 0 }, squirrel?.id ?? '', { player: 0 }])
      .pay();
    g.passAll();
    g.expect.pt({ name: BEARS, seat: 0 }, 4, 4);
    const shown = getView(g.state, 0).battlefield.find((v) => v.id === squirrel?.id);
    expect([shown?.power, shown?.toughness]).toEqual([3, 3]);
    expect(tokens(g, 'Squirrel', 0)).toHaveLength(3);
  });

  test('the last mode twice and three seats: each target opponent sacrifices a nontoken artifact of their choice', () => {
    for (const seats of [3, 4] as const) {
      const g = start(seats).at('precombatMain', { active: 0, turn: 3 }).build();
      g.act(0)
        .cast(APPRENTICESHIP)
        .modes(SACRIFICE, SACRIFICE, PUT_COUNTERS)
        .targets([{ name: BEARS, seat: 0 }, { player: 1 }, { player: 2 }])
        .pay();
      g.passAll();
      expect(g.find({ name: ARTIFACT.name, zone: 'battlefield', seat: 1 })).toHaveLength(0);
      expect(g.find({ name: ARTIFACT.name, zone: 'battlefield', seat: 2 })).toHaveLength(0);
      if (seats === 4) {
        expect(g.find({ name: ARTIFACT.name, zone: 'battlefield', seat: 3 })).toHaveLength(1);
      }
      g.expect.invariants();
    }
  });
});
