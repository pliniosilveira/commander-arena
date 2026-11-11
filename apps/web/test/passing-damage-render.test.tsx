/** The "Damage getting through" panel of the declare blockers question (issue 106). */
import type { GameView, ObjectId, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PassingDamagePanel } from '../src/ui/decisions/PassingDamagePanel';

const goblin = (n: number): ObjectView =>
  ({
    id: `o${n}`,
    name: 'SYNTHETIC Goblin',
    controller: 1,
    types: ['creature'],
    keywords: [],
    damage: 0,
    counters: {},
    power: 3,
    toughness: 2,
  }) as unknown as ObjectView;

const view = (life: number): GameView =>
  ({
    viewer: 0,
    battlefield: [goblin(1), goblin(2)],
    stack: [],
    exile: [],
    seats: [
      { id: 0, life, poison: 0, hand: [], graveyard: [], command: [] },
      { id: 1, life: 40, poison: 0, hand: null, graveyard: [], command: [] },
    ],
  }) as unknown as GameView;

const attackers = (['o1', 'o2'] as ObjectId[]).map((attacker) => ({
  attacker,
  target: { kind: 'player', seat: 0 } as const,
  minBlockers: 1,
}));

test('names what the player takes, the life left and where it comes from', () => {
  const html = renderToStaticMarkup(
    <PassingDamagePanel view={view(40)} decision={{ attackers }} blocks={[]} />,
  );
  expect(html).toContain('You take 6');
  expect(html).toContain('Life 40 to 34');
  expect(html).toContain('data-passing-lethal="false"');
  expect(html).not.toContain('Lethal');
});

test('warns when the damage is lethal', () => {
  const html = renderToStaticMarkup(
    <PassingDamagePanel view={view(6)} decision={{ attackers }} blocks={[]} />,
  );
  expect(html).toContain('data-passing-lethal="true"');
  expect(html).toContain('Lethal');
});

test('says so when every attacker is blocked', () => {
  const html = renderToStaticMarkup(
    <PassingDamagePanel
      view={view(40)}
      decision={{ attackers }}
      blocks={[
        { blocker: 'o11', attacker: 'o1' },
        { blocker: 'o12', attacker: 'o2' },
      ]}
    />,
  );
  expect(html).toContain('every attacker is blocked');
});
