// "Target commander", "with a counter on it" and "the greatest mana value among your commanders" (D-145): the filter parts
// `commander` and `hasCounter`, and the amount `commanderManaValue` in a static ability's power and toughness.
// Pins: CR 903.3 (a commander is a card designated as one), CR 122.1 (counters), CR 202.3 (mana value), CR 613.4c (a +N/+N effect of a
// static ability applies in layer 7c and follows the board), CR 613.1f (a mana ability granted in layer 6), CR 115.1 (targets).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-commanders.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const CLINIC = 'SYNTHETIC Commander Clinic';
const BLADE = 'SYNTHETIC Commander Blade';
const LORD = 'SYNTHETIC Counter Lord';
const GROWTH = 'SYNTHETIC Growth Lord';
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const BEARS = 'Grizzly Bears';
const ISAMARU = 'Isamaru, Hound of Konda'; // mana value 1
const YARGLE = 'Yargle, Glutton of Urborg'; // mana value 4

const hasManaAbility = (g: ScenarioGame, label: string): boolean =>
  derive(g.state, g.object(label)).abilities.some((a) => a.kind === 'mana');

/** The ids of the objects the engine offers for the first target slot of the pending targets decision. */
function offered(g: ScenarioGame): string[] {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
  return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
}

describe('the cards are valid', () => {
  test.each([CLINIC, BLADE, LORD, GROWTH])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"target commander" (CR 903.3)', () => {
  const game = () =>
    scenario()
      .seat(0)
      .battlefield(CLINIC)
      .battlefield(ISAMARU, { commander: true, label: 'mine' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(YARGLE, { commander: true, label: 'theirs' })
      .battlefield('Giant Spider', { label: 'spider' })
      .build();

  test('a commander is a legal target', () => {
    const g = game();
    g.act(0).activate(CLINIC, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.derived('mine', { keywords: ['lifelink'] });
  });

  test("an opponent's commander too, whoever controls it", () => {
    const g = game();
    g.act(0).activate(CLINIC, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.derived('theirs', { keywords: ['lifelink'] });
  });

  test('only the commanders are offered: a creature that is not one is not a legal target', () => {
    const g = game();
    g.act(0).activate(CLINIC);
    expect(offered(g).sort()).toEqual([g.id('mine'), g.id('theirs')].sort());
  });

  test('a commander in the command zone is not a battlefield permanent, so nothing can be targeted', () => {
    const g = scenario().seat(0).battlefield(CLINIC).command(ISAMARU, { commander: true }).build();
    expect(g.act(0).try.activate(CLINIC).ok).toBe(false);
  });
});

describe('"the greatest mana value among your commanders" (CR 903.3, 202.3)', () => {
  const game = (mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    mine(scenario().seat(0).battlefield(BLADE, 'Forest').battlefield(BEARS, { label: 'bears' }))
      .seat(1)
      .battlefield(YARGLE, { commander: true })
      .build();

  test('equipped creature gets the commander mana value: +4/+4 for a mana value 4 commander', () => {
    const g = game((b) => b.battlefield(YARGLE, { commander: true, label: 'cmd' }));
    g.act(0).activate(BLADE, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 6, 6);
  });

  test('the commander can be anywhere: here it waits in the command zone', () => {
    const g = game((b) => b.command(ISAMARU, { commander: true }));
    g.act(0).activate(BLADE, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 3, 3);
  });

  test('the greatest of two commanders counts, not the total', () => {
    const g = game((b) =>
      b.command(ISAMARU, { commander: true }).battlefield(YARGLE, { commander: true }),
    );
    g.act(0).activate(BLADE, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 6, 6);
  });

  test("an opponent's commander does not count: only seat 0's own Isamaru, +1/+1", () => {
    const g = game((b) => b.command(ISAMARU, { commander: true }));
    g.act(0).activate(BLADE, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 3, 3);
  });

  test('no commander at all: +0/+0', () => {
    const g = scenario().seat(0).battlefield(BLADE, BEARS, 'Forest').build();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('"with a counter on it" (CR 122.1)', () => {
  test('a creature with any counter has the granted mana ability, one without has not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD)
      .battlefield(BEARS, { label: 'marked', counters: { '+1/+1': 1 } })
      .battlefield(VANILLA, { label: 'plain' })
      .battlefield(VANILLA, { label: 'stunned', counters: { stun: 1 } })
      .build();
    expect(hasManaAbility(g, 'marked')).toBe(true);
    expect(hasManaAbility(g, 'plain')).toBe(false);
    expect(hasManaAbility(g, 'stunned')).toBe(true);
    g.act(0).tapForMana('marked');
    g.expect.pool(0, 'G');
  });

  test('opponent creatures with counters get nothing: "creatures you control"', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD)
      .seat(1)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 1 } })
      .build();
    expect(hasManaAbility(g, 'theirs')).toBe(false);
  });

  test('a named counter kind: only +1/+1 counters give flying, a stun counter does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GROWTH)
      .battlefield(BEARS, { label: 'grown', counters: { '+1/+1': 1 } })
      .battlefield(VANILLA, { label: 'stunned', counters: { stun: 2 } })
      .build();
    g.expect.derived('grown', { keywords: ['flying'] });
    g.expect.derived('stunned', { keywords: [] });
  });

  test('a counter count of 0 is no counter', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GROWTH)
      .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 0 } })
      .build();
    g.expect.derived('bears', { keywords: [] });
  });
});

describe('validation', () => {
  const card = (filter: object) =>
    ({
      ...syntheticCard(CLINIC),
      faces: [
        {
          ...syntheticCard(CLINIC).faces[0],
          abilities: [
            {
              kind: 'activated',
              cost: [{ kind: 'tap' }],
              targets: [{ id: 't1', what: { kind: 'object', filter } }],
              effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
            },
          ],
        },
      ],
    }) as unknown as Parameters<typeof validateCard>[0];

  test('hasCounter is true or a counter name', () => {
    expect(validateCard(card({ hasCounter: true }))).toEqual([]);
    expect(validateCard(card({ hasCounter: 'stun' }))).toEqual([]);
    expect(validateCard(card({ hasCounter: '' })).length).toBeGreaterThan(0);
    expect(validateCard(card({ hasCounter: false })).length).toBeGreaterThan(0);
  });

  test('commander is a flag', () => {
    expect(validateCard(card({ commander: true }))).toEqual([]);
    expect(validateCard(card({ commander: false })).length).toBeGreaterThan(0);
  });
});
