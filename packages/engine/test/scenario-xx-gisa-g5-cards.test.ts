// Group 5 of the Gisa deck (D-478 to D-482): what the engine runs for a token for each counter on a permanent that was sacrificed to pay the cost, an intervening "if you control no
// creatures with decayed", "When you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield" and "escapes with two +1/+1 counters".
// Pins: CR 113.7a (an ability exists independently of its source; the last known information of a source that left is used), CR 122.1 (counters), CR 603.4 (an intervening "if"
// is checked when the ability would trigger and again as it resolves), CR 702.29c (when you cycle this card), CR 608.2d ("you may"), CR 702.138b-c (escape, escapes with).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-gisa-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const VAULT = 'SYNTHETIC Corpse Vault'; // {1}{B} artifact: {T}: {B}; corpse counters; {1}{B}, {T}, sacrifice: a decayed Zombie for each corpse counter
const RAISER = 'SYNTHETIC Husk Raiser'; // {1}{B} 1/1: end step, if you control no creature with decayed, a decayed 2/2 Zombie token
const CYCLER = 'SYNTHETIC Rot Cycler'; // {4}{B} 4/3 Zombie, cycling {B}{B}, "you may have target player lose life equal to the number of Zombies on the battlefield"
const STRIDER = 'SYNTHETIC Grave Strider'; // {2}{B} 3/2, escape {1}{B} and two others, escapes with two +1/+1 counters
const HUSK = 'SYNTHETIC Decayed Husk';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('the cards are valid', () => {
  test.each([VAULT, RAISER, CYCLER, STRIDER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a token for each counter on the permanent sacrificed to pay the cost (CR 113.7a)', () => {
  const board = (counters: number) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(VAULT, { counters: counters > 0 ? { corpse: counters } : {} })
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  const zombies = (g: ReturnType<typeof board>) => g.find({ name: 'Zombie', zone: 'battlefield' });

  test('three corpse counters: three Zombie tokens with decayed, and the artifact is sacrificed', () => {
    const g = board(3);
    g.act(0).activate(VAULT, { ability: 2, pay: true });
    g.expect.zone(VAULT, 'graveyard', { seat: 0 });
    g.passAll();
    expect(zombies(g)).toHaveLength(3);
    for (const z of zombies(g)) {
      expect(z.token).not.toBeNull();
    }
    const views = g.view(0).battlefield.filter((o) => o.name === 'Zombie');
    expect(views).toHaveLength(3);
    for (const v of views) {
      expect(v.power).toBe(2);
      expect(v.toughness).toBe(2);
      expect(v.colors).toEqual(['B']);
      expect(v.subtypes).toEqual(['Zombie']);
      expect(v.keywords).toContain('decayed');
      expect(v.restrictions).toContain('cantBlock');
    }
    g.expect.invariants();
  });

  test('one counter makes one token; the number is the counters it had when it was sacrificed, not those it has now', () => {
    const g = board(1);
    g.act(0).activate(VAULT, { ability: 2, pay: true });
    // the Vault is in the graveyard (a new object with no counters) before the ability resolves
    expect(g.find({ name: VAULT, zone: 'graveyard' })[0]?.counters).toEqual({});
    g.passAll();
    expect(zombies(g)).toHaveLength(1);
  });

  test('no counter on it: the cost is paid and nothing is created', () => {
    const g = board(0);
    g.act(0).activate(VAULT, { ability: 2, pay: true });
    g.passAll();
    expect(zombies(g)).toHaveLength(0);
    g.expect.zone(VAULT, 'graveyard', { seat: 0 });
  });

  test('a creature of yours that dies puts a corpse counter on it (an opponent’s does not)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield(VAULT)
      .battlefield('Mountain', 'Mountain')
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.counters(VAULT, { corpse: 1 });
    g.act(0).cast(BOLT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.counters(VAULT, { corpse: 1 });
  });
});

describe('"At the beginning of your end step, if you control no creatures with decayed, create a ... Zombie token with decayed" (CR 603.4)', () => {
  const board = (...extra: string[]) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(RAISER, ...extra)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  const tokens = (g: ReturnType<typeof board>) =>
    g.find({ name: 'Zombie', zone: 'battlefield' }).length;

  test('with no creature with decayed: the token is created at the beginning of your end step', () => {
    const g = board();
    g.advanceTo('end');
    g.expect.stack([`${RAISER} (ability)`]);
    g.passAll();
    expect(tokens(g)).toBe(1);
    g.expect.derived({ name: 'Zombie', seat: 0 }, { keywords: ['decayed'] });
  });

  test('with a creature with decayed of yours: it does not trigger (the "if" is not true)', () => {
    const g = board(HUSK);
    g.advanceTo('end');
    g.expect.stack([]);
    expect(tokens(g)).toBe(0);
  });

  test('the next turn, once the Zombie is gone, it makes another: one at a time', () => {
    const g = board();
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g)).toBe(1);
    g.advanceTo('end', { turn: 'next' });
    // the opponent's end step is not its controller's: nothing for the opponent's turn
    expect(tokens(g)).toBe(1);
    g.advanceTo('end', { turn: 'next' });
    g.expect.stack([]);
    expect(tokens(g)).toBe(1);
  });

  test("an opponent's creature with decayed does not count: it is “you control”", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(RAISER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(HUSK)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.expect.stack([`${RAISER} (ability)`]);
    g.passAll();
    expect(tokens(g)).toBe(1);
  });

  test('a creature that has decayed from a counter or a grant counts as one with decayed', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(RAISER)
      .battlefield(BEARS, { counters: { decayed: 1 } })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.expect.stack([]);
  });
});

describe('"When you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield" (CR 702.29c)', () => {
  const board = (extra: string[] = [], opponent: string[] = []) =>
    scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(CYCLER)
      .battlefield('Swamp', 'Swamp')
      .battlefield(...extra)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(...opponent)
      .at('precombatMain', { active: 0 })
      .build();

  test('three Zombies on the battlefield (yours and theirs): the target player loses 3 life', () => {
    const g = board([HUSK, HUSK], [HUSK]);
    g.act(0).activate(CYCLER, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.expect.zone(CYCLER, 'graveyard', { seat: 0 });
    g.passAll();
    g.act(0).accept();
    g.expect.life(1, 17);
    g.expect.life(0, 20);
  });

  test('the cycled card is in the graveyard and is a Zombie, but only the battlefield counts', () => {
    const g = board([], []);
    g.act(0).activate(CYCLER, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).accept();
    g.expect.life(1, 20);
  });

  test('you may decline: nobody loses life', () => {
    const g = board([HUSK, HUSK]);
    g.act(0).activate(CYCLER, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).decline();
    g.expect.life(1, 20);
    g.expect.life(0, 20);
  });

  test('you can aim it at yourself: any player is a target', () => {
    const g = board([HUSK, HUSK]);
    g.act(0).activate(CYCLER, { pay: true });
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    g.act(0).accept();
    g.expect.life(0, 18);
  });

  test('a Zombie token counts like a Zombie card; a non-Zombie does not', () => {
    const g = board([HUSK, BEARS, BEARS]);
    g.act(0).activate(CYCLER, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).accept();
    g.expect.life(1, 19);
  });
});

describe('"~ escapes with two +1/+1 counters on it" (CR 702.138c)', () => {
  const FILLER = ['Grizzly Bears', 'Giant Spider'] as const;
  const board = () => {
    const b = scenario().seat(0).graveyard(STRIDER);
    for (const f of FILLER) b.graveyard(f);
    return b
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('cast from the graveyard for its escape cost it enters with two +1/+1 counters: 5/4', () => {
    const g = board();
    g.act(0).cast(STRIDER, { alternative: 'escape', pay: true });
    g.passAll();
    g.expect.counters(STRIDER, { '+1/+1': 2 });
    g.expect.pt(STRIDER, 5, 4);
    g.expect.stack([]);
  });

  test('cast from the hand it has no counters: 3/2', () => {
    const g = scenario()
      .seat(0)
      .hand(STRIDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(STRIDER, { pay: true });
    g.passAll();
    g.expect.counters(STRIDER, {});
    g.expect.pt(STRIDER, 3, 2);
  });
});
