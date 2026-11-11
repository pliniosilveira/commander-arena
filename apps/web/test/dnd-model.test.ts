import type {
  DeclareAttackersDecision,
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { objectIndex } from '../src/ui/decisions/lookup';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import {
  accepts,
  type DragSource,
  type DropTarget,
  dragSpec,
  labelFor,
  parseZoneKey,
  resolveDrop,
  zoneKey,
} from '../src/ui/dnd/model';

const o = (n: number): ObjectId => `o${n}`;
const card = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: o(n),
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    ...patch,
  }) as ObjectView;

const view = {
  viewer: 0,
  battlefield: [
    card(1, 'Grizzly Bears'),
    card(2, 'Serra Angel'),
    card(10, 'Goblin Guide', { controller: 1 }),
    card(12, 'Jace', { controller: 1, types: ['planeswalker'] }),
  ],
  stack: [],
  exile: [],
  seats: [
    {
      id: 0,
      hand: [card(5, 'Lightning Bolt', { types: ['instant'] }), card(6, 'Plains')],
      graveyard: [],
      command: [card(7, 'Commander')],
    },
    { id: 1, hand: null, graveyard: [], command: [] },
  ],
} as unknown as GameView;
const index = objectIndex(view);

const spec = (p: PendingDecision, ui: UiState, id: ObjectId, source: DragSource) =>
  dragSpec(p, ui, index, 0, id, source);
const drop = (
  p: PendingDecision,
  ui: UiState,
  id: ObjectId,
  source: DragSource,
  target: DropTarget,
) => resolveDrop(p, ui, index, 0, id, source, target);
const apply = (r: ReturnType<typeof drop>, ui: UiState): UiState =>
  r.kind === 'ui' ? r.change(ui) : ui;

const BATTLEFIELD: DropTarget = { kind: 'battlefield' };
const STACK: DropTarget = { kind: 'stack' };

describe('zone keys', () => {
  test('round trip, and unknown text is not a zone', () => {
    for (const t of [
      BATTLEFIELD,
      STACK,
      { kind: 'seat', seat: 1 },
      { kind: 'object', id: o(12) },
    ] satisfies DropTarget[]) {
      expect(parseZoneKey(zoneKey(t))).toEqual(t);
    }
    expect(parseZoneKey('')).toBeNull();
    expect(parseZoneKey('seat:x')).toBeNull();
    expect(parseZoneKey('object:12')).toBeNull();
    expect(parseZoneKey('hand')).toBeNull();
  });
});

describe('priority: hand cards and the commander', () => {
  const pending: PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'priority',
    options: [
      { kind: 'pass' },
      { kind: 'castSpell', object: o(5) },
      { kind: 'playLand', object: o(6) },
      { kind: 'castSpell', object: o(7) },
      { kind: 'activateAbility', source: o(1), abilityIndex: 0, color: 'W' },
    ],
  };
  const ui = initialUi(pending);

  test('a spell and a land offer the battlefield and the stack, worded by what the click does', () => {
    const bolt = spec(pending, ui, o(5), 'card');
    expect(bolt?.zones.map((z) => zoneKey(z.target))).toEqual(['battlefield', 'stack']);
    expect(labelFor(bolt, BATTLEFIELD)).toBe('Cast Lightning Bolt');
    expect(labelFor(spec(pending, ui, o(6), 'card'), STACK)).toBe('Play Plains');
    expect(labelFor(spec(pending, ui, o(7), 'card'), BATTLEFIELD)).toBe('Cast Commander');
  });

  test('a drop on a valid zone is the click; elsewhere and for other objects it is nothing', () => {
    expect(drop(pending, ui, o(5), 'card', BATTLEFIELD)).toEqual({ kind: 'click' });
    expect(drop(pending, ui, o(6), 'card', STACK)).toEqual({ kind: 'click' });
    expect(drop(pending, ui, o(5), 'card', { kind: 'seat', seat: 1 })).toEqual({ kind: 'none' });
    expect(drop(pending, ui, o(5), 'card', { kind: 'object', id: o(10) })).toEqual({
      kind: 'none',
    });
  });

  test('permanents and cards without a cast or play option are not draggable', () => {
    expect(spec(pending, ui, o(1), 'permanent')).toBeNull(); // a land tapped for mana: click only
    expect(spec(pending, ui, o(1), 'card')).toBeNull();
    expect(spec(pending, ui, o(99), 'card')).toBeNull();
    expect(drop(pending, ui, o(1), 'permanent', BATTLEFIELD)).toEqual({ kind: 'none' });
    expect(accepts(null, BATTLEFIELD)).toBe(false);
  });

  test('other decisions offer nothing to drag', () => {
    const targets = {
      id: 'd2',
      seat: 0,
      kind: 'mulligan',
      canMulligan: true,
    } as unknown as PendingDecision;
    expect(spec(targets, initialUi(targets), o(5), 'card')).toBeNull();
  });
});

describe('declareAttackers', () => {
  const pending: DeclareAttackersDecision & PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'declareAttackers',
    mustAttack: [],
    candidates: [
      {
        attacker: o(1),
        targets: [
          { kind: 'player', seat: 1 },
          { kind: 'permanent', object: o(12) },
        ],
      },
      { attacker: o(2), targets: [{ kind: 'player', seat: 1 }] },
    ],
  };
  const fresh = initialUi(pending);
  const player: DropTarget = { kind: 'seat', seat: 1 };
  const walker: DropTarget = { kind: 'object', id: o(12) };

  test('only legal targets are zones; your battlefield joins once the creature attacks', () => {
    const before = spec(pending, fresh, o(1), 'permanent');
    expect(before?.zones.map((z) => zoneKey(z.target))).toEqual(['seat:1', `object:${o(12)}`]);
    expect(labelFor(before, player)).toBe('Attack Opponent');
    expect(labelFor(before, walker)).toBe('Attack Jace');
    // o(2) may not attack the planeswalker: it is not even a zone.
    expect(accepts(spec(pending, fresh, o(2), 'permanent'), walker)).toBe(false);
    expect(drop(pending, fresh, o(2), 'permanent', walker)).toEqual({ kind: 'none' });

    const after = apply(drop(pending, fresh, o(1), 'permanent', player), fresh);
    expect(labelFor(spec(pending, after, o(1), 'permanent'), BATTLEFIELD)).toContain(
      'Grizzly Bears',
    );
  });

  test('a creature may not be dragged during the declaration unless it is a candidate, or as a card', () => {
    expect(spec(pending, fresh, o(10), 'permanent')).toBeNull();
    expect(spec(pending, fresh, o(1), 'card')).toBeNull();
  });

  test('drop on a player attacks it, on a planeswalker aims there, on your battlefield removes', () => {
    let ui = apply(drop(pending, fresh, o(1), 'permanent', player), fresh);
    expect(ui.attacks).toEqual([{ attacker: o(1), target: { kind: 'player', seat: 1 } }]);
    // Dropping on the same player again changes nothing.
    ui = apply(drop(pending, ui, o(1), 'permanent', player), ui);
    expect(ui.attacks).toHaveLength(1);

    ui = apply(drop(pending, ui, o(1), 'permanent', walker), ui);
    expect(ui.attacks).toEqual([{ attacker: o(1), target: { kind: 'permanent', object: o(12) } }]);

    ui = apply(drop(pending, ui, o(1), 'permanent', player), ui);
    expect(ui.attacks).toEqual([{ attacker: o(1), target: { kind: 'player', seat: 1 } }]);

    ui = apply(drop(pending, ui, o(1), 'permanent', BATTLEFIELD), ui);
    expect(ui.attacks).toEqual([]);
  });

  test('a creature that is not attacking cannot be "taken back": the battlefield is no zone', () => {
    expect(drop(pending, fresh, o(1), 'permanent', BATTLEFIELD)).toEqual({ kind: 'none' });
  });

  test('a new attacker dropped on a planeswalker attacks it directly, other attackers are untouched', () => {
    let ui = apply(drop(pending, fresh, o(2), 'permanent', player), fresh);
    ui = apply(drop(pending, ui, o(1), 'permanent', walker), ui);
    expect(ui.attacks).toEqual([
      { attacker: o(2), target: { kind: 'player', seat: 1 } },
      { attacker: o(1), target: { kind: 'permanent', object: o(12) } },
    ]);
  });
});

describe('declareBlockers', () => {
  const pending: DeclareBlockersDecision & PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'declareBlockers',
    attackers: [
      { attacker: o(10), target: { kind: 'player', seat: 0 }, minBlockers: 1 },
      { attacker: o(11), target: { kind: 'player', seat: 0 }, minBlockers: 1 },
    ],
    candidates: [
      { blocker: o(1), canBlock: [o(10), o(11)] },
      { blocker: o(2), canBlock: [o(11)] },
    ],
  };
  const fresh = initialUi(pending);

  test('only the attackers a blocker can block are zones', () => {
    const s = spec(pending, fresh, o(2), 'permanent');
    expect(s?.zones.map((z) => zoneKey(z.target))).toEqual([`object:${o(11)}`]);
    expect(spec(pending, fresh, o(10), 'permanent')).toBeNull();
  });

  test('a drop assigns the block, re-assigns it, and ignores illegal and other drops', () => {
    let ui = apply(drop(pending, fresh, o(1), 'permanent', { kind: 'object', id: o(10) }), fresh);
    expect(ui.block).toEqual({ blocks: [{ blocker: o(1), attacker: o(10) }], blocker: null });
    ui = apply(drop(pending, ui, o(1), 'permanent', { kind: 'object', id: o(11) }), ui);
    expect(ui.block.blocks).toEqual([{ blocker: o(1), attacker: o(11) }]);
    ui = apply(drop(pending, ui, o(2), 'permanent', { kind: 'object', id: o(11) }), ui);
    expect(ui.block.blocks).toHaveLength(2);

    expect(drop(pending, fresh, o(2), 'permanent', { kind: 'object', id: o(10) })).toEqual({
      kind: 'none',
    });
    expect(drop(pending, fresh, o(1), 'permanent', BATTLEFIELD)).toEqual({ kind: 'none' });
    expect(drop(pending, fresh, o(1), 'permanent', { kind: 'seat', seat: 1 })).toEqual({
      kind: 'none',
    });
  });
});
