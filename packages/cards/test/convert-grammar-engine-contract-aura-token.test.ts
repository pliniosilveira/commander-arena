// Issue 89 (Silverquill Influence), Scriv, the Obligator: "Whenever ~ enters or attacks, create a white Aura enchantment token named Contract attached to target creature an opponent
// controls. The token has enchant creature and \"Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it's attacking one of your opponents. Otherwise, its controller
// loses 2 life.\"" goes through the grammar as a card with no override (NO_OVERRIDES) and is played through applyAction, so the nodes the parser writes are what the engine runs.
// The Oracle line is the real one (the golden corpus holds the card); the other fields are the printed ones. The board is the engine's own fixtures (Grizzly Bears, the basic lands and a
// SYNTHETIC vanilla planeswalker).
// Pins: CR 303.4f (an Aura token enters attached to the object the effect names), CR 111.2 (the creator controls the token), CR 303.4e (the Aura's controller is separate from its host's),
// CR 508.1b (attacking a planeswalker is not attacking a player), CR 113.7a, 603.2 (the trigger of the Aura is its controller's), CR 608.2c (the else branch).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const SCRIV = parsed(
  'Scriv, the Obligator',
  'Legendary Creature — Inkling Bird',
  'Flying, deathtouch\nWhenever ~ enters or attacks, create a white Aura enchantment token named Contract attached to target creature an opponent controls. The token has enchant creature and "Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it\'s attacking one of your opponents. Otherwise, its controller loses 2 life."',
  { manaCost: '{2}{W}{B}', power: '2', toughness: '3', colors: ['W', 'B'] },
);

/** The Aura the token is: the same abilities, as a card, so a test can put it on the battlefield. */
const CONTRACT = parsed(
  'Contract Card',
  'Enchantment — Aura',
  "Enchant creature\nWhenever enchanted creature attacks, it gets +2/+0 until end of turn if it's attacking one of your opponents. Otherwise, its controller loses 2 life.",
  { manaCost: '{1}{W}', colors: ['W'] },
);

describe('Scriv, the Obligator: the lowering', () => {
  test('both triggers create the Aura token attached to the target, with its own abilities', () => {
    const triggers = (SCRIV.faces[0]?.abilities ?? []).filter((a) => a.kind === 'triggered');
    expect(triggers).toHaveLength(2);
    for (const t of triggers) {
      expect(t).toMatchObject({
        targets: [{ id: 't1', what: { filter: { types: ['creature'], controller: 'opponent' } } }],
        effect: {
          kind: 'createToken',
          count: 1,
          attachTo: { kind: 'target', id: 't1' },
          token: {
            kind: 'custom',
            definition: {
              name: 'Contract',
              types: ['enchantment'],
              subtypes: ['Aura'],
              colors: ['W'],
              abilities: [
                { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
                {
                  kind: 'triggered',
                  trigger: { kind: 'attacks', what: { kind: 'attached' } },
                  effect: {
                    kind: 'conditional',
                    condition: {
                      kind: 'objectMatches',
                      of: { kind: 'attached' },
                      filter: { attackingOpponents: 'players' },
                    },
                    effect: { kind: 'modifyPt', power: 2, toughness: 0 },
                    else: { kind: 'loseLife', amount: 2 },
                  },
                },
              ],
            },
          },
        },
      });
    }
  });
});

describe('Scriv, the Obligator: Contract is created attached to the target (CR 303.4f)', () => {
  test('attacking with Scriv attaches a Contract the controller owns to the creature of an opponent', () => {
    const g = scenario()
      .define(SCRIV)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SCRIV.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: SCRIV.name, target: { player: 1 } }]);
    g.passAll();
    const contract = Object.values(g.state.objects).find(
      (o) => o.token?.characteristics.name === 'Contract',
    );
    expect(contract).toBeDefined();
    if (contract === undefined) return;
    const bears = Object.values(g.state.objects).find(
      (o) => o.zone === 'battlefield' && o.owner === 1,
    );
    expect(contract.attachedTo).toBe(bears?.id);
    // No control-changing effect is in play: the player it entered under controls it (CR 111.2).
    expect(contract.controller).toBe(0);
  });
});

describe('Contract: "Whenever enchanted creature attacks, it gets +2/+0 ... if it\'s attacking one of your opponents. Otherwise, its controller loses 2 life." (CR 508.1b)', () => {
  /** Seat 0 controls the Contract; it enchants the Bears of seat `host`, whose controller is the active player and attacks `target`. */
  const attack = (host: 0 | 1, target: 'player' | 'walker') => {
    const b = scenario()
      .define(CONTRACT)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CONTRACT.name, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WALKER);
    const g = (host === 0 ? b.seat(0).battlefield(BEARS) : b.seat(1).battlefield(BEARS))
      .at('precombatMain', { active: host })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const other = host === 0 ? 1 : 0;
    g.act(host).declareAttackers([
      { attacker: BEARS, target: target === 'walker' ? WALKER : { player: other } },
    ]);
    g.passAll();
    return g;
  };

  test('a creature of mine attacking an opponent of mine gets +2/+0 and I lose no life', () => {
    const g = attack(0, 'player');
    g.expect.pt(BEARS, 4, 2);
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });

  test("an opponent's creature attacking me is not attacking one of my opponents: its controller loses 2 life", () => {
    const g = attack(1, 'player');
    g.expect.pt(BEARS, 2, 2);
    g.expect.life(1, 38);
    g.expect.life(0, 40);
  });

  test('attacking a planeswalker is not attacking a player: the else branch, whoever controls the creature', () => {
    const g = attack(0, 'walker');
    g.expect.pt(BEARS, 2, 2);
    g.expect.life(0, 38);
    g.expect.life(1, 40);
  });
});
