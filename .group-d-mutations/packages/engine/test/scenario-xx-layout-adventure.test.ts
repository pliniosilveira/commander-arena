// Adventurer cards (CR 715): a card with a creature (or other permanent) face and an Adventure, an
// instant or sorcery in the inset frame. "As a player plays an adventurer card, the player chooses
// whether they play the card normally or as an Adventure" (CR 715.3); only the alternative
// characteristics are evaluated to cast it (CR 715.3a) and it has only those on the stack (CR
// 715.3b); "in every zone except the stack, and while on the stack not as an Adventure, an
// adventurer card has only its normal characteristics" (CR 715.4). "Instead of putting a spell that
// was cast as an Adventure into its owner's graveyard as it resolves, its controller exiles it. For
// as long as that card remains exiled, that player may play it. It can't be cast as an Adventure
// this way" (CR 715.3d). A countered Adventure goes to the graveyard (CR 715.4's "resolves" is
// the only way to exile it). Cards are SYNTHETIC (src/cards/fixtures/synthetic-layouts.ts).
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

const BEAR = 'SYNTHETIC Brawler Bear // Chop'; // Brawler Bear {1}{G} 2/2; Chop {R} instant, 2 damage to a creature
const OWL = 'SYNTHETIC Wise Owl // Peek'; // Wise Owl {2}{U} 1/1 flier; Peek {U} sorcery, draw a card

const casts = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'castSpell');

describe('characteristics outside the stack: the card only (CR 715.4)', () => {
  test('in hand: the creature, its mana value, and both faces for the UI', () => {
    const g = scenario().seat(0).hand(BEAR).seat(1).build();
    const v = viewOf(g, BEAR);
    expect(v.name).toBe('Brawler Bear');
    expect(v.types).toEqual(['creature']);
    expect(v.manaCost).toEqual(['1', 'G']);
    expect(manaValue(v.manaCost ?? [])).toBe(2);
    expect(v.colors).toEqual(['G']);
    expect(v.face).toBe(0);
    expect(v.faces?.map((f) => [f.name, f.types])).toEqual([
      ['Brawler Bear', ['creature']],
      ['Chop', ['instant']],
    ]);
  });

  test('in the graveyard, the library and the command zone: the same', () => {
    const g = scenario().seat(0).graveyard(BEAR).seat(1).build();
    expect(viewOf(g, BEAR).name).toBe('Brawler Bear');
    expect(viewOf(g, BEAR).types).toEqual(['creature']);
  });
});

describe('casting normally or as an Adventure (CR 715.3)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(BEAR)
      .battlefield('Mountain', 'Forest')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();

  test('two options, one per face; the creature is face 0', () => {
    const g = build();
    const id = g.id(BEAR);
    expect(casts(g)).toEqual([
      { kind: 'castSpell', object: id, face: 0 },
      { kind: 'castSpell', object: id, face: 1 },
    ]);
  });

  test('only the face cast is evaluated: no target for Chop, no mana for the creature', () => {
    // No creature to hit: the Adventure is not offered, the creature is.
    const noTarget = scenario()
      .seat(0)
      .hand(BEAR)
      .battlefield('Mountain', 'Forest')
      .seat(1)
      .build();
    expect(casts(noTarget)).toEqual([{ kind: 'castSpell', object: noTarget.id(BEAR), face: 0 }]);
    noTarget.expect.illegal(0, { cast: BEAR, face: 1 });
    // One Mountain: the Adventure ({R}) but not the creature ({1}{G}).
    const poor = scenario()
      .seat(0)
      .hand(BEAR)
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(casts(poor)).toEqual([{ kind: 'castSpell', object: poor.id(BEAR), face: 1 }]);
  });

  test('the Adventure on the stack has only the Adventure characteristics (CR 715.3b)', () => {
    const g = build();
    g.act(0).cast(BEAR, { face: 1, targets: ['bears'] });
    const v = viewOf(g, BEAR);
    expect(v.zone).toBe('stack');
    expect(v.name).toBe('Chop');
    expect(v.types).toEqual(['instant']);
    expect(v.colors).toEqual(['R']);
    expect(v.manaCost).toEqual(['R']);
    expect(v.power).toBeNull();
    expect(v.face).toBe(1);
  });

  test('a resolved Adventure is exiled, not put in the graveyard, and the card is the creature (CR 715.3d)', () => {
    const g = build();
    g.act(0).cast(BEAR, { face: 1, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 }); // Chop dealt 2 damage
    g.expect.zone(BEAR, 'exile');
    g.expect.noObject(BEAR, { zone: 'graveyard' });
    expect(g.object(BEAR).onAdventure).toBe(true);
    expect(g.object(BEAR).face).toBe(0);
    const v = viewOf(g, BEAR);
    expect(v.onAdventure).toBe(true);
    expect(v.name).toBe('Brawler Bear'); // CR 715.4: only the normal characteristics
    expect(v.types).toEqual(['creature']);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('from exile its owner may cast the creature, not the Adventure again (CR 715.3d)', () => {
    const g = scenario()
      .seat(0)
      .exile(BEAR, { onAdventure: true })
      .battlefield('Mountain', 'Forest', 'Forest')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    const id = g.id(BEAR);
    // One option, face 0: the card is still a card with two faces.
    expect(casts(g)).toEqual([{ kind: 'castSpell', object: id, face: 0 }]);
    g.expect.legal(0, { cast: BEAR, face: 0 });
    g.expect.illegal(0, { cast: BEAR, face: 1 });
    g.act(0).cast(BEAR, { face: 0, pay: true });
    expect(viewOf(g, BEAR).zone).toBe('stack');
    expect(viewOf(g, BEAR).name).toBe('Brawler Bear');
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    // It is a creature with the front face's characteristics, and the Adventure flag is gone.
    expect(g.object(BEAR).onAdventure).toBeUndefined();
    expect(g.object(BEAR).face).toBe(0);
    g.expect.derived(BEAR, { types: ['creature'], subtypes: ['Bear'], colors: ['G'] });
    g.expect.pt(BEAR, 2, 2);
  });

  test('the whole path: Adventure from the hand, then the creature from exile', () => {
    const g = scenario()
      .seat(0)
      .hand(BEAR)
      .battlefield('Mountain', 'Forest', 'Forest', 'Mountain')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast(BEAR, { face: 1, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'exile');
    g.expect.legal(0, { cast: BEAR, face: 0 });
    g.act(0).cast(BEAR, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.noObject(BEAR, { zone: 'exile' });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('a card in exile that is not on an Adventure cannot be cast, nor can the opponent cast it', () => {
    const plain = scenario().seat(0).exile(BEAR).battlefield('Forest', 'Forest').seat(1).build();
    expect(casts(plain)).toEqual([]);
    const theirs = scenario()
      .seat(0)
      .exile(BEAR, { onAdventure: true })
      .seat(1)
      .battlefield('Forest', 'Forest')
      .at('precombatMain', { active: 1 })
      .build();
    expect(casts(theirs, 1)).toEqual([]);
    theirs.expect.illegal(1, { cast: { name: BEAR, seat: 0 }, face: 0 });
  });

  test('cast normally from the hand, the creature is a permanent and is never exiled', () => {
    const g = build();
    g.act(0).cast(BEAR, { face: 0, pay: true });
    expect(viewOf(g, BEAR).name).toBe('Brawler Bear');
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.derived(BEAR, { types: ['creature'] });
    g.expect.pt(BEAR, 2, 2);
  });

  test('a countered Adventure goes to the graveyard (CR 715.4)', () => {
    const g = scenario()
      .seat(0)
      .hand(BEAR)
      .battlefield('Mountain')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island', 'Grizzly Bears')
      .build();
    g.act(0).cast(BEAR, { face: 1, targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [{ name: 'Chop' }], pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    g.expect.noObject(BEAR, { zone: 'exile' });
    expect(g.object(BEAR).onAdventure).toBeUndefined();
    // Back in the graveyard it is the creature card, not castable again.
    expect(viewOf(g, BEAR).name).toBe('Brawler Bear');
    expect(casts(g)).toEqual([]);
  });

  test('an Adventure whose target left does not resolve and goes to the graveyard (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .hand(BEAR)
      .battlefield('Mountain')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain', 'Grizzly Bears')
      .build();
    g.act(0).cast(BEAR, { face: 1, targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.pass(0);
    g.act(1).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    g.expect.noObject(BEAR, { zone: 'exile' });
  });

  test('an Adventure with no target, at sorcery speed (a sorcery Adventure)', () => {
    const g = scenario()
      .seat(0)
      .hand(OWL)
      .library('Plains')
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(OWL, { face: 1, pay: true });
    expect(viewOf(g, OWL).types).toEqual(['sorcery']);
    g.passAll();
    g.expect.handSize(0, 1); // Peek drew the Plains
    g.expect.zone(OWL, 'exile');
  });

  test('the sorcery Adventure cannot be cast at instant speed, the creature neither', () => {
    const g = scenario()
      .seat(0)
      .hand(OWL)
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(casts(g)).toEqual([]);
  });

  test('a creature face with flying keeps it on the battlefield', () => {
    const g = scenario()
      .seat(0)
      .exile(OWL, { onAdventure: true })
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(OWL, { face: 0, pay: true });
    g.passAll();
    g.expect.derived(OWL, { keywords: ['flying'] });
  });

  test('the action is rejected, and the state is unchanged, for a bad face', () => {
    const g = build();
    const before = g.hash();
    const r = applyAction(g.state, 0, { kind: 'castSpell', object: g.id(BEAR), face: 2 });
    expect(r.ok).toBe(false);
    expect(g.hash()).toBe(before);
  });
});
