/**
 * Triggered abilities that choose targets as they go on the stack (CR 603.3d, D-089), through the
 * game host and the page's store with the hidden SYNTHETIC deck `synthetic-trigger-targets`: the
 * decision is marked, has no cancel, the target ends on the stack object, the autopilot never
 * answers it, and an ability with no legal target is logged as removed.
 */
import { expect, test, vi } from 'vitest';
import type { GameHost } from '../src/game/host';
import {
  opposingCreatures,
  REAPER,
  searchTriggerTargets,
  startHost,
  startStore,
  triggerTargetsAsked,
} from './trigger-targets-decks';
import type { Session } from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

const AI = 'swamp-forest';
const REMOVED = `${REAPER}'s ability has no legal target and is removed.`;

test('the engine asks for the trigger targets with forTrigger, offers no cancel and refuses one', async () => {
  const reached = await searchTriggerTargets(startHost(AI), triggerTargetsAsked);
  if (reached === null) throw new Error('no seed reaches the situation');
  const { session } = reached;
  const { host } = session as Session & { host: GameHost };
  const view = session.snapshot().view;
  const pending = view.pending;
  if (pending?.kind !== 'targets') throw new Error('not a targets decision');
  expect(pending.forTrigger).toBe(true);
  // The source is the ability's stack object, which carries the AST the prompt reads.
  const source = view.stack.find((o) => o.id === pending.source);
  expect(source?.abilitySource).toBeDefined();
  expect(source?.name).toBe(REAPER);
  expect(source?.ability?.kind).toBe('triggered');
  // Every legal target is an opposing creature.
  const opposing = new Set(opposingCreatures(view).map((o) => o.id));
  const legal = pending.specs.flatMap((s) => s.legal);
  expect(legal.length).toBeGreaterThan(0);
  for (const t of legal) expect(t.kind === 'object' && opposing.has(t.id)).toBe(true);

  // `cancel` is refused, and the decision is still there.
  const refused = await host.act({ kind: 'cancel' });
  expect(refused.error).not.toBeNull();
  expect(session.snapshot().view.pending?.id).toBe(pending.id);

  // The chosen target is on the stack object, and the log says the ability triggered.
  const target = legal[0];
  if (target === undefined) throw new Error('no legal target');
  await session.act({ kind: 'chooseTargets', targets: [target] });
  const stacked = session.snapshot().view.stack.find((o) => o.id === pending.source);
  expect(stacked?.targets).toEqual([target]);
  expect(session.log().some((l) => l.text === `${REAPER} triggers.`)).toBe(true);
});

test('the autopilot stops at the trigger target decision and leaves it to the player', async () => {
  const reached = await searchTriggerTargets(startStore(AI, false), triggerTargetsAsked);
  if (reached === null) throw new Error('no seed reaches the situation');
  const { session } = reached;
  const before = session.snapshot();
  const asked = before.view.pending;
  // Give an autopilot that was about to send something the chance to do it.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const after = session.snapshot();
  expect(after.revision).toBe(before.revision);
  expect(after.view.pending?.id).toBe(asked?.id);
  expect(triggerTargetsAsked(after.view)).toBe(true);
});

test('an enters trigger with no legal target is removed and the log says so', async () => {
  const reached = await searchTriggerTargets(startStore(AI), (_view, session) =>
    session.log().some((l) => l.text === REMOVED),
  );
  if (reached === null) throw new Error('no seed reaches the situation');
  const line = reached.session.log().find((l) => l.text === REMOVED);
  expect(line?.level).toBe('major');
  expect(line?.rule).toBe('CR 603.3d');
  // The ability never became an object on the stack.
  const view = reached.session.snapshot().view;
  expect(view.stack.some((o) => o.abilitySource !== undefined && o.name === REAPER)).toBe(false);
});
