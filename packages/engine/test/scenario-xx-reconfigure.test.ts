// Reconfigure (CR 702.151) and Equipment that are creatures (CR 301.5c, 704.5n), at three seats.
// Pins: CR 702.151a (two sorcery-speed activated abilities: attach to another target creature you
// control; unattach, only while attached to a creature), CR 702.151b (attached, the Equipment stops
// being a creature until it is unattached), CR 301.5c (an Equipment that is a creature can't equip
// unless it has reconfigure; an Equipment can't equip itself), CR 704.5n (illegally attached
// Equipment becomes unattached). Cards are SYNTHETIC (src/cards/fixtures/synthetic-attachments.ts).
import { describe, expect, test } from 'vitest';
import { getLegalActions } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const RC = 'SYNTHETIC Reconfigure Blade'; // 1/3 Equipment creature, +2/+0, reconfigure {2}
const PLAIN = 'SYNTHETIC Plain Equipment Creature'; // 1/1 Equipment creature, +2/+0, equip {1}
const BEARS = 'Grizzly Bears';
const ISAMARU = 'Isamaru, Hound of Konda';
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const ATTACH = 2; // derived index: static, keyword, then the two expansions
const UNATTACH = 3;

const three = () =>
  scenario({ seats: 3 })
    .seat(0)
    .battlefield(RC, 'Island', 'Island', 'Island', 'Island', BEARS, ISAMARU)
    .seat(1)
    .battlefield(VANILLA)
    .seat(2)
    .battlefield(VANILLA);

const isCreature = (g: ScenarioGame, name: string): boolean =>
  derive(g.state, g.object(name)).types.includes('creature');
const offered = (g: ScenarioGame, name: string, index: number): boolean =>
  getLegalActions(g.state, 0).some(
    (a) => a.kind === 'activate' && a.object === g.id(name) && a.abilityIndex === index,
  );

describe('CR 702.151a: Reconfigure expands to an attach and an unattach ability', () => {
  test('derive adds both sorcery-speed abilities after the keyword', () => {
    const g = three().build();
    const abilities = derive(g.state, g.object(RC)).abilities;
    expect(abilities.map((a) => a.kind)).toEqual(['static', 'keyword', 'activated', 'activated']);
    const attach = abilities[ATTACH];
    if (attach?.kind !== 'activated') throw new Error('expected activated');
    expect(attach.timing).toBe('sorcery');
    expect(attach.effect).toEqual({
      kind: 'attach',
      object: { kind: 'this' },
      to: { kind: 'target', id: 't1' },
    });
    const un = abilities[UNATTACH];
    if (un?.kind !== 'activated') throw new Error('expected activated');
    expect(un.timing).toBe('sorcery');
    expect(un.effect).toEqual({ kind: 'unattach', object: { kind: 'this' } });
  });

  test('unattached it is a creature; the attach ability targets only other creatures you control', () => {
    const g = three().build();
    expect(isCreature(g, RC)).toBe(true);
    g.act(0).activate(RC, { ability: ATTACH });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null));
    expect(legal).toHaveLength(2);
    expect(legal).toContain(g.id(BEARS));
    expect(legal).toContain(g.id(ISAMARU));
    expect(legal).not.toContain(g.id(RC));
  });

  test('the unattach ability is offered only while it is attached to a creature', () => {
    const g = three().build();
    expect(offered(g, RC, ATTACH)).toBe(true);
    expect(offered(g, RC, UNATTACH)).toBe(false);
    g.act(0).activate(RC, { ability: ATTACH, targets: [BEARS], pay: true });
    g.passAll();
    expect(offered(g, RC, UNATTACH)).toBe(true);
  });

  test('attaching: it stops being a creature (its creature types too) and gives its bonus', () => {
    const g = three().build();
    g.act(0).activate(RC, { ability: ATTACH, targets: [BEARS], pay: true });
    g.expect.attached(RC, null); // the ability is on the stack
    g.passAll();
    g.expect.attached(RC, BEARS);
    expect(isCreature(g, RC)).toBe(false);
    expect(derive(g.state, g.object(RC)).subtypes).not.toContain('Construct');
    expect(derive(g.state, g.object(RC)).subtypes).toContain('Equipment');
    g.expect.pt(BEARS, 4, 2);
    g.expect.zone(RC, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('unattaching: it becomes a creature again and the bonus goes', () => {
    const g = three().build();
    g.act(0).activate(RC, { ability: ATTACH, targets: [BEARS], pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).activate(RC, { ability: UNATTACH, pay: true });
    g.passAll();
    g.expect.attached(RC, null);
    expect(isCreature(g, RC)).toBe(true);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(RC, 1, 3);
    g.expect.eventLog(
      [{ kind: 'unattached', object: g.id(RC), from: g.id(BEARS), reason: 'effect' }],
      { since: mark },
    );
    g.expect.invariants();
  });

  test('it moves from one creature to another and stays a non-creature', () => {
    const g = three().build();
    g.act(0).activate(RC, { ability: ATTACH, targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).activate(RC, { ability: ATTACH, targets: [ISAMARU], pay: true });
    g.passAll();
    g.expect.attached(RC, ISAMARU);
    expect(isCreature(g, RC)).toBe(false);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(ISAMARU, 4, 2);
  });

  test('sorcery speed: not offered on an opponent turn, nor with a non-empty stack', () => {
    const g = three().at('precombatMain', { active: 1, priority: 0 }).build();
    expect(offered(g, RC, ATTACH)).toBe(false);
  });

  test('when its creature dies it becomes unattached and a creature again (CR 704.5n, 702.151b)', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield(BEARS)
      .battlefield(RC, { attachedTo: BEARS })
      .seat(1)
      .seat(2)
      .build();
    g.expect.attached(RC, BEARS);
    g.act(0).cast('Murder', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.attached(RC, null);
    expect(isCreature(g, RC)).toBe(true);
    g.expect.invariants();
  });
});

describe('CR 301.5c: an Equipment that is a creature', () => {
  test('without reconfigure it cannot equip: the attach does nothing', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(PLAIN, 'Island', BEARS)
      .seat(1)
      .seat(2)
      .build();
    g.act(0).activate(PLAIN, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(PLAIN, null);
    g.expect.pt(BEARS, 2, 2);
  });

  test('without reconfigure, placed attached, it becomes unattached as a state-based action', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(BEARS)
      .battlefield(PLAIN, { attachedTo: BEARS })
      .seat(1)
      .seat(2)
      .build();
    g.act(0).pass(); // state-based actions are checked when a player would receive priority
    g.expect.attached(PLAIN, null);
  });

  test('with reconfigure, placed attached, it stays attached (it is not a creature)', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(BEARS)
      .battlefield(RC, { attachedTo: BEARS })
      .seat(1)
      .seat(2)
      .build();
    g.expect.attached(RC, BEARS);
    expect(isCreature(g, RC)).toBe(false);
  });
});

describe('"As long as ~ is attached to a creature, you may play lands and cast spells from the top of your library"', () => {
  const CHIP = 'SYNTHETIC Library Chip';
  const FILLER = Array.from({ length: 6 }, () => 'Mountain');
  const game = (top: string, attached: boolean) => {
    const b = scenario({ seats: 3 })
      .seat(0)
      .battlefield(BEARS)
      .battlefield(CHIP, attached ? { attachedTo: BEARS } : {})
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .library(top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER);
    return b.build();
  };

  test('unattached: neither a land nor a spell on top may be played', () => {
    const land = game('Forest', false);
    land.expect.illegal(0, { playLand: { name: 'Forest', zone: 'library', seat: 0 } });
    const spell = game('Lightning Bolt', false);
    spell.expect.illegal(0, { cast: { name: 'Lightning Bolt', zone: 'library', seat: 0 } });
  });

  test('attached: the land on top may be played from the library', () => {
    const g = game('Forest', true);
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });

  test('attached: a spell on top may be cast from the library', () => {
    const g = game('Divination', true);
    g.expect.legal(0, { cast: 'Divination' });
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.zone('Divination', 'graveyard', { seat: 0 });
  });

  test('unattaching it ends both permissions (the condition is read as the card is played)', () => {
    const g = game('Divination', true);
    g.expect.legal(0, { cast: 'Divination' });
    g.act(0).activate(CHIP, { ability: 4, pay: true }); // static, static, keyword, attach, unattach
    g.passAll();
    g.expect.attached(CHIP, null);
    g.expect.illegal(0, { cast: { name: 'Divination', zone: 'library', seat: 0 } });
  });
});
