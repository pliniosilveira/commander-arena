/**
 * Who blocks whom (issue 19): an arrow from each blocker to the attacker it blocks, in the colour of
 * the pair (`pairing.ts`), drawn while the player picks blocks and after they are declared. It is a
 * full-screen SVG that ignores the pointer, like the stack's arrows (`panels/StackArrows.tsx`); the
 * boxes come from the tiles' `data-object-id`, the geometry from `panels/arrows.ts`.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type Arrow, arrowBetween, type Box } from '../panels/arrows';
import { pairClass } from './pairing';
import type { CombatRole } from './resolve';

interface Pair {
  readonly key: string;
  readonly blocker: string;
  readonly attacker: string;
  readonly number: number;
}

interface Placed {
  readonly key: string;
  readonly number: number;
  readonly arrow: Arrow;
}

/** Every block the roles describe: one per blocker and attacker it blocks. */
export function blockPairs(roles: ReadonlyMap<string, CombatRole>): readonly Pair[] {
  const pairs: Pair[] = [];
  for (const [blocker, role] of roles) {
    if (role.kind !== 'blocker') continue;
    for (const p of role.pairs) {
      pairs.push({
        key: `${blocker}>${p.attacker}`,
        blocker,
        attacker: p.attacker,
        number: p.number,
      });
    }
  }
  return pairs;
}

const cssEscape = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

function boxOf(id: string): Box | null {
  const el = document.querySelector(`.board [data-object-id="${cssEscape(id)}"]`);
  if (el === null) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function measure(pairs: readonly Pair[]): Placed[] {
  const placed: Placed[] = [];
  for (const pair of pairs) {
    const from = boxOf(pair.blocker);
    const to = boxOf(pair.attacker);
    if (from === null || to === null) continue;
    const arrow = arrowBetween(from, to, { bend: 0.08, gap: 4, headSize: 11 });
    if (arrow !== null) placed.push({ key: pair.key, number: pair.number, arrow });
  }
  return placed;
}

const signature = (placed: readonly Placed[]): string =>
  placed.map((p) => `${p.key}:${p.arrow.path}`).join('|');

export function BlockArrows({ roles }: { roles: ReadonlyMap<string, CombatRole> }) {
  const [placed, setPlaced] = useState<readonly Placed[]>([]);
  const last = useRef('');
  const frame = useRef(0);
  const pairs = blockPairs(roles);
  const key = pairs.map((p) => p.key).join('|');

  // The measuring callback reads the latest pairs without being a new function each render.
  const latest = useRef(pairs);
  latest.current = pairs;
  const update = useCallback(() => {
    const next = measure(latest.current);
    const sig = signature(next);
    if (sig === last.current) return;
    last.current = sig;
    setPlaced(next);
  }, []);

  // After every render: the rows may have moved though the blocks did not change.
  useLayoutEffect(() => {
    update();
  });

  useLayoutEffect(() => {
    if (key === '') return;
    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(update);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      resize.disconnect();
    };
  }, [key, update]);

  if (key === '') return null;
  return (
    <svg className="pnl-arrows block-arrows" aria-hidden="true" focusable="false">
      {placed.map(({ key: pairKey, number, arrow }) => (
        <g key={pairKey} className={`pnl-arrow block-arrow ${pairClass(number)}`}>
          <path d={arrow.path} className="pnl-arrow-shaft" />
          <polygon points={arrow.headPoints} className="pnl-arrow-head" />
        </g>
      ))}
    </svg>
  );
}
