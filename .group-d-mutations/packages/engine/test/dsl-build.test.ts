// The scenario DSL builder (SPEC 17.3 A12, D-012): it writes a precise state directly, produces
// only consistent states and refuses impossible setups with clear errors.
import { describe, expect, test } from 'vitest';
import {
  checkInvariants,
  fixtureCard,
  getView,
  ScenarioError,
  scenario,
  singleFaceCard,
} from './dsl-helpers';

describe('scenario builder: state', () => {
  test('builds a consistent state with something in every zone', () => {
    const g = scenario()
      .seat(0)
      .life(31)
      .hand('Lightning Bolt', 'Counterspell')
      .library('Island', 'Forest')
      .graveyard('Murder')
      .exile('Divination')
      .battlefield('Mountain')
      .commander('Isamaru, Hound of Konda')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    expect(checkInvariants(g.state)).toEqual([]);
    g.expect.life(0, 31);
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
    g.expect.zone('Murder', 'graveyard', { seat: 0 });
    g.expect.zone('Divination', 'exile', { seat: 0 });
    g.expect.zone('Isamaru, Hound of Konda', 'command', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.noObject('Grizzly Bears', { seat: 0 });
  });

  test('life defaults to the Commander starting life of 40 (CR 103.4c)', () => {
    const g = scenario().seat(0).seat(1).life(7).build();
    g.expect.life(0, 40);
    g.expect.life(1, 7);
  });

  test('the library is listed top first; other zones keep the order given', () => {
    const g = scenario()
      .seat(0)
      .library('Island', 'Forest', 'Swamp')
      .hand('Murder', 'Unsummon')
      .build();
    expect(g.state.seats[0]?.library).toHaveLength(3);
    expect(g.object('Island').id).toBe(g.state.seats[0]?.library[0]);
    expect(g.object('Swamp').id).toBe(g.state.seats[0]?.library[2]);
    expect(g.object('Murder').id).toBe(g.state.seats[0]?.hand[0]);
  });

  test('copies of one name are separate cards and objects, reachable by index', () => {
    const g = scenario().seat(0).battlefield('Mountain', { count: 3, tapped: true }).build();
    const ids = g.find({ name: 'Mountain' }).map((o) => o.id);
    expect(new Set(ids).size).toBe(3);
    expect(new Set(g.find({ name: 'Mountain' }).map((o) => o.card)).size).toBe(3);
    expect(g.object('Mountain[1]').id).toBe(ids[1]);
    expect(g.object({ name: 'Mountain', nth: 2 }).id).toBe(ids[2]);
    expect(() => g.object('Mountain')).toThrow(/ambiguous: 3 matches/);
    expect(() => g.object('Mountain[3]')).toThrow(/does not exist/);
  });

  test('permanent options: tapped, damage, counters', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { tapped: true, damage: 1, counters: { '+1/+1': 2 } })
      .battlefield('Forest')
      .build();
    g.expect.tapped('Grizzly Bears');
    g.expect.tapped('Forest', false);
    g.expect.damage('Grizzly Bears', 1);
    g.expect.counters('Grizzly Bears', { '+1/+1': 2 });
    const view = getView(g.state, 0).battlefield.find((o) => o.name === 'Grizzly Bears');
    expect(view?.power).toBe(4);
  });

  test('a permanent is not summoning sick by default and is when marked fresh (CR 302.6)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Llanowar Elves', { label: 'old' })
      .battlefield('Llanowar Elves', { fresh: true, label: 'new' })
      .seat(1)
      .battlefield('Llanowar Elves', { fresh: true, label: 'theirs' })
      .build();
    const sick = (label: string) =>
      getView(g.state, 0).battlefield.find((o) => o.id === g.id(label))?.summoningSick;
    expect(sick('old')).toBe(false);
    expect(sick('new')).toBe(true);
    expect(sick('theirs')).toBe(true);
  });

  test('commanders: flag, command zone, tax history and commander damage', () => {
    const g = scenario()
      .seat(0)
      .commander('Isamaru, Hound of Konda', { casts: 2 })
      .commanderDamageTaken('Yargle, Glutton of Urborg', 5)
      .seat(1)
      .commander('Yargle, Glutton of Urborg')
      .build();
    const isamaru = g.object('Isamaru, Hound of Konda');
    expect(isamaru.zone).toBe('command');
    const card = isamaru.card;
    expect(card).not.toBeNull();
    if (card === null) return;
    expect(g.state.cards[card]?.isCommander).toBe(true);
    expect(g.state.seats[0]?.commanders).toEqual([card]);
    expect(g.state.commanderCasts[card]).toBe(2);
    const yargle = g.object('Yargle, Glutton of Urborg').card;
    expect(g.state.commanderDamage[`0:${yargle}`]).toBe(5);
    expect(getView(g.state, 0).seats[0]?.commanderTax[card]).toBe(4);
  });

  test('a commander may be flagged in any zone, for example on the battlefield', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Isamaru, Hound of Konda', { commander: true })
      .build();
    const card = g.object('Isamaru, Hound of Konda').card;
    expect(card && g.state.cards[card]?.isCommander).toBe(true);
    expect(card && g.state.seats[0]?.commanders).toEqual([card]);
  });

  test('mana pool, mulligans, lands played, hand size, poison', () => {
    const g = scenario()
      .seat(0)
      .pool('GGC')
      .landsPlayed(1)
      .handSizeMax(8)
      .poison(3)
      .seat(1)
      .pool({ R: 2 })
      .mulligans(2)
      .build();
    g.expect.pool(0, 'GGC');
    g.expect.pool(1, { R: 2 });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
    expect(g.state.seats[0]?.handSizeMax).toBe(8);
    expect(g.state.seats[0]?.poison).toBe(3);
    expect(g.state.seats[1]?.mulligans).toBe(2);
  });

  test('turn, active seat, step, phase and priority', () => {
    const g = scenario()
      .seat(0)
      .seat(1)
      .at('beginningOfCombat', { active: 1, turn: 6, priority: 0, extraLandDrops: 1 })
      .build();
    expect(g.state.turn).toMatchObject({
      number: 6,
      activeSeat: 1,
      step: 'beginningOfCombat',
      phase: 'combat',
      prioritySeat: 0,
      extraLandDrops: 1,
    });
    g.expect.pending('priority', 0);
    g.expect.step('beginningOfCombat', { active: 1, turn: 6 });
  });

  test('defaults: precombat main of turn 3, seat 0 active with priority', () => {
    const g = scenario().seat(0).seat(1).build();
    expect(g.state.turn).toMatchObject({
      number: 3,
      activeSeat: 0,
      step: 'precombatMain',
      prioritySeat: 0,
    });
  });

  test('the first decision is a priority decision with real options', () => {
    const g = scenario().seat(0).hand('Lightning Bolt', 'Forest').battlefield('Mountain').build();
    g.expect.legal(0, 'pass');
    g.expect.legal(0, { playLand: 'Forest' });
    g.expect.legal(0, { cast: 'Lightning Bolt' });
    g.expect.legal(0, { tap: 'Mountain' });
    expect(g.legalActions(1)).toEqual([]);
  });

  test('every priority step builds the phase the engine uses', () => {
    const steps = [
      'upkeep',
      'draw',
      'precombatMain',
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'postcombatMain',
      'end',
    ] as const;
    const g = scenario().seat(0).library('Island').seat(1).library('Island').at('upkeep').build();
    for (const step of steps) {
      g.advanceTo(step);
      const built = scenario().seat(0).seat(1).at(step).build();
      expect(built.state.turn.phase, step).toBe(g.state.turn.phase);
    }
  });

  test('the built state is plain JSON', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .commander('Isamaru, Hound of Konda')
      .pool('R')
      .build();
    expect(JSON.parse(JSON.stringify(g.state))).toEqual(g.state);
  });

  test('settle: true performs state-based actions before the first decision (CR 117.5)', () => {
    const lethal = () => scenario().seat(0).battlefield('Grizzly Bears', { damage: 2 });
    const raw = lethal().build();
    raw.expect.zone('Grizzly Bears', 'battlefield');
    const settled = lethal().build({ settle: true });
    settled.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    settled.expect.pending('priority', 0);
  });

  test('settle: true can end the game', () => {
    const g = scenario().seat(0).life(0).seat(1).build({ settle: true });
    g.expect.gameOver({ win: 1 });
  });

  test('define registers a card the scenario can name', () => {
    const mine = singleFaceCard({
      name: 'Test Bear',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 5,
      toughness: 5,
      oracleText: '',
    });
    const g = scenario().define(mine).seat(0).battlefield('Test Bear').build();
    g.expect.zone('Test Bear', 'battlefield', { seat: 0 });
    expect(getView(g.state, 0).battlefield[0]?.power).toBe(5);
  });

  test('labels name one exact card and follow it through zone changes', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', { label: 'bolt' })
      .hand('Lightning Bolt', { label: 'other' })
      .battlefield('Mountain')
      .build();
    const before = g.id('bolt');
    g.act(0).cast('bolt', { targets: [{ player: 1 }], pay: true });
    expect(g.id('bolt')).not.toBe(before);
    expect(g.object('bolt').zone).toBe('stack');
    g.passAll();
    expect(g.object('bolt').zone).toBe('graveyard');
    expect(g.object('other').zone).toBe('hand');
  });

  test('fixtureCard resolves the same definitions the DSL uses', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').build();
    expect(g.state.definitions[0]).toBe(fixtureCard('Lightning Bolt'));
  });
});

describe('scenario builder: refusals', () => {
  const refused = (build: () => unknown, message: RegExp) => {
    expect(build).toThrow(ScenarioError);
    expect(build).toThrow(message);
  };

  test('an unknown card name, with a suggestion for a typo', () => {
    refused(
      () => scenario().seat(0).hand('Lightening Bolt').build(),
      /Unknown card "Lightening Bolt"\. Did you mean "Lightning Bolt"/,
    );
    refused(
      () => scenario().seat(0).hand('Nonexistent Wizard').build(),
      /Unknown card "Nonexistent Wizard"\./,
    );
  });

  test('one card flagged as commander twice, or three commanders', () => {
    refused(
      () => scenario().seat(0).commander('Isamaru, Hound of Konda', { count: 2 }).build(),
      /two commanders named "Isamaru, Hound of Konda"/,
    );
    refused(
      () =>
        scenario()
          .seat(0)
          .commander('Isamaru, Hound of Konda')
          .commander('Isamaru, Hound of Konda')
          .build(),
      /two commanders named/,
    );
    refused(
      () =>
        scenario()
          .seat(0)
          .commander('Isamaru, Hound of Konda')
          .commander('Yargle, Glutton of Urborg')
          .commander('Grizzly Bears')
          .build(),
      /more than two commanders/,
    );
  });

  test('instants and sorceries cannot be on the battlefield (CR 110.1)', () => {
    refused(() => scenario().seat(0).battlefield('Lightning Bolt').build(), /not a permanent card/);
  });

  test('battlefield-only options elsewhere', () => {
    refused(
      () =>
        scenario()
          .seat(0)
          .hand('Grizzly Bears', { tapped: true } as never)
          .build(),
      /only apply to the battlefield/,
    );
    refused(
      () =>
        scenario()
          .seat(0)
          .graveyard('Grizzly Bears', { damage: 1 } as never)
          .build(),
      /only apply to the battlefield/,
    );
  });

  test('casts without commander', () => {
    refused(
      () => scenario().seat(0).hand('Isamaru, Hound of Konda', { casts: 1 }).build(),
      /casts only applies to a commander/,
    );
  });

  test('seat problems', () => {
    refused(() => scenario().seat(2), /exactly two seats/);
    refused(() => scenario().hand('Forest'), /Call \.seat\(0\) or \.seat\(1\) before \.hand\(\)/);
    refused(
      () => scenario().seat(0).at('precombatMain', { active: 2 }).build(),
      /active seat 2 does not exist/,
    );
    refused(
      () => scenario().seat(0).at('precombatMain', { priority: 5 }).build(),
      /priority seat 5 does not exist/,
    );
  });

  test('steps without priority', () => {
    refused(
      () => scenario().seat(0).at('untap').build(),
      /No player has priority in the untap step/,
    );
    refused(
      () => scenario().seat(0).at('cleanup').build(),
      /No player has priority in the cleanup step/,
    );
  });

  test('labels: duplicates, counts, ids', () => {
    refused(
      () =>
        scenario().seat(0).hand('Forest', { label: 'x' }).hand('Plains', { label: 'x' }).build(),
      /Label "x" is used twice/,
    );
    refused(
      () => scenario().seat(0).hand('Forest', { label: 'x', count: 2 }).build(),
      /names one card but count is 2/,
    );
    refused(
      () => scenario().seat(0).hand('Forest', { label: 'o4' }).build(),
      /looks like an object id/,
    );
  });

  test('bad numbers and mana', () => {
    refused(() => scenario().seat(0).life(1.5).build(), /life 1\.5 is not an integer/);
    refused(
      () => scenario().seat(0).battlefield('Grizzly Bears', { damage: -1 }).build(),
      /damage .* must be an integer >= 0/,
    );
    refused(
      () => scenario().seat(0).hand('Forest', { count: 0 }).build(),
      /count .* must be an integer >= 1/,
    );
    refused(() => scenario().seat(0).pool('GX').build(), /"X" is not a mana symbol in "GX"/);
    refused(
      () => scenario().seat(0).at('precombatMain', { turn: 0 }).build(),
      /turn must be an integer >= 1/,
    );
  });

  test('commander damage needs exactly one commander of that name', () => {
    refused(
      () => scenario().seat(0).commanderDamageTaken('Yargle, Glutton of Urborg', 3).build(),
      /expected exactly one commander card with that name, found 0/,
    );
  });

  test('define refuses a structurally invalid card', () => {
    const bad = { ...fixtureCard('Grizzly Bears'), name: '' };
    refused(() => scenario().define(bad), /not a valid definition/);
  });
});
