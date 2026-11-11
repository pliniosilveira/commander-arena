// Modal double-faced cards (CR 712.3): "Modal double-faced cards have a Magic card face on each
// side." A player casting one chooses which face before putting it on the stack (CR 712.11b) and
// only that face is evaluated (CR 712.11c); "a player playing a modal double-faced card as a land
// chooses one of its faces that's a land before putting it onto the battlefield. It enters the
// battlefield with that face up" (CR 712.12). While it is outside the stack and the battlefield it
// has only the front face's characteristics (CR 712.8a); on the stack and on the battlefield only
// the face that is up (CR 712.8f); a resolving spell keeps its face when it becomes a permanent
// (CR 712.13); a permanent that leaves the battlefield is the front face again (CR 712.8a, 400.7).
// Playing the back face as a land is a land play (CR 305.2). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-layouts.ts).
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, checkInvariants, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const DRAKE = 'SYNTHETIC Ridge Drake // Ridge Pass'; // Ridge Drake {2}{R} 3/2; Ridge Pass, a land, {T}: Add {R}
const CHARM = 'SYNTHETIC Zeal Charm // Shock Pass'; // Zeal Charm {1}{B} sorcery, gain 3; Shock Pass, a shock land ({B})
const KNIGHT = 'SYNTHETIC Twin Knight // Twin Wall'; // Twin Knight {1}{W} 2/1 vigilance; Twin Wall {2}{W}{W} 1/5 defender

const options = (g: ScenarioGame, kind: 'castSpell' | 'playLand', seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter((a) => a.kind === kind);

describe('characteristics outside the stack: the front face only (CR 712.8a)', () => {
  test('in hand, with both faces for the UI', () => {
    const g = scenario().seat(0).hand(DRAKE).seat(1).build();
    const v = viewOf(g, DRAKE);
    expect(v.name).toBe('Ridge Drake');
    expect(v.types).toEqual(['creature']);
    expect(v.manaCost).toEqual(['2', 'R']);
    expect(v.face).toBe(0);
    expect(v.faces?.map((f) => [f.name, f.types])).toEqual([
      ['Ridge Drake', ['creature']],
      ['Ridge Pass', ['land']],
    ]);
  });

  test('in the graveyard and in exile: the front face again', () => {
    for (const zone of ['graveyard', 'exile'] as const) {
      const g = scenario().seat(0)[zone](DRAKE).seat(1).build();
      expect(viewOf(g, DRAKE).name, zone).toBe('Ridge Drake');
      expect(viewOf(g, DRAKE).types, zone).toEqual(['creature']);
    }
  });
});

describe('casting a face (CR 712.11b)', () => {
  test('a land face is played, not cast; a spell face is cast, not played', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAKE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    const id = g.id(DRAKE);
    expect(options(g, 'castSpell')).toEqual([{ kind: 'castSpell', object: id, face: 0 }]);
    expect(options(g, 'playLand')).toEqual([{ kind: 'playLand', object: id, face: 1 }]);
    g.expect.illegal(0, { cast: DRAKE, face: 1 }); // a land is never cast (CR 305.1)
    g.expect.illegal(0, { playLand: DRAKE, face: 0 }); // the creature face is not a land
    g.expect.illegal(0, { playLand: DRAKE }); // face 0 by default
    g.expect.legal(0, { playLand: DRAKE, face: 1 });
  });

  test('the front face cast is a creature on the stack and on the battlefield', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAKE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(DRAKE, { face: 0, pay: true });
    expect(viewOf(g, DRAKE).name).toBe('Ridge Drake');
    g.passAll();
    g.expect.zone(DRAKE, 'battlefield', { seat: 0 });
    expect(g.object(DRAKE).face).toBe(0);
    g.expect.pt(DRAKE, 3, 2);
  });

  test('the back face cast is the permanent: its characteristics, its abilities (CR 712.13, 712.8f)', () => {
    const g = scenario()
      .seat(0)
      .hand(KNIGHT)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    const id = g.id(KNIGHT);
    expect(options(g, 'castSpell')).toEqual([
      { kind: 'castSpell', object: id, face: 0 },
      { kind: 'castSpell', object: id, face: 1 },
    ]);
    g.act(0).cast(KNIGHT, { face: 1, pay: true });
    const spell = viewOf(g, KNIGHT);
    expect(spell.zone).toBe('stack');
    expect(spell.name).toBe('Twin Wall');
    expect(spell.manaCost).toEqual(['2', 'W', 'W']);
    expect(spell.face).toBe(1);
    g.passAll();
    g.expect.zone(KNIGHT, 'battlefield', { seat: 0 });
    const wall = viewOf(g, KNIGHT);
    expect(wall.name).toBe('Twin Wall');
    expect(wall.face).toBe(1);
    expect(wall.keywords).toEqual(['defender']);
    expect(wall.manaCost).toEqual(['2', 'W', 'W']); // a modal face keeps its own cost (CR 712.8f)
    g.expect.pt(KNIGHT, 1, 5);
    g.expect.derived(KNIGHT, { subtypes: ['Wall'], keywords: ['defender'] });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('only the face cast is evaluated: the cheaper face is castable when the other is not', () => {
    const g = scenario().seat(0).hand(KNIGHT).battlefield('Plains', 'Plains').seat(1).build();
    expect(options(g, 'castSpell')).toEqual([{ kind: 'castSpell', object: g.id(KNIGHT), face: 0 }]);
    g.expect.illegal(0, { cast: KNIGHT, face: 1 });
  });

  test('a sorcery face has sorcery timing and a spell face resolves its own text', () => {
    const g = scenario().seat(0).hand(CHARM).battlefield('Swamp', 'Swamp').seat(1).build();
    g.act(0).cast(CHARM, { face: 0, pay: true });
    expect(viewOf(g, CHARM).types).toEqual(['sorcery']);
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone(CHARM, 'graveyard', { seat: 0 });
    expect(viewOf(g, CHARM).name).toBe('Zeal Charm');
    expect(viewOf(g, CHARM).face).toBe(0);
    const later = scenario()
      .seat(0)
      .hand(CHARM)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(options(later, 'castSpell')).toEqual([]);
  });
});

describe('playing the back face as a land (CR 712.12)', () => {
  const build = () =>
    scenario().seat(0).hand(DRAKE, 'Forest').battlefield('Mountain').seat(1).build();

  test('it enters as the land, face up, and counts as the land drop (CR 305.2)', () => {
    const g = build();
    g.act(0).playLand(DRAKE, { face: 1 });
    g.expect.zone(DRAKE, 'battlefield', { seat: 0 });
    expect(g.object(DRAKE).face).toBe(1);
    const v = viewOf(g, DRAKE);
    expect(v.name).toBe('Ridge Pass');
    expect(v.types).toEqual(['land']);
    expect(v.manaCost).toBeNull();
    expect(v.face).toBe(1);
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
    g.expect.eventLog([{ kind: 'landPlayed', face: 1 }]);
    // The land drop is used: no second land, from either face or any card.
    expect(options(g, 'playLand')).toEqual([]);
    g.expect.illegal(0, { playLand: 'Forest' });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the land taps for the mana of its face', () => {
    const g = build();
    g.act(0).playLand(DRAKE, { face: 1 });
    g.act(0).tapForMana(DRAKE);
    g.expect.pool(0, 'R');
  });

  test('a land played first leaves the other land cards unplayable, and a played Forest the DFC', () => {
    const g = build();
    g.act(0).playLand('Forest');
    expect(options(g, 'playLand')).toEqual([]);
    g.expect.illegal(0, { playLand: DRAKE, face: 1 });
  });

  test('a shock land face asks to pay 2 life before it enters, with the same face (CR 614.12)', () => {
    const g = scenario().seat(0).hand(CHARM).seat(1).build();
    g.act(0).playLand(CHARM, { face: 1 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.life(0, 38);
    expect(g.object(CHARM).face).toBe(1);
    expect(g.object(CHARM).tapped).toBe(false);
    expect(viewOf(g, CHARM).name).toBe('Shock Pass');
    // The land drop was used exactly once.
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
  });

  test('declining the payment: it enters tapped', () => {
    const g = scenario().seat(0).hand(CHARM).seat(1).build();
    g.act(0).playLand(CHARM, { face: 1 });
    g.act(0).decline();
    g.expect.life(0, 40);
    expect(g.object(CHARM).face).toBe(1);
    expect(g.object(CHARM).tapped).toBe(true);
  });

  test('a land face cannot be played in the opponent turn or with the stack not empty', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAKE)
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(options(g, 'playLand')).toEqual([]);
    g.expect.illegal(0, { playLand: DRAKE, face: 1 });
  });
});

describe('leaving the battlefield (CR 712.8a, 400.7)', () => {
  test('a back-face permanent that dies is the front face in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT, { face: 1, label: 'wall' })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    expect(viewOf(g, 'wall').name).toBe('Twin Wall');
    g.act(1).cast('Murder', { targets: ['wall'], pay: true });
    g.passAll();
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0 });
    expect(g.object(KNIGHT).face).toBe(0);
    expect(viewOf(g, KNIGHT).name).toBe('Twin Knight');
    expect(viewOf(g, KNIGHT).types).toEqual(['creature']);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('bounced to the hand, it is the front face again', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT, { face: 1, label: 'wall' })
      .battlefield('Island', 'Plains', 'Plains', 'Plains')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).cast('Unsummon', { targets: ['wall'], pay: true });
    g.passAll();
    g.expect.zone(KNIGHT, 'hand', { seat: 0 });
    expect(g.object(KNIGHT).face).toBe(0);
    expect(viewOf(g, KNIGHT).name).toBe('Twin Knight');
    expect(options(g, 'castSpell')).toEqual([{ kind: 'castSpell', object: g.id(KNIGHT), face: 0 }]);
  });
});

describe('transforming a modal double-faced permanent (CR 712.9, 712.3)', () => {
  test('an effect that transforms it turns it to its other face; it is still one object', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT, { label: 'knight', counters: { '+1/+1': 1 } })
      .hand('SYNTHETIC Turn Over')
      .battlefield('Plains')
      .seat(1)
      .build();
    const before = g.id('knight');
    g.act(0).cast('SYNTHETIC Turn Over', { targets: ['knight'], pay: true });
    g.passAll();
    expect(g.id('knight')).toBe(before);
    expect(viewOf(g, 'knight').name).toBe('Twin Wall');
    g.expect.pt('knight', 2, 6);
  });
});

describe('determinism', () => {
  test('replaying the action log of a game with every layout path gives the same state', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAKE, KNIGHT, CHARM)
      .battlefield('Mountain', 'Plains', 'Plains', 'Plains', 'Swamp')
      .seat(1)
      .build();
    const start = g.state;
    g.act(0).playLand(DRAKE, { face: 1 });
    g.act(0).cast(KNIGHT, { face: 1, pay: true });
    g.passAll();
    g.act(0).cast(CHARM, { face: 0, pay: true });
    g.passAll();
    let state = start;
    for (const { seat, action } of g.log) {
      const r = applyAction(state, seat, action);
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    expect(state).toEqual(g.state);
  });
});
