// The Sauron deck, amass and excess damage cards: "When ~ enters and whenever an Army you control attacks, amass Orcs 1." (March from the Black Gate), "Amass Orcs 3, then target
// player mills X cards, where X is the amassed Army's power." (Surrounded by Orcs) and "Whenever a creature an opponent controls is dealt excess noncombat damage, amass Orcs X,
// where X is that excess damage." (Fall of Cair Andros).
// Pins: CR 701.47a and 701.47b (amass: the Army chosen is the amassed Army, counters or not), CR 608.2h (the Army's power is read as the effect resolves), CR 603.2c and 603.6a (one
// ability that two events cause), CR 508.1 and 508.2a (the attack trigger), CR 120.10 (excess damage: more than lethal damage as it was before the damage, marked damage counted),
// CR 120.2b (noncombat damage), CR 603.2 (a trigger for each source of damage), CR 701.17a (mill), CR 102.2 (every opponent of the controller, in a game of three seats).
// The cards are SYNTHETIC, defined in this file: the AST is what the Oracle text lowers to (`packages/cards/test/convert-sauron-amass.test.ts` checks that the parser writes it).
import { describe, expect, test } from 'vitest';
import { getView, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MARCH = 'SYNTHETIC March Gate';
const SURROUNDED = 'SYNTHETIC Surrounded Orcs';
const SURROUNDED_ZERO = 'SYNTHETIC Surrounded Zero';
const ANDROS = 'SYNTHETIC Fall Andros';
const ORC_ARMY = 'SYNTHETIC Orc Army Veteran'; // 2/2 Orc Army creature card (src/cards/fixtures/synthetic-hashaton-group-4.ts)
const SOLDIER_ARMY = 'SYNTHETIC Soldier Army Recruit'; // 1/1 Soldier Army creature card
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const YARGLE = 'Yargle, Glutton of Urborg'; // 9/3

const amassOrc = (count: number): { kind: 'amass'; subtype: 'Orc'; count: number } => ({
  kind: 'amass',
  subtype: 'Orc',
  count,
});

const march = singleFaceCard({
  name: MARCH,
  manaCost: ['1', 'B'],
  types: ['enchantment'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'When this enchantment enters and whenever an Army you control attacks, amass Orcs 1.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: amassOrc(1),
    },
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { subtypes: ['Army'], controller: 'you' } },
      effect: amassOrc(1),
    },
  ],
});

const surrounded = (name: string, count: number) =>
  singleFaceCard({
    name,
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: `Amass Orcs ${count}, then target player mills X cards, where X is the amassed Army's power.`,
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        kind: 'sequence',
        effects: [
          amassOrc(count),
          {
            kind: 'mill',
            player: { kind: 'target', id: 't1' },
            count: { kind: 'powerOf', of: { kind: 'moved' } },
          },
        ],
      },
    },
  });

const andros = singleFaceCard({
  name: ANDROS,
  manaCost: ['2', 'R'],
  types: ['enchantment'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText:
    'Whenever a creature an opponent controls is dealt excess noncombat damage, amass Orcs X, where X is that excess damage.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'dealtDamage',
        what: { types: ['creature'], controller: 'opponent' },
        noncombat: true,
        excess: true,
      },
      effect: { kind: 'amass', subtype: 'Orc', count: { kind: 'triggerDamage' } },
    },
  ],
});

const cards = [march, surrounded(SURROUNDED, 3), surrounded(SURROUNDED_ZERO, 0), andros];
const LIBRARY = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island'];

const armies = (g: { readonly state: Parameters<typeof getView>[0] }, seat: 0 | 1 | 2 = 0) =>
  getView(g.state, seat).battlefield.filter(
    (o) => o.controller === seat && o.subtypes.includes('Army'),
  );

describe('the cards are valid', () => {
  test.each(cards.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('a dealtDamage trigger cannot be both combat and noncombat', () => {
    const bad = singleFaceCard({
      name: 'SYNTHETIC Bad Damage Trigger',
      manaCost: ['R'],
      types: ['enchantment'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: '',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dealtDamage', what: { kind: 'this' }, combat: true, noncombat: true },
          effect: amassOrc(1),
        },
      ],
    });
    expect(JSON.stringify(validateCard(bad))).toContain('noncombat does not go with combat');
  });
});

describe('March from the Black Gate: one ability that two events cause (CR 603.2c)', () => {
  const board = (seat0: readonly string[], seat1: readonly string[] = []) =>
    scenario()
      .define(march)
      .seat(0)
      .library(...LIBRARY)
      .hand(MARCH)
      .battlefield('Swamp', 'Swamp', ...seat0)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...seat1)
      .build();

  test('it enters: with no Army, a 0/0 Orc Army token gets a +1/+1 counter', () => {
    const g = board([]);
    g.act(0).cast(MARCH, { pay: true });
    g.passAll();
    const [army, ...rest] = armies(g);
    expect(rest).toEqual([]);
    expect(army).toMatchObject({ name: 'Orc Army', counters: { '+1/+1': 1 } });
    expect(army?.subtypes).toEqual(expect.arrayContaining(['Orc', 'Army']));
    g.expect.invariants();
  });

  test('it enters with an Army already there: that Army gets the counter, no token is made', () => {
    const g = board([ORC_ARMY]);
    g.act(0).cast(MARCH, { pay: true });
    g.passAll();
    const [army, ...rest] = armies(g);
    expect(rest).toEqual([]);
    expect(army).toMatchObject({ name: ORC_ARMY, counters: { '+1/+1': 1 } });
  });
});

describe('March from the Black Gate on the battlefield: the attack trigger', () => {
  const play = (seat0: readonly string[], seat1: readonly string[] = []) => {
    const g = scenario()
      .define(march)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MARCH, ...seat0)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...seat1)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('an Army you control attacks: it gets a +1/+1 counter (the Army chosen is the only one)', () => {
    const g = play([ORC_ARMY]);
    g.act(0).attack([ORC_ARMY]);
    g.expect.stack([`${MARCH} (ability)`]);
    g.passAll();
    const [army] = armies(g);
    expect(army).toMatchObject({ name: ORC_ARMY, counters: { '+1/+1': 1 } });
    expect(army?.power).toBe(3);
  });

  test('a creature that is not an Army attacks: nothing triggers', () => {
    const g = play([BEARS]);
    g.act(0).attack([BEARS]);
    g.expect.stack([]);
    expect(armies(g)).toHaveLength(0);
  });

  test('an Army an opponent controls attacking is not "an Army you control"', () => {
    const g = scenario()
      .define(march)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MARCH)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ORC_ARMY)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([ORC_ARMY]);
    g.expect.stack([]);
  });

  test('two Armies attack: it triggers once for each, and each amass chooses an Army', () => {
    const g = play([ORC_ARMY, SOLDIER_ARMY]);
    g.act(0).attack([ORC_ARMY, SOLDIER_ARMY]);
    g.expect.stack([`${MARCH} (ability)`, `${MARCH} (ability)`]);
  });
});

describe('Surrounded by Orcs: the amassed Army is the Army the amass chose (CR 701.47a, 701.47b)', () => {
  const board = (name: string, seat0: readonly string[], library: number) =>
    scenario({ seats: 3 })
      .define(surrounded(SURROUNDED, 3))
      .define(surrounded(SURROUNDED_ZERO, 0))
      .seat(0)
      .library(...LIBRARY)
      .hand(name)
      .battlefield('Island', 'Island', 'Island', 'Island', ...seat0)
      .seat(1)
      .library('Island', { count: library })
      .seat(2)
      .library('Island', { count: library })
      .at('precombatMain', { active: 0 })
      .build();

  test('with no Army: a 3/3 Orc Army token is created and the target player mills its power', () => {
    const g = board(SURROUNDED, [], 10);
    g.act(0).cast(SURROUNDED, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const [army] = armies(g);
    expect(army).toMatchObject({ name: 'Orc Army', counters: { '+1/+1': 3 }, power: 3 });
    expect(g.state.seats[1]?.graveyard).toHaveLength(3);
    expect(g.state.seats[1]?.library).toHaveLength(7);
    expect(g.state.seats[2]?.graveyard).toHaveLength(0);
    g.expect.invariants();
  });

  test('with an Army of power 2: it gets three counters, and its power now (5) is how many cards are milled', () => {
    const g = board(SURROUNDED, [ORC_ARMY], 10);
    g.act(0).cast(SURROUNDED, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    const [army] = armies(g);
    expect(army).toMatchObject({ name: ORC_ARMY, power: 5 });
    expect(g.state.seats[2]?.graveyard).toHaveLength(5);
    expect(g.state.seats[1]?.graveyard).toHaveLength(0);
  });

  test('with two Armies: the controller chooses, and the mill is the power of the chosen one', () => {
    const g = board(SURROUNDED, [ORC_ARMY, SOLDIER_ARMY], 10);
    g.act(0).cast(SURROUNDED, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(SOLDIER_ARMY);
    // The 1/1 Soldier Army got three counters and became an Orc: power 4.
    expect(g.state.seats[1]?.graveyard).toHaveLength(4);
    const soldier = armies(g).find((o) => o.name === SOLDIER_ARMY);
    expect(soldier?.subtypes).toContain('Orc');
  });

  test('the controller may target themselves', () => {
    const g = board(SURROUNDED, [], 10);
    g.act(0).cast(SURROUNDED, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    // Seat 0 had 8 cards in the library: the three milled are the Army's power (the spell itself is in the graveyard as well).
    expect(g.state.seats[0]?.library).toHaveLength(5);
  });

  test('"even if none were placed": amass 0 still names the Army, whose power now is the number milled', () => {
    const g = board(SURROUNDED_ZERO, [ORC_ARMY], 10);
    g.act(0).cast(SURROUNDED_ZERO, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const [army] = armies(g);
    expect(army).toMatchObject({ name: ORC_ARMY, power: 2 });
    expect(g.state.seats[1]?.graveyard).toHaveLength(2);
  });

  test('a library with fewer cards than the power: it mills what it has', () => {
    const g = board(SURROUNDED, [], 2);
    g.act(0).cast(SURROUNDED, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.seats[1]?.graveyard).toHaveLength(2);
    expect(g.state.seats[1]?.library).toHaveLength(0);
  });
});

describe('Fall of Cair Andros: "is dealt excess noncombat damage" (CR 120.10, 120.2b)', () => {
  const board = (extra: (b: ReturnType<typeof scenario>) => void = () => {}) => {
    const b = scenario({ seats: 3 })
      .define(andros)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', 'Mountain', ANDROS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears1' })
      .battlefield(SPIDER, { damage: 3, label: 'hurtSpider' })
      .battlefield(SPIDER, { label: 'spider1' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears2' });
    extra(b);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('Lightning Bolt on a 2/2: 1 damage is more than lethal, so Orcs 1: a token with one counter', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['bears1'], pay: true });
    g.passAll();
    // The creature dies to the damage; the trigger looks back at the damage as it was dealt.
    const [army] = armies(g);
    expect(army).toMatchObject({ name: 'Orc Army', counters: { '+1/+1': 1 } });
  });

  test('damage that is exactly lethal is no excess: nothing triggers', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['spider1'], pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'tokenCreated' });
  });

  test('marked damage counts: a 2/4 with 3 damage marked is dealt 3, 1 is lethal and 2 is the excess', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['hurtSpider'], pay: true });
    g.passAll();
    const [army] = armies(g);
    expect(army).toMatchObject({ name: 'Orc Army', counters: { '+1/+1': 2 } });
  });

  test('a creature of the controller is not "a creature an opponent controls"', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'mine' }));
    g.act(0).cast(`${BOLT}[0]`, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'tokenCreated' });
  });

  test('three seats: a creature of either opponent counts (seat 2)', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['bears2'], pay: true });
    g.passAll();
    const [army] = armies(g);
    expect(army).toMatchObject({ name: 'Orc Army', counters: { '+1/+1': 1 } });
  });

  test('a second excess damage chooses the Army already there: counters add up', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['bears1'], pay: true });
    g.passAll();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['bears2'], pay: true });
    g.passAll();
    const [army, ...rest] = armies(g);
    expect(rest).toEqual([]);
    expect(army).toMatchObject({ counters: { '+1/+1': 2 } });
  });

  test('combat damage is no noncombat damage: an excess combat damage does not trigger it', () => {
    const g = scenario()
      .define(andros)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ANDROS, YARGLE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([YARGLE]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: YARGLE }]);
    g.advanceTo('postcombatMain');
    // Yargle dealt 9 damage to a 2/2: 7 was excess, but combat damage does not trigger the ability.
    g.expect.noEvent({ kind: 'tokenCreated' });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });
});
