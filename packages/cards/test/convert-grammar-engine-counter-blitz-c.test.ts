// The Counter Blitz deck (Final Fantasy Commander), group C: Saga creatures, modal and choice text. The REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no
// override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Cards: Summon: Magus Sisters
// (CR 700.2, "choose one at random" on a chapter), Summon: Valefor (CR 608.2d, 101.4: each opponent chooses among the creatures with the greatest mana value), Summon: Yojimbo (CR 508.1d,
// 508.1h: "can't attack you unless their controller pays {2}"; CR 102.2: opponents who control a creature with power 4 or greater), Collective Effort (CR 702.120a: Escalate with a tap cost),
// Yuna's Decision (CR 608.2d: "a creature card and/or a land card") and Endless Detour (CR 108.3, 401.4: the owner chooses the top or the bottom).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const sisters = real('Summon: Magus Sisters');
const valefor = real('Summon: Valefor');
const yojimbo = real('Summon: Yojimbo');
const effort = real('Collective Effort');
const decision = real("Yuna's Decision");
const detour = real('Endless Detour');

// SYNTHETIC creatures with the stats a test needs.
const wall = (name: string, power: number, manaCost: string) =>
  parsed(name, 'Creature — Wall', '', { manaCost, power: String(power), toughness: '4' });
const MV1 = wall('SYNTHETIC One Wall', 1, '{1}');
const MV3A = wall('SYNTHETIC Three Wall A', 2, '{2}{G}');
const MV3B = wall('SYNTHETIC Three Wall B', 5, '{1}{R}{R}');
const MV5 = wall('SYNTHETIC Five Wall', 4, '{3}{U}{U}');
const ENCH = 'SYNTHETIC Quiet Enchantment';
const ench = parsed(ENCH, 'Enchantment', '', { manaCost: '{1}' });
const FILLER = Array.from({ length: 12 }, () => 'Plains');

describe('the six cards are valid and supported', () => {
  for (const def of [sisters, valefor, yojimbo, effort, decision, detour]) {
    test(def.name, () => {
      expect(validateCard(def)).toEqual([]);
    });
  }

  test('the real text reads as the nodes the engine runs', () => {
    const json = (def: CardDefinition) => JSON.stringify(def.faces);
    expect(json(sisters)).toContain('"random":true');
    expect(json(valefor)).toContain('"greatest":"manaValue"');
    expect(json(valefor)).toContain('"player":{"kind":"eachOpponent"}');
    expect(json(yojimbo)).toContain('"tax":[{"kind":"mana","symbols":["2"]}]');
    expect(json(yojimbo)).toContain('"opponentsOnly":true');
    expect(json(effort)).toContain('"kind":"escalate"');
    expect(json(effort)).toContain('"kind":"tapPermanents"');
    expect(json(detour)).toContain('"kind":"ownerPutsOnLibrary"');
    expect(json(detour)).toContain('"card":{"zone":"graveyard"}');
  });
});

describe('Summon: Valefor (CR 608.2d, 101.4)', () => {
  const NAME = valefor.name;
  /** Seat 0 casts it ({4}{U}); seats 1 and 2 each have creatures of different mana values. */
  const cast = () => {
    const g = scenario({ seats: 3 })
      .define(valefor)
      .define(MV1)
      .define(MV3A)
      .define(MV3B)
      .define(MV5)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...FILLER)
      .battlefield(MV1.name, MV3A.name, MV3B.name)
      .seat(2)
      .library(...FILLER)
      .battlefield(MV1.name, MV5.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    return g;
  };

  test('chapter I: each opponent chooses a creature with the greatest mana value, and those are returned', () => {
    const g = cast();
    // Seat 1 has two creatures tied at mana value 3 and chooses; seat 2 has one with the greatest (5) and is not asked.
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(MV3B.name);
    g.expect.zone(MV3B.name, 'hand', { seat: 1 });
    g.expect.zone(MV3A.name, 'battlefield', { seat: 1 });
    g.expect.zone(MV1.name, 'battlefield', { seat: 1 });
    g.expect.zone(MV5.name, 'hand', { seat: 2 });
    g.expect.zone(MV1.name, 'battlefield', { seat: 2 });
    g.expect.invariants();
  });

  test('only a creature tied for the greatest mana value can be chosen', () => {
    const g = cast();
    const pending = g.state.pending;
    expect(pending?.kind).toBe('choosePermanent');
    if (pending?.kind !== 'choosePermanent') return;
    expect([...pending.legal].sort()).toEqual(
      [g.id({ name: MV3A.name, seat: 1 }), g.id({ name: MV3B.name, seat: 1 })].sort(),
    );
  });

  test('a player with no creature is not asked and loses nothing', () => {
    const g = scenario({ seats: 3 })
      .define(valefor)
      .define(MV5)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .battlefield(MV5.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(MV5.name, 'hand', { seat: 2 });
    g.expect.invariants();
  });

  test('chapter II: tap up to one target creature and put a stun counter on it', () => {
    const g = cast();
    g.act(1).choosePermanents(MV3B.name);
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.act(0).chooseTargets({ name: MV3A.name, seat: 1 });
    g.passAll();
    g.expect.tapped({ name: MV3A.name, seat: 1 });
    g.expect.counters({ name: MV3A.name, seat: 1 }, { stun: 1 });
    g.expect.invariants();
  });
});

describe('Summon: Yojimbo', () => {
  const NAME = yojimbo.name;
  const TREASURE = 'Treasure';
  const base = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    build(
      scenario({ seats: 3 })
        .define(yojimbo)
        .define(MV1)
        .define(MV3A)
        .define(MV3B)
        .define(MV5)
        .define(ench)
        .seat(0)
        .hand(NAME)
        .library(...FILLER)
        .battlefield('Plains', 'Plains', 'Plains', 'Plains'),
    );

  test('chapter I: only an artifact, an enchantment or a tapped creature an opponent controls can be targeted', () => {
    const g = base((b) =>
      b
        .seat(0)
        .battlefield(MV1.name, { tapped: true })
        .seat(1)
        .library(...FILLER)
        .battlefield(MV3A.name)
        .battlefield(MV3B.name, { tapped: true })
        .battlefield('Sol Ring')
        .seat(2)
        .library(...FILLER)
        .battlefield(ENCH)
        .battlefield(MV5.name)
        .battlefield('Forest')
        .at('precombatMain', { active: 0 }),
    ).build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    const pending = g.state.pending;
    expect(pending?.kind).toBe('targets');
    if (pending?.kind !== 'targets') return;
    const legal = (pending.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : -1));
    expect([...legal].sort()).toEqual(
      [
        g.id({ name: MV3B.name, seat: 1 }),
        g.id({ name: 'Sol Ring', seat: 1 }),
        g.id({ name: ENCH, seat: 2 }),
      ].sort(),
    );
  });

  test('chapter I: the target is exiled', () => {
    const g = base((b) =>
      b
        .seat(1)
        .library(...FILLER)
        .battlefield(MV3B.name, { tapped: true })
        .seat(2)
        .library(...FILLER)
        .at('precombatMain', { active: 0 }),
    ).build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    // The one legal target is chosen as the chapter ability is put on the stack.
    g.passAll();
    g.expect.zone(MV3B.name, 'exile', { seat: 1 });
    g.expect.invariants();
  });

  /** Seat 0 casts it and chapter I resolves (nothing to exile), then its next turn comes and chapter II resolves; on to the declare attackers step of seat 1 (or 2). */
  const taxed = (seat: 1 | 2) => {
    const g = base((b) =>
      b
        .seat(1)
        .library(...FILLER)
        .battlefield(MV1.name, 'Plains', 'Plains', 'Plains')
        .seat(2)
        .library(...FILLER)
        .battlefield(MV3A.name, 'Plains', 'Plains', 'Plains')
        .at('precombatMain', { active: 0 }),
    ).build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.passAll();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + seat });
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('chapter II: creatures cannot attack its controller unless their controller pays {2} for each', () => {
    const g = taxed(1);
    const d = g.state.pending;
    expect(d?.kind).toBe('declareAttackers');
    if (d?.kind !== 'declareAttackers') return;
    expect(d.attackCosts).toEqual([
      { target: { kind: 'player', seat: 0 }, cost: ['2'], affordable: 1 },
    ]);
    g.act(1).attack(MV1.name, { player: 0 });
    g.expect.pending('payMana', 1);
    g.act(1).payAuto();
    g.expect.combat({ attackers: [MV1.name] });
    g.expect.invariants();
  });

  test('a creature that attacks another player pays nothing, and the cost is never required', () => {
    const g = taxed(1);
    g.act(1).attack(MV1.name, { player: 2 });
    g.expect.pending('priority', 1);
    g.expect.combat({ attackers: [MV1.name] });
  });

  test('it lasts through the turns of every other player until the next turn of its controller', () => {
    const g = taxed(2);
    const d = g.state.pending;
    expect(d?.kind).toBe('declareAttackers');
    if (d?.kind !== 'declareAttackers') return;
    expect(d.attackCosts?.[0]?.cost).toEqual(['2']);
  });

  /** Chapter IV: through the chapters of the next three turns of seat 0. */
  const chapterIV = (seat1: readonly string[], seat2: readonly string[]) => {
    const g = base((b) => {
      b.seat(1).library(...FILLER);
      for (const name of seat1) b.battlefield(name);
      b.seat(2).library(...FILLER);
      for (const name of seat2) b.battlefield(name);
      return b.at('precombatMain', { active: 0 });
    }).build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    for (let chapter = 2; chapter <= 4; chapter++) {
      g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
      g.passAll();
    }
    return g;
  };
  const treasures = (g: ReturnType<typeof chapterIV>) =>
    g.find({ name: TREASURE, zone: 'battlefield', seat: 0 }).length;

  test('chapter IV: a Treasure for each opponent who controls a creature with power 4 or greater', () => {
    const g = chapterIV([MV3B.name, MV1.name], [MV5.name]);
    expect(treasures(g)).toBe(2);
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('chapter IV: an opponent with only smaller creatures, or none, adds nothing (and two such creatures count once)', () => {
    expect(treasures(chapterIV([MV3A.name, MV1.name], []))).toBe(0);
    expect(treasures(chapterIV([MV3B.name, MV5.name], [MV1.name]))).toBe(1);
  });
});
