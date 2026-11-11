/**
 * Drag and drop for Equipment, Auras and flashback, the pure part: which zones each gesture offers,
 * computed from the legal options and the view, and what a drop on each does. The objects are made
 * up for the test (no real card text beyond the Oracle lines the readers look for).
 */
import type {
  ActivatedAbility,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { objectIndex } from '../src/ui/decisions/lookup';
import { initialUi } from '../src/ui/decisions/ui-state';
import { enchantFilter } from '../src/ui/dnd/hosts';
import {
  accepts,
  type DragSource,
  type DropTarget,
  dragSpec,
  labelFor,
  resolveDrop,
  zoneKey,
} from '../src/ui/dnd/model';

const o = (n: number): ObjectId => `o${n}`;
const obj = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: o(n),
    name,
    controller: 0,
    owner: 0,
    zone: 'battlefield',
    types: ['creature'],
    subtypes: [],
    supertypes: [],
    colors: [],
    keywords: [],
    tapped: false,
    oracleText: '',
    ...patch,
  }) as ObjectView;

/** An Equip ability as the view carries it: attach this, to the creature the slot names. */
const equipAbility = (filter: object = { types: ['creature'], controller: 'you' }) =>
  ({
    effect: { kind: 'attach', object: { kind: 'this' }, to: { kind: 'target', id: 't1' } },
    targets: [{ id: 't1', what: { kind: 'object', filter } }],
    cost: [],
  }) as unknown as ActivatedAbility;

const BLADE = 20;
const AURA = 21;
const FLASH = 22;
const bears = obj(1, 'Grizzly Bears');
const angel = obj(2, 'Serra Angel');
const forest = obj(3, 'Forest', { types: ['land'] });
const enemy = obj(10, 'Goblin Guide', { controller: 1 });
const hexed = obj(11, 'Hexproof Beast', { controller: 1, keywords: ['hexproof'] });
const shrouded = obj(12, 'Shrouded Elf', { keywords: ['shroud'] });
const blade = obj(BLADE, 'Blade', {
  types: ['artifact'],
  subtypes: ['Equipment'],
  activated: [{ abilityIndex: 0, ability: equipAbility() }],
});
const aura = obj(AURA, 'Might Aura', {
  zone: 'hand',
  types: ['enchantment'],
  subtypes: ['Aura'],
  oracleText: 'Enchant creature\nEnchanted creature gets +2/+2.',
});
const flash = obj(FLASH, 'Flash Gain', {
  zone: 'graveyard',
  types: ['instant'],
  oracleText: 'You gain 3 life.\nFlashback {2}{W}',
});

function viewOf(battlefield: ObjectView[], hand: ObjectView[] = [], grave: ObjectView[] = []) {
  return {
    viewer: 0,
    battlefield,
    stack: [],
    exile: [],
    seats: [
      { id: 0, hand, graveyard: grave, command: [] },
      { id: 1, hand: null, graveyard: [], command: [] },
    ],
  } as unknown as GameView;
}

const priority = (options: PriorityOption[]): PendingDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options],
});

const ctx = (view: GameView, pending: PendingDecision) => {
  const index = objectIndex(view);
  const ui = initialUi(pending);
  return {
    spec: (id: ObjectId, source: DragSource) => dragSpec(pending, ui, index, 0, id, source),
    drop: (id: ObjectId, source: DragSource, target: DropTarget) =>
      resolveDrop(pending, ui, index, 0, id, source, target),
  };
};

const keys = (spec: ReturnType<ReturnType<typeof ctx>['spec']>) =>
  spec?.zones.map((z) => zoneKey(z.target)) ?? [];
const objectZone = (n: number): DropTarget => ({ kind: 'object', id: o(n) });
const BATTLEFIELD: DropTarget = { kind: 'battlefield' };

describe('Equipment dragged onto a creature', () => {
  const equip: PriorityOption = { kind: 'activate', object: o(BLADE), abilityIndex: 0 };
  const view = viewOf([bears, angel, forest, enemy, shrouded, blade]);
  const g = ctx(view, priority([equip]));

  test('only the creatures you control are zones, worded "Equip <name>"', () => {
    const spec = g.spec(o(BLADE), 'permanent');
    // Not the land, the opponent's creature, a shrouded one (illegal target) or the Blade itself.
    expect(keys(spec)).toEqual([`object:${o(1)}`, `object:${o(2)}`]);
    expect(labelFor(spec, objectZone(1))).toBe('Equip Grizzly Bears');
    expect(accepts(spec, BATTLEFIELD)).toBe(false);
  });

  test('a drop on a legal host starts the equip action and names the host', () => {
    expect(g.drop(o(BLADE), 'permanent', objectZone(2))).toEqual({
      kind: 'attach',
      start: { kind: 'activate', object: o(BLADE), abilityIndex: 0 },
      host: o(2),
    });
  });

  test('a drop anywhere else does nothing: other permanents, your battlefield, a player', () => {
    for (const target of [
      objectZone(3),
      objectZone(10),
      objectZone(12),
      objectZone(BLADE),
      BATTLEFIELD,
      { kind: 'stack' },
      { kind: 'seat', seat: 1 },
    ] satisfies DropTarget[]) {
      expect(g.drop(o(BLADE), 'permanent', target)).toEqual({ kind: 'none' });
    }
  });

  test('an Equipment is only carried as a permanent, and with no creature to take it, not at all', () => {
    expect(g.spec(o(BLADE), 'card')).toBeNull();
    const empty = ctx(viewOf([forest, enemy, blade]), priority([equip]));
    expect(empty.spec(o(BLADE), 'permanent')).toBeNull();
  });

  test('a permanent with no equip option, or without the engine offering it, is not carried', () => {
    expect(g.spec(o(1), 'permanent')).toBeNull();
    const none = ctx(view, priority([]));
    expect(none.spec(o(BLADE), 'permanent')).toBeNull();
  });

  test('an Equipment already on a creature leaves that creature out of the zones', () => {
    const worn = obj(BLADE, 'Blade', { ...blade, attachedTo: o(1) });
    const onBears = ctx(
      viewOf([{ ...bears, attachments: [o(BLADE)] }, angel, worn]),
      priority([equip]),
    );
    expect(keys(onBears.spec(o(BLADE), 'permanent'))).toEqual([`object:${o(2)}`]);
  });

  test('the ability filter decides: an Equip that wants an opposing creature offers those', () => {
    const odd = obj(BLADE, 'Odd Blade', {
      ...blade,
      activated: [
        { abilityIndex: 0, ability: equipAbility({ types: ['creature'], controller: 'opponent' }) },
      ],
    });
    const c = ctx(viewOf([bears, enemy, hexed, odd]), priority([equip]));
    // The hexproof creature is not a legal target of your ability.
    expect(keys(c.spec(o(BLADE), 'permanent'))).toEqual([`object:${o(10)}`]);
  });

  test('a non-equip ability is not a drag', () => {
    const pump = obj(BLADE, 'Pumper', {
      activated: [
        {
          abilityIndex: 0,
          ability: {
            effect: { kind: 'gainLife' },
            targets: [],
            cost: [],
          } as unknown as ActivatedAbility,
        },
      ],
    });
    expect(ctx(viewOf([bears, pump]), priority([equip])).spec(o(BLADE), 'permanent')).toBeNull();
  });
});

describe('an Aura dragged from the hand onto a permanent', () => {
  const cast: PriorityOption = { kind: 'castSpell', object: o(AURA) };
  const view = viewOf([bears, forest, enemy, hexed, shrouded], [aura]);
  const g = ctx(view, priority([cast]));

  test('"Enchant creature": every creature that can be targeted, yours and the opponent’s', () => {
    const spec = g.spec(o(AURA), 'card');
    expect(keys(spec)).toEqual([`object:${o(1)}`, `object:${o(10)}`]);
    expect(labelFor(spec, objectZone(10))).toBe('Enchant Goblin Guide');
    // The plain cast zones are gone: a drop elsewhere is not a cast.
    expect(accepts(spec, BATTLEFIELD)).toBe(false);
    expect(accepts(spec, { kind: 'stack' })).toBe(false);
  });

  test('a drop on a host starts the cast and names the host; anywhere else is nothing', () => {
    expect(g.drop(o(AURA), 'card', objectZone(10))).toEqual({
      kind: 'attach',
      start: { kind: 'castSpell', object: o(AURA) },
      host: o(10),
    });
    for (const target of [
      objectZone(3),
      objectZone(11),
      BATTLEFIELD,
      { kind: 'stack' },
      { kind: 'seat', seat: 1 },
    ] satisfies DropTarget[]) {
      expect(g.drop(o(AURA), 'card', target)).toEqual({ kind: 'none' });
    }
  });

  test('the Oracle line narrows it: land, "you control", a list of types', () => {
    const withText = (oracleText: string) =>
      keys(
        ctx(viewOf([bears, forest, enemy], [{ ...aura, oracleText }]), priority([cast])).spec(
          o(AURA),
          'card',
        ),
      );
    expect(withText('Enchant land')).toEqual([`object:${o(3)}`]);
    expect(withText('Enchant creature you control')).toEqual([`object:${o(1)}`]);
    expect(withText('Enchant creature an opponent controls')).toEqual([`object:${o(10)}`]);
    expect(withText('Enchant land or creature')).toEqual([
      `object:${o(1)}`,
      `object:${o(3)}`,
      `object:${o(10)}`,
    ]);
    expect(withText('Enchant permanent')).toHaveLength(3);
  });

  test('a restriction the page cannot read leaves every permanent in; the engine settles it', () => {
    const spec = ctx(
      viewOf([bears, forest], [{ ...aura, oracleText: 'Enchant Forest' }]),
      priority([cast]),
    ).spec(o(AURA), 'card');
    expect(keys(spec)).toEqual([`object:${o(1)}`, `object:${o(3)}`]);
  });

  test('with no host on the board the Aura keeps the plain cast zones and the click flow', () => {
    const c = ctx(viewOf([], [aura]), priority([cast]));
    const spec = c.spec(o(AURA), 'card');
    expect(keys(spec)).toEqual(['battlefield', 'stack']);
    expect(c.drop(o(AURA), 'card', BATTLEFIELD)).toEqual({ kind: 'click' });
  });

  test('an ordinary spell in the same view is unchanged: battlefield and stack, the click', () => {
    const bolt = obj(30, 'Lightning Bolt', { zone: 'hand', types: ['instant'] });
    const c = ctx(viewOf([bears], [bolt]), priority([{ kind: 'castSpell', object: o(30) }]));
    expect(keys(c.spec(o(30), 'card'))).toEqual(['battlefield', 'stack']);
    expect(c.drop(o(30), 'card', objectZone(1))).toEqual({ kind: 'none' });
  });
});

describe('enchantFilter reads the first Enchant line', () => {
  const read = (text: string) => enchantFilter({ oracleText: text } as ObjectView);
  test('known phrases', () => {
    expect(read('Enchant creature')).toEqual({ types: ['creature'] });
    expect(read('Enchant creature you control.')).toEqual({
      types: ['creature'],
      controller: 'you',
    });
    expect(read('Flying\nEnchant artifact')).toEqual({ types: ['artifact'] });
    // The synthetic cards keep it all on one line.
    expect(read('Enchant creature. Enchanted creature gets +2/+2.')).toEqual({
      types: ['creature'],
    });
    expect(read('Enchant artifact, creature, or land')).toEqual({
      anyOf: [{ types: ['artifact'] }, { types: ['creature'] }, { types: ['land'] }],
    });
  });
  test('anything else is no restriction', () => {
    for (const text of [
      '',
      'Enchant Forest',
      'Enchant nonbasic land',
      'Enchant player',
      'Enchant creature with flying',
      'Bear',
    ]) {
      expect(read(text)).toEqual({});
    }
  });
});

describe('a graveyard card with flashback dragged onto the board', () => {
  const option: PriorityOption = { kind: 'castSpell', object: o(FLASH), alternative: 'flashback' };
  const g = ctx(viewOf([bears], [], [flash]), priority([option]));

  test('the battlefield and the stack take it, worded with the flashback cost', () => {
    const spec = g.spec(o(FLASH), 'card');
    expect(keys(spec)).toEqual(['battlefield', 'stack']);
    expect(labelFor(spec, BATTLEFIELD)).toBe('Flashback {2}{W}');
  });

  test('a drop sends the cast with its alternative, not the click (which could open a menu)', () => {
    const expected = {
      kind: 'act',
      action: { kind: 'castSpell', object: o(FLASH), alternative: 'flashback' },
    };
    expect(g.drop(o(FLASH), 'card', BATTLEFIELD)).toEqual(expected);
    expect(g.drop(o(FLASH), 'card', { kind: 'stack' })).toEqual(expected);
    expect(g.drop(o(FLASH), 'card', objectZone(1))).toEqual({ kind: 'none' });
    expect(g.drop(o(FLASH), 'card', { kind: 'seat', seat: 1 })).toEqual({ kind: 'none' });
  });

  test('a graveyard card the engine does not offer is not draggable', () => {
    const none = ctx(viewOf([bears], [], [flash]), priority([]));
    expect(none.spec(o(FLASH), 'card')).toBeNull();
  });
});
