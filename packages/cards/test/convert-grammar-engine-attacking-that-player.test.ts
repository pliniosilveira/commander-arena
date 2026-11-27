// "Whenever you attack a player, create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player." and "Other enchantment creatures you control have
// flying." (Soaring Lightbringer). SYNTHETIC cards: the real Oracle wording on shells that say SYNTHETIC.
// Pins: CR 508.6 and 603.2c (one trigger for each player attacked as a player, however many creatures attack that player; an attack on a planeswalker is not an attack on its
// controller), CR 508.4 and 110.5b (the token enters tapped and attacking the player the effect names, and was never declared as an attacker, so no attack trigger sees it),
// CR 111.4 and 205.2a (a token with two card types). Built for more than one opponent: three and four seats.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const TEXT =
  "Flying\nOther enchantment creatures you control have flying.\nWhenever you attack a player, create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player.";
const BRINGER = parsed('SYNTHETIC Lightbringer', 'Enchantment Creature — Bird Glimmer', TEXT, {
  manaCost: '{4}{W}',
  power: '4',
  toughness: '5',
});
// Counts the creatures that "attacked": a token put onto the battlefield attacking never did (CR 508.4).
const WATCHER = parsed(
  'SYNTHETIC Attack Watcher',
  'Enchantment',
  'Whenever a creature you control attacks, you gain 1 life.',
  { manaCost: '{0}' },
);
const WALKER = parsed(
  'SYNTHETIC Quiet Walker',
  'Legendary Planeswalker — Quiet',
  '+1: Draw a card.',
  {
    manaCost: '{3}',
    loyalty: '4',
  },
);
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const ISLANDS = Array.from({ length: 10 }, () => 'Island');

describe('the text is read', () => {
  test('one trigger for each player attacked, and a token attacking that player', () => {
    expect(BRINGER.faces[0]?.abilities).toMatchObject([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['enchantment', 'creature'], controller: 'you' },
            other: true,
          },
          keyword: { kind: 'flying' },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'you', atLeast: 1, eachAttackedPlayer: true },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Glimmer',
              types: ['enchantment', 'creature'],
              subtypes: ['Glimmer'],
              colors: ['W'],
              power: 1,
              toughness: 1,
            },
          },
          count: 1,
          tapped: true,
          attacking: { at: { kind: 'triggerAttackedPlayer' } },
        },
      },
    ]);
    // The words name the player: the controller chooses nothing (CR 508.4).
    expect(JSON.stringify(BRINGER.faces[0]?.abilities)).not.toContain('controllerChooses');
    expect(validateCard(BRINGER)).toEqual([]);
  });

  test.each([
    // No player the trigger is about: "that player" names nobody the token could attack.
    "Whenever ~ attacks, create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player.",
    "Whenever you attack, create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player.",
    "When ~ enters, create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player.",
    // A choice between the player and a planeswalker is not read.
    "Whenever you attack a player, create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player or a planeswalker they control.",
  ])('is not read: %s', (text) => {
    const card = importCard(
      syntheticCard({
        name: 'SYNTHETIC Not Read',
        typeLine: 'Creature — Bird',
        oracleText: text.replaceAll('~', 'SYNTHETIC Not Read'),
        power: '1',
        toughness: '1',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(card.support.status).toBe('unsupported');
  });
});

describe('"Whenever you attack a player, create a token that\'s tapped and attacking that player"', () => {
  const game = (seats: 3 | 4, extra: (b: ReturnType<typeof scenario>) => void = () => {}) => {
    const b = scenario({ seats }).define(BRINGER).define(WATCHER).define(WALKER);
    b.seat(0)
      .battlefield(BRINGER.name, WATCHER.name, BEARS, GOBLIN)
      .library(...ISLANDS);
    for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...ISLANDS);
    extra(b);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };
  type Game = ReturnType<typeof game>;
  const tokens = (g: Game) => g.find({ name: 'Glimmer', zone: 'battlefield' });
  /** The triggers of one declaration go on the stack in an order their controller chooses (CR 603.3b); then everything resolves. */
  const settle = (g: Game) => {
    const d = g.state.pending;
    if (d?.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(...d.triggers.map((_, index) => index));
    }
    g.passAll();
  };
  const attackedSeats = (g: Game) =>
    tokens(g)
      .map((t) => g.state.combat?.attackers.find((a) => a.object === t.id)?.target)
      .map((target) => (target?.kind === 'player' ? target.seat : null));

  test('two different opponents attacked: two triggers, each token attacks its own player (three seats)', () => {
    const g = game(3);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    settle(g);
    const made = tokens(g);
    expect(made).toHaveLength(2);
    expect(made.every((t) => t.tapped)).toBe(true);
    expect([...attackedSeats(g)].sort()).toEqual([1, 2]);
    // Never declared as attackers (CR 508.4): the turn log has only the two declared creatures, and "whenever a creature you control attacks" saw two.
    expect(g.state.turnLog.attackedWith.some((a) => made.some((t) => t.id === a.object))).toBe(
      false,
    );
    g.expect.life(0, 42);
    // The token is an enchantment creature, so the static ability gives it flying; the Bears are not.
    for (const t of made) {
      g.expect.derived(t.id, { types: ['enchantment', 'creature'], keywords: ['flying'] });
    }
    g.expect.derived(BEARS, { keywords: [] });
    g.advanceTo('endOfCombat');
    // Bears (2) and a token (1) at seat 1; Raging Goblin (1) and a token (1) at seat 2.
    g.expect.life(1, 37);
    g.expect.life(2, 38);
    g.expect.invariants();
  });

  test('two creatures at the same player: one trigger, one token', () => {
    const g = game(3);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 2 } },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    settle(g);
    expect(tokens(g)).toHaveLength(1);
    expect(attackedSeats(g)).toEqual([2]);
  });

  test('three opponents attacked: three tokens (four seats)', () => {
    const g = game(4);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 2 } },
      { attacker: BRINGER.name, target: { player: 3 } },
    ]);
    settle(g);
    expect(tokens(g)).toHaveLength(3);
    expect([...attackedSeats(g)].sort()).toEqual([1, 2, 3]);
    g.expect.invariants();
  });

  test('a creature attacking a planeswalker does not attack a player (CR 508.6)', () => {
    const g = game(3, (b) => b.seat(1).battlefield(WALKER.name));
    g.act(0).declareAttackers([{ attacker: BEARS, target: WALKER.name }]);
    settle(g);
    expect(tokens(g)).toHaveLength(0);
  });

  test('a planeswalker of one opponent and another opponent attacked: one token, at the player', () => {
    const g = game(3, (b) => b.seat(1).battlefield(WALKER.name));
    g.act(0).declareAttackers([
      { attacker: BEARS, target: WALKER.name },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    settle(g);
    expect(tokens(g)).toHaveLength(1);
    expect(attackedSeats(g)).toEqual([2]);
  });

  test('"that player" in the body is the player attacked, bound for each trigger', () => {
    const drain = parsed(
      'SYNTHETIC Attack Drain',
      'Enchantment',
      'Whenever you attack a player, that player loses 1 life.',
      { manaCost: '{0}' },
    );
    expect(drain.faces[0]?.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', eachAttackedPlayer: true },
        effect: { kind: 'loseLife', player: { kind: 'triggerAttackedPlayer' } },
      },
    ]);
    const g = scenario({ seats: 3 })
      .define(drain)
      .seat(0)
      .battlefield(drain.name, BEARS, GOBLIN)
      .library(...ISLANDS)
      .seat(1)
      .library(...ISLANDS)
      .seat(2)
      .library(...ISLANDS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    settle(g);
    g.expect.life(0, 40);
    g.expect.life(1, 39);
    g.expect.life(2, 39);
  });

  test('no attack: no token', () => {
    const g = game(3);
    g.act(0).noAttackers();
    expect(tokens(g)).toHaveLength(0);
  });
});
