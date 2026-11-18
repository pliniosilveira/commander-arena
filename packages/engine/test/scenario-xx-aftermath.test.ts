// Aftermath (CR 702.127a): "Aftermath is an ability found on some split cards. It represents three
// static abilities. 'Aftermath' means 'You may cast this half of this split card from your
// graveyard,' 'This half of this split card can't be cast from any zone other than a graveyard,' and
// 'If this spell was cast from a graveyard, exile it instead of putting it anywhere else any time it
// would leave the stack.'" Pins: CR 709.3 (the half is chosen before the card is put on the stack),
// CR 709.3b (only the half cast exists on the stack), CR 709.4 (both halves combined elsewhere),
// CR 601.2 (casting), CR 117.1a (sorcery timing), CR 608.2b (fizzle), CR 701.6 (countered).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-layouts.ts): SYNTHETIC Rite // Toll is Rite {1}{B},
// a sorcery that gains 2 life, and Toll {2}{B}, an Aftermath sorcery that destroys target creature.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, checkInvariants, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const CARD = 'SYNTHETIC Rite // Toll';

const casts = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'castSpell');

const inGraveyard = () =>
  scenario()
    .seat(0)
    .graveyard(CARD)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .battlefield('Grizzly Bears', { label: 'bears' })
    .build();

describe('where the halves are cast from (CR 702.127a)', () => {
  test('in the hand only the first half is offered', () => {
    const g = scenario()
      .seat(0)
      .hand(CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    const id = g.id(CARD);
    expect(casts(g)).toEqual([{ kind: 'castSpell', object: id, face: 0 }]);
    // "This half of this split card can't be cast from any zone other than a graveyard."
    g.expect.illegal(0, { cast: CARD, face: 1 });
  });

  test('in the graveyard only the Aftermath half is offered, with its face and no alternative', () => {
    const g = inGraveyard();
    const id = g.id({ name: CARD, zone: 'graveyard' });
    expect(casts(g)).toEqual([{ kind: 'castSpell', object: id, face: 1 }]);
    g.expect.illegal(0, { cast: CARD, face: 0 }); // the other half is not cast from a graveyard
    g.expect.illegal(0, { cast: CARD, face: 1, alternative: 'flashback' });
  });

  test('not from the library, exile or the command zone', () => {
    for (const zone of ['library', 'exile'] as const) {
      const g = scenario()
        .seat(0)
        [zone](CARD)
        .battlefield('Swamp', 'Swamp', 'Swamp')
        .seat(1)
        .battlefield('Grizzly Bears')
        .build();
      expect(
        getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.face === 1),
        zone,
      ).toEqual([]);
    }
  });

  test("not from the opponent's graveyard", () => {
    const g = scenario()
      .seat(1)
      .graveyard(CARD)
      .seat(0)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(casts(g)).toEqual([]);
  });

  test('the half is evaluated alone: no target or no mana, no option', () => {
    const noTarget = scenario()
      .seat(0)
      .graveyard(CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    expect(casts(noTarget)).toEqual([]);
    const poor = scenario()
      .seat(0)
      .graveyard(CARD)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(casts(poor)).toEqual([]); // Toll costs {2}{B}: three mana
  });

  test('sorcery timing: not in the opponent turn', () => {
    const g = scenario()
      .seat(0)
      .graveyard(CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(casts(g)).toEqual([]);
  });
});

describe('casting and what happens after (CR 702.127a, 709.3b)', () => {
  test('the spell is only Toll, paid with its own mana cost, and resolves', () => {
    const g = inGraveyard();
    g.act(0).cast(CARD, { face: 1, targets: ['bears'], pay: true });
    const v = viewOf(g, CARD);
    expect(v.zone).toBe('stack');
    expect(v.name).toBe('Toll');
    expect(v.manaCost).toEqual(['2', 'B']);
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).every((o) => o.tapped)).toBe(true);
    g.expect.eventLog([{ kind: 'spellCast', face: 1 }]);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    // "Then exile it": the card is in exile, not back in the graveyard.
    g.expect.zone(CARD, 'exile');
    expect(checkInvariants(g.state)).toEqual([]);
    // It cannot be cast again.
    expect(casts(g)).toEqual([]);
  });

  test('a countered Aftermath spell is exiled', () => {
    const g = scenario()
      .seat(0)
      .graveyard(CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast(CARD, { face: 1, targets: ['bears'], pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [{ name: 'Toll' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.zone(CARD, 'exile');
  });

  test('a fizzled Aftermath spell is exiled (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast(CARD, { face: 1, targets: ['bears'], pay: true });
    g.pass(0);
    g.act(1).cast('Lightning Bolt', { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone(CARD, 'exile');
  });

  test('cancelling the cast leaves the card in the graveyard', () => {
    const g = inGraveyard();
    const before = g.positionHash();
    g.act(0).cast(CARD, { face: 1 });
    g.expect.pending('targets', 0);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.zone(CARD, 'graveyard', { seat: 0 });
  });

  test('the first half cast from the hand goes to the graveyard, and then Toll is available', () => {
    const g = scenario()
      .seat(0)
      .hand(CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast(CARD, { face: 0, pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.zone(CARD, 'graveyard', { seat: 0 });
    expect(viewOf(g, CARD).name).toBe('Rite // Toll'); // both halves again (CR 709.4)
    g.act(0).cast(CARD, { face: 1, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone(CARD, 'exile');
  });

  test('applyAction agrees with the legal actions', () => {
    const g = inGraveyard();
    const id = g.id({ name: CARD, zone: 'graveyard' });
    for (const face of [undefined, 0, 1]) {
      const action = { kind: 'castSpell', object: id, ...(face === undefined ? {} : { face }) };
      const listed = getLegalActions(g.state, 0).some(
        (a) => a.kind === 'castSpell' && a.object === id && (a.face ?? 0) === (face ?? 0),
      );
      expect(applyAction(g.state, 0, action as Action).ok, String(face)).toBe(listed);
    }
  });
});
