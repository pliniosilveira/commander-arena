// The Prismari deck (issue 87), group 1 (D-624 to D-631): the REAL Oracle text of Brudiclad, Telchor Engineer, Determined Iteration, Redoubled Stormsinger, Rionya, Fire Dancer, Rite of
// Replication, Twinflame, Muddle, the Ever-Changing, Inspired Skypainter // Maestro's Gift and Dirgur Focusmage // Braingeyser (the corpus's golden.jsonl, taken from the issue) goes through
// the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures (`synthetic-prismari-g1.ts`), which the engine tests and the AI soak play. Pins: CR 701.36
// (populate), CR 603.7c (a delayed ability about the tokens one ability made), CR 707.2 and 111.10 (copies of tokens), CR 508.4 (tapped and attacking), CR 601.2f (strive), CR 702.33a
// (kicker), CR 722.3a (prepared), CR 707.9b (a copy "except it has myriad"), CR 601.2i (the spells cast this turn: Volcanic Torrent counts itself).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const SOLDIER_CALL = 'SYNTHETIC Soldier Call';
const BEAST_CALL = 'SYNTHETIC Beast Call';
const CANTRIP = 'SYNTHETIC Prismari Cantrip';
const GRAND_STUDY = 'SYNTHETIC Prismari Grand Study';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

const brudiclad = real('Brudiclad, Telchor Engineer');
const iteration = real('Determined Iteration');
const stormsinger = real('Redoubled Stormsinger');
const rionya = real('Rionya, Fire Dancer');
const rite = real('Rite of Replication');
const twinflame = real('Twinflame');
const muddle = real('Muddle, the Ever-Changing');
const skypainter = real("Inspired Skypainter // Maestro's Gift");
const dirgur = real('Dirgur Focusmage // Braingeyser');
const torrent = real('Volcanic Torrent');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;
type Builder = ReturnType<typeof scenario>;

const tokens = (g: Game, name: string, seat = 0) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);
const castHand = (g: Game, name: string, options: object = {}) =>
  g.act(0).cast({ name, zone: 'hand', seat: 0, nth: 0 }, { pay: true, ...options });

function build(
  cards: readonly CardDefinition[],
  setup: (b: Builder) => void,
  at: 'precombatMain' | 'upkeep' = 'precombatMain',
) {
  let b = scenario();
  for (const card of cards) b = b.define(card);
  b = b.seat(0).library(...LIBRARY);
  setup(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at(at, { active: 0 })
    .build();
}

describe('every card is valid and has the abilities of its SYNTHETIC sibling', () => {
  test.each([
    ['Brudiclad, Telchor Engineer', brudiclad, 'SYNTHETIC Myr Tinker'],
    ['Determined Iteration', iteration, 'SYNTHETIC Iteration Engine'],
    ['Redoubled Stormsinger', stormsinger, 'SYNTHETIC Storm Singer'],
    ['Rionya, Fire Dancer', rionya, 'SYNTHETIC Flame Dancer'],
    ['Rite of Replication', rite, 'SYNTHETIC Replication Rite'],
    ['Twinflame', twinflame, 'SYNTHETIC Twin Blaze'],
    ['Muddle, the Ever-Changing', muddle, 'SYNTHETIC Mud Morph'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const other = syntheticCard(sibling);
    expect(card.faces[0]?.abilities).toEqual(other.faces[0]?.abilities);
    expect(card.faces[0]?.spell).toEqual(other.faces[0]?.spell);
  });

  test.each([
    ["Inspired Skypainter // Maestro's Gift", skypainter, 'SYNTHETIC Sky Painter // Gift Spell'],
    ['Dirgur Focusmage // Braingeyser', dirgur, 'SYNTHETIC Focus Mage // Brain Surge'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.layout).toBe('prepare');
    const other = syntheticCard(sibling);
    for (const i of [0, 1]) {
      expect(card.faces[i]?.abilities, `face ${i}`).toEqual(other.faces[i]?.abilities);
      expect(card.faces[i]?.spell, `face ${i}`).toEqual(other.faces[i]?.spell);
    }
  });

  test('Volcanic Torrent (a card the same words unlock): the count of spells cast this turn', () => {
    expect(validateCard(torrent)).toEqual([]);
  });
});

describe('Determined Iteration', () => {
  test('populates at the beginning of combat: a copy with haste, sacrificed at the end step', () => {
    const g = build([iteration], (b) =>
      b
        .battlefield(iteration.name)
        .battlefield('Plains')
        .battlefield('Forest', { count: 3 })
        .hand(BEAST_CALL),
    );
    castHand(g, BEAST_CALL);
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 'Beast')).toHaveLength(2);
    g.expect.derived(tokens(g, 'Beast')[1]?.id as string, { keywords: ['haste'] });
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, 'Beast')).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('Rite of Replication', () => {
  test('kicked: five copies; not kicked: one', () => {
    const kicked = build([rite], (b) =>
      b.hand(rite.name).battlefield('Island', { count: 9 }).battlefield(BEARS, { label: 'bears' }),
    );
    kicked.act(0).cast(rite.name, { kicked: true, pay: true, targets: ['bears'] });
    kicked.passAll();
    expect(tokens(kicked, BEARS)).toHaveLength(5);
    const plain = build([rite], (b) =>
      b.hand(rite.name).battlefield('Island', { count: 4 }).battlefield(BEARS, { label: 'bears' }),
    );
    plain.act(0).cast(rite.name, { pay: true, targets: ['bears'] });
    plain.passAll();
    expect(tokens(plain, BEARS)).toHaveLength(1);
  });
});

describe('Twinflame', () => {
  test('strive: two targets cost {1}{R} and {2}{R}; two copies with haste, exiled at the end step', () => {
    const g = build([twinflame], (b) =>
      b
        .hand(twinflame.name)
        .battlefield('Mountain', { count: 4 })
        .battlefield('Plains', { count: 3 })
        .battlefield(BEARS, { label: 'a' })
        .battlefield(ANGEL, { label: 'b' }),
    );
    g.act(0).cast(twinflame.name, { pay: true, targets: ['a', 'b'] });
    const untapped = [...g.find({ name: 'Mountain' }), ...g.find({ name: 'Plains' })].filter(
      (o) => o.zone === 'battlefield' && !o.tapped,
    );
    expect(untapped).toHaveLength(2);
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
    expect(tokens(g, ANGEL)).toHaveLength(1);
    g.expect.derived(tokens(g, ANGEL)[0]?.id as string, {
      keywords: ['flying', 'vigilance', 'haste'],
    });
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(0);
    expect(tokens(g, ANGEL)).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Rionya, Fire Dancer', () => {
  test('X is one plus the instants and sorceries cast this turn: two cast, three copies; exiled at the end step', () => {
    const g = build([rionya], (b) =>
      b
        .battlefield(rionya.name)
        .battlefield(BEARS, { label: 'bears' })
        .battlefield('Island', { count: 4 })
        .hand(CANTRIP, CANTRIP),
    );
    castHand(g, CANTRIP);
    g.passAll();
    castHand(g, CANTRIP);
    g.passAll();
    g.advanceTo('beginningOfCombat');
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets('bears');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(3);
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(0);
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(1);
  });
});

describe('Redoubled Stormsinger', () => {
  test('attacks: a tapped and attacking copy of each token that entered this turn, sacrificed at the end step', () => {
    const g = build([stormsinger], (b) =>
      b.battlefield(stormsinger.name, { label: 'singer' }).battlefield('Plains').hand(SOLDIER_CALL),
    );
    castHand(g, SOLDIER_CALL);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack('singer');
    g.passAll();
    const copies = tokens(g, 'Soldier');
    expect(copies).toHaveLength(2);
    const attacking = g.state.combat?.attackers.map((a) => a.object) ?? [];
    expect(copies.filter((o) => attacking.includes(o.id) && o.tapped)).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, 'Soldier')).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('Brudiclad, Telchor Engineer', () => {
  test('makes a Myr with haste at the beginning of combat; the token chosen is what the others become', () => {
    const g = build([brudiclad], (b) =>
      b
        .battlefield(brudiclad.name)
        .battlefield('Plains')
        .battlefield('Forest', { count: 3 })
        .hand(SOLDIER_CALL, BEAST_CALL),
    );
    castHand(g, SOLDIER_CALL);
    g.passAll();
    castHand(g, BEAST_CALL);
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.derived(tokens(g, 'Phyrexian Myr')[0]?.id as string, { keywords: ['haste'] });
    g.act(0).choosePermanents(tokens(g, 'Beast')[0]?.id as string);
    g.passAll();
    expect(tokens(g, 'Beast')).toHaveLength(3);
    expect(tokens(g, 'Soldier')).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Muddle, the Ever-Changing', () => {
  test('casting an instant: it becomes a copy of the creature with myriad, and a legendary creature is not a target', () => {
    const g = build([muddle], (b) =>
      b
        .battlefield(muddle.name, { label: 'muddle' })
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield('SYNTHETIC Prismari Legend', { label: 'legend' })
        .battlefield('Island', { count: 3 })
        .hand(CANTRIP),
    );
    castHand(g, CANTRIP);
    const pending = g.state.pending;
    expect(
      pending?.kind === 'targets' &&
        pending.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : '')),
    ).not.toContain(g.id('legend'));
    g.act(0).chooseTargets('angel');
    g.passAll();
    g.expect.pt('muddle', 4, 4);
    g.expect.derived('muddle', { keywords: ['flying', 'vigilance', 'myriad'] });
  });
});

describe("Inspired Skypainter // Maestro's Gift", () => {
  test('enters prepared; Maestro’s Gift copies a creature with haste until end of turn', () => {
    const g = build([skypainter], (b) =>
      b
        .hand(skypainter.name)
        .battlefield('Island', { count: 4 })
        .battlefield('Mountain', { count: 4 })
        .battlefield(BEARS, { label: 'bears' }),
    );
    g.act(0).cast('Inspired Skypainter', { pay: true });
    g.passAll();
    const prepared = Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
    expect(prepared?.zone).toBe('exile');
    g.act(0).cast(prepared?.id as string, { pay: true, targets: ['bears'] });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
    g.expect.derived(tokens(g, BEARS)[0]?.id as string, { keywords: ['haste'] });
  });
});

describe('Dirgur Focusmage // Braingeyser', () => {
  test('a sorcery of mana value 5 cast from the hand prepares it; Braingeyser draws X cards', () => {
    const g = build([dirgur], (b) =>
      b.battlefield(dirgur.name).battlefield('Island', { count: 9 }).hand(GRAND_STUDY, CANTRIP),
    );
    castHand(g, CANTRIP);
    g.passAll();
    expect(Object.values(g.state.objects).some((o) => o.prepareOf !== undefined)).toBe(false);
    castHand(g, GRAND_STUDY);
    g.passAll();
    const prepared = Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
    expect(prepared?.zone).toBe('exile');
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(prepared?.id as string, { pay: true, x: 2, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.handSize(0, before + 2);
  });
});

describe("Volcanic Torrent: X is the number of spells you've cast this turn (itself included)", () => {
  test('the first spell of the turn deals 1 damage to each creature of the opponent', () => {
    const g = build([torrent], (b) => {
      b.hand(torrent.name).battlefield('Mountain', { count: 5 });
      b.seat(1).battlefield(ANGEL, { label: 'angel' });
    });
    g.act(0).cast(torrent.name, { pay: true });
    g.passAll();
    // Cascade exiles Islands only (no nonland card to cast): the damage is the spells cast this turn.
    if (g.state.pending !== null && g.state.pending.kind !== 'priority') {
      // An answer to a cascade question, if the engine asks one.
      g.act(0).decline();
      g.passAll();
    }
    g.expect.damage('angel', 1);
  });
});
