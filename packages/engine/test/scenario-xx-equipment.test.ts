// Equipment (CR 301.5, 702.6): equip, re-equip, and what happens when the creature goes away.
// Pins: CR 301.5b (Equipment enters unattached; the equip ability attaches it to a creature you
// control; control matters only when it is activated and when it resolves), CR 702.6a ("Equip
// [cost]" means "[Cost]: Attach this permanent to target creature you control. Activate only as a
// sorcery."), CR 701.3b (attaching to what it is already attached to does nothing), CR 701.3c (a new
// timestamp when it moves), CR 701.3d (unattaching), CR 704.5n (an Equipment attached to an illegal
// permanent becomes unattached and stays on the battlefield), CR 602.5d (sorcery timing), CR 608.2b
// (a target that is gone makes the ability not resolve). Cards are SYNTHETIC (src/cards/fixtures).
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions } from '../src/index';
import { derive } from '../src/rules/derive';
import { createDriver, type ScenarioGame, scenario } from '../src/testing/index';

const BLADE = 'SYNTHETIC Blade'; // +2/+0, equip {1}
const CLOAK = 'SYNTHETIC Cloak'; // +0/+2 and hexproof, equip {2}
const BLOOD = 'SYNTHETIC Blood Blade'; // +3/+0, equip pay 2 life
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';

const activates = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'activate');

/** The index of the equip ability among the Equipment's derived abilities. */
function equipIndex(g: ScenarioGame, name: string): number {
  const abilities = derive(g.state, g.object(name)).abilities;
  const i = abilities.findIndex((a) => a.kind === 'activated');
  if (i < 0) throw new Error(`${name} has no activated ability`);
  return i;
}

describe('CR 702.6a: Equip is "[Cost]: Attach this to target creature you control", at sorcery speed', () => {
  test('derive expands the keyword after the printed abilities and keeps the keyword', () => {
    const g = scenario().seat(0).battlefield(BLADE).seat(1).build();
    const abilities = derive(g.state, g.object(BLADE)).abilities;
    expect(abilities.map((a) => a.kind)).toEqual(['static', 'keyword', 'activated']);
    expect(abilities[2]).toEqual({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
      ],
      effect: { kind: 'attach', object: { kind: 'this' }, to: { kind: 'target', id: 't1' } },
      timing: 'sorcery',
      equip: true, // D-1233: what "Equip abilities you activate that target ..." names
    });
  });

  test('the targets are the creatures the activating player controls, nothing else', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, 'Forest')
      .battlefield(BEARS, 'Plains')
      .seat(1)
      .battlefield(VANILLA)
      .build();
    g.act(0).activate(BLADE);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const names = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? g.object(t.id) : null));
    expect(names?.map((o) => o?.controller)).toEqual([0]);
    expect(names).toHaveLength(1);
  });

  test('equipping pays the cost, attaches at resolution, and gives the bonus', () => {
    const g = scenario().seat(0).battlefield(BLADE, 'Forest').battlefield(BEARS).seat(1).build();
    const mark = g.mark();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.expect.attached(BLADE, null);
    g.expect.pt(BEARS, 2, 2);
    g.expect.tapped('Forest');
    g.expect.stack([`${BLADE} (ability)`]);
    g.passAll();
    g.expect.attached(BLADE, BEARS);
    g.expect.pt(BEARS, 4, 2);
    g.expect.eventLog(
      [
        { kind: 'abilityActivated', source: g.id(BLADE) },
        { kind: 'attached', object: g.id(BLADE), to: g.id(BEARS) },
      ],
      { since: mark },
    );
    g.expect.noEvent({ kind: 'unattached' }, { since: mark });
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
  });

  test('the view shows the Equipment on the creature and the creature with its bonus', () => {
    const g = scenario().seat(0).battlefield(BLADE, 'Forest').battlefield(BEARS).seat(1).build();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    const field = g.view(1).battlefield;
    expect(field.find((o) => o.name === BLADE)?.attachedTo).toBe(g.id(BEARS));
    expect(field.find((o) => o.name === BEARS)).toMatchObject({
      attachments: [g.id(BLADE)],
      power: 4,
      toughness: 2,
    });
  });

  test('an Equipment spell enters the battlefield unattached (CR 301.5b)', () => {
    const g = scenario()
      .seat(0)
      .hand(BLADE)
      .battlefield('Forest')
      .battlefield(BEARS)
      .seat(1)
      .build();
    const mark = g.mark();
    g.act(0).cast(BLADE, { pay: true });
    g.passAll();
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
    g.expect.attached(BLADE, null);
    g.expect.noEvent({ kind: 'attached' }, { since: mark });
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('CR 602.5d: Equip is a sorcery-speed ability, and the engine agrees with the legal list', () => {
  const idx = (g: ScenarioGame) => equipIndex(g, BLADE);

  test('offered in the main phase with an empty stack; the same action is accepted', () => {
    const g = scenario().seat(0).battlefield(BLADE, 'Forest').battlefield(BEARS).seat(1).build();
    expect(activates(g)).toEqual([{ kind: 'activate', object: g.id(BLADE), abilityIndex: idx(g) }]);
    g.expect.legal(0, { activate: BLADE, ability: idx(g) });
  });

  test('not offered, and refused, in any step but a main phase', () => {
    for (const step of ['upkeep', 'beginningOfCombat', 'declareAttackers', 'end'] as const) {
      const g = scenario()
        .seat(0)
        .battlefield(BLADE, 'Forest')
        .battlefield(BEARS)
        .seat(1)
        .at(step, { active: 0, priority: 0 })
        .build();
      expect(activates(g), step).toEqual([]);
      g.expect.illegal(0, { activate: BLADE, ability: 2 });
    }
  });

  test('not on the opponent turn, and not with something on the stack', () => {
    const theirs = scenario()
      .seat(0)
      .battlefield(BLADE, 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(activates(theirs)).toEqual([]);
    theirs.expect.illegal(0, { activate: BLADE, ability: 2 });

    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield(BLADE, 'Forest', 'Mountain')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0)
      .cast('Lightning Bolt', { targets: [{ player: 1 }] })
      .payManual(['Mountain']);
    g.expect.stack(['Lightning Bolt']);
    expect(activates(g)).toEqual([]);
    g.expect.illegal(0, { activate: BLADE, ability: 2 });
  });

  test('not offered without a creature to equip or without the mana', () => {
    const noCreature = scenario().seat(0).battlefield(BLADE, 'Forest').seat(1).battlefield(VANILLA);
    expect(activates(noCreature.build())).toEqual([]);
    const noMana = scenario().seat(0).battlefield(BLADE).battlefield(BEARS).seat(1).build();
    expect(activates(noMana)).toEqual([]);
    expect(noMana.act(0).try.activate(BLADE).ok).toBe(false);
  });

  test('the opponent never sees my Equipment ability, even with priority', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE)
      .seat(1)
      .battlefield('Forest')
      .battlefield(VANILLA)
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    expect(activates(g, 1)).toEqual([]);
    expect(g.act(1).try.action({ kind: 'activate', object: g.id(BLADE), abilityIndex: 2 }).ok).toBe(
      false,
    );
  });

  test('every activate action the engine lists is accepted by applyAction', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, CLOAK, 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS, VANILLA)
      .seat(1)
      .build();
    const listed = activates(g);
    expect(listed).toHaveLength(2);
    for (const action of listed) {
      const copy = createDriver(g.state);
      expect(copy.act(0).try.action(action).ok).toBe(true);
    }
  });
});

describe('re-equipping (CR 701.3b, 701.3c, 701.3d)', () => {
  function equipped() {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS, VANILLA)
      .seat(1)
      .build();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    return g;
  }

  test('equipping another creature moves it: unattached (replaced) then attached', () => {
    const g = equipped();
    const stamp = g.object(BLADE).timestamp;
    const mark = g.mark();
    g.act(0).activate(BLADE, { targets: [VANILLA], pay: true });
    g.passAll();
    g.expect.attached(BLADE, VANILLA);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(VANILLA, 5, 3);
    g.expect.eventLog(
      [
        { kind: 'unattached', object: g.id(BLADE), from: g.id(BEARS), reason: 'replaced' },
        { kind: 'attached', object: g.id(BLADE), to: g.id(VANILLA) },
      ],
      { since: mark },
    );
    expect(g.object(BLADE).timestamp).toBeGreaterThan(stamp);
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.attachments).toBeUndefined();
  });

  test('equipping the creature it is already on does nothing: no events, no new timestamp', () => {
    const g = equipped();
    const stamp = g.object(BLADE).timestamp;
    const mark = g.mark();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(BLADE, BEARS);
    g.expect.pt(BEARS, 4, 2);
    g.expect.noEvent({ kind: 'attached' }, { since: mark });
    g.expect.noEvent({ kind: 'unattached' }, { since: mark });
    expect(g.object(BLADE).timestamp).toBe(stamp);
  });

  test('two Equipment on one creature both apply', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, CLOAK, 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).activate(CLOAK, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.attachments).toEqual([
      g.id(BLADE),
      g.id(CLOAK),
    ]);
  });
});

describe('CR 704.5n: an Equipment attached to an illegal permanent becomes unattached and stays', () => {
  test('the creature dies: the Equipment stays on the battlefield, unattached (left)', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    const mark = g.mark();
    g.act(0).cast('Murder', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
    g.expect.attached(BLADE, null);
    g.expect.eventLog(
      [
        { kind: 'died', cardName: BEARS },
        { kind: 'unattached', object: g.id(BLADE), reason: 'left' },
      ],
      { since: mark },
    );
    g.expect.invariants();
  });

  test('the creature is bounced and comes back: the Equipment is not on the new object', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).cast('Unsummon', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.attached(BLADE, null);
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
  });

  test('the creature stops being a creature: unattached because the host is illegal', () => {
    const base = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    const definitions = base.state.definitions.map((def) =>
      def.name === BEARS
        ? {
            ...def,
            faces: def.faces.map((f) => ({
              ...f,
              types: ['artifact' as const],
              power: null,
              toughness: null,
            })),
          }
        : def,
    );
    const g = createDriver({ ...base.state, definitions });
    const mark = g.mark();
    g.act(0).pass();
    g.expect.attached(BLADE, null);
    g.expect.eventLog([{ kind: 'unattached', object: g.id(BLADE), reason: 'illegal' }], {
      since: mark,
    });
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
  });

  test('a creature stolen from its Equipment controller keeps the Equipment (CR 301.5b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS, { controller: 1 })
      .seat(1)
      .build({ settle: true });
    g.expect.attached(BLADE, BEARS);
    g.expect.pt(BEARS, 4, 2);
  });

  test('a permanent that is not an Equipment or Aura is never attached (CR 704.5p)', () => {
    const base = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    // The Equipment loses its subtype (CR 301.5c): it becomes unattached and stays.
    const definitions = base.state.definitions.map((def) =>
      def.name === BLADE
        ? { ...def, faces: def.faces.map((f) => ({ ...f, subtypes: [] as string[] })) }
        : def,
    );
    const g = createDriver({ ...base.state, definitions });
    g.act(0).pass();
    g.expect.attached(BLADE, null);
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
  });
});

describe('CR 608.2b: the equip ability checks its target as it resolves', () => {
  test('the creature dies in response: the Equipment stays where it was and nothing attaches', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, 'Forest')
      .battlefield(BEARS, VANILLA)
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    const mark = g.mark();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.attached(BLADE, null);
    g.expect.eventLog([{ kind: 'fizzled' }], { since: mark });
    g.expect.noEvent({ kind: 'attached' }, { since: mark });
  });

  test('a creature with hexproof from an Equipment is still a legal equip target for its controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, 'Forest', 'Forest', 'Forest')
      .battlefield(CLOAK, 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).activate(CLOAK, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
  });
});

describe('equip costs other than mana', () => {
  test('Equip-Pay 2 life takes the life and is offered only with enough', () => {
    const g = scenario().seat(0).battlefield(BLOOD).battlefield(BEARS).seat(1).build();
    g.act(0).activate(BLOOD, { targets: [BEARS] });
    g.expect.life(0, 38);
    g.passAll();
    g.expect.pt(BEARS, 5, 2);
    const poor = scenario().seat(0).life(1).battlefield(BLOOD).battlefield(BEARS).seat(1).build();
    expect(activates(poor)).toEqual([]);
  });
});
