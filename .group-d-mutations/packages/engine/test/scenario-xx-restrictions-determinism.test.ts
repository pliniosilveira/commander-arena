// Determinism and agreement for restrictions (D-094): the same actions on the same scenario give the
// same state hash, applyAction is a pure function of the state, and the legal-action lists of the
// combat decisions hold nothing the engine refuses (CR 508.1d, 509.1b). SYNTHETIC cards.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, stateHash } from '../src/index';
import { scenario } from '../src/testing/index';

const BERSERKER = 'SYNTHETIC Berserker';
const GHOST = 'SYNTHETIC Ghost Step';
const SHADOW = 'SYNTHETIC Shadow Bear';

function play() {
  const g = scenario()
    .seat(0)
    .battlefield(BERSERKER, SHADOW, 'Island')
    .hand(GHOST)
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield('Grizzly Bears', 'SYNTHETIC Shadow Wall', 'SYNTHETIC Dry Desert')
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(GHOST, { targets: [BERSERKER], pay: true });
  g.passAll();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack([BERSERKER, SHADOW]);
  g.advanceTo('declareBlockers');
  return g;
}

describe('determinism', () => {
  test('the same plays give the same hash and the same event log', () => {
    const a = play();
    const b = play();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(a.events).toEqual(b.events);
  });

  test('applyAction does not change its input and gives the same answer twice', () => {
    const g = play();
    const before = stateHash(g.state);
    const action = getLegalActions(g.state, 1)[0];
    if (action === undefined) throw new Error('no legal action');
    const one = applyAction(g.state, 1, action);
    const two = applyAction(g.state, 1, action);
    expect(stateHash(g.state)).toBe(before);
    expect(one.ok && two.ok && stateHash(one.state) === stateHash(two.state)).toBe(true);
  });
});

describe('the legal actions agree with applyAction', () => {
  test('every declaration of blockers that is listed is accepted, and the shadow attacker is blocked only by shadow', () => {
    const g = play();
    const listed = getLegalActions(g.state, 1);
    expect(listed.length).toBeGreaterThan(1);
    for (const a of listed) expect(applyAction(g.state, 1, a).ok, JSON.stringify(a)).toBe(true);
    // Grizzly Bears can't block the shadow creature; the Berserker was made unblockable by the spell.
    const bears = g.id('Grizzly Bears');
    const wall = g.id('SYNTHETIC Shadow Wall');
    for (const a of listed) {
      if (a.kind !== 'declareBlockers') continue;
      for (const b of a.blocks) {
        expect(b.attacker).toBe(g.id(SHADOW));
        expect(b.blocker).toBe(wall);
        expect(b.blocker).not.toBe(bears);
      }
    }
    expect(
      applyAction(g.state, 1, {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('Grizzly Bears'), attacker: g.id(SHADOW) }],
      }).ok,
    ).toBe(false);
    expect(
      applyAction(g.state, 1, {
        kind: 'declareBlockers',
        blocks: [{ blocker: wall, attacker: g.id(BERSERKER) }],
      }).ok,
    ).toBe(false);
  });
});
