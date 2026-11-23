// Ahoy Mateys deck, group 6: Departed Deckhand, Azure Fleet Admiral and Port Razer, read from their real Oracle text and run by the engine.
// "This creature can't be blocked except by Spirits." and "{3}{U}: Another target creature you control can't be blocked this turn except by Spirits."
// "This creature can't be blocked by creatures the monarch controls." and "When this creature enters, you become the monarch."
// "This creature can't attack a player it has already attacked this turn." with "untap each creature you control. After this phase, there is an additional combat phase."
// Pins: CR 509.1b (blocking restrictions, read as blockers are declared), CR 611.2a (an effect lasts as long as it says), CR 725.1 (the monarch), CR 508.1a and 508.6 (what an attacker may
// attack), CR 500.8 (an additional combat phase), CR 603.2 (a trigger of becoming a target). The CR text was not available here: the numbers are those the engine's comments cite.
import { applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const DECKHAND = real('Departed Deckhand');
const ADMIRAL = real('Azure Fleet Admiral');
const RAZER = real('Port Razer');
const BEARS = 'Grizzly Bears';
const SPIRIT = 'SYNTHETIC Plain Spirit';
const GHOST_STEP = 'SYNTHETIC Ghost Step';

type Ref = Parameters<ScenarioGame['id']>[0];

/** Whether seat 1 may declare `blocker` blocking `attacker`, by what the engine accepts (CR 509.1b). */
function canBlock(g: ScenarioGame, blocker: Ref, attacker: Ref): boolean {
  return applyAction(g.state, 1, {
    kind: 'declareBlockers',
    blocks: [{ blocker: g.id(blocker), attacker: g.id(attacker) }],
  }).ok;
}

function attacked(
  mine: readonly string[],
  theirs: readonly string[],
  opts: { readonly monarch?: 0 | 1; readonly lands?: number } = {},
): ScenarioGame {
  let b = scenario()
    .define(DECKHAND)
    .define(ADMIRAL)
    .define(RAZER)
    .seat(0)
    .library('Island', { count: 6 });
  for (const name of mine) b = b.battlefield(name);
  for (let i = 0; i < (opts.lands ?? 0); i += 1) b = b.battlefield('Island');
  b = b.seat(1).library('Island', { count: 6 });
  for (const name of theirs) b = b.battlefield(name);
  const g = b
    .at('precombatMain', {
      active: 0,
      ...(opts.monarch === undefined ? {} : { monarch: opts.monarch }),
    })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(mine);
  g.advanceTo('declareBlockers');
  return g;
}

describe('Departed Deckhand', () => {
  test('can not be blocked except by Spirits (CR 509.1b)', () => {
    const g = attacked([DECKHAND.name], [BEARS, SPIRIT]);
    expect(canBlock(g, BEARS, DECKHAND.name)).toBe(false);
    expect(canBlock(g, SPIRIT, DECKHAND.name)).toBe(true);
  });

  test('{3}{U}: another creature you control can not be blocked this turn except by Spirits (CR 509.1b, 611.2a)', () => {
    const b = scenario()
      .define(DECKHAND)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(DECKHAND.name)
      .battlefield(BEARS)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 6 })
      .battlefield('SYNTHETIC Brick Wall')
      .battlefield(SPIRIT);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.act(0).activate(DECKHAND.name, { ability: 2, targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, 'SYNTHETIC Brick Wall', BEARS)).toBe(false);
    expect(canBlock(g, SPIRIT, BEARS)).toBe(true);
  });

  test('without the activation another creature is blocked as usual', () => {
    const g = attacked([BEARS], ['SYNTHETIC Brick Wall']);
    expect(canBlock(g, 'SYNTHETIC Brick Wall', BEARS)).toBe(true);
  });

  test('when it becomes the target of a spell, it is sacrificed (CR 603.2, 701.21a)', () => {
    const g = scenario()
      .define(DECKHAND)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(DECKHAND.name)
      .battlefield('Island')
      .hand(GHOST_STEP)
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).cast(GHOST_STEP, { targets: [DECKHAND.name], pay: true });
    g.passAll();
    g.expect.zone(DECKHAND.name, 'graveyard');
  });
});

describe('Azure Fleet Admiral', () => {
  test('when it enters, you become the monarch (CR 725.1)', () => {
    const g = scenario()
      .define(ADMIRAL)
      .seat(0)
      .library('Island', { count: 6 })
      .hand(ADMIRAL.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).cast(ADMIRAL.name, { pay: true });
    g.passAll();
    expect(g.state.monarch).toBe(0);
  });

  test('creatures the monarch controls can not block it; when somebody else is the monarch, they can (CR 509.1b, 725.1)', () => {
    expect(canBlock(attacked([ADMIRAL.name], [BEARS], { monarch: 1 }), BEARS, ADMIRAL.name)).toBe(
      false,
    );
    expect(canBlock(attacked([ADMIRAL.name], [BEARS], { monarch: 0 }), BEARS, ADMIRAL.name)).toBe(
      true,
    );
    expect(canBlock(attacked([ADMIRAL.name], [BEARS]), BEARS, ADMIRAL.name)).toBe(true);
  });
});

describe('Port Razer', () => {
  function afterFirstCombat(): ScenarioGame {
    const g = scenario()
      .define(RAZER)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(RAZER.name)
      .battlefield(BEARS)
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([RAZER.name, BEARS]);
    for (let i = 0; i < 12 && g.state.pending?.kind !== 'declareAttackers'; i += 1) g.passAll();
    return g;
  }

  test('its combat damage untaps my creatures and gives an additional combat phase, where it can not attack that player again (CR 500.8, 508.1a, 508.6)', () => {
    const g = afterFirstCombat();
    g.expect.life(1, 40 - 4 - 2);
    g.expect.tapped(RAZER.name, false);
    g.expect.tapped(BEARS, false);
    g.expect.pending('declareAttackers', 0);
    g.expect.canAttack(RAZER.name, false);
    g.expect.canAttack(BEARS, true);
  });

  test('before it has attacked anybody it may attack', () => {
    const g = scenario()
      .define(RAZER)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(RAZER.name)
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(RAZER.name, true);
  });
});
