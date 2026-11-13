// Group 9 of the Hashaton deck (issue 31, D-1180 to D-1185 provisional): the cost of Rona, Herald of Invasion, "{5}{B/P}: Transform ~. Activate only as a sorcery.", an
// ordinary activated ability whose cost has a Phyrexian mana symbol.
// Pins: CR 107.4f (a Phyrexian mana symbol is paid with one mana of its color or 2 life), CR 119.4 (a player can pay life only if the life total is at least the payment; the
// planner keeps 1 life), CR 602.2b and 601.2g-h (the cost of an ability is paid like that of a spell), CR 602.5d (activate only as a sorcery), CR 701.27a and 712.18
// (transform: the same object, the other face up), CR 712.8e (the characteristics of the back face).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g9.ts).
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const SCRIBE = 'SYNTHETIC Phyrexian Scribe'; // {B/P}: draw a card
const SEER = 'SYNTHETIC Phyrexian Seer // Phyrexian Colossus'; // {5}{B/P}: transform, sorcery speed; back 5/5 trample
const FILLER = Array.from({ length: 6 }, () => 'Plains');

describe('an activated ability with a Phyrexian symbol in its cost (CR 107.4f)', () => {
  test('the cards are valid and the cost kind is supported', () => {
    expect(validateCard(syntheticCard(SCRIBE))).toEqual([]);
    expect(validateCard(syntheticCard(SEER))).toEqual([]);
    expect(isFeatureSupported('cost:mana')).toBe(true);
  });

  const start = (life: number, ...battlefield: readonly string[]) =>
    scenario()
      .seat(0)
      .life(life)
      .battlefield(SCRIBE)
      .battlefield(...battlefield)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with a black source the planner pays {B}, and no life is paid', () => {
    const g = start(40, 'Swamp');
    g.act(0).activate(SCRIBE, { pay: true });
    g.passAll();
    g.expect.tapped('Swamp');
    g.expect.life(0, 40);
    g.expect.handSize(0, 1);
  });

  test('with no black mana the same payment is 2 life (the life option is offered)', () => {
    const g = start(40, 'Island');
    g.expect.legal(0, { activate: SCRIBE });
    g.act(0).activate(SCRIBE, { pay: true });
    g.passAll();
    g.expect.life(0, 38);
    g.expect.tapped('Island', false);
    g.expect.handSize(0, 1);
  });

  test('paying by hand with no taps pays the life even when a Swamp is untapped', () => {
    const g = start(40, 'Swamp');
    g.act(0).activate(SCRIBE).payManual([]);
    g.passAll();
    g.expect.life(0, 38);
    g.expect.tapped('Swamp', false);
    g.expect.handSize(0, 1);
  });

  test('paying by hand with the Swamp pays {B}', () => {
    const g = start(40, 'Swamp');
    g.act(0).activate(SCRIBE).payManual(['Swamp']);
    g.passAll();
    g.expect.life(0, 40);
    g.expect.tapped('Swamp');
  });

  test('3 life is enough (CR 119.4: the planner keeps 1 life), 2 life is not', () => {
    const rich = start(3);
    rich.expect.legal(0, { activate: SCRIBE });
    rich.act(0).activate(SCRIBE, { pay: true });
    rich.passAll();
    rich.expect.life(0, 1);
    const poor = start(2);
    poor.expect.illegal(0, { activate: SCRIBE });
  });
});

describe('{5}{B/P}: Transform this creature. Activate only as a sorcery.', () => {
  const start = (
    life: number,
    lands: readonly string[],
    phase: 'precombatMain' | 'combat' = 'precombatMain',
  ) =>
    scenario()
      .seat(0)
      .life(life)
      .battlefield(SEER)
      .battlefield(...lands)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at(phase === 'combat' ? 'beginningOfCombat' : phase, { active: 0, turn: 3 })
      .build();

  test('five lands and 2 life: it transforms into the 5/5 with trample (the same object)', () => {
    const g = start(40, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    g.expect.legal(0, { activate: SEER });
    g.act(0).activate(SEER, { pay: true });
    g.passAll();
    g.expect.life(0, 38);
    const view = viewOf(g, SEER);
    expect(view.power).toBe(5);
    expect(view.toughness).toBe(5);
    expect(view.keywords).toContain('trample');
    g.expect.invariants();
  });

  test('six lands with a Swamp: the {B} is paid by the Swamp, not life', () => {
    const g = start(40, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Swamp']);
    g.act(0).activate(SEER, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.tapped('Swamp');
  });

  test('four lands are not enough: not offered', () => {
    const g = start(40, ['Plains', 'Plains', 'Plains', 'Plains']);
    g.expect.illegal(0, { activate: SEER });
  });

  test('at sorcery speed only (CR 602.5d): not in the beginning of combat, not with the stack busy', () => {
    const g = start(40, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'], 'combat');
    g.expect.illegal(0, { activate: SEER });
  });
});
