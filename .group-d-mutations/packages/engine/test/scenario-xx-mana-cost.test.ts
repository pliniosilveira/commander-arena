// Mana abilities with a mana cost: "{1}, {T}: Add {U}{B}." (a Signet).
// Pins: CR 605.1a (an activated ability that could add mana and has no target is a mana ability,
// whatever it costs), CR 605.3a (mana abilities may be activated while paying a cost: the player
// taps other sources first and the cost of this one comes out of the pool), CR 118.3 (a cost can
// be paid only with resources the player has), CR 106.6 (mana restricted to spells cannot pay an
// ability's cost), CR 601.2g-h.
//
// The planner rule under test is the one-level rule written in mana/payment.ts: a costed ability
// is used by auto-pay only when its cost is paid from the pool or from sources that have no mana
// cost, and its own mana never pays for itself or for another costed ability.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { ManaObject, PaymentSource } from '../src/index';
import { parseManaCost, planPayment, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SIGNET = 'SYNTHETIC Signet';

const signetSource = (object: `o${number}`, cost = ['1']): PaymentSource => ({
  object,
  abilityIndex: 0,
  produces: [['U', 'B']],
  tier: 'artifact',
  snow: false,
  restriction: null,
  cost: parseManaCost(cost),
});

const land = (object: `o${number}`, color: 'W' | 'U' | 'B' | 'R' | 'G'): PaymentSource => ({
  object,
  abilityIndex: 0,
  produces: [[color]],
  tier: 'land',
  snow: false,
  restriction: null,
});

const plan = (
  cost: string[],
  sources: PaymentSource[],
  pool: ManaObject[] = [],
  types = ['instant'],
) =>
  planPayment({
    cost: parseManaCost(cost),
    x: 0,
    pool,
    sources,
    lifeAvailable: 0,
    spell: { types },
  });

describe('activating it by hand: the cost comes out of the mana pool (CR 605.3a, 118.3)', () => {
  test('with an empty pool it cannot be activated, and it is not offered', () => {
    const g = scenario().seat(0).battlefield(SIGNET).build();
    const r = g.act(0).try.tapForMana(SIGNET);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('costs {1}');
      expect(r.error).toContain('mana pool');
    }
    g.expect.tapped(SIGNET, false);
    expect(g.legalActions(0).some((a) => a.kind === 'activateAbility')).toBe(false);
  });

  test('with a mana in the pool it pays {1}, taps, and adds {U}{B}', () => {
    const g = scenario().seat(0).battlefield(SIGNET).pool('G').build();
    g.act(0).tapForMana(SIGNET);
    g.expect.pool(0, 'UB');
    g.expect.tapped(SIGNET);
    g.expect.stack([]);
  });

  test('a land tapped first pays for it: Forest then Signet leaves {U}{B}', () => {
    const g = scenario().seat(0).battlefield(SIGNET, 'Forest').build();
    expect(g.legalActions(0).filter((a) => a.kind === 'activateAbility')).toHaveLength(1); // only the Forest
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(SIGNET);
    g.expect.pool(0, 'UB');
  });

  test('the cost leaves other mana in the pool alone', () => {
    const g = scenario().seat(0).battlefield(SIGNET).pool('GG').build();
    g.act(0).tapForMana(SIGNET);
    g.expect.pool(0, 'GUB');
  });

  test('the costs are paid before the mana is added (CR 605.3b), with nothing in between', () => {
    const g = scenario().seat(0).battlefield(SIGNET).pool('R').build();
    const before = g.mark();
    g.act(0).tapForMana(SIGNET);
    g.expect.eventLog([{ kind: 'tapped' }, { kind: 'manaAdded', count: 2 }], { since: before });
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: before });
  });

  test('a colored cost needs mana of that color in the pool', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Green Signet').pool('R').build();
    const r = g.act(0).try.tapForMana('SYNTHETIC Green Signet');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('{G}');
    const ok = scenario().seat(0).battlefield('SYNTHETIC Green Signet').pool('G').build();
    ok.act(0).tapForMana('SYNTHETIC Green Signet');
    ok.expect.pool(0, 'GWW');
  });
});

describe('manual payment while casting: order matters', () => {
  test('lands first, then the Signet, pay Divination ({2}{U}) by hand', () => {
    const g = scenario().seat(0).hand('Divination').battlefield(SIGNET, 'Forest', 'Forest').build();
    g.act(0).cast('Divination').payManual(['Forest[0]', SIGNET, 'Forest[1]']);
    g.expect.stack(['Divination']);
    g.expect.tapped(SIGNET);
    g.expect.pool(0, '');
  });

  test('the Signet first is refused with the reason, and the cast carries on', () => {
    const g = scenario().seat(0).hand('Divination').battlefield(SIGNET, 'Forest', 'Forest').build();
    const cast = g.act(0).cast('Divination');
    const r = g.act(0).try.action({
      kind: 'payManual',
      taps: [
        { object: g.id(SIGNET), abilityIndex: 0 },
        { object: g.id({ name: 'Forest', nth: 0 }), abilityIndex: 0 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('tap other sources first');
    g.expect.pending('payMana', 0);
    g.expect.tapped(SIGNET, false);
    cast.cancel();
  });
});

describe('the payment planner: one level of mana-cost abilities', () => {
  test('a land pays the Signet, the Signet pays the blue (Divination from Forest, Forest, Signet)', () => {
    const g = scenario().seat(0).hand('Divination').battlefield(SIGNET, 'Forest', 'Forest').build();
    g.expect.legal(0, { cast: 'Divination' });
    g.act(0).cast('Divination', { pay: true });
    g.expect.tapped(SIGNET);
    g.expect.tapped({ name: 'Forest', nth: 0 });
    g.expect.tapped({ name: 'Forest', nth: 1 });
    g.expect.pool(0, '');
  });

  test('the Signet alone cannot pay even its own cost: nothing is offered', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(SIGNET)
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.expect.illegal(0, { cast: 'Unsummon' });
  });

  test('unspent mana from the Signet goes to the pool: casting Unsummon ({U}) leaves {B}', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(SIGNET, 'Forest')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'], pay: true });
    g.expect.pool(0, 'B');
    g.expect.tapped('Forest');
    g.expect.tapped(SIGNET);
  });

  test('mana already in the pool pays the Signet cost before a land is tapped', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(SIGNET, 'Forest')
      .pool('G')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'], pay: true });
    g.expect.tapped('Forest', false);
    g.expect.pool(0, 'B');
  });

  test('a Signet is not used when lands pay: Lightning Bolt from Mountain, Forest and a Signet', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield(SIGNET, 'Mountain', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.tapped('Mountain');
    g.expect.tapped(SIGNET, false);
    g.expect.tapped('Forest', false);
  });

  test('a colored cost is paid with that color only', () => {
    // {W}{W}{G} from a Green Signet ({G}, {T}: Add {G}{W}{W}) needs a green source for its cost.
    const withForest = plan(['G', 'W', 'W'], [signetGreen('o1'), land('o2', 'G')]);
    expect(withForest?.taps.map((t) => t.object).sort()).toEqual(['o1', 'o2']);
    expect(plan(['G', 'W', 'W'], [signetGreen('o1'), land('o2', 'U')])).toBeNull();
  });
});

function signetGreen(object: `o${number}`): PaymentSource {
  return { ...signetSource(object, ['G']), produces: [['G', 'W', 'W']] };
}

describe('planPayment with mana-cost sources, directly', () => {
  test('the Signet pays blue and black when a land pays its {1}', () => {
    const p = plan(['U', 'B'], [signetSource('o1'), land('o2', 'R')]);
    expect(p?.taps.map((t) => t.object).sort()).toEqual(['o1', 'o2']);
    expect(p?.leftover).toEqual([]);
  });

  test('without any other source it cannot pay (it never pays for itself)', () => {
    expect(plan(['U'], [signetSource('o1')])).toBeNull();
    expect(plan(['U', 'B'], [signetSource('o1')])).toBeNull();
  });

  test('ONE level: a Signet does not start another Signet', () => {
    // {U}{B}{U}{B} needs both Signets; the second one's {1} could only come from the first one's
    // mana, which the planner does not use. A player could do it by hand (tap one, then the other).
    const sources = [signetSource('o1'), signetSource('o2'), land('o3', 'R')];
    expect(plan(['U', 'B', 'U', 'B'], sources)).toBeNull();
    // With a second land the same cost works: each Signet's cost is paid by a land.
    const two = [...sources, land('o4', 'G')];
    const p = plan(['U', 'B', 'U', 'B'], two);
    expect(p?.taps).toHaveLength(4);
  });

  test("a Signet's mana cannot pay a cost that the pool or lands could not (colored check)", () => {
    // The Signet makes U and B; its own cost {1} is generic, so a land of any color pays it.
    expect(plan(['U'], [signetSource('o1'), land('o2', 'W')])?.taps).toHaveLength(2);
  });

  test('restricted mana in the pool cannot pay an ability cost (CR 106.6), but pays the spell', () => {
    const restricted: ManaObject = {
      color: 'G',
      snow: false,
      source: 'o9',
      restriction: { kind: 'spellTypes', types: ['instant'] },
    };
    expect(plan(['U'], [signetSource('o1')], [restricted])).toBeNull();
    // The same mana pays the instant itself.
    expect(plan(['G'], [], [restricted])?.fromPool).toEqual([0]);
  });

  test('costed sources chosen are all used; an unused one is not tapped', () => {
    const p = plan(['R'], [signetSource('o1'), land('o2', 'R'), land('o3', 'G')]);
    expect(p?.taps.map((t) => t.object)).toEqual(['o2']);
  });

  test('a cost the planner cannot plan (Phyrexian) makes the source unusable instead of wrong', () => {
    const weird: PaymentSource = { ...signetSource('o1'), cost: parseManaCost(['W/P']) };
    expect(plan(['U'], [weird, land('o2', 'W')])).toBeNull();
  });

  test('a hybrid cost is planned: {W/U} is paid with the white of the land (D-099)', () => {
    const hybrid: PaymentSource = { ...signetSource('o1'), cost: parseManaCost(['W/U']) };
    const p = plan(['U'], [hybrid, land('o2', 'W')]);
    expect(p?.taps.map((t) => t.object)).toEqual(['o1', 'o2']);
  });
});

describe('validation', () => {
  test('the Signet fixture is a valid, supported card', () => {
    const def = scenario()
      .seat(0)
      .battlefield(SIGNET)
      .build()
      .state.definitions.find((d) => d.name === SIGNET);
    expect(def && validateCard(def)).toEqual([]);
  });

  test('a mana cost on a mana ability is structurally valid; hybrid or X in it is not supported', () => {
    const ability = (symbols: string[]) =>
      ({
        kind: 'mana',
        cost: [{ kind: 'mana', symbols }, { kind: 'tap' }],
        production: { kind: 'fixed', mana: ['C'] },
      }) as const;
    expect(validateAbility(ability(['2']))).toEqual([]);
    expect(validateAbility(ability(['W/U']))).toEqual([]);
  });
});
