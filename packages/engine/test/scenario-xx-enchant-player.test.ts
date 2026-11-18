// "Enchant player. Whenever enchanted player is attacked, ..." (issue 160, D-629): an Aura that enchants a player.
// Pins: CR 303.4 and 303.4b (an Aura enters attached to an object or player; the player is enchanted), CR 303.4a and 702.5a (the enchant ability defines the Aura spell's target:
// a player), CR 303.4c and 704.5m (an Aura on an illegal player, or on a player who left the game, goes to the graveyard), CR 702.16c (a player with protection can't be
// enchanted by an Aura with that quality), CR 303.4e (the Aura's controller is not the enchanted player), CR 508.1 and 603.2 (attackers are declared together: the ability
// triggers once for the declaration), CR 506.2 and 508.1b (attacking a planeswalker is not attacking its controller). Cards are SYNTHETIC (src/cards/fixtures/synthetic-curse.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { illegalAuras } from '../src/rules/attach';
import { scenario } from '../src/testing/index';

const PLENTY = 'SYNTHETIC Curse of Plenty'; // {2}{G}: untap my nonland permanents and the attacker's when the enchanted player is attacked
const TITHES = 'SYNTHETIC Curse of Tithes'; // {1}{W}: I gain 1 life each time the enchanted player is attacked
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([PLENTY, TITHES])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 has the Curse in hand and the lands; seat 1 is the player it will enchant. */
const castGame = (curse: string) =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(curse)
    .battlefield('Plains', { count: 2 })
    .battlefield('Forest')
    .battlefield(BEARS)
    .battlefield(HAWK)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(WALKER)
    .battlefield(BEARS)
    .at('precombatMain', { active: 0 })
    .build();

const enchanted = (g: ReturnType<typeof castGame>, name: string) => {
  const obj = g.state.objects[g.id(name)];
  return obj?.attachedToPlayer;
};

describe('the Aura spell targets a player and enters attached to them (CR 303.4a, 303.4b)', () => {
  test('the cast asks for a player; the Curse enters enchanting the one chosen, and is controlled by the caster', () => {
    const g = castGame(TITHES);
    g.act(0).cast(TITHES, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(enchanted(g, TITHES)).toBe(1);
    expect(g.state.objects[g.id(TITHES)]?.attachedTo).toBeNull();
    expect(g.state.objects[g.id(TITHES)]?.zone).toBe('battlefield');
    g.expect.invariants();
  });

  test('only players are legal targets of the Aura spell, never a permanent', () => {
    const g = castGame(TITHES);
    g.act(0).cast(TITHES);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected the targets decision');
    const kinds = d.specs.flatMap((spec) => spec.legal.map((t) => t.kind));
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['player']));
  });

  test('it can enchant any player, the caster included (CR 303.4e: its controller is not necessarily the enchanted player)', () => {
    const g = castGame(TITHES);
    g.act(0).cast(TITHES, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(enchanted(g, TITHES)).toBe(0);
  });
});

describe('"Whenever enchanted player is attacked" (CR 508.1, 603.2)', () => {
  const enchantedGame = (curse: string) => {
    const g = castGame(curse);
    g.act(0).cast(curse, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    return g;
  };

  test('two attackers declared at the enchanted player trigger it once: one life', () => {
    const g = enchantedGame(TITHES);
    g.advanceTo('declareAttackers', { attack: false });
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).attack([BEARS, HAWK]);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(before + 1);
  });

  test('an attack on a planeswalker of the enchanted player is not an attack on the player (CR 508.1b)', () => {
    const g = enchantedGame(TITHES);
    g.advanceTo('declareAttackers', { attack: false });
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).attack([BEARS, HAWK], WALKER);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(before);
  });

  test('one attacker at the player and one at the planeswalker: the player was attacked, so it triggers once', () => {
    const g = enchantedGame(TITHES);
    g.advanceTo('declareAttackers', { attack: false });
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).declareAttackers([{ attacker: BEARS }, { attacker: HAWK, target: WALKER }]);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(before + 1);
  });

  test('a player who is not enchanted attacked: nothing (the Curse is on seat 0, seat 0 attacks seat 1)', () => {
    const g = castGame(TITHES);
    g.act(0).cast(TITHES, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).attack([BEARS]);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(before);
  });

  test('the Curse of Plenty untaps my nonland permanents (the attackers among them, CR 701.26a)', () => {
    const g = enchantedGame(PLENTY);
    g.advanceTo('declareAttackers', { attack: false });
    const mine = { name: BEARS, zone: 'battlefield' as const, seat: 0 as const };
    g.act(0).attack([mine]);
    g.expect.tapped(mine, true);
    g.passAll();
    // The trigger resolved: the Bears are untapped again, and so is everything else of mine that is not a land.
    g.expect.tapped(mine, false);
    g.expect.invariants();
  });
});

describe('an Aura on a player that can no longer be enchanted goes to the graveyard (CR 303.4c, 704.5m, 702.16c)', () => {
  const withCurse = () => {
    const g = castGame(TITHES);
    g.act(0).cast(TITHES, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    return g;
  };

  test('the Curse stays while the player is in the game and has no protection', () => {
    const g = withCurse();
    expect(illegalAuras(g.state)).toEqual([]);
  });

  test('a player who left the game can no longer be enchanted: the Curse is an illegal Aura', () => {
    const g = withCurse();
    const left = {
      ...g.state,
      seats: g.state.seats.map((seat, i) => (i === 1 ? { ...seat, hasLost: true } : seat)),
    };
    expect(illegalAuras(left).map((o) => o.id)).toEqual([g.id(TITHES)]);
  });

  test('protection from everything: the Curse is an illegal Aura (CR 702.16c)', () => {
    const g = withCurse();
    const shielded = {
      ...g.state,
      continuousEffects: [
        ...g.state.continuousEffects,
        {
          id: 'ce-shield',
          timestamp: 999,
          objects: [],
          until: 'permanent' as const,
          players: [1],
          change: { kind: 'playerProtectionEverything' as const },
        },
      ],
    };
    expect(illegalAuras(shielded).map((o) => o.id)).toEqual([g.id(TITHES)]);
  });

  test('an Aura that enchants a player but is attached to no one is illegal; it goes to the graveyard as the state-based action runs', () => {
    const g = withCurse();
    const loose = {
      ...g.state,
      objects: {
        ...g.state.objects,
        [g.id(TITHES)]: { ...g.state.objects[g.id(TITHES)], attachedToPlayer: undefined },
      },
    } as typeof g.state;
    expect(illegalAuras(loose).map((o) => o.id)).toEqual([g.id(TITHES)]);
  });

  test('the Curse leaving the battlefield leaves no memory of the player (CR 400.7): a new object is attached to no one', () => {
    const g = withCurse();
    expect(enchanted(g, TITHES)).toBe(1);
    expect(g.state.objects[g.id(TITHES)]?.attachedTo).toBeNull();
  });
});

describe('what a card may say (D-629)', () => {
  const card = (abilities: unknown) => {
    const base = syntheticCard(TITHES);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...base, faces: [{ ...face, abilities }] } as typeof base;
  };
  const messages = (c: ReturnType<typeof card>) =>
    validateCard(c)
      .map((m) => m.message)
      .join(' | ');
  const enchantPlayer = { kind: 'keyword', keyword: { kind: 'enchant', filter: {}, player: true } };
  const watch = {
    kind: 'triggered',
    trigger: { kind: 'attackBatch', who: 'any', atLeast: 1, attackedEnchantedPlayer: true },
    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
  };

  test('"Enchant player" has an empty filter of permanents', () => {
    expect(messages(card([enchantPlayer]))).toBe('');
    expect(
      messages(
        card([
          {
            kind: 'keyword',
            keyword: { kind: 'enchant', filter: { types: ['creature'] }, player: true },
          },
        ]),
      ),
    ).toMatch(/empty filter/);
  });

  test('the trigger "whenever enchanted player is attacked" needs an Aura that enchants a player', () => {
    expect(messages(card([enchantPlayer, watch]))).toBe('');
    expect(
      messages(
        card([
          { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
          watch,
        ]),
      ),
    ).toMatch(/enchants a player/);
  });
});
