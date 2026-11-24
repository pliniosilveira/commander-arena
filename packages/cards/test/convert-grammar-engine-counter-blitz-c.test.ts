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

describe('Summon: Magus Sisters (CR 700.2, 714)', () => {
  const NAME = sisters.name;
  /** Seat 0 casts it ({4}{G}) with seed `seed`; the mode of chapter I is drawn as the chapter ability goes on the stack. */
  const cast = (seed: number) => {
    const g = scenario({ seats: 2 })
      .seed(seed)
      .define(sisters)
      .define(MV3A)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...FILLER)
      .battlefield(MV3A.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    const pending = g.state.pending;
    if (pending?.kind === 'targets') {
      const first = pending.specs[0]?.legal[0];
      if (first?.kind === 'object') g.act(0).chooseTargets(String(first.id));
      g.passAll();
    }
    return g;
  };
  const outcome = (g: ReturnType<typeof cast>) => {
    const sistersId = g.id({ name: NAME, seat: 0 });
    const wall = g.state.objects[g.id({ name: MV3A.name, seat: 1 })];
    const counters = (id: typeof sistersId) => g.state.objects[id]?.counters ?? {};
    if (wall?.zone === 'graveyard') return 'fight';
    if ((counters(sistersId)['+1/+1'] ?? 0) === 3 || (wall?.counters['+1/+1'] ?? 0) === 3) {
      return 'combine';
    }
    if ((counters(sistersId).shield ?? 0) === 1 || (wall?.counters.shield ?? 0) === 1) {
      return 'defense';
    }
    return 'nothing';
  };

  test('chapter I does one of the three modes, drawn at random, and every one of them happens', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) seen.add(outcome(cast(seed)));
    expect([...seen].sort()).toEqual(['combine', 'defense', 'fight']);
  });

  test('the modes do what they say', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = cast(seed);
      const result = outcome(g);
      if (result === 'defense') {
        g.expect.life(0, 43);
      } else if (result === 'fight') {
        // 5 damage from the Saga kills the 2/4 wall; the wall dealt 2 damage back.
        g.expect.damage(NAME, 2);
        g.expect.life(0, 40);
      } else {
        g.expect.life(0, 40);
      }
      g.expect.invariants();
    }
  });
});

describe('Collective Effort (CR 702.120a, 118.3, 700.2)', () => {
  const NAME = effort.name;
  const A = 'SYNTHETIC Escalate Bear A';
  const B = 'SYNTHETIC Escalate Bear B';
  const bearA = parsed(A, 'Creature — Bear', '', { manaCost: '{1}', power: '2', toughness: '2' });
  const bearB = parsed(B, 'Creature — Bear', '', { manaCost: '{1}', power: '2', toughness: '2' });
  /** Seat 0 has `bears` creatures (the first one summoning sick: tapping for a cost needs no {T} ability) and three Plains; seat 1 has an enchantment and a power 5 creature. */
  const setup = (bears: readonly string[]) => {
    const b = scenario({ seats: 2 })
      .define(effort)
      .define(bearA)
      .define(bearB)
      .define(MV3B)
      .define(ench)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Plains', 'Plains', 'Plains');
    for (const name of bears) b.battlefield(name);
    return b
      .seat(1)
      .library(...FILLER)
      .battlefield(MV3B.name)
      .battlefield(ENCH)
      .at('precombatMain', { active: 0 })
      .build();
  };
  const FOE = { name: MV3B.name, seat: 1 } as const;
  const AURA = { name: ENCH, seat: 1 } as const;

  test('the keyword reads as an escalate cost of tapping one untapped creature', () => {
    expect(effort.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: {
        kind: 'escalate',
        cost: [
          { kind: 'tapPermanents', filter: { types: ['creature'], controller: 'you' }, count: 1 },
        ],
      },
    });
  });

  test('one mode costs only the mana: no creature is tapped', () => {
    const g = setup([A]);
    g.act(0).cast(NAME).modes(1).targets([AURA]).pay();
    g.passAll();
    g.expect.zone(ENCH, 'graveyard', { seat: 1 });
    g.expect.tapped(A, false);
    g.expect.invariants();
  });

  test('two modes tap one untapped creature, and both modes happen', () => {
    const g = setup([A]);
    g.act(0).cast(NAME).modes(0, 1).targets([FOE, AURA]).pay();
    g.expect.tapped(A, true);
    g.passAll();
    g.expect.zone(MV3B.name, 'graveyard', { seat: 1 });
    g.expect.zone(ENCH, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('three modes tap two creatures', () => {
    const g = setup([A, B]);
    g.act(0)
      .cast(NAME)
      .modes(0, 1, 2)
      .targets([FOE, AURA, { player: 0 }])
      .pay();
    g.expect.tapped(A, true);
    g.expect.tapped(B, true);
    g.passAll();
    // The counter goes on each creature seat 0 controls (they are tapped already, and still creatures).
    g.expect.counters(A, { '+1/+1': 1 });
    g.expect.counters(B, { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('with more untapped creatures than the cost needs, the caster chooses which one is tapped', () => {
    const g = setup([A, B]);
    g.act(0).cast(NAME).modes(0, 1).targets([FOE, AURA]).pay();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(B);
    g.expect.tapped(B, true);
    g.expect.tapped(A, false);
    g.passAll();
    g.expect.zone(MV3B.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a creature that is already tapped cannot pay: with one untapped creature the third mode is not offered', () => {
    const g = setup([A]);
    g.act(0).cast(NAME);
    const pending = g.state.pending;
    expect(pending?.kind).toBe('chooseModes');
    if (pending?.kind !== 'chooseModes') return;
    // Three modes need two creatures to tap, two modes need one.
    expect(pending.sets.map((set) => set.length)).not.toContain(3);
    expect(pending.sets.map((set) => set.length)).toContain(2);
  });

  test('with no creature to tap only one mode can be chosen', () => {
    const g = setup([]);
    g.act(0).cast(NAME);
    const pending = g.state.pending;
    expect(pending?.kind).toBe('chooseModes');
    if (pending?.kind !== 'chooseModes') return;
    expect(pending.sets.every((set) => set.length === 1)).toBe(true);
  });
});

describe("Yuna's Decision (CR 608.2d, 110.2a)", () => {
  const NAME = decision.name;
  const SAC = 'SYNTHETIC Sacrifice Fodder';
  const fodder = parsed(SAC, 'Creature — Bear', '', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  });
  const HANDCREATURE = 'SYNTHETIC Hand Creature';
  const handCreature = parsed(HANDCREATURE, 'Creature — Bear', '', {
    manaCost: '{3}',
    power: '3',
    toughness: '3',
  });
  const setup = (fodderOnBoard: boolean) => {
    const b = scenario({ seats: 2 })
      .define(decision)
      .define(fodder)
      .define(handCreature)
      .define(MV1)
      .define(MV3A)
      .seat(0)
      .hand(NAME, HANDCREATURE, MV3A.name, 'Forest', 'Island')
      .library('Plains', ...FILLER)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .graveyard(MV1.name, 'Mountain', 'Swamp');
    if (fodderOnBoard) b.battlefield(SAC);
    return b
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('continue the pilgrimage: sacrifice, draw, then a creature card and a land card may come from the hand', () => {
    const g = setup(true);
    g.act(0).cast(NAME).modes(0).pay();
    g.passAll();
    g.expect.zone(SAC, 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(HANDCREATURE);
    g.expect.pending('chooseCards', 0);
    // Either land card of the hand (the drawn Plains too) is a candidate; one is put.
    g.act(0).chooseCards({ name: 'Island', zone: 'hand', seat: 0 });
    g.expect.zone(HANDCREATURE, 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    // Only one card of each kind: the other creature card and the other lands stay in the hand.
    g.expect.zone(MV3A.name, 'hand', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('each card is an offer of its own: either may be declined', () => {
    const g = setup(true);
    g.act(0).cast(NAME).modes(0).pay();
    g.passAll();
    g.act(0).chooseCards();
    g.act(0).chooseCards({ name: 'Island', zone: 'hand', seat: 0 });
    g.expect.zone(HANDCREATURE, 'hand', { seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature to sacrifice nothing is drawn and nothing is put onto the battlefield', () => {
    const g = setup(false);
    g.act(0).cast(NAME).modes(0).pay();
    g.passAll();
    g.expect.zone('Plains', 'library', { seat: 0 });
    g.expect.zone(HANDCREATURE, 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('find another way: one or two target permanent cards return from the graveyard', () => {
    const g = setup(false);
    g.act(0)
      .cast(NAME)
      .modes(1)
      .targets([
        { name: MV1.name, zone: 'graveyard', seat: 0 },
        { name: 'Mountain', zone: 'graveyard', seat: 0 },
      ])
      .pay();
    g.passAll();
    g.expect.zone(MV1.name, 'hand', { seat: 0 });
    g.expect.zone('Mountain', 'hand', { seat: 0 });
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Endless Detour (CR 108.3, 401.4, 115.1)', () => {
  const NAME = detour.name;
  const TOP = 'on top of your library';
  const BOTTOM = 'on the bottom of your library';
  /** Seat 0 has {G}{W}{U} open and Endless Detour; seat 1 has a creature, an enchantment and a land, a Bolt in hand and a card in its graveyard. */
  const setup = (active: 0 | 1 = 0) =>
    scenario({ seats: 2 })
      .define(detour)
      .define(MV3A)
      .define(ench)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Forest', 'Plains', 'Island')
      .seat(1)
      .library(...FILLER)
      .hand('Lightning Bolt')
      .graveyard('Grizzly Bears')
      .battlefield(MV3A.name)
      .battlefield(ENCH)
      .battlefield('Mountain')
      .at('precombatMain', { active })
      .build();
  type Game = ReturnType<typeof setup>;
  const top = (g: Game) => g.state.seats[1]?.library[0];
  const bottom = (g: Game) => g.state.seats[1]?.library.at(-1);

  test('a nonland permanent: its owner puts it on the top of their library', () => {
    const g = setup();
    g.act(0)
      .cast(NAME)
      .targets([{ name: MV3A.name, seat: 1 }])
      .pay();
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption(TOP);
    g.expect.zone(MV3A.name, 'library', { seat: 1 });
    expect(top(g)).toBe(g.id({ name: MV3A.name, zone: 'library', seat: 1 }));
    g.expect.invariants();
  });

  test('the owner may put it on the bottom instead', () => {
    const g = setup();
    g.act(0)
      .cast(NAME)
      .targets([{ name: ENCH, seat: 1 }])
      .pay();
    g.passAll();
    g.act(1).chooseOption(BOTTOM);
    expect(bottom(g)).toBe(g.id({ name: ENCH, zone: 'library', seat: 1 }));
    g.expect.invariants();
  });

  test('a land is not a legal target; a permanent and a card of a graveyard are', () => {
    const g = setup();
    g.act(0).cast(NAME);
    const pending = g.state.pending;
    expect(pending?.kind).toBe('targets');
    if (pending?.kind !== 'targets') return;
    const legal = (pending.specs[0]?.legal ?? []).flatMap((t) =>
      t.kind === 'object' ? [t.id] : [],
    );
    expect(legal).not.toContain(g.id({ name: 'Mountain', seat: 1 }));
    expect(legal).toContain(g.id({ name: 'Grizzly Bears', zone: 'graveyard', seat: 1 }));
    expect(legal).toContain(g.id({ name: ENCH, seat: 1 }));
    expect(legal).toContain(g.id({ name: MV3A.name, seat: 1 }));
  });

  test('a card in a graveyard goes to the library of its owner', () => {
    const g = setup();
    g.act(0)
      .cast(NAME)
      .targets([{ name: 'Grizzly Bears', zone: 'graveyard', seat: 1 }])
      .pay();
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption(TOP);
    g.expect.zone('Grizzly Bears', 'library', { seat: 1 });
    expect(top(g)).toBe(g.id({ name: 'Grizzly Bears', zone: 'library', seat: 1 }));
    g.expect.invariants();
  });

  test('a spell on the stack: its owner is asked, and the spell does not resolve', () => {
    const g = setup(1);
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [{ player: 0 }] });
    g.pass(1);
    g.act(0)
      .cast(NAME)
      .targets([{ name: 'Lightning Bolt', zone: 'stack', seat: 1 }])
      .pay();
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption(BOTTOM);
    expect(bottom(g)).toBe(g.id({ name: 'Lightning Bolt', zone: 'library', seat: 1 }));
    g.passAll();
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('the owner chooses, not the controller: a permanent that is controlled by another player', () => {
    const g = scenario({ seats: 2 })
      .define(detour)
      .define(MV3A)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Forest', 'Plains', 'Island')
      .seat(1)
      .library(...FILLER)
      .battlefield(MV3A.name, { controller: 0 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(NAME).targets([MV3A.name]).pay();
    g.passAll();
    // Seat 0 controls the creature, seat 1 owns it: seat 1 is asked and the creature goes to seat 1's library.
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption(TOP);
    expect(top(g)).toBe(g.id({ name: MV3A.name, zone: 'library', seat: 1 }));
    g.expect.invariants();
  });
});
