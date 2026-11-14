// Transforming double-faced cards (CR 712.2) and the transform keyword action (CR 701.27).
// A double-faced spell is cast with its front face up (CR 712.11); a resolving one becomes a
// permanent with the face that was up (CR 712.13). "To transform a permanent, turn it over so that
// its other face is up" (CR 701.27a): it is the same object afterwards (CR 712.18), so its
// counters, attachments, damage, tapped status and the effects that apply to it stay, and it has
// the other face's characteristics and abilities (CR 712.8d, 712.8e), with the mana value of the
// front face (CR 712.8e, 202.3b). Only a double-faced card transforms (CR 712.9); a copy of it
// copies the face that is up (CR 707.8), and the mana value of a copy of a back face is 0 (CR
// 202.3b). A transformed permanent that leaves the battlefield is the front face again (CR 712.8a).
// An ability of a permanent that tries to transform it does so only if it has not transformed since
// the ability was put on the stack (CR 701.27f). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-layouts.ts); "Clone Cub // Clone Beast" is defined here.
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  type CardDefinition,
  checkInvariants,
  getLegalActions,
} from '../src/index';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const CUB = 'SYNTHETIC Moon Cub // Moon Beast'; // Moon Cub {1}{G} 2/2; Moon Beast 4/4 trample; both transform at your upkeep
const SQUIRE = 'SYNTHETIC Squire // Grown Knight'; // Squire {W} 1/1, {1}: transform; Grown Knight 3/3 first strike, {2}: transform
const TURN = 'SYNTHETIC Turn Over'; // {1} instant: transform target creature
const BLADE = 'SYNTHETIC Blade'; // Equipment, +2/+0, equip {1}
const SPURT = 'SYNTHETIC Growth Spurt'; // {G} instant: +3/+3 until end of turn
const SHIFT = 'SYNTHETIC Doppel Shift'; // {1}{U} instant: target creature becomes a copy of another target creature

// A transforming card whose front face makes a token copy of itself: "copy of a transformed permanent".
const CLONE: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Clone Cub // Clone Beast',
  layout: 'transform',
  colorIdentity: ['G'],
  support: 'supported',
  faces: [
    {
      name: 'Clone Cub',
      manaCost: ['G'],
      supertypes: [],
      types: ['creature'],
      subtypes: ['Wolf'],
      colors: ['G'],
      power: 1,
      toughness: 1,
      loyalty: null,
      defense: null,
      oracleText: '{1}: Create a token that is a copy of this creature.',
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          effect: {
            kind: 'createToken',
            token: { kind: 'copyOf', object: { kind: 'this' } },
            count: 1,
          },
        },
      ],
      spell: null,
    },
    {
      name: 'Clone Beast',
      manaCost: null,
      supertypes: [],
      types: ['creature'],
      subtypes: ['Wolf', 'Werewolf'],
      colors: ['G'],
      power: 3,
      toughness: 3,
      loyalty: null,
      defense: null,
      oracleText: '{1}: Create a token that is a copy of this creature.',
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          effect: {
            kind: 'createToken',
            token: { kind: 'copyOf', object: { kind: 'this' } },
            count: 1,
          },
        },
      ],
      spell: null,
    },
  ],
};

const casts = (g: ReturnType<ReturnType<typeof scenario>['build']>): Action[] =>
  getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell');

describe('casting a transforming card: the front face only (CR 712.11)', () => {
  test('one option with no face to choose; the back face cannot be cast', () => {
    const g = scenario().seat(0).hand(CUB).battlefield('Forest', 'Forest').seat(1).build();
    expect(casts(g)).toEqual([{ kind: 'castSpell', object: g.id(CUB) }]);
    g.expect.legal(0, { cast: CUB });
    g.expect.legal(0, { cast: CUB, face: 0 });
    g.expect.illegal(0, { cast: CUB, face: 1 });
    expect(applyAction(g.state, 0, { kind: 'castSpell', object: g.id(CUB), face: 1 }).ok).toBe(
      false,
    );
  });

  test('in hand and on the stack: the front face; on the battlefield: front face up', () => {
    const g = scenario().seat(0).hand(CUB).battlefield('Forest', 'Forest').seat(1).build();
    const hand = viewOf(g, CUB);
    expect(hand.name).toBe('Moon Cub');
    expect(hand.faces?.map((f) => f.name)).toEqual(['Moon Cub', 'Moon Beast']);
    g.act(0).cast(CUB, { pay: true });
    expect(viewOf(g, CUB).name).toBe('Moon Cub');
    expect(viewOf(g, CUB).face).toBe(0);
    g.passAll();
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    expect(g.object(CUB).face).toBe(0);
    g.expect.pt(CUB, 2, 2);
  });
});

describe('transforming a permanent (CR 701.27)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .battlefield(CUB, { label: 'cub', counters: { '+1/+1': 1 }, tapped: true, damage: 1 })
      .battlefield(BLADE, { label: 'blade', attachedTo: 'cub' })
      .hand(TURN)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .build();

  test('the other face is up: name, types, power, toughness, keywords', () => {
    const g = build();
    g.expect.pt('cub', 5, 3); // 2/2, a +1/+1 counter, the Blade's +2/+0
    g.act(0).cast(TURN, { targets: ['cub'], pay: true });
    g.passAll();
    const v = viewOf(g, 'cub');
    expect(v.name).toBe('Moon Beast');
    expect(v.face).toBe(1);
    expect(v.subtypes).toEqual(['Wolf', 'Werewolf']);
    expect(v.keywords).toContain('trample');
    expect(v.faces?.map((f) => f.name)).toEqual(['Moon Cub', 'Moon Beast']);
    g.expect.derived('cub', { types: ['creature'], keywords: ['trample'] });
    g.expect.pt('cub', 7, 5); // 4/4, the counter, the Blade
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('it is the same object, and keeps counters, damage, tapped status and its Equipment (CR 712.18)', () => {
    const g = build();
    const object = g.id('cub');
    const blade = g.id('blade');
    g.act(0).cast(TURN, { targets: ['cub'], pay: true });
    g.passAll();
    expect(g.id('cub')).toBe(object);
    expect(g.object('cub').counters).toEqual({ '+1/+1': 1 });
    expect(g.object('cub').damage).toBe(1);
    expect(g.object('cub').tapped).toBe(true);
    g.expect.attached('blade', 'cub');
    expect(g.id('blade')).toBe(blade);
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
  });

  test('effects that apply to it carry over (CR 712.18)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { label: 'cub' })
      .hand(TURN, SPURT)
      .battlefield('Plains', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(SPURT, { targets: ['cub'], pay: true });
    g.passAll();
    g.expect.pt('cub', 5, 5);
    g.act(0).cast(TURN, { targets: ['cub'], pay: true });
    g.passAll();
    g.expect.pt('cub', 7, 7); // the +3/+3 until end of turn is still there
  });

  test('its mana value is that of the front face (CR 712.8e, 202.3b)', () => {
    const g = build();
    g.act(0).cast(TURN, { targets: ['cub'], pay: true });
    g.passAll();
    expect(viewOf(g, 'cub').manaCost).toEqual(['1', 'G']);
  });

  test('transforming again turns it back to the front face', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { label: 'cub' })
      .hand(TURN, { count: 2 })
      .battlefield('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(`${TURN}[0]`, { targets: ['cub'], pay: true });
    g.passAll();
    expect(viewOf(g, 'cub').name).toBe('Moon Beast');
    g.act(0).cast(`${TURN}[0]`, { targets: ['cub'], pay: true });
    g.passAll();
    expect(viewOf(g, 'cub').name).toBe('Moon Cub');
    expect(g.object('cub').face).toBe(0);
  });

  test('its abilities are the back face abilities: activated, keywords, triggers', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SQUIRE, { label: 'squire' })
      .battlefield('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    const costOf = (name: string) => viewOf(g, name).activated?.map((a) => a.ability.cost);
    expect(costOf('squire')).toEqual([[{ kind: 'mana', symbols: ['1'] }]]);
    expect(viewOf(g, 'squire').keywords).toEqual([]);
    g.act(0).activate('squire', { pay: true });
    g.passAll();
    expect(viewOf(g, 'squire').name).toBe('Grown Knight');
    expect(viewOf(g, 'squire').keywords).toEqual(['firstStrike']);
    expect(costOf('squire')).toEqual([[{ kind: 'mana', symbols: ['2'] }]]);
    g.expect.pt('squire', 3, 3);
  });

  test('an ability that transforms it, put on the stack twice, transforms it once (CR 701.27f)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SQUIRE, { label: 'squire' })
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate('squire', { pay: true });
    g.act(0).activate('squire', { pay: true });
    g.passAll();
    // Both abilities were put on the stack while it was the Squire. The first turned it over; the
    // second finds it has transformed since it was put on the stack, and does nothing.
    expect(viewOf(g, 'squire').name).toBe('Grown Knight');
    // The next activation, put on the stack after it transformed, works.
    g.act(0).activate('squire', { pay: true });
    g.passAll();
    expect(viewOf(g, 'squire').name).toBe('Squire');
    expect(g.object('squire').face).toBe(0);
  });

  test('a trigger at the beginning of your upkeep transforms it, each upkeep', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { label: 'cub' })
      .library('Plains', { count: 6 })
      .seat(1)
      .library('Plains', { count: 6 })
      .at('end', { active: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.passAll();
    expect(viewOf(g, 'cub').name).toBe('Moon Beast');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(viewOf(g, 'cub').name).toBe('Moon Cub'); // the back face's own trigger turned it back
    expect(g.object('cub').face).toBe(0);
  });
});

describe('what does not transform (CR 712.9, 712.10)', () => {
  test('a single-faced creature and a token: nothing happens', () => {
    const g = scenario()
      .seat(0)
      .hand(TURN)
      .battlefield('Plains')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    const before = g.object('bears');
    g.act(0).cast(TURN, { targets: ['bears'], pay: true });
    g.passAll();
    expect(g.object('bears')).toEqual(before);
    g.expect.noEvent({ kind: 'died' });
  });

  test('a copy that is not a double-faced card does not transform, even with the ability', () => {
    // CR 712.9: a Bears that became a copy of a transforming creature is not a double-faced card.
    const g = scenario()
      .seat(0)
      .battlefield(SQUIRE, { label: 'squire' })
      .battlefield('Grizzly Bears', { label: 'bears' })
      .hand(SHIFT)
      .battlefield('Island', 'Island', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(SHIFT, { targets: ['bears', 'squire'], pay: true });
    g.passAll();
    expect(viewOf(g, 'bears').name).toBe('Squire'); // a copy of the front face
    g.act(0).activate('bears', { pay: true });
    g.expect.eventLog([{ kind: 'abilityActivated', source: g.id('bears') }]);
    g.passAll();
    expect(g.object('bears').face).toBe(0);
    expect(viewOf(g, 'bears').name).toBe('Squire');
    expect(viewOf(g, 'bears').face).toBeUndefined(); // it is not a card with several faces
    // The creature that was copied is unchanged.
    expect(viewOf(g, 'squire').name).toBe('Squire');
  });
});

describe('leaving the battlefield: the front face again (CR 712.8a, 400.7)', () => {
  test('a transformed permanent that dies is the front face in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { face: 1, label: 'beast' })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { targets: ['beast'], pay: true });
    g.passAll();
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
    expect(g.object(CUB).face).toBe(0);
    expect(viewOf(g, CUB).name).toBe('Moon Cub');
    expect(g.object(CUB).transformedAt).toBeUndefined();
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('bounced to the hand and cast again, it is the front face', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { face: 1, label: 'beast' })
      .hand('Unsummon')
      .battlefield('Island', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast('Unsummon', { targets: ['beast'], pay: true });
    g.passAll();
    expect(viewOf(g, CUB).name).toBe('Moon Cub');
    g.act(0).cast(CUB, { pay: true });
    g.passAll();
    expect(viewOf(g, CUB).name).toBe('Moon Cub');
    expect(g.object(CUB).face).toBe(0);
  });
});

describe('copies of a transformed permanent (CR 707.8, 202.3b)', () => {
  test('becoming a copy of a transformed permanent copies the face that is up; its mana value is 0', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { face: 1, label: 'beast' })
      .hand(SHIFT)
      .battlefield('Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast(SHIFT, { targets: ['bears', 'beast'], pay: true });
    g.passAll();
    const v = viewOf(g, 'bears');
    expect(v.name).toBe('Moon Beast'); // the back face, not the front face of the card
    expect(v.keywords).toContain('trample');
    expect(v.manaCost).toBeNull(); // CR 202.3b: a copy of a back face has mana value 0
    g.expect.pt('bears', 4, 4);
    // The original is unchanged, with the mana value of its front face.
    expect(viewOf(g, 'beast').manaCost).toEqual(['1', 'G']);
  });

  test('a copy of the front face is the front face', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { label: 'cub' })
      .hand(SHIFT)
      .battlefield('Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast(SHIFT, { targets: ['bears', 'cub'], pay: true });
    g.passAll();
    expect(viewOf(g, 'bears').name).toBe('Moon Cub');
    g.expect.pt('bears', 2, 2);
  });

  test('a token that is a copy of a transformed permanent has the face that was up', () => {
    const g = scenario()
      .define(CLONE)
      .seat(0)
      .battlefield(CLONE.name, { face: 1, label: 'clone' })
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).activate('clone', { pay: true });
    g.passAll();
    const tokens = g.view(0).battlefield.filter((o) => o.isToken);
    expect(tokens.map((t) => t.name)).toEqual(['Clone Beast']);
    expect(tokens[0]?.power).toBe(3);
  });
});

describe('determinism', () => {
  test('replaying the action log of a game with a transformation gives the same state', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SQUIRE, { label: 'squire' })
      .hand(CUB)
      .battlefield('Plains', 'Plains', 'Forest', 'Forest')
      .seat(1)
      .build();
    const start = g.state;
    g.act(0).activate('squire', { pay: true });
    g.passAll();
    g.act(0).cast(CUB, { pay: true });
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
