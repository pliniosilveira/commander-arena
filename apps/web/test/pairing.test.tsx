/**
 * Block pairing (owner playtest): "When I had 4 zombies 3 of them were blocked but I didn't know
 * what card was blocking what token." A blocked attacker and each of its blockers carry the same
 * number and colour; identical creatures in different combat states never share a tile.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { groupTokens } from '../src/ui/board/group';
import { layoutRow } from '../src/ui/board/layout';
import { PAIR_COLORS, pairClass, pairNumbers } from '../src/ui/board/pairing';
import { combatRoles, roleKey, roleText } from '../src/ui/board/resolve';
import { Tile } from '../src/ui/board/Tile';
import { StoreProvider } from '../src/ui/store-context';

let next = 0;
function creature(over: Partial<ObjectView> = {}): ObjectView {
  next += 1;
  return {
    id: `o${next}`,
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: 'Zombie',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    power: 2,
    toughness: 2,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: true,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

const attack = (
  object: ObjectView,
  blockedBy: ObjectView[] = [],
  blocked = blockedBy.length > 0,
) => ({
  object: object.id,
  target: { kind: 'player' as const, seat: 1 },
  blocked,
  blockedBy: blockedBy.map((b) => b.id),
});

function viewOf(
  battlefield: ObjectView[],
  attackers: ReturnType<typeof attack>[],
  over: Partial<GameView> = {},
): GameView {
  return {
    viewer: 1,
    turn: 4,
    activeSeat: 0,
    phase: 'combat',
    step: 'declareBlockers',
    prioritySeat: 1,
    seats: [],
    battlefield,
    exile: [],
    stack: [],
    combat: { attackers },
    pending: null,
    decidingSeat: null,
    commanderDamage: {},
    result: null,
    ...over,
  } as GameView;
}

/** The owner's case: four identical Zombie attackers, three of them blocked by identical Zombies. */
function fourZombies() {
  const attackers = [creature(), creature(), creature(), creature()];
  const blockers = [
    creature({ controller: 1 }),
    creature({ controller: 1 }),
    creature({ controller: 1 }),
  ];
  const view = viewOf(
    [...attackers, ...blockers],
    [
      attack(at(attackers, 0), [at(blockers, 0)]),
      attack(at(attackers, 1), [at(blockers, 1)]),
      attack(at(attackers, 2)),
      attack(at(attackers, 3), [at(blockers, 2)]),
    ],
  );
  return { attackers, blockers, view };
}

describe('pair numbers', () => {
  test('an attacker and each of its blockers share a number; the unblocked one is open', () => {
    const { attackers, blockers, view } = fourZombies();
    const roles = combatRoles(view);
    const number = (o: ObjectView) => pairNumbers(roles.get(o.id));
    expect(attackers.map(number)).toEqual([[1], [2], [3], [4]]);
    expect(blockers.map(number)).toEqual([[1], [2], [4]]);
    expect(roles.get(at(attackers, 2).id)).toMatchObject({ blocked: false, number: 3 });
  });

  test('two blockers on one attacker both carry its number; a double block carries both', () => {
    const [a1, a2] = [creature(), creature()];
    const [b1, b2] = [creature({ controller: 1 }), creature({ controller: 1 })];
    const roles = combatRoles(viewOf([a1, a2, b1, b2], [attack(a1, [b1, b2]), attack(a2, [b2])]));
    expect(pairNumbers(roles.get(a1.id))).toEqual([1]);
    expect(pairNumbers(roles.get(b1.id))).toEqual([1]);
    expect(pairNumbers(roles.get(b2.id))).toEqual([1, 2]);
    expect(roles.get(a1.id)).toMatchObject({ blockers: 2 });
  });

  test('no block on the table: no numbers, until the viewer is choosing blocks', () => {
    const a = creature();
    const quiet = viewOf([a], [attack(a)]);
    expect(pairNumbers(combatRoles(quiet).get(a.id))).toEqual([]);
    const choosing = viewOf([a], [attack(a)], { pending: { kind: 'declareBlockers' } as never });
    expect(pairNumbers(combatRoles(choosing).get(a.id))).toEqual([1]);
  });

  test('picked blocks pair up before they are declared, and are marked tentative', () => {
    const [a1, a2] = [creature(), creature()];
    const b = creature({ controller: 1 });
    const roles = combatRoles(viewOf([a1, a2, b], [attack(a1), attack(a2)]), [
      { blocker: b.id, attacker: a2.id },
    ]);
    expect(roles.get(b.id)).toMatchObject({ kind: 'blocker', tentative: true });
    expect(pairNumbers(roles.get(b.id))).toEqual([2]);
    expect(roles.get(a2.id)).toMatchObject({ blocked: true, tentative: true, number: 2 });
    expect(roles.get(a1.id)).toMatchObject({ blocked: false, tentative: false, number: 1 });
  });

  test('an attacker that stays blocked after its blocker left keeps its number', () => {
    const a = creature();
    const roles = combatRoles(viewOf([a], [attack(a, [], true)]));
    expect(roles.get(a.id)).toMatchObject({ blocked: true, blockers: 0, number: 1 });
  });

  test('colours repeat after eight pairs; the number does not', () => {
    expect(pairClass(1)).toBe('pair-c1');
    expect(pairClass(PAIR_COLORS)).toBe(`pair-c${PAIR_COLORS}`);
    expect(pairClass(PAIR_COLORS + 1)).toBe('pair-c1');
  });
});

describe('what the tooltip and the preview say', () => {
  test('a blocker says whom it blocks, with the number', () => {
    const { blockers, view } = fourZombies();
    const role = combatRoles(view).get(at(blockers, 2).id);
    expect(role && roleText(role)).toBe('Blocking Zombie (#4)');
  });

  test('a double blocker names both; attackers say blocked, how many, and the number', () => {
    const [a1, a2] = [creature({ name: 'Ogre' }), creature({ name: 'Imp' })];
    const [b1, b2] = [creature({ controller: 1 }), creature({ controller: 1 })];
    const roles = combatRoles(viewOf([a1, a2, b1, b2], [attack(a1, [b1, b2]), attack(a2, [b2])]));
    expect(roleText(roles.get(b2.id) ?? ({} as never))).toBe('Blocking Ogre (#1), Imp (#2)');
    expect(roleText(roles.get(a1.id) ?? ({} as never))).toBe(
      'Attacking You, blocked by 2 creatures (#1)',
    );
  });

  test('an unblocked attacker among blocked ones says so', () => {
    const { attackers, view } = fourZombies();
    const role = combatRoles(view).get(at(attackers, 2).id);
    expect(role && roleText(role)).toBe('Attacking You, unblocked (#3)');
  });
});

describe('grouping never hides a pairing', () => {
  test('identical tokens with different combat assignments stay on separate tiles', () => {
    const { attackers, blockers, view } = fourZombies();
    const roles = combatRoles(view);
    const key = (o: ObjectView) => roleKey(roles.get(o.id));
    // The attackers: blocked 1, blocked 2, open 3, blocked 4: four different states.
    expect(groupTokens(attackers, key).map((e) => e.kind)).toEqual([
      'single',
      'single',
      'single',
      'single',
    ]);
    // Three identical blockers, each on a different attacker.
    expect(groupTokens(blockers, key).map((e) => e.kind)).toEqual(['single', 'single', 'single']);
    // Without the combat state in the key they would collapse: this is the confusion that was fixed.
    expect(groupTokens(blockers)).toHaveLength(1);
  });

  test('blockers of the same attacker may share a tile; a blocker of another may not', () => {
    const a = creature();
    const bs = [creature({ controller: 1 }), creature({ controller: 1 })];
    const other = creature({ controller: 1 });
    const roles = combatRoles(viewOf([a, ...bs, other], [attack(a, bs)]));
    const key = (o: ObjectView) => roleKey(roles.get(o.id));
    expect(groupTokens(bs, key)).toHaveLength(1);
    const [spare] = groupTokens([...bs, other], key).filter((e) => e.kind === 'single');
    expect(spare).toBeDefined();
  });

  test('a squeezed row keeps the pairing apart when it groups', () => {
    const { blockers, view } = fourZombies();
    const roles = combatRoles(view);
    const spec = { tileH: 100, preferredW: 74, minW: 56, gap: 6 };
    const layout = layoutRow(blockers, 150, spec, (o) => roleKey(roles.get(o.id)));
    expect(layout.entries.every((e) => e.kind === 'single')).toBe(true);
  });
});

describe('the tile', () => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  const render = (node: React.ReactNode) =>
    renderToStaticMarkup(
      <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
    );

  test('a blocker and its attacker draw the same number and colour class', () => {
    const { attackers, blockers, view } = fourZombies();
    const roles = combatRoles(view);
    const second = render(
      <Tile object={at(attackers, 1)} w={80} h={108} role={roles.get(at(attackers, 1).id)} />,
    );
    const blocker = render(
      <Tile object={at(blockers, 1)} w={80} h={108} role={roles.get(at(blockers, 1).id)} />,
    );
    for (const html of [second, blocker]) {
      expect(html).toContain('pair-c2');
      expect(html).toContain('data-pairs="2"');
      expect(html).toMatch(/<span class="board-pair pair-c2">2<\/span>/);
    }
    expect(blocker).toContain('Blocking Zombie (#2)');
    expect(second).toContain('blocked by 1 creature (#2)');
  });

  test('an unblocked attacker shows its number in outline, without a pair colour', () => {
    const { attackers, view } = fourZombies();
    const role = combatRoles(view).get(at(attackers, 2).id);
    const html = render(<Tile object={at(attackers, 2)} w={80} h={108} role={role} />);
    expect(html).toMatch(/<span class="board-pair board-pair-open">3<\/span>/);
    expect(html).not.toContain('has-pair');
    expect(html).toContain('unblocked');
  });

  test('a creature that blocks two attackers shows both numbers', () => {
    const [a1, a2] = [creature(), creature()];
    const b = creature({ controller: 1 });
    const roles = combatRoles(viewOf([a1, a2, b], [attack(a1, [b]), attack(a2, [b])]));
    const html = render(<Tile object={b} w={80} h={108} role={roles.get(b.id)} />);
    expect(html).toContain('pair-c1">1</span>');
    expect(html).toContain('pair-c2">2</span>');
    expect(html).toContain('data-pairs="1,2"');
  });

  test('a tile outside combat has no marker', () => {
    const html = render(<Tile object={creature()} w={80} h={108} />);
    expect(html).not.toContain('board-pair');
    expect(html).not.toContain('data-pairs');
  });
});
