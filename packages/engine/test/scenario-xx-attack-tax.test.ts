// "Creatures can't attack you unless their controller pays {M} for each creature they control that's
// attacking you." (Propaganda, Ghostly Prison) and its planeswalker form (D-125).
// Pins: CR 508.1d (a creature that can't attack unless a cost is paid: the player is not required to pay it,
// even if attacking would obey a requirement), CR 508.1h (the total cost to attack is determined for the chosen
// creatures and locked in; mana, life and so on), CR 508.1f (the attackers are tapped before the cost is
// paid, so a tapped attacker cannot pay with its own mana ability), CR 508.1j-k (attackers declared once the
// cost is paid), CR 506.3 (a player or a planeswalker can be attacked), CR 605.3a (mana abilities are
// activated while paying), CR 107.4f (Phyrexian mana: its color or 2 life), CR 733 (a declaration that cannot
// be completed is taken back). All cards are SYNTHETIC (src/cards/fixtures/synthetic-play-rules.ts) or real
// fixtures.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  validateAbility,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';
import type { Builder } from './restriction-helpers';

const GATE = 'SYNTHETIC Tax Gate'; // {2} per creature
const TOLL = 'SYNTHETIC Tax Toll'; // {1}
const WARDEN = 'SYNTHETIC Tax Warden'; // a creature, {1}
const RUNE = 'SYNTHETIC Tax Rune'; // {R}
const AEGIS = 'SYNTHETIC Tax Aegis'; // {1}, also for planeswalkers
const BLOOD = 'SYNTHETIC Tax Blood'; // {W/P}, also for planeswalkers
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

const mountains = (n: number) => Array.from({ length: n }, () => 'Mountain');

/** Seat 0 is at its declare attackers decision; `seat0` and `seat1` set the boards up. */
function atAttackers(seat0: (b: Builder) => void, seat1: (b: Builder) => void = () => {}) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

type Game = ReturnType<typeof atAttackers>;

function declaration(g: Game) {
  const d = g.state.pending;
  if (d?.kind !== 'declareAttackers') throw new Error(`expected declareAttackers, got ${d?.kind}`);
  return d;
}

function payment(g: Game) {
  const d = g.state.pending;
  if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
  return d;
}

const bears = (n: number) => Array.from({ length: n }, () => BEARS);

describe('CR 508.1h: the cost to attack is the tax for each attacker', () => {
  test('without the ability an attack is declared at once (the baseline)', () => {
    const g = atAttackers((b) => b.battlefield(BEARS, ...mountains(2)));
    expect(declaration(g).attackCosts).toBeUndefined();
    g.act(0).attack(BEARS);
    g.expect.combat({ attackers: [BEARS] });
    g.expect.pending('priority', 0);
  });

  test('the decision names the cost of attacking the player and how many attackers can be paid for', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(3), ...mountains(5)),
      (b) => b.battlefield(GATE),
    );
    expect(declaration(g).attackCosts).toEqual([
      { target: { kind: 'player', seat: 1 }, cost: ['2'], affordable: 2 },
    ]);
  });

  test('"affordable" is counted with every attacker tapped, so it is a floor the engine can beat', () => {
    // Elves and three Mountains make {4}; counted with the Elves tapped (it may attack) only {3} are left, so
    // one attacker is promised; the Bears alone leave the Elves untapped and could pay for two.
    const g = atAttackers(
      (b) => b.battlefield(BEARS, BEARS, ELVES, ...mountains(3)),
      (b) => b.battlefield(GATE),
    );
    expect(declaration(g).attackCosts?.[0]?.affordable).toBe(1);
    const two = g
      .act(0)
      .try.declareAttackers([{ attacker: 'Grizzly Bears[0]' }, { attacker: 'Grizzly Bears[1]' }]);
    expect(two.ok).toBe(true);
  });

  test('one attacker: the declaration asks for {2}, and nothing is declared until it is paid', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(2)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack(BEARS);
    const d = payment(g);
    expect(d.purpose).toBe('attackTax');
    expect(d.seat).toBe(0);
    expect(d.totalCost).toEqual(['2']);
    expect(d.source).toBe(g.id(GATE));
    expect(d.attacks).toEqual([{ attacker: g.id(BEARS), target: { kind: 'player', seat: 1 } }]);
    expect(d.manaSources.map((s) => s.object).sort()).toEqual(
      [g.id('Mountain[0]'), g.id('Mountain[1]')].sort(),
    );
    expect(g.state.combat).toBeNull();
    g.expect.noEvent({ kind: 'attackersDeclared' });
  });

  test('paying declares the attackers, taps what paid, and gives priority', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(3)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack(BEARS).payAuto();
    g.expect.combat({ attackers: [BEARS] });
    g.expect.tapped(BEARS, true);
    g.expect.pending('priority', 0);
    g.expect.step('declareAttackers', { active: 0 });
    const tapped = ['Mountain[0]', 'Mountain[1]', 'Mountain[2]'].filter((m) => g.object(m).tapped);
    expect(tapped).toHaveLength(2);
    // The payment came between the attackers tapping and the declaration (CR 508.1f, 508.1h, 508.1k).
    const kinds = g.events.map((e) => e.kind);
    expect(kinds.lastIndexOf('attackersDeclared')).toBeGreaterThan(kinds.lastIndexOf('tapped'));
  });

  test('each attacker costs the tax: two attackers pay {2}{2}', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(2), ...mountains(4)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]']);
    expect(payment(g).totalCost).toEqual(['2', '2']);
    g.act(0).payAuto();
    g.expect.combat({ attackers: ['Grizzly Bears[0]', 'Grizzly Bears[1]'] });
    expect(['0', '1', '2', '3'].every((i) => g.object(`Mountain[${i}]`).tapped)).toBe(true);
  });

  test('several taxes add up: {2} and {1} make {3} for each attacker', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(3)),
      (b) => b.battlefield(GATE, TOLL),
    );
    expect(declaration(g).attackCosts?.[0]?.cost.slice().sort()).toEqual(['1', '2']);
    g.act(0).attack(BEARS);
    expect(payment(g).totalCost.slice().sort()).toEqual(['1', '2']);
    g.act(0).payAuto();
    expect(['0', '1', '2'].every((i) => g.object(`Mountain[${i}]`).tapped)).toBe(true);
  });

  test('two copies of the same source add up, and a creature can be the source', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(2), ...mountains(6)),
      (b) => b.battlefield(TOLL, TOLL, WARDEN),
    );
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]']);
    expect(payment(g).totalCost).toEqual(['1', '1', '1', '1', '1', '1']);
    g.act(0).payAuto();
    g.expect.combat({ attackers: ['Grizzly Bears[0]', 'Grizzly Bears[1]'] });
  });
});

describe('CR 508.1h: a declaration that cannot be paid is invalid, and fewer attackers pay less', () => {
  test('with {3} available, two attackers (cost {4}) are refused and the state does not change', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(2), ...mountains(3)),
      (b) => b.battlefield(GATE),
    );
    const before = g.hash();
    const r = g
      .act(0)
      .try.declareAttackers([{ attacker: 'Grizzly Bears[0]' }, { attacker: 'Grizzly Bears[1]' }]);
    expect(r.ok).toBe(false);
    expect(g.hash()).toBe(before);
    g.expect.pending('declareAttackers', 0);
  });

  test('declaring one of the two pays {2} and leaves the rest of the mana', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(2), ...mountains(3)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack('Grizzly Bears[0]').payAuto();
    g.expect.combat({ attackers: ['Grizzly Bears[0]'] });
    expect(['0', '1', '2'].filter((i) => !g.object(`Mountain[${i}]`).tapped)).toHaveLength(1);
  });

  test('with no mana at all only "no attack" is possible', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(GATE),
    );
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(false);
    expect(declaration(g).attackCosts?.[0]?.affordable).toBe(0);
    g.act(0).noAttackers();
    g.expect.combat(null);
    g.expect.pending('priority', 0);
  });

  test('the legal actions never offer what the engine refuses, and offer the most that can be paid', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(3), ...mountains(5)),
      (b) => b.battlefield(GATE),
    );
    const attacks = getLegalActions(g.state, 0).filter((a) => a.kind === 'declareAttackers');
    expect(attacks.length).toBeGreaterThan(1);
    const sizes = new Set<number>();
    for (const a of attacks) {
      if (a.kind !== 'declareAttackers') continue;
      sizes.add(a.attacks.length);
      expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
    // Nobody, one, and two attackers (the most that {5} pays for); never all three.
    expect([...sizes].sort()).toEqual([0, 1, 2]);
  });

  test('a land that taps for the wrong color does not pay a colored tax', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, 'Forest', 'Forest'),
      (b) => b.battlefield(RUNE),
    );
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(false);
    const ok = atAttackers(
      (b) => b.battlefield(BEARS, 'Mountain'),
      (b) => b.battlefield(RUNE),
    );
    ok.act(0).attack(BEARS).payAuto();
    ok.expect.combat({ attackers: [BEARS] });
  });

  test('a tapped attacker cannot pay with its own mana ability (CR 508.1f)', () => {
    const build = () =>
      atAttackers(
        (b) => b.battlefield(BEARS, ELVES, 'Mountain'),
        (b) => b.battlefield(GATE),
      );
    // The Elves and one Mountain make {2}; the Elves attacking tap for the cost: refused.
    const elvesAttack = build();
    expect(elvesAttack.act(0).try.declareAttackers([{ attacker: ELVES }]).ok).toBe(false);
    // The Bears attacking leave both the Elves and the Mountain to pay.
    const bearsAttack = build();
    bearsAttack.act(0).attack(BEARS).payAuto();
    bearsAttack.expect.combat({ attackers: [BEARS] });
    bearsAttack.expect.tapped(ELVES, true);
  });
});

describe('payment by hand and taking the declaration back', () => {
  test('manual taps that pay are accepted', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(4)),
      (b) => b.battlefield(GATE),
    );
    g.act(0)
      .attack(BEARS)
      .choose({
        kind: 'payManual',
        taps: ['Mountain[2]', 'Mountain[3]'].map((m) => ({ object: g.id(m), abilityIndex: 0 })),
      });
    g.expect.combat({ attackers: [BEARS] });
    expect(g.object('Mountain[2]').tapped && g.object('Mountain[3]').tapped).toBe(true);
    expect(g.object('Mountain[0]').tapped || g.object('Mountain[1]').tapped).toBe(false);
  });

  test('too few manual taps are refused and the payment is still pending', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(4)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack(BEARS);
    const before = g.hash();
    const r = applyAction(g.state, 0, {
      kind: 'payManual',
      taps: [{ object: g.id('Mountain[0]'), abilityIndex: 0 }],
    });
    expect(r.ok).toBe(false);
    expect(g.hash()).toBe(before);
    payment(g);
  });

  test('cancel takes the declaration back: nothing is tapped or paid, and another can be made', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(2), ...mountains(2)),
      (b) => b.battlefield(GATE),
    );
    const asked = { ...declaration(g), id: '' };
    g.act(0).attack('Grizzly Bears[0]');
    g.act(0).cancel();
    g.expect.pending('declareAttackers', 0);
    expect(g.state.combat).toBeNull();
    g.expect.tapped('Grizzly Bears[0]', false);
    expect(g.object('Mountain[0]').tapped).toBe(false);
    // The same question as before.
    expect({ ...declaration(g), id: '' }).toEqual(asked);
    g.act(0).attack('Grizzly Bears[1]').payAuto();
    g.expect.combat({ attackers: ['Grizzly Bears[1]'] });
  });

  test('cancel then no attack is allowed', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(2)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack(BEARS).cancel().noAttackers();
    g.expect.combat(null);
  });

  test('the payment is the attacker only: the opponent sees no decision and cannot answer', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(2)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack(BEARS);
    expect(getView(g.state, 1).pending).toBeNull();
    expect(getView(g.state, 1).decidingSeat).toBe(0);
    expect(getView(g.state, 0).pending?.kind).toBe('payMana');
    expect(g.legalActions(1)).toEqual([]);
    expect(applyAction(g.state, 1, { kind: 'payAuto' }).ok).toBe(false);
  });
});

describe('who pays and for what (CR 506.3, 508.1h)', () => {
  test('the tax is on attacking its controller only: its controller attacks for free', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, GATE, ...mountains(2)),
      (b) => b.battlefield(GATE),
    );
    // Seat 0 controls a Gate too: it taxes the creatures that attack seat 0, not seat 0's attack on seat 1.
    // Seat 1's Gate taxes this attack.
    expect(declaration(g).attackCosts).toEqual([
      { target: { kind: 'player', seat: 1 }, cost: ['2'], affordable: 1 },
    ]);
  });

  test("an opponent's attack on me is taxed by my permanent, on its own turn", () => {
    const b = scenario().seat(0).battlefield(GATE).library('Island', { count: 4 });
    const g = b
      .seat(1)
      .battlefield(BEARS, ...mountains(2))
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.state.pending?.seat).toBe(1);
    g.act(1).attack(BEARS, { player: 0 });
    expect(payment(g).seat).toBe(1);
    g.act(1).payAuto();
    g.expect.combat({ attackers: [BEARS] });
  });

  test('a planeswalker is attacked for free by Gate, which names only its controller', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(GATE, WALKER),
    );
    expect(declaration(g).attackCosts).toEqual([
      { target: { kind: 'player', seat: 1 }, cost: ['2'], affordable: 0 },
    ]);
    g.act(0).attack(BEARS, WALKER);
    g.expect.combat({ attackers: [BEARS] });
    g.expect.pending('priority', 0);
  });

  test('the planeswalker form taxes the attack on a planeswalker too', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, ...mountains(1)),
      (b) => b.battlefield(AEGIS, WALKER),
    );
    expect(declaration(g).attackCosts).toEqual([
      { target: { kind: 'player', seat: 1 }, cost: ['1'], affordable: 1 },
      { target: { kind: 'permanent', object: g.id(WALKER) }, cost: ['1'], affordable: 1 },
    ]);
    g.act(0).attack(BEARS, WALKER);
    expect(payment(g).totalCost).toEqual(['1']);
    g.act(0).payAuto();
    g.expect.combat({ attackers: [BEARS], targets: [{ attacker: BEARS, target: WALKER }] });
  });

  test('attackers split between a taxed player and a free planeswalker pay only for the first', () => {
    const g = atAttackers(
      (b) => b.battlefield(...bears(2), ...mountains(2)),
      (b) => b.battlefield(GATE, WALKER),
    );
    g.act(0).declareAttackers([
      { attacker: 'Grizzly Bears[0]' },
      { attacker: 'Grizzly Bears[1]', target: WALKER },
    ]);
    expect(payment(g).totalCost).toEqual(['2']);
    g.act(0).payAuto();
    g.expect.combat({ attackers: ['Grizzly Bears[0]', 'Grizzly Bears[1]'] });
  });

  test("a planeswalker's own tax is for its controller's planeswalkers, not those of another", () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(WALKER).seat(0).battlefield(AEGIS).seat(1),
    );
    // The Aegis is seat 0's: it taxes attacks on seat 0 and on seat 0's planeswalkers only.
    g.act(0).attack(BEARS, WALKER);
    g.expect.combat({ attackers: [BEARS] });
  });

  test('a battle is never taxed by the planeswalker form (it names planeswalkers)', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(AEGIS, 'SYNTHETIC Vanilla Battle'),
    );
    const targets = declaration(g).attackCosts?.map((c) => c.target.kind);
    expect(targets).toEqual(['player']);
  });

  test('Phyrexian mana in the tax is paid with its color or with 2 life', () => {
    const color = atAttackers(
      (b) => b.battlefield(BEARS, 'Plains'),
      (b) => b.battlefield(BLOOD),
    );
    color.act(0).attack(BEARS).payAuto();
    color.expect.combat({ attackers: [BEARS] });
    expect(color.state.seats[0]?.life).toBe(40);
    const life = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(BLOOD),
    );
    expect(life.act(0).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(true);
    life.act(0).payAuto();
    life.expect.combat({ attackers: [BEARS] });
    expect(life.state.seats[0]?.life).toBe(38);
  });

  test('commander tax is a different thing: it is not touched, and a commander attacking pays only the attack tax', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS, { commander: true, casts: 2 }).battlefield(...mountains(2)),
      (b) => b.battlefield(GATE),
    );
    const casts = { ...g.state.commanderCasts };
    const tax = getView(g.state, 0).seats[0]?.commanderTax;
    expect(Object.values(tax ?? {})).toEqual([4]);
    g.act(0).attack(BEARS).payAuto();
    g.expect.combat({ attackers: [BEARS] });
    expect(getView(g.state, 0).seats[0]?.commanderTax).toEqual(tax);
    expect(g.state.commanderCasts).toEqual(casts);
  });
});

describe('CR 508.1d: a creature that attacks each combat if able is not required to pay', () => {
  const BERSERKER = 'SYNTHETIC Berserker';

  test('its only target is taxed: it is not required, and "no attack" is legal even with the mana', () => {
    const g = atAttackers(
      (b) => b.battlefield(BERSERKER, ...mountains(4)),
      (b) => b.battlefield(GATE),
    );
    expect(declaration(g).mustAttack).toEqual([]);
    g.act(0).noAttackers();
    g.expect.combat(null);
  });

  test('it may still attack and pay', () => {
    const g = atAttackers(
      (b) => b.battlefield(BERSERKER, ...mountains(2)),
      (b) => b.battlefield(GATE),
    );
    g.act(0).attack(BERSERKER).payAuto();
    g.expect.combat({ attackers: [BERSERKER] });
  });

  test('with a target that is not taxed it is still required to attack that one', () => {
    const g = atAttackers(
      (b) => b.battlefield(BERSERKER),
      (b) => b.battlefield(GATE, WALKER),
    );
    expect(declaration(g).mustAttack).toEqual([g.id(BERSERKER)]);
    expect(g.act(0).try.declareAttackers([]).ok).toBe(false);
    g.act(0).attack(BERSERKER, WALKER);
    g.expect.combat({ attackers: [BERSERKER] });
  });

  test('the legal actions agree with the engine in both cases', () => {
    for (const walker of [false, true]) {
      const g = atAttackers(
        (b) => b.battlefield(BERSERKER, BEARS, ...mountains(2)),
        (b) => (walker ? b.battlefield(GATE, WALKER) : b.battlefield(GATE)),
      );
      const attacks = getLegalActions(g.state, 0).filter((a) => a.kind === 'declareAttackers');
      expect(attacks.length).toBeGreaterThan(0);
      for (const a of attacks) expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
  });
});

describe('the tax follows the board', () => {
  test('a source that is not on the battlefield taxes nothing', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.hand(GATE).graveyard(TOLL),
    );
    g.act(0).attack(BEARS);
    g.expect.combat({ attackers: [BEARS] });
  });

  test('no creature attacking means no cost, and no decision about one', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(GATE),
    );
    g.act(0).noAttackers();
    g.expect.pending('priority', 0);
  });
});

describe('determinism', () => {
  test('the same actions give the same hash, the payment included', () => {
    const play = () => {
      const g = atAttackers(
        (b) => b.battlefield(...bears(2), ...mountains(4)),
        (b) => b.battlefield(GATE),
      );
      g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]']).payAuto();
      return { hash: g.hash(), log: g.log };
    };
    const a = play();
    const b = play();
    expect(a.hash).toBe(b.hash);
    expect(a.log).toEqual(b.log);
    expect(a.log.at(-1)?.action).toEqual({ kind: 'payAuto' });
  });
});

describe('validation and features', () => {
  const ability = (cost: unknown, extra: Record<string, unknown> = {}): Ability =>
    ({ kind: 'static', static: { kind: 'attackTax', cost, ...extra } }) as never;
  const mana = (...symbols: string[]) => [{ kind: 'mana', symbols }];

  test('a mana cost is valid, with or without the planeswalker form', () => {
    expect(validateAbility(ability(mana('2')))).toEqual([]);
    expect(validateAbility(ability(mana('1', 'W'), { planeswalkers: true }))).toEqual([]);
    expect(validateAbility(ability(mana('W/P'), { planeswalkers: true }))).toEqual([]);
  });

  test.each([
    ['an empty cost', []],
    ['no mana symbols', mana()],
    ['a cost that is not mana', [{ kind: 'tap' }]],
    ['life', [{ kind: 'payLife', amount: 2 }]],
    ['X', mana('X')],
  ])('%s is refused with a reason', (_name, cost) => {
    const issues = validateAbility(ability(cost));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.path.startsWith('ability.static.cost'))).toBe(true);
  });

  test('planeswalkers must be true when present', () => {
    expect(
      validateAbility(ability(mana('1'), { planeswalkers: false })).map((i) => i.path),
    ).toEqual(['ability.static.planeswalkers']);
  });

  test('the feature is supported', () => {
    expect(isFeatureSupported('static:attackTax')).toBe(true);
  });

  test.each([GATE, TOLL, WARDEN, RUNE, AEGIS, BLOOD])('the fixture %s is a valid card', (name) => {
    const def = scenario()
      .seat(0)
      .battlefield(name)
      .build()
      .state.definitions.find((d) => d.name === name);
    expect(def && validateCard(def)).toEqual([]);
  });
});
