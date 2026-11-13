// "Creatures you control can't have -1/-1 counters put on them." (D-1152; the Hashaton deck, Darksteel Angel): the static ability `cantHaveCounters`.
// Pins: CR 122.6 (counters put on an object: while it is on the battlefield and as it enters), CR 101.2 (a "can't" effect wins: the counters are not put
// on, the rest of the effect still happens), CR 604.1 (a static ability of the permanent), CR 120.3d / 702.80a (wither: damage as -1/-1 counters),
// CR 701.34a (proliferate), CR 702.79a (persist), CR 606.4 (a loyalty cost), CR 714.3 (lore counters), CR 701.50a (connive), CR 702.24a (cumulative
// upkeep), CR 306.5b (loyalty counters of a planeswalker as it enters), CR 701.71a (empower), CR 613.1f (a permanent that lost its abilities protects
// nobody). Every place that puts a counter on a permanent asks one gate (`rules/counter-prevention.ts`): one test for each, so that a site that skips the
// gate fails one. Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g3.ts and others) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const NO_ROT = 'SYNTHETIC Counter Ward'; // artifact creature: creatures you control can't have -1/-1 counters
const NO_GROWTH = 'SYNTHETIC Growth Ward'; // creatures you control can't have +1/+1 counters
const NO_LOYALTY = 'SYNTHETIC Loyalty Ward'; // planeswalkers you control can't have loyalty counters
const NO_LORE = 'SYNTHETIC Lore Ward'; // Sagas you control can't have lore counters
const NO_AGE = 'SYNTHETIC Age Ward'; // permanents you control can't have age counters
const NO_PAGE = 'SYNTHETIC Page Ward'; // artifacts you control can't have page counters
const LONE = 'SYNTHETIC Lone Ward'; // this creature can't have +1/+1 counters
const AURA = 'SYNTHETIC Ward Aura'; // enchanted creature can't have +1/+1 counters
const ROT = 'SYNTHETIC Rot Boon'; // instant: a -1/-1 counter on target creature
const BOON = 'SYNTHETIC Counter Boon'; // instant: two +1/+1 counters on target creature
const BEARS = 'Grizzly Bears';
const WITHER = 'SYNTHETIC Wither Imp';
const PERSIST = 'SYNTHETIC Persist Bear';
const SPREAD = 'SYNTHETIC Spreading Growth'; // proliferate
const GROWER = 'SYNTHETIC Grower'; // enters with two +1/+1 counters
const CHIEF = 'SYNTHETIC Chief Angel'; // each other Angel you control enters with +1/+1 counters
const ANGEL_CALLER = 'SYNTHETIC Angel Caller'; // creates a 1/1 Angel token
const WALKER = 'SYNTHETIC Loyalty Walker'; // +1: gain 2 life; printed loyalty 4
const MIRROR = 'SYNTHETIC Walker Mirror';
const RITE = 'SYNTHETIC Empower Rite';
const SAGA = 'SYNTHETIC Brief Tale';
const CONNIVER = 'SYNTHETIC Conniver';
const WALL = 'SYNTHETIC Aging Wall'; // cumulative upkeep {1}
const TOME = 'SYNTHETIC Reading Tome'; // {T}, put a page counter: scry 1
const FROG = 'SYNTHETIC Frog Hex'; // target creature loses all abilities until end of turn
const BOLT = 'Lightning Bolt';
const SPIDER = 'Giant Spider'; // 2/4
const BOON_CARD = { name: BOON, zone: 'hand', nth: 0 } as const;
const LIB = Array.from({ length: 10 }, () => 'Plains');

const counters = (g: ScenarioGame, card: string, nth = 0) =>
  g.object({ name: card, zone: 'battlefield', nth }).counters;

describe('the cards are valid', () => {
  test.each([NO_ROT, NO_GROWTH, NO_LOYALTY, NO_LORE, NO_AGE, NO_PAGE, LONE, AURA, MIRROR])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );

  test('the shapes that are refused: no name for the counter, a subject that is not a permanent group', () => {
    const card = syntheticCard(NO_ROT);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withStatic = (rule: Record<string, unknown>) =>
      ({
        ...card,
        faces: [{ ...face, abilities: [{ kind: 'static', static: rule }] }],
      }) as never;
    const subject = { kind: 'filter', filter: { types: ['creature'] } };
    expect(
      validateCard(withStatic({ kind: 'cantHaveCounters', subject, counter: '-1/-1' })),
    ).toEqual([]);
    expect(
      validateCard(withStatic({ kind: 'cantHaveCounters', subject, counter: '' })),
    ).not.toEqual([]);
    expect(
      validateCard(
        withStatic({ kind: 'cantHaveCounters', subject: { kind: 'pair' }, counter: '-1/-1' }),
      ),
    ).not.toEqual([]);
    expect(
      validateCard(
        withStatic({
          kind: 'cantHaveCounters',
          subject: { kind: 'filter', filter: { types: ['creature'], zone: 'graveyard' } },
          counter: '-1/-1',
        }),
      ),
    ).not.toEqual([]);
  });
});

describe('an effect that puts counters (addCounters, CR 122.6, 101.2)', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIB)
      .hand(ROT, BOON)
      .battlefield('Swamp', 'Forest', 'Forest')
      .battlefield(NO_ROT)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'theirs' })
      .build();

  test('a -1/-1 counter is not put on my creature: no counter, no event, the spell still resolves', () => {
    const g = board();
    const mark = g.mark();
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['-1/-1']).toBeUndefined();
    g.expect.pt('mine', 2, 2);
    g.expect.noEvent({ kind: 'counterAdded' }, { since: mark });
    g.expect.zone(ROT, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test("it is put on my opponent's creature (the ability protects the creatures of its controller)", () => {
    const g = board();
    g.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    g.passAll();
    expect(g.object('theirs').counters['-1/-1']).toBe(1);
  });

  test('only the kind it names: +1/+1 counters are put on my creature', () => {
    const g = board();
    g.act(0).cast(BOON, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['+1/+1']).toBe(2);
    g.expect.pt('mine', 4, 4);
  });

  test('the protection comes from the permanent: when it leaves, the counter is put on', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(ROT)
      .battlefield('Swamp')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['-1/-1']).toBe(1);
  });

  test('the creature that has it is protected too, and a counter it already has stays (nothing removes it)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(ROT)
      .battlefield('Swamp')
      .battlefield(NO_ROT)
      .battlefield(BEARS, { label: 'mine', counters: { '-1/-1': 1 } })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['-1/-1']).toBe(1);
  });
});

describe('the other subjects: this permanent and the permanent an Aura is attached to', () => {
  test('"this creature can\'t have +1/+1 counters": it gets none, another creature does', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BOON, BOON)
      .battlefield('Forest', 'Forest')
      .battlefield(LONE, { label: 'lone' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(BOON_CARD, { targets: ['lone'], pay: true });
    g.passAll();
    expect(g.object('lone').counters['+1/+1']).toBeUndefined();
    g.act(0).cast(BOON_CARD, { targets: ['bears'], pay: true });
    g.passAll();
    expect(g.object('bears').counters['+1/+1']).toBe(2);
  });

  test('"enchanted creature can\'t have +1/+1 counters": only the creature the Aura is attached to', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BOON, BOON)
      .battlefield('Forest', 'Forest')
      .battlefield(BEARS, { label: 'enchanted' })
      .battlefield(BEARS, { label: 'free' })
      .battlefield(AURA, { attachedTo: 'enchanted' })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(BOON_CARD, { targets: ['enchanted'], pay: true });
    g.passAll();
    expect(g.object('enchanted').counters['+1/+1']).toBeUndefined();
    g.act(0).cast(BOON_CARD, { targets: ['free'], pay: true });
    g.passAll();
    expect(g.object('free').counters['+1/+1']).toBe(2);
  });
});

describe('wither damage (CR 120.3d, 702.80a, 101.2)', () => {
  const fight = (ward: boolean) => {
    const b = scenario().seat(0).battlefield(WITHER).seat(1);
    const g = (ward ? b.battlefield(NO_ROT) : b)
      .battlefield(SPIDER)
      .library(...LIB)
      .build();
    g.playCombat({
      attack: [WITHER],
      block: [{ blocker: SPIDER, attacker: WITHER }],
      until: 'postcombatMain',
    });
    return g;
  };

  test('without the ability the blocker gets two -1/-1 counters', () => {
    const g = fight(false);
    expect(counters(g, SPIDER)['-1/-1']).toBe(2);
  });

  test('with it the creature gets no counters, and no damage is marked either (wither damage is counters, never marked)', () => {
    const g = fight(true);
    expect(counters(g, SPIDER)['-1/-1']).toBeUndefined();
    expect(g.object({ name: SPIDER, zone: 'battlefield' }).damage).toBe(0);
    g.expect.noEvent({ kind: 'counterAdded', counter: '-1/-1' });
    g.expect.invariants();
  });
});

describe('proliferate (CR 701.34a, 122.6)', () => {
  test('the kind it names is not given, the other kinds are', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(SPREAD)
      .battlefield('Forest')
      .battlefield(NO_ROT)
      .battlefield(BEARS, { label: 'grown', counters: { '+1/+1': 1 } })
      .battlefield(SPIDER, { label: 'rotten', counters: { '-1/-1': 1 } })
      .seat(1)
      .library(...LIB)
      .battlefield(SPIDER, { label: 'theirs', counters: { '-1/-1': 1 } })
      .build();
    g.act(0).cast(SPREAD, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('grown', 'rotten', 'theirs');
    expect(g.object('grown').counters).toEqual({ '+1/+1': 2 });
    expect(g.object('rotten').counters).toEqual({ '-1/-1': 1 });
    expect(g.object('theirs').counters).toEqual({ '-1/-1': 2 });
  });
});

describe('counters a permanent enters with (CR 122.6)', () => {
  test('persist: the creature returns without its -1/-1 counter (so it can persist again)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(NO_ROT)
      .battlefield(PERSIST)
      .seat(1)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', 'Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    const kill = () => {
      g.act(1).cast({ name: BOLT, zone: 'hand', nth: 0 }, { targets: [PERSIST], pay: true });
      g.passAll();
    };
    kill();
    g.expect.zone(PERSIST, 'battlefield', { seat: 0 });
    expect(counters(g, PERSIST)['-1/-1']).toBeUndefined();
    g.expect.noEvent({ kind: 'counterAdded', counter: '-1/-1' });
    // No counter on it, so it persists again.
    kill();
    g.expect.zone(PERSIST, 'battlefield', { seat: 0 });
  });

  test('an "enters with two +1/+1 counters" permanent enters with none', () => {
    const g = scenario()
      .seat(0)
      .hand(GROWER)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(NO_GROWTH)
      .build();
    g.act(0).cast(GROWER, { pay: true });
    g.passAll();
    g.expect.zone(GROWER, 'battlefield', { seat: 0 });
    expect(counters(g, GROWER)['+1/+1']).toBeUndefined();
    g.expect.pt(GROWER, 2, 2);
  });

  test('the same permanent without the ability keeps its counters (the baseline)', () => {
    const g = scenario().seat(0).hand(GROWER).battlefield('Forest', 'Forest', 'Forest').build();
    g.act(0).cast(GROWER, { pay: true });
    g.passAll();
    expect(counters(g, GROWER)['+1/+1']).toBe(2);
  });

  test('a token that another permanent gives a +1/+1 counter as it enters (Chief Angel) enters without it', () => {
    const g = scenario()
      .seat(0)
      .hand(ANGEL_CALLER)
      .battlefield('Plains')
      .battlefield(CHIEF)
      .battlefield(NO_GROWTH)
      .build();
    g.act(0).cast(ANGEL_CALLER, { pay: true });
    g.passAll();
    const token = g.object({ name: 'Angel', zone: 'battlefield' });
    expect(token.counters['+1/+1']).toBeUndefined();
    g.expect.noEvent({ kind: 'counterAdded', counter: '+1/+1' });
  });

  test('the same token without the ability gets the counter (the baseline)', () => {
    const g = scenario()
      .seat(0)
      .hand(ANGEL_CALLER)
      .battlefield('Plains')
      .battlefield(CHIEF)
      .build();
    g.act(0).cast(ANGEL_CALLER, { pay: true });
    g.passAll();
    expect(g.object({ name: 'Angel', zone: 'battlefield' }).counters['+1/+1']).toBe(1);
  });

  test("a planeswalker that can't have loyalty counters enters without them and is put into the graveyard (CR 306.5b, 704.5i)", () => {
    const g = scenario()
      .seat(0)
      .hand(WALKER)
      .battlefield('Island', 'Island', 'Island')
      .battlefield(NO_LOYALTY)
      .build();
    g.act(0).cast(WALKER, { pay: true });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 0 });
  });

  test('a planeswalker that enters as a copy takes no loyalty counters either', () => {
    const g = scenario()
      .seat(0)
      .hand(MIRROR)
      .battlefield('Island', 'Island', 'Island')
      .battlefield(WALKER, { counters: { loyalty: 4 } })
      .battlefield(NO_LOYALTY)
      .build();
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(WALKER);
    // It entered as a planeswalker copy with no loyalty counters: put into the graveyard by the next state-based check.
    g.expect.zone(MIRROR, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'counterAdded', counter: 'loyalty' });
  });
});

describe('a loyalty ability and a cost that puts counters (CR 606.4, 118.3)', () => {
  test("[+1] on a planeswalker that can't have loyalty counters: no counter, the ability is still activated and resolves", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(WALKER, { counters: { loyalty: 4 } })
      .battlefield(NO_LOYALTY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    expect(counters(g, WALKER).loyalty).toBe(4);
    g.expect.life(0, 22);
  });

  test('without the ability the [+1] raises the loyalty (the baseline)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(WALKER, { counters: { loyalty: 4 } })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    expect(counters(g, WALKER).loyalty).toBe(5);
  });

  test('"Put a page counter on this artifact" as a cost: no counter, the cost is paid and the ability resolves', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .battlefield(TOME)
      .battlefield(NO_PAGE)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(TOME, { ability: 0 });
    expect(g.object({ name: TOME, zone: 'battlefield' }).tapped).toBe(true);
    g.passAll();
    expect(counters(g, TOME).page).toBeUndefined();
  });

  test('without the ability the cost puts the page counter (the baseline)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .battlefield(TOME)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(TOME, { ability: 0 });
    expect(counters(g, TOME).page).toBe(1);
  });
});

describe('empower, lore, connive and age counters', () => {
  test('empower Jace: the token gets no loyalty counters (and is gone with the next state-based check)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(RITE)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .battlefield(NO_LOYALTY)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.noObject('Jace', { zone: 'battlefield' });
    g.expect.noEvent({ kind: 'counterAdded', counter: 'loyalty' });
  });

  test("a Saga gets no lore counter in its controller's precombat main phase, so no chapter triggers (CR 714.3b)", () => {
    const g = scenario()
      .seat(0)
      .battlefield(SAGA, { counters: { lore: 1 } })
      .battlefield(NO_LORE)
      .library(...LIB)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.advanceTo('precombatMain');
    expect(counters(g, SAGA).lore).toBe(1);
    g.expect.noEvent({ kind: 'counterAdded', counter: 'lore' });
    g.expect.life(0, 40);
  });

  test('the same Saga without the ability gets its lore counter and chapter II (the baseline)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SAGA, { counters: { lore: 1 } })
      .library(...LIB)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.advanceTo('precombatMain');
    expect(counters(g, SAGA).lore).toBe(2);
  });

  test('connive: the creature that connives gets no +1/+1 counter for the nonland card discarded', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(CONNIVER, BOLT)
      .battlefield('Island', 'Island')
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(NO_GROWTH)
      .build();
    g.act(0).cast(CONNIVER, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: BOLT, zone: 'hand', nth: 0 });
    expect(g.object('mine').counters['+1/+1']).toBeUndefined();
    g.expect.noEvent({ kind: 'counterAdded', counter: '+1/+1' });
  });

  test('connive without the ability: the creature gets the counter (the baseline)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(CONNIVER, BOLT)
      .battlefield('Island', 'Island')
      .battlefield(BEARS, { label: 'mine' })
      .build();
    g.act(0).cast(CONNIVER, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: BOLT, zone: 'hand', nth: 0 });
    expect(g.object('mine').counters['+1/+1']).toBe(1);
  });

  test('cumulative upkeep: no age counter is put on the permanent, so nothing is paid and nothing is sacrificed', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIB)
      .battlefield(WALL, 'Plains', 'Plains')
      .battlefield(NO_AGE)
      .seat(1)
      .library(...LIB)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(counters(g, WALL).age).toBeUndefined();
    g.expect.zone(WALL, 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
  });
});

describe('what is not read', () => {
  test('counters an object already has stay (the ability only stops counters being put on)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(NO_ROT)
      .battlefield(BEARS, { label: 'mine', counters: { '-1/-1': 1 } })
      .build();
    g.expect.invariants();
    expect(g.object('mine').counters['-1/-1']).toBe(1);
    g.expect.pt('mine', 1, 1);
  });

  test('a permanent that lost its abilities protects nobody (CR 613.1f)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(ROT, FROG)
      .battlefield('Swamp', 'Island', 'Island')
      .battlefield(NO_ROT)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(FROG, { targets: [NO_ROT], pay: true });
    g.passAll();
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['-1/-1']).toBe(1);
  });
});
