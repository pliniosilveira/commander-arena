// "Whenever you attack with two or more creatures" and "Whenever another player attacks with two or more creatures, they draw a card if none of
// those creatures attacked you" (D-149).
// Pins: CR 508.1 (attackers are declared together), CR 603.2 (the ability triggers once for the declaration, however many creatures),
// CR 508.1b (a creature attacks a player, a planeswalker or a battle: attacking a planeswalker is not attacking its controller), CR 603.4 (no
// intervening "if": the condition after the effect is read as the ability resolves, from the declaration). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-attack-batch.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const MARSHAL = 'SYNTHETIC Raid Marshal';
const CAPTAIN = 'SYNTHETIC Choir Captain';
const SENTINEL = 'SYNTHETIC Batch Sentinel';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([MARSHAL, CAPTAIN, SENTINEL])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const myAttack = (...attackers: string[]) => {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(MARSHAL, ...attackers)
    .seat(1)
    .library(...LIBRARY)
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
};

describe('"Whenever you attack with two or more creatures"', () => {
  test('two attackers: one card', () => {
    const g = myAttack(BEARS);
    g.act(0).attack([BEARS, MARSHAL]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('three attackers: still one card (it triggers once for the declaration)', () => {
    const g = myAttack(BEARS, HAWK);
    g.act(0).attack([BEARS, MARSHAL, HAWK]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('one attacker: nothing', () => {
    const g = myAttack(BEARS);
    g.act(0).attack([BEARS]);
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('no attackers: nothing', () => {
    const g = myAttack(BEARS);
    g.act(0).noAttackers();
    g.expect.handSize(0, 0);
  });

  test("the opponent's declaration is not mine: it triggers my other ability, not this one", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MARSHAL)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS, HAWK]);
    g.passAll();
    // They attacked me (the only player), so the condition "none attacked you" fails: no card for them, none for me.
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
  });
});

describe('"they draw a card if none of those creatures attacked you"', () => {
  const theirAttack = (targets: readonly ('me' | 'walker')[]) => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MARSHAL, WALKER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const attackers = [BEARS, HAWK] as const;
    g.act(1).declareAttackers(
      attackers.map((attacker, i) => ({
        attacker,
        target: targets[i] === 'walker' ? WALKER : { player: 0 },
      })),
    );
    g.passAll();
    return g;
  };

  test('both at my planeswalker: none attacked me, so the attacking player draws a card', () => {
    const g = theirAttack(['walker', 'walker']);
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });

  test('one at me and one at the planeswalker: one attacked me, so nobody draws', () => {
    const g = theirAttack(['me', 'walker']);
    g.expect.handSize(1, 0);
  });

  test('both at me: nobody draws', () => {
    const g = theirAttack(['me', 'me']);
    g.expect.handSize(1, 0);
  });

  test('a creature removed from combat before the ability resolves still attacked me', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MARSHAL, WALKER)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: HAWK, target: WALKER },
    ]);
    // In response to the trigger I kill the creature that attacked me.
    g.act(1).pass();
    g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.handSize(1, 0);
  });
});

describe('with a filter and a player', () => {
  test('"three or more Angels": two Angels and a Bear do not count', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CAPTAIN, ANGEL, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([CAPTAIN, ANGEL, BEARS]);
    g.passAll();
    g.expect.life(0, 40);
  });

  test('"three or more Angels": three do', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CAPTAIN, ANGEL, SENTINEL, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([CAPTAIN, ANGEL, SENTINEL]);
    g.passAll();
    g.expect.life(0, 42);
  });

  test('"that player" is the attacking player', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SENTINEL)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS, HAWK]);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 40);
  });
});

describe('what the validator refuses', () => {
  test('attackersAttackedYou outside the effect of an attackBatch trigger', () => {
    const card = syntheticCard(MARSHAL);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'upkeep', whose: 'you' },
              effect: {
                kind: 'conditional',
                condition: { kind: 'attackersAttackedYou' },
                effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
              },
            },
          ],
        },
      ],
    } as typeof card;
    expect(
      validateCard(bad)
        .map((i) => i.message)
        .join(' '),
    ).toContain('attackBatch');
  });

  test('an attackBatch of fewer than one creature (D-187: one is "Whenever you attack")', () => {
    const card = syntheticCard(MARSHAL);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'attackBatch', who: 'you', atLeast: 0 },
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
          ],
        },
      ],
    } as typeof card;
    expect(validateCard(bad).length).toBeGreaterThan(0);
    // one creature is enough for "Whenever you attack"
    const good = {
      ...bad,
      faces: [
        {
          ...bad.faces[0],
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
          ],
        },
      ],
    } as typeof card;
    expect(validateCard(good)).toEqual([]);
  });
});
