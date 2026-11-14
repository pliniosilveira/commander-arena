// Parsed text is only worth something if the engine runs it as written (stage P6). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: a ward creature countering a spell unless its
// controller pays (CR 702.21a), a Vehicle crewed by a creature (CR 702.122a), token copies from a
// spell, an ability and a trigger (CR 707.2), the additive type change (CR 205.1b) and a card
// returned from an opponent's graveyard under the caster's or its owner's control (CR 110.2a).
// Every card name starts with "SYNTHETIC"; the Oracle text is template text from the corpus backlog
// (reports/backlog.md) or marked SYNTHETIC where no real line has the shape.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const spell = (name: string, type: 'Instant' | 'Sorcery', text: string, manaCost = '{1}{U}') =>
  parsed(name, type, text, { manaCost, colors: ['U'] });
const creature = (name: string, text: string, manaCost = '{1}{G}', power = '2', toughness = '2') =>
  parsed(name, 'Creature — Bear', text, { manaCost, power, toughness, colors: ['G'] });

const BEARS = 'Grizzly Bears'; // 2/2
const BOLT = 'Lightning Bolt';

describe("Ward through parsed text: counter unless the targeting spell's controller pays (CR 702.21a)", () => {
  const WARD = creature('SYNTHETIC Parsed Ward Bear', 'Ward {2}');
  const BLOOD = creature('SYNTHETIC Parsed Blood Ward Bear', 'Ward—Pay 3 life.');

  const board = (mountains: number) =>
    scenario()
      .define(WARD)
      .define(BLOOD)
      .seat(0)
      .hand(BOLT)
      .battlefield(...Array.from({ length: mountains }, () => 'Mountain'))
      .seat(1)
      .battlefield(WARD.name, BLOOD.name)
      .build();

  test('the parsed keywords are the AST the engine fixtures use', () => {
    expect(WARD.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ]);
    expect(BLOOD.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'payLife', amount: 3 }] } },
    ]);
  });

  test('declining to pay {2} counters the Bolt and the creature is unharmed', () => {
    const g = board(3);
    g.act(0).cast(BOLT, { targets: [WARD.name], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.damage(WARD.name, 0);
    g.expect.zone(WARD.name, 'battlefield', { seat: 1 });
  });

  test('paying {2} lets the Bolt resolve: the creature dies', () => {
    const g = board(3);
    g.act(0).cast(BOLT, { targets: [WARD.name], pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(WARD.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('"Ward—Pay 3 life." takes the life when accepted', () => {
    const g = board(1);
    g.act(0).cast(BOLT, { targets: [BLOOD.name], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.life(0, 37);
    g.passAll();
    g.expect.zone(BLOOD.name, 'graveyard', { seat: 1 });
  });
});

describe('Crew through parsed text: a Vehicle that a creature crews (CR 702.122a, 301.7)', () => {
  const WAGON = parsed(
    'SYNTHETIC Parsed Wagon',
    'Artifact — Vehicle',
    'Crew 2 (Tap any number of untapped creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)',
    { manaCost: '{3}', power: '4', toughness: '4' },
  );

  test('uncrewed it is an artifact with no power or toughness; crewed by a 2-power creature it is a 4/4 artifact creature', () => {
    const g = scenario().define(WAGON).seat(0).battlefield(WAGON.name, BEARS).seat(1).build();
    g.expect.derived(WAGON.name, {
      types: ['artifact'],
      subtypes: ['Vehicle'],
      keywords: ['crew'],
    });
    g.act(0).activate(WAGON.name);
    g.expect.tapped(BEARS);
    g.passAll();
    g.expect.pt(WAGON.name, 4, 4);
    g.expect.derived(WAGON.name, { types: ['artifact', 'creature'], subtypes: ['Vehicle'] });
  });

  test('a creature with too little power cannot crew it', () => {
    const small = creature('SYNTHETIC Parsed Mouse', '', '{G}', '1', '1');
    const g = scenario()
      .define(WAGON)
      .define(small)
      .seat(0)
      .battlefield(WAGON.name, small.name)
      .seat(1)
      .build();
    expect(g.act(0).try.activate(WAGON.name).ok).toBe(false);
  });

  test('at cleanup it is an artifact again', () => {
    const g = scenario().define(WAGON).seat(0).battlefield(WAGON.name, BEARS).seat(1).build();
    g.act(0).activate(WAGON.name);
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(WAGON.name, { types: ['artifact'] });
  });
});

describe('token copies through parsed text (CR 707.2, 111.4)', () => {
  const MIRROR = spell(
    'SYNTHETIC Parsed Mirror',
    'Instant',
    "Create a token that's a copy of target creature.",
  );
  const TWINS = spell(
    'SYNTHETIC Parsed Twins',
    'Sorcery',
    'Create two tokens that are copies of target creature.',
  );

  test("a copy of the opponent's creature enters under your control with its name", () => {
    const g = scenario()
      .define(MIRROR)
      .seat(0)
      .hand(MIRROR.name)
      .battlefield('Island', 'Island')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(MIRROR.name, { targets: [BEARS], pay: true });
    g.passAll();
    const bears = g.find({ name: BEARS, zone: 'battlefield' });
    expect(bears).toHaveLength(2);
    expect(bears.filter((o) => o.controller === 0)).toHaveLength(1);
    expect(bears.filter((o) => o.controller === 1)).toHaveLength(1);
    g.expect.invariants();
  });

  test('"two tokens that are copies" makes two', () => {
    const g = scenario()
      .define(TWINS)
      .seat(0)
      .hand(TWINS.name)
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(TWINS.name, { targets: [BEARS], pay: true });
    g.passAll();
    expect(
      g.find({ name: BEARS, zone: 'battlefield' }).filter((o) => o.controller === 0),
    ).toHaveLength(2);
  });

  test('{3}: a copy of this creature, from the permanent itself', () => {
    const cloner = creature('SYNTHETIC Parsed Cloner', "{3}: Create a token that's a copy of ~.");
    const g = scenario()
      .define(cloner)
      .seat(0)
      .battlefield(cloner.name, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).activate(cloner.name, { pay: true });
    g.passAll();
    expect(g.find({ name: cloner.name, zone: 'battlefield' })).toHaveLength(2);
  });

  test('"Whenever another creature you control dies, create a token that\'s a copy of it."', () => {
    // "enters" would copy the token itself for ever; a death is a one-off event.
    const rite = parsed(
      'SYNTHETIC Parsed Rite',
      'Enchantment',
      "Whenever another creature you control dies, create a token that's a copy of it.",
      { manaCost: '{1}{G}', colors: ['G'] },
    );
    const g = scenario()
      .define(rite)
      .seat(0)
      .hand(BOLT)
      .battlefield(rite.name, BEARS, 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    const bears = g.find({ name: BEARS, zone: 'battlefield' });
    expect(bears).toHaveLength(1);
    expect(bears[0]?.controller).toBe(0);
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
  });
});

describe('the additive type change through parsed text (CR 205.1b)', () => {
  test('"becomes an artifact creature in addition to its other types": a Bear that is also an artifact, until cleanup', () => {
    const awaken = spell(
      'SYNTHETIC Parsed Awaken',
      'Instant',
      'Target creature becomes an artifact creature in addition to its other types until end of turn.',
    );
    const g = scenario()
      .define(awaken)
      .seat(0)
      .hand(awaken.name)
      .battlefield('Island', 'Island')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(awaken.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { types: ['artifact', 'creature'], subtypes: ['Bear'] });
    g.expect.pt(BEARS, 2, 2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(BEARS, { types: ['creature'], subtypes: ['Bear'] });
  });
});

describe('a return from a graveyard under a stated control (CR 110.2a)', () => {
  const TAKE = spell(
    'SYNTHETIC Parsed Reanimate',
    'Sorcery',
    'Return target creature card from a graveyard to the battlefield under your control.',
    '{B}',
  );
  const GIVE = spell(
    'SYNTHETIC Parsed Return',
    'Sorcery',
    "Return target creature card from a graveyard to the battlefield under its owner's control.",
    '{B}',
  );
  const BARE = spell(
    'SYNTHETIC Parsed Bare Return',
    'Sorcery',
    'Return target creature card from a graveyard to the battlefield.',
    '{B}',
  );

  const run = (card: CardDefinition) => {
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .pool('B')
      .seat(1)
      .graveyard(BEARS)
      .build();
    g.act(0).cast(card.name, { targets: [BEARS], pay: true });
    g.passAll();
    return g.object(BEARS);
  };

  test('under your control, and the bare form, give the caster the card the opponent owns', () => {
    for (const card of [TAKE, BARE]) {
      const bears = run(card);
      expect([bears.owner, bears.controller], card.name).toEqual([1, 0]);
    }
  });

  test("under its owner's control gives it back to its owner", () => {
    const bears = run(GIVE);
    expect([bears.owner, bears.controller]).toEqual([1, 1]);
  });
});
