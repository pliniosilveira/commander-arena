// Flash (CR 702.8): "You may play this card any time you could cast an instant."
// Pins: CR 702.8a (Flash) for the keyword; CR 117.1a (Timing and Priority) for sorcery timing
// (active player, main phase, empty stack); CR 117.3 for who has priority; CR 601.3 for casting
// legality; CR 702.8b for redundant instances. Cards are SYNTHETIC (src/cards/fixtures).
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions, type StepId } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const castable = (g: ScenarioGame, seat: number, name: string): boolean => {
  const id = g.id({ name, zone: 'hand', seat });
  return getLegalActions(g.state, seat).some(
    (a: Action) => a.kind === 'castSpell' && a.object === id,
  );
};

/** Seat 0 holds a flash creature and a plain one with enough mana for either. */
function holder(step: StepId, active: 0 | 1, priority: 0 | 1) {
  return scenario()
    .seat(0)
    .hand('SYNTHETIC Flash Bear', 'Grizzly Bears')
    .battlefield('Forest', { count: 4 })
    .seat(1)
    .at(step, { active, priority })
    .build();
}

describe('CR 702.8a (Flash): the same windows as an instant', () => {
  test('the active player in a main phase with an empty stack: both are castable', () => {
    for (const step of ['precombatMain', 'postcombatMain'] as const) {
      const g = holder(step, 0, 0);
      expect(castable(g, 0, 'SYNTHETIC Flash Bear'), step).toBe(true);
      expect(castable(g, 0, 'Grizzly Bears'), step).toBe(true);
    }
  });

  test('on the opponent turn, in every step the flash creature is castable and the plain one is not', () => {
    for (const step of ['upkeep', 'draw', 'precombatMain', 'beginningOfCombat', 'end'] as const) {
      const g = holder(step, 1, 0);
      expect(castable(g, 0, 'SYNTHETIC Flash Bear'), step).toBe(true);
      expect(castable(g, 0, 'Grizzly Bears'), step).toBe(false);
    }
  });

  test('on the own turn outside the main phases (beginning of combat, end step)', () => {
    for (const step of ['upkeep', 'beginningOfCombat', 'end'] as const) {
      const g = holder(step, 0, 0);
      expect(castable(g, 0, 'SYNTHETIC Flash Bear'), step).toBe(true);
      expect(castable(g, 0, 'Grizzly Bears'), step).toBe(false);
    }
  });

  test('casting the flash creature on the opponent turn resolves it onto the battlefield', () => {
    const g = holder('upkeep', 1, 0);
    g.act(0).cast('SYNTHETIC Flash Bear', { pay: true });
    g.expect.stack(['SYNTHETIC Flash Bear']);
    g.passAll();
    g.expect.zone('SYNTHETIC Flash Bear', 'battlefield', { seat: 0 });
    g.expect.stack([]);
  });

  test('the engine refuses the plain creature in that window, and the state is unchanged', () => {
    const g = holder('upkeep', 1, 0);
    const before = JSON.stringify(g.state);
    const r = g.act(0).try.cast('Grizzly Bears');
    expect(r.ok).toBe(false);
    expect(JSON.stringify(g.state)).toBe(before);
  });
});

describe('CR 702.8a (Flash): with something on the stack', () => {
  function respondingToBolt() {
    // Seat 1 (active, main phase) casts Lightning Bolt at seat 0 and passes; seat 0 may respond.
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Flash Bear', 'Grizzly Bears')
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    return g;
  }

  test('in response to a spell the flash creature is castable, the plain creature is not', () => {
    const g = respondingToBolt();
    g.expect.stack(['Lightning Bolt']);
    expect(castable(g, 0, 'SYNTHETIC Flash Bear')).toBe(true);
    expect(castable(g, 0, 'Grizzly Bears')).toBe(false);
  });

  test('the flash creature resolves first and the Bolt still resolves afterwards', () => {
    const g = respondingToBolt();
    g.act(0).cast('SYNTHETIC Flash Bear', { pay: true });
    g.expect.stack(['SYNTHETIC Flash Bear', 'Lightning Bolt']);
    g.passAll();
    g.expect.zone('SYNTHETIC Flash Bear', 'battlefield', { seat: 0 });
    g.expect.life(0, 37);
  });

  test('on the own turn with the own spell on the stack, the plain creature is refused, flash is not', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'SYNTHETIC Flash Bear', 'Grizzly Bears')
      .battlefield('Mountain')
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    expect(castable(g, 0, 'SYNTHETIC Flash Bear')).toBe(true);
    expect(castable(g, 0, 'Grizzly Bears')).toBe(false);
  });
});

describe('CR 702.8a (Flash): any permanent type, any zone it could be cast from', () => {
  test('a flash artifact is castable at instant speed', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Flash Trinket', 'Sol Ring')
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .at('end', { active: 1, priority: 0 })
      .build();
    expect(castable(g, 0, 'SYNTHETIC Flash Trinket')).toBe(true);
    expect(castable(g, 0, 'Sol Ring')).toBe(false);
  });

  test('a commander with flash can be cast from the command zone at instant speed', () => {
    const g = scenario()
      .seat(0)
      .commander('SYNTHETIC Flash Bear')
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .at('end', { active: 1, priority: 0 })
      .build();
    const id = g.id({ name: 'SYNTHETIC Flash Bear', zone: 'command', seat: 0 });
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.object === id)).toBe(
      true,
    );
  });

  test('flash still needs the mana: with too little mana the creature is not castable', () => {
    const poor = scenario()
      .seat(0)
      .hand('SYNTHETIC Flash Bear')
      .battlefield('Forest')
      .seat(1)
      .at('end', { active: 1, priority: 0 })
      .build();
    expect(castable(poor, 0, 'SYNTHETIC Flash Bear')).toBe(false);
  });

  test('a creature with flash and another keyword (hexproof) is castable at instant speed', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Flash Hexproof Wisp')
      .battlefield('Island')
      .seat(1)
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    expect(castable(g, 0, 'SYNTHETIC Flash Hexproof Wisp')).toBe(true);
  });
});
