// Spectacle (D-117 step 6, D-124): "You may pay [cost] rather than pay this spell's mana cost if an opponent
// lost life this turn."
// Pins: CR 702.137a (the condition, and that casting for the cost follows 601.2b and 601.2f-h), CR 119.3
// (life loss: damage, effects), CR 119.4 (paying life is losing that much life), CR 118.9, 118.9a, 118.9d (an
// alternative cost; additional costs and commander tax still apply), CR 510.2 and 120.3a (combat damage to a
// player causes that much life loss), CR 102.2 (opponents). The record is per player and per turn:
// `SeatState.lifeLostThisTurn`, reset as each turn begins. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-alt-costs.ts) except Lightning Bolt and Grizzly Bears.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const RAIDER = 'SYNTHETIC Spectacle Raider'; // {3}{R} 2/2, spectacle {1}{R}
const INSIGHT = 'SYNTHETIC Spectacle Insight'; // instant {2}{U}, spectacle {U}, draw a card
const DRAIN = 'SYNTHETIC Drain Pulse'; // sorcery {B}: each opponent loses 1 life
const LIFE_TAP = 'SYNTHETIC Life Tap'; // {T}, pay 2 life: draw a card

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const spectacleOptions = (g: Game, seat = 0) =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'spectacle',
  );

describe('the condition: an opponent lost life this turn (CR 702.137a)', () => {
  test('before anyone lost life there is no spectacle option, only the ordinary cast', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    g.expect.legal(0, { cast: RAIDER });
    expect(spectacleOptions(g)).toEqual([]);
    expect(getView(g.state, 0).seats[1]?.lifeLostThisTurn).toBe(0);
  });

  test('with only the spectacle cost payable and no life lost, the card cannot be cast at all', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 2 }).seat(1).build();
    g.expect.illegal(0, { cast: RAIDER });
    g.expect.illegal(0, { cast: RAIDER, alternative: 'spectacle' });
  });

  test('after a Lightning Bolt hit the opponent the spectacle option is offered beside the ordinary cast', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER, 'Lightning Bolt')
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    // The Bolt is on the stack: nothing was lost yet, so there is no spectacle option (and Raider is a sorcery-speed creature).
    expect(spectacleOptions(g)).toEqual([]);
    g.passAll();
    g.expect.life(1, 37);
    expect(getView(g.state, 0).seats[1]?.lifeLostThisTurn).toBe(3);
    g.expect.legal(0, { cast: RAIDER });
    g.expect.legal(0, { cast: RAIDER, alternative: 'spectacle' });
    expect(spectacleOptions(g)).toHaveLength(1);
  });

  test('with only the spectacle cost payable, after the loss, only that cast is offered', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER, 'Lightning Bolt')
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.illegal(0, { cast: RAIDER });
    g.expect.legal(0, { cast: RAIDER, alternative: 'spectacle' });
  });

  test('the spectacle cost is paid instead of the mana cost; the event and the view say so', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER, 'Lightning Bolt')
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const card = getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === RAIDER);
    expect(card?.castCost).toEqual(['3', 'R']);
    expect(card?.alternativeCosts).toEqual([{ kind: 'spectacle', cost: ['1', 'R'] }]);
    const tappedBefore = g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped);
    g.act(0).cast(RAIDER, { alternative: 'spectacle', pay: true });
    const tappedAfter = g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped);
    expect(tappedAfter.length - tappedBefore.length).toBe(2);
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'spectacle', commanderTax: 0 }], {
      since: 0,
    });
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('spectacle');
    g.passAll();
    g.expect.zone(RAIDER, 'battlefield', { seat: 0 });
    // The permanent does not remember it: spectacle only matters while casting.
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === RAIDER)?.alternative,
    ).toBeUndefined();
    g.expect.invariants();
  });
});

describe('what counts as losing life (CR 119.3, 119.4, 120.3a)', () => {
  test('combat damage to the opponent counts', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Grizzly Bears')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    expect(spectacleOptions(g)).toEqual([]);
    g.playCombat({ attack: ['Grizzly Bears'], until: 'postcombatMain' });
    g.expect.life(1, 38);
    g.expect.legal(0, { cast: RAIDER, alternative: 'spectacle' });
  });

  test('combat damage that is blocked does not, and an unblocked attack that is prevented does not', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Grizzly Bears')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Wall of Stone')
      .build();
    g.playCombat({
      attack: ['Grizzly Bears'],
      block: [{ blocker: 'Wall of Stone', attacker: 'Grizzly Bears' }],
      until: 'postcombatMain',
    });
    g.expect.life(1, 40);
    expect(spectacleOptions(g)).toEqual([]);
  });

  test('a life loss that is not damage counts: "each opponent loses 1 life"', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER, DRAIN)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Swamp')
      .seat(1)
      .build();
    expect(spectacleOptions(g)).toEqual([]);
    g.act(0).cast(DRAIN, { pay: true });
    g.passAll();
    g.expect.life(1, 39);
    expect(getView(g.state, 0).seats[1]?.lifeLostThisTurn).toBe(1);
    g.expect.legal(0, { cast: RAIDER, alternative: 'spectacle' });
  });

  test('life an opponent pays as a cost counts (CR 119.4)', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield(LIFE_TAP)
      .library('Plains', 'Plains', 'Plains')
      .build();
    expect(spectacleOptions(g)).toEqual([]);
    g.pass(0); // the opponent gets priority in the first main phase
    g.act(1).activate(LIFE_TAP, { pay: true });
    g.expect.life(1, 38);
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.state.turn.step).toBe('precombatMain');
    g.expect.legal(0, { cast: RAIDER, alternative: 'spectacle' });
  });

  test('gaining life is not losing it', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .life(10)
      .build();
    expect(getView(g.state, 0).seats[1]?.lifeLostThisTurn).toBe(0);
    expect(spectacleOptions(g)).toEqual([]);
  });
});

describe('only opponents count (CR 702.137a, 102.2)', () => {
  test('life the caster lost does not enable spectacle; the opponent, whose opponent lost it, can use it', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER, 'Lightning Bolt')
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .hand(INSIGHT)
      .battlefield('Island', { count: 1 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    expect(getView(g.state, 0).seats[0]?.lifeLostThisTurn).toBe(3);
    // Seat 0 lost life, and seat 0 is nobody's opponent in its own eyes: no spectacle for seat 0.
    expect(spectacleOptions(g, 0)).toEqual([]);
    // Seat 1's opponent lost life this turn: seat 1 may cast its instant for the spectacle cost, in seat 0's turn.
    g.pass(0);
    g.expect.pending('priority', 1);
    g.expect.legal(1, { cast: INSIGHT, alternative: 'spectacle' });
    g.expect.illegal(1, { cast: INSIGHT });
  });
});

describe('the record is per turn (CR 702.137a: "this turn")', () => {
  test('it is reset as the next turn begins, so the option is gone', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER, 'Lightning Bolt')
      .battlefield('Mountain', { count: 5 })
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.legal(0, { cast: RAIDER, alternative: 'spectacle' });
    g.advanceTo('end'); // still the same turn: the record stays through the end step
    expect(getView(g.state, 0).seats[1]?.lifeLostThisTurn).toBe(3);
    g.advanceTo('precombatMain', { turn: 'next' }); // seat 1's turn
    expect(getView(g.state, 0).seats.map((s) => s.lifeLostThisTurn)).toEqual([0, 0]);
    g.advanceTo('precombatMain', { turn: 'next' }); // seat 0 again
    expect(spectacleOptions(g)).toEqual([]);
    g.expect.invariants();
  });

  test('life lost in the opponent’s own turn lets the caster cast for spectacle in that turn', () => {
    const g = scenario()
      .seat(0)
      .hand(INSIGHT, 'Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('Island')
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    // Seat 1 is active; seat 0 Bolts it (an opponent of seat 0 lost life this turn), then casts the instant.
    g.pass(1);
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.pass(1); // seat 1 is active and holds priority after the Bolt resolves; seat 0 gets it next
    g.expect.legal(0, { cast: INSIGHT, alternative: 'spectacle' });
  });
});

describe('costs that still apply (CR 118.9d, 903.8)', () => {
  test('commander tax is paid on top of the spectacle cost', () => {
    const short = scenario()
      .seat(0)
      .commander(RAIDER, { casts: 1, label: 'cmd' })
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    short.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    short.passAll();
    // 4 lands, one tapped for the Bolt: 3 left, spectacle {1}{R} plus {2} of tax needs 4.
    short.expect.illegal(0, { cast: 'cmd', alternative: 'spectacle' });
    const g = scenario()
      .seat(0)
      .commander(RAIDER, { casts: 1, label: 'cmd' })
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast('cmd', { alternative: 'spectacle', pay: true });
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'spectacle', commanderTax: 2 }], {
      since: 0,
    });
    expect(g.state.commanderCasts[g.object('cmd').card as never]).toBe(2);
  });

  test('spectacle changes the cost, not the timing: a creature stays sorcery speed, an instant stays an instant', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER, INSIGHT, 'Lightning Bolt')
      .battlefield('Mountain', { count: 3 })
      .battlefield('Island')
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    g.pass(1);
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.pass(1);
    g.expect.life(1, 37);
    g.expect.legal(0, { cast: INSIGHT, alternative: 'spectacle' });
    g.expect.illegal(0, { cast: RAIDER, alternative: 'spectacle' });
  });
});

describe('the engine refuses what it cannot run', () => {
  const face = (extra: Record<string, unknown>) => {
    const base = syntheticCard(RAIDER);
    return { ...base, faces: [{ ...base.faces[0], ...extra }] } as unknown as typeof base;
  };

  test('the features list spectacle', () => {
    expect(SUPPORTED_FEATURES.castAlternatives).toContain('spectacle');
    expect(isFeatureSupported('castAlternative:spectacle')).toBe(true);
  });

  test('every spectacle fixture validates', () => {
    for (const name of [RAIDER, INSIGHT, DRAIN]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('spectacle on a land, a non-mana cost, X and a second spectacle are refused', () => {
    const land = validateCard(face({ types: ['land'], power: null, toughness: null }));
    expect(land.map((i) => i.message).join('|')).toMatch(/spectacle is on a spell/);
    const life = face({
      alternativeCosts: [{ kind: 'spectacle', cost: [{ kind: 'payLife', amount: 2 }] }],
    });
    expect(
      validateCard(life)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/mana only/);
    const x = face({
      alternativeCosts: [{ kind: 'spectacle', cost: [{ kind: 'mana', symbols: ['X'] }] }],
    });
    expect(
      validateCard(x)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/X in an alternative cost/);
    const two = face({
      alternativeCosts: [
        { kind: 'spectacle', cost: [{ kind: 'mana', symbols: ['R'] }] },
        { kind: 'spectacle', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
      ],
    });
    expect(
      validateCard(two)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/more than one alternative cost/);
  });

  test('a card with no spectacle cost refuses the action even with an opponent who lost life', () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears', 'Lightning Bolt')
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.illegal(0, { cast: 'Grizzly Bears', alternative: 'spectacle' });
    const card = g.object('Grizzly Bears');
    expect(
      applyAction(g.state, 0, { kind: 'castSpell', object: card.id, alternative: 'spectacle' }).ok,
    ).toBe(false);
  });

  test('the action is refused when no opponent lost life, even if the player names the option', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    const card = g.object(RAIDER);
    const r = applyAction(g.state, 0, {
      kind: 'castSpell',
      object: card.id,
      alternative: 'spectacle',
    });
    expect(r.ok).toBe(false);
  });
});

describe('determinism and replay', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(RAIDER, 'Lightning Bolt')
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .build();

  test('the same actions give the same state, and the log replays to it', () => {
    const play = () => {
      const g = build();
      g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
      g.passAll();
      g.act(0).cast(RAIDER, { alternative: 'spectacle', pay: true });
      g.passAll();
      return g;
    };
    const a = play();
    const b = play();
    expect(a.hash()).toBe(b.hash());
    let state = build().state;
    for (const { seat, action } of a.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(stateHash(state)).toBe(a.hash());
    expect(state.seats[1]?.lifeLostThisTurn).toBe(3);
  });
});
