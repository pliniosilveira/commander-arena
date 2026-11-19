// "Whenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." (a triggered mana ability, CR 605.1b)
// Pins: CR 605.1b and 605.4a (it adds mana at once, to the pool of the mana ability that triggered it), CR 106.12 (tapping a permanent for mana is activating its mana ability with
// {T} in the cost), CR 106.1b (one mana of any color: the player chooses the color; colorless is not a color), CR 605.3b (the choice is made as the mana ability is activated), CR 303.4
// (the Aura's controller need not control the land: only the controller of the land can tap it, so its mana goes to them). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-enchanted-land-mana.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { type Action, type PayManaDecision, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const PRISM = 'SYNTHETIC Prismatic Growth';
const SURGE = 'SYNTHETIC Verdant Surge';
const BEARS = 'Grizzly Bears'; // {1}{G}
const BOLT = 'Lightning Bolt'; // {R}

describe('the cards are valid', () => {
  test.each([PRISM, SURGE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a choice of color (any color)', () => {
  test('tapping by hand without naming the color of the additional mana is refused, and nothing changes', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .build();
    const r = g.act(0).try.tapForMana('Forest');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('color of the additional mana');
    g.expect.tapped('Forest', false);
    g.expect.pool(0, '');
  });

  test('naming it adds both: the land’s own mana and the additional one', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .build();
    g.act(0).tapForMana('Forest', { extraColors: ['R'] });
    g.expect.pool(0, 'GR');
    g.expect.tapped('Forest', true);
  });

  test('the color of the additional mana is any of the five: colorless is not one (CR 106.1b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .build();
    expect(g.act(0).try.tapForMana('Forest', { extraColors: ['C'] }).ok).toBe(false);
    g.expect.pool(0, '');
  });

  test('the legal actions offer one tap for each color of the additional mana', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .build();
    const taps = g
      .legalActions(0)
      .filter(
        (a): a is Extract<Action, { kind: 'activateAbility' }> => a.kind === 'activateAbility',
      )
      .filter((a) => a.source === g.id('Forest'));
    expect(taps.map((a) => a.extraColors?.join('')).sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
  });

  test('paying a spell the planner chooses the color: one Forest pays {R} for Lightning Bolt', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Forest')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.expect.stack([BOLT]);
  });

  test('and one Forest pays the two mana of {1}{G}', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
  });

  test('without the Aura the same Forest pays only one mana', () => {
    const g = scenario().seat(0).hand(BEARS).battlefield('Forest').build();
    g.expect.illegal(0, { cast: BEARS });
  });

  test('another land of the same player is not enchanted: it makes its own mana only', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest', 'Mountain')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .build();
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'R');
  });
});

describe('the Aura’s controller need not control the land (CR 303.4)', () => {
  test('the player who controls the land taps it and gets the additional mana; the Aura’s controller gets none', () => {
    // The Aura is seat 0's, the Forest seat 1's.
    const attached = scenario()
      .seat(0)
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .seat(1)
      .battlefield('Forest')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    attached.act(1).tapForMana('Forest', { extraColors: ['U'] });
    attached.expect.pool(1, 'GU');
    attached.expect.pool(0, '');
  });
});

describe('the additional mana is fixed (no choice to make)', () => {
  test('tapping adds it with nothing to name', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .battlefield(SURGE, { attachedTo: 'Mountain' })
      .build();
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'RG');
  });

  test('the legal actions offer a single tap', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .battlefield(SURGE, { attachedTo: 'Mountain' })
      .build();
    const taps = g
      .legalActions(0)
      .filter((a) => a.kind === 'activateAbility' && a.source === g.id('Mountain'));
    expect(taps).toHaveLength(1);
  });
});

describe('paying by hand (payManual)', () => {
  const asked = () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Forest')
      .battlefield(PRISM, { attachedTo: 'Forest' })
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(BOLT, { targets: [BEARS] });
    return g;
  };

  test('the payment lists the colors of the additional mana of the enchanted land', () => {
    const g = asked();
    const d = g.state.pending as PayManaDecision;
    expect(d.kind).toBe('payMana');
    const forest = d.manaSources.find((s) => s.object === g.id('Forest'));
    expect(forest?.extraColors?.map((c) => c.join('')).sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
  });

  test('a tap that names the color pays: Forest for {G} and the additional {R} pay Lightning Bolt', () => {
    const g = asked();
    g.choose({
      kind: 'payManual',
      taps: [{ object: g.id('Forest'), abilityIndex: 0, extraColors: ['R'] }],
    });
    g.expect.stack([BOLT]);
  });

  test('a tap that leaves the color out is refused and the payment stays asked', () => {
    const g = asked();
    const r = g.act(0).try.action({
      kind: 'payManual',
      taps: [{ object: g.id('Forest'), abilityIndex: 0 }],
    });
    expect(r.ok).toBe(false);
    g.expect.pending('payMana', 0);
  });

  test('the automatic payment picks the color the cost needs', () => {
    const g = asked();
    g.choose({ kind: 'payAuto' });
    g.expect.stack([BOLT]);
  });
});
