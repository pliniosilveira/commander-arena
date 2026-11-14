// Split cards (CR 709): "Split cards have two card faces on a single card." The player chooses
// which half to cast before it is put on the stack (CR 709.3); only that half is evaluated (CR
// 709.3a) and exists on the stack (CR 709.3b); in every other zone the card has both halves'
// characteristics combined (CR 709.4): both names, the combined mana cost (a mana value that is the
// sum, colors of both, CR 709.4b), the card types of both and the abilities of both (CR 709.4c).
// Fuse, Aftermath and the permanent split cards of CR 709.5 are not supported (validateCard says so,
// see layout-validate.test.ts). Cards are SYNTHETIC (src/cards/fixtures/synthetic-layouts.ts).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  checkInvariants,
  getLegalActions,
  manaValue,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const SINGE = 'SYNTHETIC Singe // Mend'; // Singe {R} instant, 2 damage to a creature; Mend {1}{W} instant, gain 4
const STUDY = 'SYNTHETIC Study // Zap'; // Study {1}{U} sorcery, draw 2; Zap {R} instant, 1 damage to each opponent

const casts = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'castSpell');

describe('characteristics outside the stack: both halves combined (CR 709.4)', () => {
  const g = scenario().seat(0).hand(SINGE, STUDY).seat(1).build();

  test('name, mana cost, colors and types of the two halves', () => {
    const v = viewOf(g, SINGE);
    expect(v.name).toBe('Singe // Mend'); // CR 709.4a: two names
    expect(v.manaCost).toEqual(['R', '1', 'W']); // CR 709.4b: the combined mana cost
    expect(manaValue(v.manaCost ?? [])).toBe(3); // the mana value is the sum of the two halves
    expect(v.colors).toEqual(['W', 'R']); // red and white
    expect(v.types).toEqual(['instant']);
    expect(v.face).toBe(0);
    expect(v.faces?.map((f) => f.name)).toEqual(['Singe', 'Mend']);
    expect(v.faces?.map((f) => f.manaCost)).toEqual([['R'], ['1', 'W']]);
    // CR 709.4c: each card type specified on either half.
    expect(viewOf(g, STUDY).types).toEqual(['sorcery', 'instant']);
    expect(viewOf(g, STUDY).colors).toEqual(['U', 'R']);
  });

  test('the same combined characteristics in the graveyard, in exile and the library', () => {
    for (const zone of ['graveyard', 'exile', 'library'] as const) {
      const h = scenario().seat(0)[zone](SINGE).seat(1).build();
      const id = h.id(SINGE);
      const v = h.state.objects[id];
      expect(v?.face).toBe(0);
      if (zone === 'library') continue; // the view hides the library
      expect(viewOf(h, SINGE).name, zone).toBe('Singe // Mend');
      expect(viewOf(h, SINGE).manaCost, zone).toEqual(['R', '1', 'W']);
    }
  });
});

describe('casting a half (CR 709.3)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(SINGE)
      .battlefield('Mountain', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();

  test('one option per castable half, each with its face', () => {
    const g = build();
    const id = g.id(SINGE);
    expect(casts(g)).toEqual([
      { kind: 'castSpell', object: id, face: 0 },
      { kind: 'castSpell', object: id, face: 1 },
    ]);
    g.expect.legal(0, { cast: SINGE, face: 0 });
    g.expect.legal(0, { cast: SINGE, face: 1 });
    g.expect.legal(0, { cast: SINGE }); // no face means face 0
  });

  test('only the chosen half is evaluated: a half that needs a missing target or mana is not offered', () => {
    // No creature to aim Singe at: only Mend.
    const noTarget = scenario()
      .seat(0)
      .hand(SINGE)
      .battlefield('Mountain', 'Plains')
      .seat(1)
      .build();
    expect(casts(noTarget)).toEqual([{ kind: 'castSpell', object: noTarget.id(SINGE), face: 1 }]);
    noTarget.expect.illegal(0, { cast: SINGE, face: 0 });
    // One Mountain: Singe ({R}) but not Mend ({1}{W}).
    const poor = scenario()
      .seat(0)
      .hand(SINGE)
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(casts(poor)).toEqual([{ kind: 'castSpell', object: poor.id(SINGE), face: 0 }]);
    poor.expect.illegal(0, { cast: SINGE, face: 1 });
  });

  test('a face the card does not have is not castable', () => {
    const g = build();
    g.expect.illegal(0, { cast: SINGE, face: 2 });
    g.expect.illegal(0, { cast: SINGE, face: -1 });
    // A card with one face has no face 1, even though face 0 is castable.
    const bolt = scenario().seat(0).hand('Lightning Bolt').battlefield('Mountain').seat(1).build();
    bolt.expect.legal(0, { cast: 'Lightning Bolt' });
    bolt.expect.illegal(0, { cast: 'Lightning Bolt', face: 1 });
    expect(applyAction(g.state, 0, { kind: 'castSpell', object: g.id(SINGE), face: 0.5 }).ok).toBe(
      false,
    );
  });

  test('the spell on the stack is only the half cast: name, cost, color (CR 709.3b)', () => {
    const g = build();
    g.act(0).cast(SINGE, { face: 0, targets: ['bears'] });
    const v = viewOf(g, SINGE);
    expect(v.zone).toBe('stack');
    expect(v.name).toBe('Singe');
    expect(v.manaCost).toEqual(['R']);
    expect(manaValue(v.manaCost ?? [])).toBe(1); // "a red spell with a mana value of 1"
    expect(v.colors).toEqual(['R']);
    expect(v.face).toBe(0);
    expect(v.faces).toHaveLength(2); // the UI still sees both
    expect(v.oracleText).toBe('Singe deals 2 damage to target creature.');
  });

  test('casting the second half: its cost, its text, its effect', () => {
    const g = build();
    g.act(0).cast(SINGE, { face: 1, pay: true });
    const v = viewOf(g, SINGE);
    expect(v.name).toBe('Mend');
    expect(v.manaCost).toEqual(['1', 'W']);
    expect(v.colors).toEqual(['W']);
    expect(v.face).toBe(1);
    // Mend costs {1}{W}: the Mountain and a Plains, never the Singe cost.
    g.passAll();
    g.expect.life(0, 44);
    g.expect.zone(SINGE, 'graveyard', { seat: 0 });
    // Back in the graveyard it is a card with both halves again, front face up.
    expect(viewOf(g, SINGE).name).toBe('Singe // Mend');
    expect(viewOf(g, SINGE).face).toBe(0);
    expect(g.object(SINGE).face).toBe(0);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the first half resolves with its own effect only', () => {
    const g = build();
    g.act(0).cast(SINGE, { face: 0, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.life(0, 40);
    g.expect.zone(SINGE, 'graveyard', { seat: 0 });
    // The Plains were not tapped: only the {R} of Singe was paid.
    expect(g.find({ name: 'Plains', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(0);
  });

  test('the spellCast event names the half; the first half carries no face', () => {
    const g = build();
    g.act(0).cast(SINGE, { face: 1, pay: true });
    g.expect.eventLog([{ kind: 'spellCast', face: 1 }]);
    const h = build();
    h.act(0).cast(SINGE, { face: 0, targets: ['bears'], pay: true });
    h.expect.noEvent({ kind: 'spellCast', face: 0 });
  });

  test('timing is that of the half cast: an instant half at instant speed, a sorcery half not', () => {
    // The opponent's main phase, seat 0 has priority: Zap ({R}, an instant) but not Study (a sorcery).
    const g = scenario()
      .seat(0)
      .hand(STUDY)
      .battlefield('Mountain', 'Island')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(casts(g)).toEqual([{ kind: 'castSpell', object: g.id(STUDY), face: 1 }]);
    g.expect.illegal(0, { cast: STUDY, face: 0 });
    // On their own turn both halves are castable.
    const own = scenario().seat(0).hand(STUDY).battlefield('Mountain', 'Island').seat(1).build();
    expect(casts(own)).toHaveLength(2);
  });

  test('a countered split spell goes to the graveyard, and is one card with both halves again', () => {
    const g = scenario()
      .seat(0)
      .hand(SINGE)
      .battlefield('Mountain')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island', 'Grizzly Bears')
      .build();
    g.act(0).cast(SINGE, { face: 0, targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [{ name: 'Singe' }], pay: true });
    g.passAll();
    g.expect.zone(SINGE, 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    expect(g.object(SINGE).onAdventure).toBeUndefined();
    expect(viewOf(g, SINGE).name).toBe('Singe // Mend');
  });

  test('cancelling the cast puts the card back in the hand with its combined characteristics', () => {
    const g = build();
    const before = g.positionHash();
    g.act(0).cast(SINGE, { face: 0 });
    g.expect.pending('targets', 0);
    g.act(0).cancel();
    g.expect.position(before);
    expect(viewOf(g, SINGE).name).toBe('Singe // Mend');
  });

  test('an opponent cannot cast a half of a card in your hand', () => {
    const g = scenario()
      .seat(0)
      .hand(SINGE)
      .battlefield('Mountain', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Mountain', 'Plains', 'Plains', 'Grizzly Bears')
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    g.expect.illegal(1, { cast: { name: SINGE, seat: 0 }, face: 0 });
  });
});
