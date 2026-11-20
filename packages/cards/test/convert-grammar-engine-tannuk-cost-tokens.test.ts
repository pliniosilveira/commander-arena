// The Tannuk deck (issue 347), the cost and token group: the REAL cards of the golden corpus (Goblin Anarchomancer, Verdant Kraken, Horizon Explorer, Seedship Impact, Larval
// Scoutlander) read through the grammar only and played through applyAction. Stand-ins (a spell of both colors, an artifact of mana value 3, a card that makes a Lander) are
// SYNTHETIC and named so. Pins: CR 118.7a and 601.2f (a reduction of generic mana, applied once to a spell of both colors), CR 111.10u (the Lander token), CR 305.6 (the intrinsic mana
// ability of a land token that has a basic land type), CR 508.1b and 508.6 (an attack on a player, once for each player attacked), CR 608.2c and 608.2d ("if you do"), CR 701.23 (Search).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const DIVINATION = 'Divination';
const SOL_RING = 'Sol Ring';

/** What the view says a card in `seat`'s hand costs to cast now. */
function costOf(g: ScenarioGame, name: string, seat: 0 | 1 = 0): readonly string[] | undefined {
  const hand = getView(g.state, seat).seats[seat]?.hand ?? [];
  return hand.find((o) => o.name === name)?.castCost ?? undefined;
}

/** The names of the permanents `seat` controls. */
const onBattlefield = (g: ScenarioGame, seat: 0 | 1): string[] =>
  getView(g.state, seat)
    .battlefield.filter((o) => o.controller === seat)
    .map((o) => o.name);

/** Whether the permanent is summoning sick now (CR 302.6). */
const summoningSick = (g: ScenarioGame, name: string): boolean | undefined =>
  getView(g.state, 0).battlefield.find((o) => o.name === name)?.summoningSick;

const count = (names: readonly string[], name: string): number =>
  names.filter((n) => n === name).length;

describe('Goblin Anarchomancer ("Each spell you cast that\'s red or green costs {1} less to cast.")', () => {
  const ANARCHOMANCER = real('Goblin Anarchomancer');
  const GRUUL = parsed('SYNTHETIC Gruul Charm Bear', 'Creature — Bear', '', {
    manaCost: '{2}{R}{G}',
    colors: ['R', 'G'],
    power: '3',
    toughness: '3',
  });

  test('read as one reduction of {1} for the spells of the controller that are red or green', () => {
    expect(ANARCHOMANCER.faces[0]?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { controller: 'you', anyOf: [{ colors: ['R'] }, { colors: ['G'] }] },
          amount: 1,
        },
      },
    ]);
  });

  const game = () =>
    scenario()
      .define(ANARCHOMANCER)
      .define(GRUUL)
      .seat(0)
      .hand(BOLT, BEARS, MURDER, DIVINATION, SOL_RING, GRUUL.name)
      .battlefield(ANARCHOMANCER.name, 'Mountain', 'Forest')
      .library(...FILLER)
      .seat(1)
      .hand(BEARS, GRUUL.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a green spell costs {1} less, a red spell keeps its colored mana, the others cost what they did', () => {
    const g = game();
    expect(costOf(g, BEARS)).toEqual(['G']);
    expect(costOf(g, BOLT)).toEqual(['R']);
    expect(costOf(g, MURDER)).toEqual(['1', 'B', 'B']);
    expect(costOf(g, DIVINATION)).toEqual(['2', 'U']);
    expect(costOf(g, SOL_RING)).toEqual(['1']);
  });

  test('a spell that is both red and green costs {1} less, once (the ruling of 2021-06-18)', () => {
    const g = game();
    expect(costOf(g, GRUUL.name)).toEqual(['1', 'R', 'G']);
  });

  test('only the spells of the controller: the opponent pays the full cost', () => {
    const g = game();
    expect(costOf(g, BEARS, 1)).toEqual(['1', 'G']);
    expect(costOf(g, GRUUL.name, 1)).toEqual(['2', 'R', 'G']);
  });

  test('the reduced spell is cast and paid with what the player has: a Grizzly Bears for one Forest', () => {
    const g = game();
    g.expect.legal(0, { cast: BEARS });
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', true);
    g.expect.invariants();
  });

  test('without the creature on the battlefield nothing is reduced', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .seat(1)
      .library(...FILLER)
      .build();
    expect(costOf(g, BEARS)).toEqual(['1', 'G']);
  });
});

describe("Verdant Kraken (a land creature token at the beginning of each player's upkeep)", () => {
  const KRAKEN = real('Verdant Kraken');
  const TOKEN = 'Forest Tentacle';

  test('read as a trigger of each upkeep that makes a green 3/3 Forest Tentacle land creature token', () => {
    expect(KRAKEN.faces[0]?.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: TOKEN,
              types: ['land', 'creature'],
              subtypes: ['Forest', 'Tentacle'],
              supertypes: [],
              colors: ['G'],
              power: 3,
              toughness: 3,
              // CR 305.6: the intrinsic ability of the basic land type Forest.
              abilities: [
                {
                  kind: 'mana',
                  cost: [{ kind: 'tap' }],
                  production: { kind: 'fixed', mana: ['G'] },
                },
              ],
            },
          },
          count: 1,
        },
      },
    ]);
  });

  const game = () =>
    scenario()
      .define(KRAKEN)
      .seat(0)
      .battlefield(KRAKEN.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 1, turn: 2 })
      .build();

  test("in the controller's upkeep and in the opponent's upkeep the controller gets a token each time", () => {
    const g = game();
    g.advanceTo('upkeep', { turn: 3 });
    g.passAll();
    expect(count(onBattlefield(g, 0), TOKEN)).toBe(1);
    g.advanceTo('upkeep', { turn: 4 });
    g.passAll();
    // The token of the opponent's upkeep is the controller's, not the opponent's.
    expect(count(onBattlefield(g, 0), TOKEN)).toBe(2);
    expect(count(onBattlefield(g, 1), TOKEN)).toBe(0);
    g.expect.invariants();
  });

  test('the token is a green 3/3 land creature that is not a basic land', () => {
    const g = game();
    g.advanceTo('upkeep', { turn: 3 });
    g.passAll();
    g.expect.derived(TOKEN, {
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Tentacle'],
      supertypes: [],
      colors: ['G'],
    });
    g.expect.pt(TOKEN, 3, 3);
  });

  test('it is a creature with summoning sickness: no mana the turn it comes, mana from the next turn of its controller', () => {
    const g = game();
    g.advanceTo('upkeep', { turn: 3 });
    g.passAll();
    expect(summoningSick(g, TOKEN)).toBe(true);
    expect(g.act(0).try.tapForMana(TOKEN).ok).toBe(false);
    g.advanceTo('precombatMain', { turn: 5 });
    expect(summoningSick(g, TOKEN)).toBe(false);
    // The oldest token, the one of turn 3, has been under its controller's control since the start of turn 5.
    g.act(0).tapForMana({ name: TOKEN, nth: 0 });
    g.expect.pool(0, { G: 1 });
    g.expect.invariants();
  });
});

describe('the Lander token (CR 111.10u) of Horizon Explorer ("Whenever you attack a player")', () => {
  const EXPLORER = real('Horizon Explorer');
  const WALKER = 'SYNTHETIC Vanilla Planeswalker';
  const LANDER = 'Lander';

  test('read as a trigger for each player attacked and a Lander preset', () => {
    expect(EXPLORER.faces[0]?.abilities).toMatchObject([
      { kind: 'replacement', replacement: { kind: 'groupEntersUntapped' } },
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'you', atLeast: 1, eachAttackedPlayer: true },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Lander' }, count: 1 },
      },
    ]);
  });

  const game = (attackers: readonly string[], target?: string) => {
    const g = scenario()
      .define(EXPLORER)
      .seat(0)
      .battlefield(EXPLORER.name, BEARS, 'Giant Spider')
      .library(...FILLER)
      .seat(1)
      .battlefield(WALKER)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers(
      attackers.map((a) => (target === undefined ? { attacker: a } : { attacker: a, target })),
    );
    g.passAll();
    return g;
  };

  test('attacking the player makes one Lander, however many creatures attack', () => {
    const g = game([BEARS, 'Giant Spider']);
    const lander = getView(g.state, 0).battlefield.find((o) => o.name === LANDER);
    expect(count(onBattlefield(g, 0), LANDER)).toBe(1);
    expect(lander).toBeDefined();
    g.expect.derived(LANDER, { types: ['artifact'], subtypes: ['Lander'], colors: [] });
    g.expect.invariants();
  });

  test('attacking a planeswalker is not attacking a player: no Lander', () => {
    const g = game([BEARS], WALKER);
    expect(count(onBattlefield(g, 0), LANDER)).toBe(0);
  });

  test('no attack, no Lander', () => {
    const g = scenario()
      .define(EXPLORER)
      .seat(0)
      .battlefield(EXPLORER.name, BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('endOfCombat');
    expect(count(onBattlefield(g, 0), LANDER)).toBe(0);
  });

  test('the Lander is sacrificed for {2} and {T} to put a basic land from the library onto the battlefield tapped, then the library is shuffled (CR 111.10u)', () => {
    const maker = parsed('SYNTHETIC Lander Maker', 'Sorcery', 'Create a Lander token.', {
      manaCost: '{0}',
    });
    const g = scenario()
      .define(maker)
      .seat(0)
      .hand(maker.name)
      .battlefield('Island', 'Island')
      .library('Mountain', 'Forest', 'Swamp')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(maker.name, { pay: true });
    g.passAll();
    expect(count(onBattlefield(g, 0), LANDER)).toBe(1);
    g.act(0).activate(LANDER, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id('Forest'));
    expect(onBattlefield(g, 0)).not.toContain(LANDER);
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', true);
    g.expect.librarySize(0, 2);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });
});

describe('Horizon Explorer with a Lander (the ruling of 2025-07-25: a land put onto the battlefield tapped enters untapped)', () => {
  test('the land the Lander finds enters untapped under Horizon Explorer', () => {
    const explorer = real('Horizon Explorer');
    const maker = parsed('SYNTHETIC Lander Maker', 'Sorcery', 'Create a Lander token.', {
      manaCost: '{0}',
    });
    const g = scenario()
      .define(explorer)
      .define(maker)
      .seat(0)
      .hand(maker.name)
      .battlefield(explorer.name, 'Island', 'Island')
      .library('Mountain', 'Forest')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(maker.name, { pay: true });
    g.passAll();
    g.act(0).activate('Lander', { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id('Forest'));
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', false);
    g.expect.invariants();
  });
});

describe('Seedship Impact ("Destroy target artifact or enchantment. If its mana value was 2 or less, create a Lander token.")', () => {
  const IMPACT = real('Seedship Impact');
  const LANDER = 'Lander';
  const TRINKET = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{3}' });
  const CHARM = parsed('SYNTHETIC Charm', 'Enchantment', '', { manaCost: '{1}{W}' });
  const BAUBLE = parsed('SYNTHETIC Bauble', 'Artifact', '', { manaCost: '{3}' });

  const game = (target: string, seat: 0 | 1 = 1) =>
    scenario()
      .define(IMPACT)
      .define(TRINKET)
      .define(CHARM)
      .define(BAUBLE)
      .seat(0)
      .hand(IMPACT.name)
      .battlefield('Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .battlefield(...(seat === 1 ? [target] : []))
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('an artifact of mana value 1 is destroyed and the controller of the spell gets a Lander', () => {
    const g = game(SOL_RING);
    g.act(0).cast(IMPACT.name, { targets: [SOL_RING], pay: true });
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    expect(count(onBattlefield(g, 0), LANDER)).toBe(1);
    expect(count(onBattlefield(g, 1), LANDER)).toBe(0);
    g.expect.invariants();
  });

  test('an enchantment of mana value 2 is destroyed and makes a Lander (2 or less)', () => {
    const g = game(CHARM.name);
    g.act(0).cast(IMPACT.name, { targets: [CHARM.name], pay: true });
    g.passAll();
    g.expect.zone(CHARM.name, 'graveyard', { seat: 1 });
    expect(count(onBattlefield(g, 0), LANDER)).toBe(1);
  });

  test('an artifact of mana value 3 is destroyed and makes no Lander', () => {
    const g = game(TRINKET.name);
    g.act(0).cast(IMPACT.name, { targets: [TRINKET.name], pay: true });
    g.passAll();
    g.expect.zone(TRINKET.name, 'graveyard', { seat: 1 });
    expect(count(onBattlefield(g, 0), LANDER)).toBe(0);
    g.expect.invariants();
  });
});

describe('Larval Scoutlander (sacrifice a land or Lander, if you do search for up to two basic lands)', () => {
  const SCOUT = real('Larval Scoutlander');
  const LANDER = 'Lander';
  const MAKER = parsed('SYNTHETIC Lander Maker', 'Sorcery', 'Create a Lander token.', {
    manaCost: '{0}',
  });

  test('read as an enters trigger with an optional sacrifice, a test of it and a search; Station and its level are kept', () => {
    const abilities = SCOUT.faces[0]?.abilities ?? [];
    expect(abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'may',
            effect: {
              kind: 'sacrifice',
              objects: {
                kind: 'choose',
                filter: { anyOf: [{ types: ['land'] }, { subtypes: ['Lander'] }] },
              },
            },
          },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: {
              kind: 'search',
              max: 2,
              destinations: [{ zone: 'battlefield', tapped: true, count: 2 }],
              shuffle: true,
            },
          },
        ],
      },
    });
    expect(abilities[1]).toMatchObject({ kind: 'keyword', keyword: { kind: 'station' } });
    expect(abilities[2]).toMatchObject({ kind: 'stationLevel', threshold: 7 });
  });

  const game = (library: readonly string[]) =>
    scenario()
      .define(SCOUT)
      .define(MAKER)
      .seat(0)
      .hand(SCOUT.name, MAKER.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Swamp')
      .library(...library)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  const enter = (g: ScenarioGame) => {
    g.act(0).cast(SCOUT.name, { pay: true });
    g.passAll();
  };

  test('sacrificing a land finds two basic lands, tapped, and shuffles', () => {
    const g = game(['Mountain', 'Plains', 'Mountain', 'Island']);
    enter(g);
    g.act(0).accept();
    g.act(0).choosePermanents(g.id('Swamp'));
    g.passAll();
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.act(0).chooseCards(g.id({ name: 'Mountain', nth: 0 }), g.id('Plains'));
    const lands = onBattlefield(g, 0);
    expect(count(lands, 'Mountain')).toBe(1);
    expect(count(lands, 'Plains')).toBe(1);
    g.expect.tapped({ name: 'Plains', zone: 'battlefield' }, true);
    g.expect.tapped({ name: 'Mountain', zone: 'battlefield' }, true);
    g.expect.librarySize(0, 2);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 2 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('declining the sacrifice does nothing: the library is not searched', () => {
    const g = game(['Mountain', 'Plains']);
    enter(g);
    g.act(0).decline();
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.librarySize(0, 2);
    g.expect.noEvent({ kind: 'librarySearched', seat: 0 }, { since: 0 });
    g.expect.invariants();
  });

  test('a Lander can be sacrificed instead of a land', () => {
    const g = game(['Mountain', 'Plains']);
    // The Lander is on the battlefield before the Spacecraft is cast: made by a sorcery for no mana.
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    expect(count(onBattlefield(g, 0), LANDER)).toBe(1);
    enter(g);
    g.act(0).accept();
    g.act(0).choosePermanents(g.id(LANDER));
    g.passAll();
    g.act(0).chooseCards(g.id('Mountain'), g.id('Plains'));
    expect(onBattlefield(g, 0)).not.toContain(LANDER);
    // The token ceased to exist in the graveyard (CR 111.7); no land was sacrificed.
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.librarySize(0, 0);
    g.expect.invariants();
  });

  test('it finds fewer than two when the library has fewer basic lands (up to two, CR 701.23b)', () => {
    const g = game(['Mountain', 'Island']);
    enter(g);
    g.act(0).accept();
    g.act(0).choosePermanents(g.id('Swamp'));
    g.passAll();
    g.act(0).chooseCards(g.id('Mountain'));
    expect(count(onBattlefield(g, 0), 'Mountain')).toBe(1);
    g.expect.invariants();
  });
});
