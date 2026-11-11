// Parsed text is only worth something if the engine runs it as written (stage P16). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction with the X announcement (`chooseX`, D-103): "deals X
// damage", "draw X cards", "gain X life", "put X +1/+1 counters", "create X tokens", "scry X", "enters
// with X +1/+1 counters on it", "pay X life" as an additional cost, and an activated ability with {X}
// or "pay X life" in its cost. Every card name starts with "SYNTHETIC"; the Oracle text is the real
// line of the shape in reports/template-replay.md where the replay has one ("~ enters with X +1/+1
// counters on it.", "~ enters with X charge counters on it.", "As an additional cost to cast ~, pay X
// life.", "{X}{X}, {T}, Sacrifice ~: Create X Treasure tokens.") and SYNTHETIC otherwise. No real
// card's text is claimed; the real cards used as targets (Grizzly Bears, Giant Spider, the basic
// lands) are the engine's own fixtures.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type ParsedExtra, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

type Colors = NonNullable<ParsedExtra['colors']>;

const instant = (name: string, text: string, manaCost: string, colors: Colors = ['R']) =>
  parsed(name, 'Instant', text, { manaCost, colors });
const sorcery = (name: string, text: string, manaCost: string, colors: Colors = ['U']) =>
  parsed(name, 'Sorcery', text, { manaCost, colors });
const artifact = (name: string, text: string, manaCost = '{2}') =>
  parsed(name, 'Artifact', text, { manaCost });

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4

const count = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.find({ name, zone: 'battlefield', seat }).length;

describe('"~ deals X damage to any target" and its variants (CR 107.3a, 120.3)', () => {
  const BURN = instant('SYNTHETIC Parsed X Burn', '~ deals X damage to any target.', '{X}{R}');
  const EACH = instant('SYNTHETIC Parsed X Sweep', '~ deals X damage to each opponent.', '{X}{R}');

  const board = (card: CardDefinition, mountains = 5) =>
    scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Mountain', { count: mountains })
      .seat(1)
      .battlefield(SPIDER)
      .build();

  test('the spell has an {X} and reads X', () => {
    expect(BURN.faces[0]?.manaCost).toEqual(['X', 'R']);
    expect(BURN.faces[0]?.spell?.x).toBe(true);
  });

  test('X = 3 pays {3}{R} and deals 3 damage to the player', () => {
    const g = board(BURN);
    g.act(0).cast(BURN.name, { x: 3, targets: [{ player: 1 }], pay: true });
    expect(g.object({ name: BURN.name, zone: 'stack' }).stack?.x).toBe(3);
    for (let i = 0; i < 4; i += 1) g.expect.tapped(`Mountain[${i}]`);
    g.expect.tapped('Mountain[4]', false);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('X = 4 kills the Spider; X = 3 does not', () => {
    const small = board(BURN);
    small.act(0).cast(BURN.name, { x: 3, targets: [SPIDER], pay: true });
    small.passAll();
    small.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    const big = board(BURN);
    big.act(0).cast(BURN.name, { x: 4, targets: [SPIDER], pay: true });
    big.passAll();
    big.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('X = 0 deals nothing', () => {
    const g = board(BURN);
    g.act(0).cast(BURN.name, { x: 0, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });

  test('"each opponent" takes X', () => {
    const g = board(EACH);
    g.act(0).cast(EACH.name, { x: 2, pay: true });
    g.passAll();
    g.expect.life(1, 38);
  });
});

describe('"Draw X cards.", "You gain X life.", "Target player loses X life."', () => {
  const DRAW = sorcery('SYNTHETIC Parsed X Draw', 'Draw X cards.', '{X}{U}');
  const GAIN = sorcery('SYNTHETIC Parsed X Gain', 'You gain X life.', '{X}{W}', ['W']);
  const DRAIN = sorcery('SYNTHETIC Parsed X Drain', 'Target player loses X life.', '{X}{B}', ['B']);

  test('draws X cards', () => {
    const g = scenario()
      .define(DRAW)
      .seat(0)
      .hand(DRAW.name)
      .battlefield('Island', { count: 4 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(DRAW.name, { x: 3, pay: true });
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, 1);
  });

  test('gains X life', () => {
    const g = scenario()
      .define(GAIN)
      .seat(0)
      .hand(GAIN.name)
      .battlefield('Plains', { count: 5 })
      .seat(1)
      .build();
    g.act(0).cast(GAIN.name, { x: 4, pay: true });
    g.passAll();
    g.expect.life(0, 44);
  });

  test('the target player loses X life', () => {
    const g = scenario()
      .define(DRAIN)
      .seat(0)
      .hand(DRAIN.name)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(DRAIN.name, { x: 3, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('"Put X +1/+1 counters on target creature." and on each creature you control (CR 122.6)', () => {
  const PUMP = sorcery(
    'SYNTHETIC Parsed X Pump',
    'Put X +1/+1 counters on target creature.',
    '{X}{G}',
    ['G'],
  );
  const ALL = sorcery(
    'SYNTHETIC Parsed X Rally',
    'Put X +1/+1 counters on each creature you control.',
    '{X}{G}',
    ['G'],
  );

  test('X counters on the target', () => {
    const g = scenario()
      .define(PUMP)
      .seat(0)
      .hand(PUMP.name)
      .battlefield('Forest', { count: 4 })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(PUMP.name, { x: 3, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 3 });
    g.expect.pt(BEARS, 5, 5);
  });

  test("X counters on each creature, and none on the opponent's", () => {
    const g = scenario()
      .define(ALL)
      .seat(0)
      .hand(ALL.name)
      .battlefield('Forest', { count: 3 })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .battlefield(SPIDER, { label: 'theirs' })
      .build();
    g.act(0).cast(ALL.name, { x: 2, pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 2 });
    g.expect.counters('theirs', {});
  });
});

describe('"Create X Treasure tokens." and "Create X 1/1 white Soldier creature tokens." (CR 111.2)', () => {
  const GOLD = sorcery('SYNTHETIC Parsed X Gold', 'Create X Treasure tokens.', '{X}{R}');
  const ARMY = sorcery(
    'SYNTHETIC Parsed X Army',
    'Create X 1/1 white Soldier creature tokens.',
    '{X}{W}',
    ['W'],
  );

  test('X Treasures', () => {
    const g = scenario()
      .define(GOLD)
      .seat(0)
      .hand(GOLD.name)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(GOLD.name, { x: 3, pay: true });
    g.passAll();
    expect(count(g, 'Treasure')).toBe(3);
  });

  test('X Soldiers, with the printed values', () => {
    const g = scenario()
      .define(ARMY)
      .seat(0)
      .hand(ARMY.name)
      .battlefield('Plains', { count: 5 })
      .seat(1)
      .build();
    g.act(0).cast(ARMY.name, { x: 4, pay: true });
    g.passAll();
    expect(count(g, 'Soldier')).toBe(4);
    g.expect.pt('Soldier[0]', 1, 1);
    g.expect.derived('Soldier[0]', { types: ['creature'], subtypes: ['Soldier'], colors: ['W'] });
  });

  test('X = 0 makes none', () => {
    const g = scenario()
      .define(ARMY)
      .seat(0)
      .hand(ARMY.name)
      .battlefield('Plains', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast(ARMY.name, { x: 0, pay: true });
    g.passAll();
    expect(count(g, 'Soldier')).toBe(0);
  });
});

describe('"Scry X." (CR 701.22a): the number of cards looked at is the X announced', () => {
  const LOOK = sorcery('SYNTHETIC Parsed X Scry', 'Scry X.', '{X}{U}');

  test('X = 3 looks at three cards', () => {
    const g = scenario()
      .define(LOOK)
      .seat(0)
      .hand(LOOK.name)
      .battlefield('Island', { count: 4 })
      .library('Plains', 'Forest', 'Swamp', 'Mountain', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(LOOK.name, { x: 3, pay: true });
    g.passAll();
    const pending = g.state.pending;
    expect(pending).toMatchObject({ kind: 'arrangeCards', purpose: 'scry' });
    expect(pending && 'cards' in pending ? pending.cards.length : -1).toBe(3);
  });
});

describe('"~ enters with X +1/+1 counters on it." (CR 107.3m, 122.6)', () => {
  const HYDRA = parsed(
    'SYNTHETIC Parsed Hydra',
    'Creature — Hydra',
    '~ enters with X +1/+1 counters on it.',
    { manaCost: '{X}{G}', power: '1', toughness: '1', colors: ['G'] },
  );
  const BATTERY = parsed(
    'SYNTHETIC Parsed Battery',
    'Artifact',
    '~ enters with X charge counters on it.',
    { manaCost: '{X}' },
  );

  test('the permanent enters with X counters and is bigger by X', () => {
    const g = scenario()
      .define(HYDRA)
      .seat(0)
      .hand(HYDRA.name)
      .battlefield('Forest', { count: 6 })
      .seat(1)
      .build();
    g.act(0).cast(HYDRA.name, { x: 4, pay: true });
    g.passAll();
    g.expect.zone(HYDRA.name, 'battlefield', { seat: 0 });
    g.expect.counters(HYDRA.name, { '+1/+1': 4 });
    g.expect.pt(HYDRA.name, 5, 5);
    g.expect.invariants();
  });

  test('X = 0 enters with none', () => {
    const g = scenario()
      .define(HYDRA)
      .seat(0)
      .hand(HYDRA.name)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .build();
    g.act(0).cast(HYDRA.name, { x: 0, pay: true });
    g.passAll();
    g.expect.counters(HYDRA.name, {});
    g.expect.pt(HYDRA.name, 1, 1);
  });

  test('X charge counters on a mana-free {X} artifact: X mana, X counters', () => {
    const g = scenario()
      .define(BATTERY)
      .seat(0)
      .hand(BATTERY.name)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .build();
    g.act(0).cast(BATTERY.name, { x: 3, pay: true });
    g.passAll();
    g.expect.counters(BATTERY.name, { charge: 3 });
    for (let i = 0; i < 3; i += 1) g.expect.tapped(`Forest[${i}]`);
  });

  test('a card that is not an {X} card is refused by the engine, not run', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Liar',
        typeLine: 'Creature — Hydra',
        manaCost: '{1}{G}',
        oracleText: 'SYNTHETIC Parsed Liar enters with X +1/+1 counters on it.',
        power: '1',
        toughness: '1',
        colors: ['G'],
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join(' ')).toContain('X');
  });
});

describe('"As an additional cost to cast ~, pay X life." (CR 118.8, 119.4)', () => {
  const BLOOD = sorcery(
    'SYNTHETIC Parsed Blood Burn',
    'As an additional cost to cast ~, pay X life.\n~ deals X damage to any target.',
    '{R}',
    ['R'],
  );

  const game = () =>
    scenario()
      .define(BLOOD)
      .seat(0)
      .life(20)
      .hand(BLOOD.name)
      .battlefield('Mountain')
      .seat(1)
      .build();

  test('the face has the cost, and the spell reads X', () => {
    expect(BLOOD.faces[0]?.additionalCosts).toEqual([{ kind: 'payXLife' }]);
    expect(BLOOD.faces[0]?.spell?.x).toBe(true);
  });

  test('X = 6 pays 6 life with {R} and deals 6 damage', () => {
    const g = game();
    g.act(0).cast(BLOOD.name, { x: 6, targets: [{ player: 1 }], pay: true });
    g.expect.life(0, 14);
    g.passAll();
    g.expect.life(1, 34);
  });

  test('X = 0 pays no life', () => {
    const g = game();
    g.act(0).cast(BLOOD.name, { x: 0, targets: [{ player: 1 }], pay: true });
    g.expect.life(0, 20);
    g.passAll();
    g.expect.life(1, 40);
  });

  test('X is asked, and the life is given back when the cast is cancelled', () => {
    const g = game();
    g.act(0).cast(BLOOD.name);
    g.expect.pending('chooseX', 0);
    g.act(0).chooseX(5).cancel();
    g.expect.life(0, 20);
    g.expect.zone(BLOOD.name, 'hand', { seat: 0 });
  });
});

describe('X in the cost of an activated ability (CR 602.2b, 107.3a, 107.3k)', () => {
  const CANNON = artifact(
    'SYNTHETIC Parsed X Cannon',
    '{X}, {T}: ~ deals X damage to target creature.',
  );
  const WELL = artifact('SYNTHETIC Parsed Double Well', '{X}{X}, {T}: Draw X cards.');
  const LANCE = parsed(
    'SYNTHETIC Parsed Blood Lance',
    'Creature — Bear',
    'Pay X life: ~ deals X damage to target creature.',
    { manaCost: '{R}', power: '1', toughness: '1', colors: ['R'] },
  );
  const MINT = artifact(
    'SYNTHETIC Parsed Mint',
    '{X}{X}, {T}, Sacrifice ~: Create X Treasure tokens.',
  );

  test('"{X}, {T}: ~ deals X damage to target creature." pays X, taps, and deals X', () => {
    const g = scenario()
      .define(CANNON)
      .seat(0)
      .battlefield(CANNON.name, { label: 'cannon' })
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield(SPIDER, { label: 'spider' })
      .build();
    g.act(0).activate('cannon', { x: 4, targets: ['spider'], pay: true });
    expect(g.state.stack.length).toBe(1);
    g.expect.tapped('cannon');
    for (let i = 0; i < 4; i += 1) g.expect.tapped(`Mountain[${i}]`);
    g.expect.tapped('Mountain[4]', false);
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('X = 2 with two Mountains: not enough to kill the Spider', () => {
    const g = scenario()
      .define(CANNON)
      .seat(0)
      .battlefield(CANNON.name, { label: 'cannon' })
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield(SPIDER, { label: 'spider' })
      .build();
    g.act(0).activate('cannon', { x: 2, targets: ['spider'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
  });

  test('two {X} are 2X mana and draw X', () => {
    const g = scenario()
      .define(WELL)
      .seat(0)
      .battlefield(WELL.name, { label: 'well' })
      .battlefield('Island', { count: 6 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate('well', { x: 3, pay: true });
    for (let i = 0; i < 6; i += 1) g.expect.tapped(`Island[${i}]`);
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('"Pay X life: ..." pays X life and deals X damage', () => {
    const g = scenario()
      .define(LANCE)
      .seat(0)
      .life(20)
      .battlefield(LANCE.name, { label: 'lance' })
      .seat(1)
      .battlefield(SPIDER, { label: 'spider' })
      .build();
    g.act(0).activate('lance', { x: 4, targets: ['spider'], pay: true });
    g.expect.life(0, 16);
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('the replay line: {X}{X}, {T}, Sacrifice ~ makes X Treasures', () => {
    const g = scenario()
      .define(MINT)
      .seat(0)
      .battlefield(MINT.name, { label: 'mint' })
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .build();
    g.act(0).activate('mint', { x: 3, pay: true });
    g.expect.zone(MINT.name, 'graveyard', { seat: 0 });
    g.passAll();
    expect(count(g, 'Treasure')).toBe(3);
  });

  test('X is asked after the ability is on the stack', () => {
    const g = scenario()
      .define(CANNON)
      .seat(0)
      .battlefield(CANNON.name, { label: 'cannon' })
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .battlefield(SPIDER, { label: 'spider' })
      .build();
    g.act(0).activate('cannon');
    g.expect.pending('chooseX', 0);
    g.act(0).cancel();
    g.expect.tapped('cannon', false);
  });
});
