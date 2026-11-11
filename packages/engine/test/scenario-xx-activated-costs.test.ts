// What an activation costs (CR 602.2b, 118) and what happens after it is paid.
// Pins: CR 118.3 and 118.3b (a cost that cannot be paid cannot be activated; paying life), CR 119.4
// (life can be paid only if the total is at least the amount), CR 701.21 (sacrifice), CR 122.1
// (counters), CR 113.7a (an ability exists independently of its source), CR 608.2b (an ability whose
// targets are all illegal does not resolve), CR 733 (cancelling a cost rewinds the activation).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-abilities.ts) or defined in this file.
import { describe, expect, test } from 'vitest';
import type { Cost } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Action, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SNACK = 'SYNTHETIC Snack';
const ALTAR = 'SYNTHETIC Altar';
const LIFE_TAP = 'SYNTHETIC Life Tap';
const BATTERY = 'SYNTHETIC Charge Battery';
const PINGER = 'SYNTHETIC Pinger';
const DRAGON = 'SYNTHETIC Sacrifice Dragon';

const activateOptions = (g: ScenarioGame, seat: 0 | 1 = 0) =>
  getLegalActions(g.state, seat).filter((a: Action) => a.kind === 'activate');
const offers = (g: ScenarioGame, name: string, seat: 0 | 1 = 0): boolean =>
  activateOptions(g, seat).some((a) => a.kind === 'activate' && a.object === g.id(name));

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
const gain1 = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;

/** {1}, {T}, Sacrifice a creature: Draw a card. For the cost-order tests. */
const RIG = singleFace({
  name: 'SYNTHETIC Test Rig',
  manaCost: ['1'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: '{1}, {T}, Sacrifice a creature: Draw a card.',
  abilities: [
    {
      kind: 'activated',
      cost: [mana('1'), { kind: 'tap' }, { kind: 'sacrifice', what: { types: ['creature'] } }],
      effect: draw,
    },
  ],
});

/** A creature that makes mana by tapping and also has "{1}, {T}: You gain 1 life". */
const MANA_PINGER = singleFace({
  name: 'SYNTHETIC Test Mana Gainer',
  manaCost: ['G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 1,
  toughness: 1,
  oracleText: '{T}: Add {G}. {1}, {T}: You gain 1 life.',
  abilities: [
    { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    { kind: 'activated', cost: [mana('1'), { kind: 'tap' }], effect: gain1 },
  ],
});

/** An artifact that makes mana and has "{1}, Sacrifice this artifact: Draw a card". */
const ROCK = singleFace({
  name: 'SYNTHETIC Test Rock',
  manaCost: ['1'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: '{T}: Add {C}. {1}, Sacrifice this artifact: Draw a card.',
  abilities: [
    { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
    {
      kind: 'activated',
      cost: [mana('1'), { kind: 'sacrifice', what: { kind: 'this' } }],
      effect: draw,
    },
  ],
});

describe('{2}, {T}, Sacrifice this artifact: every part of one cost', () => {
  const build = () => scenario().seat(0).battlefield(SNACK, 'Forest', 'Forest').seat(1).build();

  test('all three are paid before the ability is on the stack, the source is gone', () => {
    const g = build();
    const snack = g.id(SNACK);
    g.act(0).activate(SNACK, { pay: true });
    g.expect.zone(SNACK, 'graveyard', { seat: 0 });
    g.expect.tapped('Forest[0]');
    g.expect.tapped('Forest[1]');
    g.expect.stack([`${SNACK} (ability)`]); // named after its source, which left (CR 113.7a)
    // `tapped` was paid on the permanent that then left, so the event names the old object.
    g.expect.eventLog([
      { kind: 'tapped' },
      { kind: 'tapped' },
      { kind: 'sacrificed', permanent: snack },
      { kind: 'abilityActivated', source: snack },
    ]);
  });

  test('the ability resolves without its source (CR 113.7a): the life is gained', () => {
    const g = build();
    g.act(0).activate(SNACK, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
    g.expect.stack([]);
  });

  test('the sacrifice happens after the mana, so the source can be tapped for mana first', () => {
    // CR 701.21a: it is still a permanent its controller controls even if it is tapped.
    const g = scenario().define(ROCK).seat(0).battlefield(ROCK.name, 'Forest').seat(1).build();
    g.act(0).activate(ROCK.name).payManual([ROCK.name]);
    g.expect.zone(ROCK.name, 'graveyard', { seat: 0 });
    g.expect.tapped('Forest', false);
  });
});

describe('the order of payment', () => {
  test('{T} is paid first, so auto-payment cannot tap the creature for mana and lose its own cost', () => {
    const lone = scenario()
      .define(MANA_PINGER)
      .seat(0)
      .battlefield(MANA_PINGER.name)
      .seat(1)
      .build();
    // Its own mana would pay the {1}, but the creature is tapped for the {T} cost: not offered.
    expect(offers(lone, MANA_PINGER.name)).toBe(false);

    const g = scenario()
      .define(MANA_PINGER)
      .seat(0)
      .battlefield(MANA_PINGER.name, 'Forest')
      .seat(1)
      .build();
    expect(offers(g, MANA_PINGER.name)).toBe(true);
    g.act(0).activate(MANA_PINGER.name, { pay: true });
    g.expect.tapped('Forest');
    g.expect.tapped(MANA_PINGER.name);
    g.passAll();
    g.expect.life(0, 41);
  });

  test('auto-payment never spends a source that is being sacrificed for the cost', () => {
    const lone = scenario().define(ROCK).seat(0).battlefield(ROCK.name).seat(1).build();
    expect(offers(lone, ROCK.name)).toBe(false);
    const g = scenario().define(ROCK).seat(0).battlefield(ROCK.name, 'Forest').seat(1).build();
    g.act(0).activate(ROCK.name, { pay: true });
    g.expect.tapped('Forest');
    g.expect.zone(ROCK.name, 'graveyard', { seat: 0 });
  });
});

describe('Sacrifice a creature: the cost names a filter, the player chooses', () => {
  test('the choice is a choosePermanent decision for a cost, with cancel; only own creatures', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ALTAR, 'Grizzly Bears', 'SYNTHETIC Pump Bear')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).activate(ALTAR);
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect(d.forCost).toBe(true);
    expect(d.purpose).toBe('sacrifice');
    expect([d.min, d.max]).toEqual([1, 1]);
    expect(d.legal).toHaveLength(2);
    expect(d.legal).toContain(g.id({ name: 'Grizzly Bears', seat: 0 }));
    expect(d.legal).not.toContain(g.id({ name: 'Grizzly Bears', seat: 1 }));
    const kinds = getLegalActions(g.state, 0).map((a) => a.kind);
    expect(kinds).toContain('cancel');
    expect(kinds).toContain('choosePermanents');
    // The opponent's creature is not a legal answer.
    const bad = g.act(0).try.action({
      kind: 'choosePermanents',
      objects: [g.id({ name: 'Grizzly Bears', seat: 1 })],
    });
    expect(bad.ok).toBe(false);
    g.act(0).choosePermanents({ name: 'Grizzly Bears', seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.stack([`${ALTAR} (ability)`]);
    g.expect.eventLog([
      { kind: 'permanentsChosen', automatic: false, purpose: 'sacrifice' },
      { kind: 'sacrificed' },
      { kind: 'abilityActivated' },
    ]);
    g.passAll();
    g.expect.life(0, 42);
  });

  test('with one candidate the engine chooses and says so; with none it is not offered', () => {
    const g = scenario().seat(0).battlefield(ALTAR, 'Grizzly Bears').seat(1).build();
    g.act(0).activate(ALTAR);
    g.expect.pending('priority', 0);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'permanentsChosen', automatic: true, purpose: 'sacrifice' }]);
    const none = scenario().seat(0).battlefield(ALTAR).seat(1).battlefield('Grizzly Bears').build();
    expect(offers(none, ALTAR)).toBe(false);
    const r = none.act(0).try.activate(ALTAR);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('nothing to sacrifice') });
  });

  test('the source can be sacrificed to its own cost when it matches (a creature outlet)', () => {
    const outlet = singleFace({
      name: 'SYNTHETIC Test Self Outlet',
      manaCost: ['B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 1,
      toughness: 1,
      oracleText: 'Sacrifice a creature: You gain 1 life.',
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
          effect: gain1,
        },
      ],
    });
    const g = scenario().define(outlet).seat(0).battlefield(outlet.name).seat(1).build();
    g.act(0).activate(outlet.name);
    g.expect.zone(outlet.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('"another" in the filter leaves the source out', () => {
    const outlet = singleFace({
      name: 'SYNTHETIC Test Other Outlet',
      manaCost: ['B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 1,
      toughness: 1,
      oracleText: 'Sacrifice another creature: You gain 1 life.',
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'sacrifice', what: { types: ['creature'], other: true } }],
          effect: gain1,
        },
      ],
    });
    const alone = scenario().define(outlet).seat(0).battlefield(outlet.name).seat(1).build();
    expect(offers(alone, outlet.name)).toBe(false);
    const g = scenario()
      .define(outlet)
      .seat(0)
      .battlefield(outlet.name, 'Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).activate(outlet.name);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone(outlet.name, 'battlefield', { seat: 0 });
  });

  test('"whenever you sacrifice" sees the cost: the trigger goes on the stack above the ability', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ALTAR, DRAGON, 'Grizzly Bears')
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).activate(ALTAR);
    g.act(0).choosePermanents('Grizzly Bears');
    // Top first: the Dragon's trigger (noticed from the sacrifice) above the Altar's ability.
    g.expect.stack([`${DRAGON} (ability)`, `${ALTAR} (ability)`]);
    g.passAll();
    g.expect.counters(DRAGON, { '+1/+1': 1 });
  });

  test('cancelling at the sacrifice rewinds the cost already paid: {T}, mana and all', () => {
    const g = scenario()
      .define(RIG)
      .seat(0)
      .battlefield(RIG.name, 'Forest', 'Grizzly Bears', 'SYNTHETIC Pump Bear')
      .seat(1)
      .build();
    const before = g.positionHash();
    g.act(0).activate(RIG.name, { pay: true });
    g.expect.pending('choosePermanent', 0);
    g.expect.tapped(RIG.name);
    g.expect.tapped('Forest');
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.tapped(RIG.name, false);
    g.expect.tapped('Forest', false);
    g.expect.stack([]);
    expect(offers(g, RIG.name)).toBe(true);
  });

  test('cancelling is not offered once the activation is finished', () => {
    const g = scenario().seat(0).battlefield(ALTAR, 'Grizzly Bears').seat(1).build();
    g.act(0).activate(ALTAR);
    g.expect.stack([`${ALTAR} (ability)`]);
    expect(g.act(0).try.action({ kind: 'cancel' }).ok).toBe(false);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(false);
  });
});

describe('Pay 2 life (CR 118.3b, 119.4)', () => {
  test('{T}, Pay 2 life: Draw a card pays the life and taps', () => {
    const g = scenario().seat(0).battlefield(LIFE_TAP).library('Forest', 'Plains').seat(1).build();
    g.act(0).activate(LIFE_TAP);
    g.expect.life(0, 38);
    g.expect.tapped(LIFE_TAP);
    g.expect.eventLog([{ kind: 'lifeChanged', seat: 0, from: 40, to: 38 }]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('with 1 life it cannot be paid; with exactly 2 it can, and then the seat loses', () => {
    const poor = scenario().seat(0).life(1).battlefield(LIFE_TAP).seat(1).build();
    expect(offers(poor, LIFE_TAP)).toBe(false);
    expect(poor.act(0).try.activate(LIFE_TAP)).toMatchObject({
      ok: false,
      error: expect.stringContaining('life'),
    });
    const g = scenario().seat(0).life(2).battlefield(LIFE_TAP).library('Forest').seat(1).build();
    expect(offers(g, LIFE_TAP)).toBe(true);
    g.act(0).activate(LIFE_TAP);
    g.expect.life(0, 0);
    g.expect.hasLost(0);
    g.expect.gameOver({ win: 1 });
  });
});

describe('Remove a counter (CR 122.1, 118.3)', () => {
  test('a battery that enters with two charge counters pays twice, then is not offered', () => {
    const g = scenario().seat(0).hand(BATTERY).battlefield('Forest').seat(1).build();
    g.act(0).cast(BATTERY, { pay: true });
    g.passAll();
    g.expect.counters(BATTERY, { charge: 2 });
    const mark = g.mark();
    g.act(0).activate(BATTERY);
    g.expect.counters(BATTERY, { charge: 1 });
    g.expect.eventLog([{ kind: 'counterRemoved', counter: 'charge', count: 1 }], { since: mark });
    g.act(0).activate(BATTERY);
    g.expect.counters(BATTERY, {});
    g.expect.stack([`${BATTERY} (ability)`, `${BATTERY} (ability)`]);
    expect(offers(g, BATTERY)).toBe(false);
    g.passAll();
    g.passAll();
    g.expect.life(0, 42);
  });
});

describe('a cost the engine cannot pay is never offered (CR 118.3)', () => {
  test('costs the engine does not pay are not activations', () => {
    for (const cost of [{ kind: 'untap' }] as const) {
      const card = singleFace({
        name: 'SYNTHETIC Test Unpayable',
        manaCost: ['1'],
        types: ['artifact'],
        colors: [],
        colorIdentity: [],
        oracleText: 'Unsupported cost: Draw a card.',
        abilities: [{ kind: 'activated', cost: [cost], effect: draw }],
      });
      const g = scenario()
        .define(card)
        .seat(0)
        .battlefield(card.name)
        .hand('Forest')
        .seat(1)
        .build();
      expect(offers(g, card.name), cost.kind).toBe(false);
      expect(g.act(0).try.activate(card.name).ok, cost.kind).toBe(false);
    }
  });
});

describe('a targeted ability whose target becomes illegal (CR 608.2b)', () => {
  function pingBears() {
    const g = scenario()
      .seat(0)
      .battlefield(PINGER)
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island', 'Grizzly Bears')
      .build();
    g.act(0).activate(PINGER, { targets: [{ name: 'Grizzly Bears' }] });
    g.act(0).pass();
    return g;
  }

  test('the target is bounced in response: the ability fizzles, the {T} stays paid', () => {
    const g = pingBears();
    g.act(1).cast('Unsummon', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.act(1).pass();
    g.act(0).pass(); // Unsummon resolves first: it is on top
    g.expect.stack([`${PINGER} (ability)`]);
    g.passAll();
    g.expect.stack([]);
    g.expect.eventLog([{ kind: 'fizzled' }]);
    g.expect.noEvent({ kind: 'damageDealt' });
    g.expect.noEvent({ kind: 'resolved', cardName: PINGER });
    g.expect.tapped(PINGER);
    g.expect.zone(PINGER, 'battlefield', { seat: 0 });
  });

  test('left alone, the same ability resolves and the damage is marked', () => {
    const g = pingBears();
    g.act(1).pass();
    g.expect.damage('Grizzly Bears', 1);
    g.expect.noEvent({ kind: 'fizzled' });
  });
});

describe('an ability resolving after its source died (CR 113.7a)', () => {
  test('a pinger killed in response still deals its damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PINGER)
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [{ name: PINGER }], pay: true });
    g.act(1).pass();
    g.act(0).pass(); // the Bolt resolves first
    g.expect.zone(PINGER, 'graveyard', { seat: 0 });
    g.expect.stack([`${PINGER} (ability)`]);
    // The view names it after its source from last-known information.
    expect(g.view(0).stack[0]?.name).toBe(PINGER);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.stack([]);
  });
});

describe('legal actions and applyAction agree', () => {
  type Build = () => ScenarioGame;
  const builders: Record<string, Build> = {
    'bear and a forest': () =>
      scenario().seat(0).battlefield('SYNTHETIC Pump Bear', 'Forest').seat(1).build(),
    'bear, no mana': () => scenario().seat(0).battlefield('SYNTHETIC Pump Bear').seat(1).build(),
    'fresh pinger and altar': () =>
      scenario()
        .seat(0)
        .battlefield(PINGER, { fresh: true })
        .battlefield(ALTAR, { fresh: true })
        .seat(1)
        .build(),
    'tapped pinger': () => scenario().seat(0).battlefield(PINGER, { tapped: true }).seat(1).build(),
    'opponent has priority': () =>
      scenario()
        .seat(0)
        .battlefield('SYNTHETIC Pump Bear', 'Forest')
        .seat(1)
        .battlefield('SYNTHETIC Pump Bear', 'Forest')
        .at('precombatMain', { active: 0, priority: 1 })
        .build(),
    'scholar in combat': () =>
      scenario()
        .seat(0)
        .battlefield('SYNTHETIC Slow Scholar', 'Forest')
        .seat(1)
        .at('beginningOfCombat')
        .build(),
    'scholar, main phase': () =>
      scenario().seat(0).battlefield('SYNTHETIC Slow Scholar', 'Forest').seat(1).build(),
    'altar with and without creatures': () =>
      scenario()
        .seat(0)
        .battlefield(ALTAR, 'Grizzly Bears')
        .seat(1)
        .battlefield('Grizzly Bears')
        .build(),
    'life tap at 1 life': () => scenario().seat(0).life(1).battlefield(LIFE_TAP).seat(1).build(),
    'snack with one forest': () => scenario().seat(0).battlefield(SNACK, 'Forest').seat(1).build(),
    'snack with two forests': () =>
      scenario().seat(0).battlefield(SNACK, 'Forest', 'Forest').seat(1).build(),
    'battery without counters': () => scenario().seat(0).battlefield(BATTERY).seat(1).build(),
    'battery with counters': () =>
      scenario()
        .seat(0)
        .battlefield(BATTERY, { counters: { charge: 1 } })
        .seat(1)
        .build(),
    'cycling cards in hand': () =>
      scenario()
        .seat(0)
        .hand('SYNTHETIC Cycling Bear', 'SYNTHETIC Cycling Land', 'SYNTHETIC Life Cycler')
        .battlefield('Forest', 'Forest')
        .library('Forest', 'Forest')
        .seat(1)
        .hand('SYNTHETIC Cycling Bear')
        .battlefield('Forest', 'Forest')
        .build(),
    'cycling card on the battlefield': () =>
      scenario().seat(0).battlefield('SYNTHETIC Cycling Bear', 'Forest', 'Forest').seat(1).build(),
    'tapped coach': () =>
      scenario().seat(0).battlefield('SYNTHETIC Coach', { tapped: true }).seat(1).build(),
  };

  /** Scenarios built so that no activation is possible: the probes then all fail. */
  const OFFERS_NOTHING = new Set([
    'bear, no mana',
    'tapped pinger',
    'scholar in combat',
    'life tap at 1 life',
    'snack with one forest',
    'battery without counters',
    'cycling card on the battlefield',
    'tapped coach',
  ]);

  /** Every probe runs on a fresh game: an accepted activation moves the game on. */
  for (const [name, build] of Object.entries(builders)) {
    test(`every activate action is listed exactly when applyAction accepts it: ${name}`, () => {
      const ids = Object.keys(build().state.objects);
      let probes = 0;
      let accepted = 0;
      for (const seat of [0, 1] as const) {
        for (const id of ids) {
          for (let abilityIndex = 0; abilityIndex < 4; abilityIndex += 1) {
            const g = build();
            const action: Action = { kind: 'activate', object: id as never, abilityIndex };
            const listed = getLegalActions(g.state, seat).some(
              (a) => JSON.stringify(a) === JSON.stringify(action),
            );
            const ok = g.act(seat).try.action(action).ok;
            expect(ok, `${name}: seat ${seat} ${id}#${abilityIndex}`).toBe(listed);
            probes += 1;
            if (ok) accepted += 1;
          }
        }
      }
      expect(probes).toBeGreaterThan(0);
      // Every scenario offers something to someone, except the ones built to offer nothing.
      expect(accepted > 0, name).toBe(!OFFERS_NOTHING.has(name));
    });
  }
});
