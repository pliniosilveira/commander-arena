// Stick Together's primitive (`chooseParty`, CR 700.8d, 701.21a, 101.4): each player, in APNAP order, chooses a party from among the creatures they control, then the rest are sacrificed
// at once. Cards are defined here (SYNTHETIC), with no name of a real card. Played through applyAction with two, three and four seats.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  enumerateParties,
  getView,
  isFeatureSupported,
  isKnownFeature,
  type PartyType,
  type PendingDecision,
  validateCard,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const LIB = Array.from({ length: 6 }, () => 'Plains');

const creature = (
  name: string,
  subtypes: readonly string[],
  abilities: readonly Ability[] = [],
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['creature'],
    subtypes,
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'Test.',
    abilities,
  });

const CLERIC = creature('SYNTHETIC Cleric', ['Human', 'Cleric']);
const CLERIC2 = creature('SYNTHETIC Second Cleric', ['Human', 'Cleric']);
const ROGUE = creature('SYNTHETIC Rogue', ['Human', 'Rogue']);
const WARRIOR = creature('SYNTHETIC Warrior', ['Human', 'Warrior']);
const WIZARD = creature('SYNTHETIC Wizard', ['Human', 'Wizard']);
const CLERIC_WIZARD = creature('SYNTHETIC Cleric Wizard', ['Elf', 'Cleric', 'Wizard']);
const CHANGELING = creature(
  'SYNTHETIC Shapeshifter',
  ['Shapeshifter'],
  [{ kind: 'keyword', keyword: { kind: 'changeling' } }],
);
const BEAR = creature('SYNTHETIC Bear', ['Bear']);
// "When this creature dies, you gain 3 life."
const MARTYR = creature(
  'SYNTHETIC Martyr Cleric',
  ['Human', 'Cleric'],
  [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    },
  ],
);
// "Each player chooses a party from among creatures they control, then sacrifices the rest."
const TOGETHER = singleFace({
  name: 'SYNTHETIC Party Purge',
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText:
    'Each player chooses a party from among creatures they control, then sacrifices the rest.',
  spell: { effect: { kind: 'chooseParty', players: { kind: 'eachPlayer' } } },
});
const ALL = [
  CLERIC,
  CLERIC2,
  ROGUE,
  WARRIOR,
  WIZARD,
  CLERIC_WIZARD,
  CHANGELING,
  BEAR,
  MARTYR,
  TOGETHER,
];

type Entry = string | readonly [string, string];

function start(
  seats: 2 | 3 | 4,
  active: number,
  boards: Readonly<Record<number, readonly Entry[]>>,
) {
  let b = scenario({ seats });
  for (const card of ALL) b = b.define(card);
  for (let seat = 0; seat < seats; seat += 1) {
    const s = b
      .seat(seat)
      .life(20)
      .library(...LIB);
    if (seat === active) s.hand(TOGETHER.name).battlefield('Plains');
    for (const entry of boards[seat] ?? []) {
      if (typeof entry === 'string') s.battlefield(entry);
      else s.battlefield(entry[0], { label: entry[1] });
    }
  }
  const g = b.at('precombatMain', { active, turn: 3 }).build();
  g.act(active).cast(TOGETHER.name).pay();
  g.passAll();
  return g;
}
type Game = ReturnType<typeof start>;
const party = (g: Game): Extract<PendingDecision, { kind: 'chooseParty' }> => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseParty') throw new Error(`expected chooseParty, got ${d?.kind}`);
  return d;
};
const onBattlefield = (g: Game, seat: number): string[] =>
  Object.values(g.state.objects)
    .filter((o) => o.zone === 'battlefield' && o.controller === seat)
    .map((o) => derive(g.state, o).name)
    .filter((n) => n !== 'Plains')
    .sort();
const idOf = (g: Game, name: string, seat = 0) => {
  const [obj] = g.find({ name, zone: 'battlefield', seat });
  if (obj === undefined) throw new Error(`no ${name}`);
  return obj.id;
};

describe('the primitive is known, supported and validated', () => {
  test('feature and card validation', () => {
    expect(isKnownFeature('effect:chooseParty' as never)).toBe(true);
    expect(isFeatureSupported('effect:chooseParty' as never)).toBe(true);
    expect(validateCard(TOGETHER)).toEqual([]);
  });
});

describe('CR 700.8d, 101.4: two seats', () => {
  const board = {
    0: [CLERIC.name, CLERIC2.name, ROGUE.name, WARRIOR.name, WIZARD.name, BEAR.name],
    1: [CLERIC.name, BEAR.name],
  };

  test('the active player chooses first, then the other; nothing is sacrificed until both have chosen', () => {
    const g = start(2, 0, board);
    const d = party(g);
    expect(d.seat).toBe(0);
    expect(d.slots.map((s) => s.type)).toEqual(['Cleric', 'Rogue', 'Warrior', 'Wizard']);
    expect(d.slots.map((s) => s.legal.length)).toEqual([2, 1, 1, 1]);
    g.act(0).chooseParty({
      Cleric: { name: CLERIC.name, seat: 0 },
      Rogue: ROGUE.name,
      Warrior: WARRIOR.name,
      Wizard: WIZARD.name,
    });
    // Seat 0 has chosen, seat 1 not yet: every creature is still on the battlefield.
    expect(party(g).seat).toBe(1);
    expect(onBattlefield(g, 0)).toHaveLength(6);
    expect(onBattlefield(g, 1)).toHaveLength(2);
    g.act(1).chooseParty({ Cleric: CLERIC.name });
    expect(onBattlefield(g, 0)).toEqual(
      [CLERIC.name, ROGUE.name, WARRIOR.name, WIZARD.name].sort(),
    );
    // The Bear of the second player is not a party type: it is sacrificed with every creature left out.
    expect(onBattlefield(g, 1)).toEqual([CLERIC.name]);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('a player may choose fewer than they could, or nobody: the rest are sacrificed', () => {
    const g = start(2, 0, board);
    g.act(0).chooseParty({ Rogue: ROGUE.name });
    g.act(1).chooseParty({});
    expect(onBattlefield(g, 0)).toEqual([ROGUE.name]);
    expect(onBattlefield(g, 1)).toEqual([]);
  });

  test('a creature not of the type of its slot, a creature twice, or a creature of another player is refused', () => {
    const g = start(2, 0, board);
    const answer = (members: { type: PartyType; object: ReturnType<typeof idOf> }[]) =>
      g.act(0).try.action({ kind: 'chooseParty', party: members });
    expect(answer([{ type: 'Warrior', object: idOf(g, ROGUE.name) }]).ok).toBe(false);
    expect(
      answer([
        { type: 'Cleric', object: idOf(g, CLERIC.name) },
        { type: 'Rogue', object: idOf(g, CLERIC.name) },
      ]).ok,
    ).toBe(false);
    expect(
      answer([
        { type: 'Cleric', object: idOf(g, CLERIC.name) },
        { type: 'Cleric', object: idOf(g, CLERIC2.name) },
      ]).ok,
    ).toBe(false);
    expect(answer([{ type: 'Cleric', object: idOf(g, CLERIC.name, 1) }]).ok).toBe(false);
    expect(party(g).seat).toBe(0);
  });

  test('a player who controls no creature has nothing to choose; a player with only non-party creatures sacrifices them all', () => {
    // Neither player controls a party creature: no decision at all, the Bear is sacrificed.
    const g = start(2, 0, { 0: [], 1: [BEAR.name] });
    expect(g.state.pending?.kind).toBe('priority');
    expect(onBattlefield(g, 1)).toEqual([]);
    const h = start(2, 0, { 0: [CLERIC.name, BEAR.name], 1: [] });
    expect(party(h).seat).toBe(0);
    h.act(0).chooseParty({ Cleric: CLERIC.name });
    expect(h.state.pending?.kind).toBe('priority');
    expect(onBattlefield(h, 0)).toEqual([CLERIC.name]);
  });
});

describe('CR 700.8b, 700.8d: creatures with several types', () => {
  test('a Cleric Wizard fills the Cleric slot or the Wizard slot, never both', () => {
    const g = start(2, 0, { 0: [CLERIC_WIZARD.name, CLERIC.name] });
    expect(party(g).slots.map((s) => s.legal.length)).toEqual([2, 0, 0, 1]);
    const wizard = idOf(g, CLERIC_WIZARD.name);
    const both = g.act(0).try.action({
      kind: 'chooseParty',
      party: [
        { type: 'Cleric', object: wizard },
        { type: 'Wizard', object: wizard },
      ],
    });
    expect(both.ok).toBe(false);
    // Cleric Wizard as the Wizard, the plain Cleric as the Cleric: both stay.
    g.act(0).chooseParty({ Cleric: CLERIC.name, Wizard: CLERIC_WIZARD.name });
    expect(onBattlefield(g, 0)).toEqual([CLERIC.name, CLERIC_WIZARD.name].sort());
  });

  test('the listing of answers holds the fullest parties first and every one is accepted', () => {
    const g = start(2, 0, { 0: [CLERIC_WIZARD.name, CLERIC.name] });
    const parties = enumerateParties(party(g).slots, 50);
    expect(parties[0]).toHaveLength(2);
    expect(parties.at(-1)).toEqual([]);
    // One full party only: the Cleric Wizard as the Wizard and the Cleric as the Cleric.
    expect(parties.filter((p) => p.length === 2)).toHaveLength(1);
    const listed = g.legalActions(0).filter((a) => a.kind === 'chooseParty');
    expect(listed).toHaveLength(parties.length);
    expect(listed.length).toBeGreaterThan(3);
  });

  test('a changeling is every creature type: it can fill any one slot', () => {
    const g = start(2, 0, { 0: [CHANGELING.name] });
    expect(party(g).slots.map((s) => s.legal.length)).toEqual([1, 1, 1, 1]);
    g.act(0).chooseParty({ Rogue: CHANGELING.name });
    expect(onBattlefield(g, 0)).toEqual([CHANGELING.name]);
  });
});

describe('CR 101.4, 701.21a, 603.10a: sacrifice triggers', () => {
  const board = {
    0: [
      [MARTYR.name, 'martyr'],
      [CLERIC.name, 'cleric'],
    ] as readonly Entry[],
  };

  test('a creature left out dies and its trigger fires', () => {
    const g = start(2, 0, board);
    g.act(0).chooseParty({ Cleric: 'cleric' });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(23);
    expect(onBattlefield(g, 0)).toEqual([CLERIC.name]);
  });

  test('a creature in the party does not die', () => {
    const g = start(2, 0, board);
    g.act(0).chooseParty({ Cleric: 'martyr' });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
    expect(onBattlefield(g, 0)).toEqual([MARTYR.name]);
  });
});

describe('CR 101.4: APNAP order at three and four seats', () => {
  const board = (seats: number): Record<number, readonly Entry[]> =>
    Object.fromEntries(
      Array.from({ length: seats }, (_, s) => [s, [CLERIC.name, ROGUE.name, BEAR.name]]),
    );

  test('three seats, active seat 1: seats 1, 2, 0 in turn order, and all sacrifice together at the end', () => {
    const g = start(3, 1, board(3));
    const order: number[] = [];
    for (let n = 0; n < 3; n += 1) {
      const d = party(g);
      order.push(d.seat);
      // Nothing has left the battlefield before the last answer.
      for (const seat of [0, 1, 2]) expect(onBattlefield(g, seat)).toHaveLength(3);
      g.act(d.seat).chooseParty({ Cleric: { name: CLERIC.name, seat: d.seat } });
    }
    expect(order).toEqual([1, 2, 0]);
    for (const seat of [0, 1, 2]) expect(onBattlefield(g, seat)).toEqual([CLERIC.name]);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('four seats, active seat 2: seats 2, 3, 0, 1; a seat with no creatures is skipped without a question', () => {
    const g = start(4, 2, { ...board(4), 3: [] });
    const order: number[] = [];
    while (g.state.pending?.kind === 'chooseParty') {
      const d = party(g);
      order.push(d.seat);
      g.act(d.seat).chooseParty({});
    }
    expect(order).toEqual([2, 0, 1]);
    for (const seat of [0, 1, 2, 3]) expect(onBattlefield(g, seat)).toEqual([]);
  });
});

describe('hidden information', () => {
  test('only the player who chooses sees the decision, and it names only creatures on the battlefield', () => {
    const g = start(3, 0, { 0: [CLERIC.name], 1: [ROGUE.name], 2: [WARRIOR.name] });
    const d = party(g);
    expect(getView(g.state, d.seat).pending?.kind).toBe('chooseParty');
    for (const seat of [1, 2]) expect(getView(g.state, seat).pending).toBeNull();
    for (const slot of d.slots)
      for (const id of slot.legal) expect(g.state.objects[id]?.zone).toBe('battlefield');
    // The view of a seat that waits does not show the decision, and the answer of the chooser is a plain list of battlefield objects.
    expect(JSON.stringify(getView(g.state, 1).pending)).toBe('null');
  });
});
