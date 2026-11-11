/**
 * Vehicles and Crew (CR 301.7, 702.122) through the game host with the hidden SYNTHETIC deck
 * `synthetic-vehicles`: the crew choice and its answer, Cancel, the log lines, Undo, attacking with
 * the crewed Vehicle and the cleanup that ends the crew. Seeds are searched, not fixed.
 */
import type { GameState, ObjectView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { describeEvent } from '../src/game/describe';
import type { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { menuItems } from '../src/ui/decisions/abilities';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import {
  canCrewWagon,
  crewAsk,
  crewWithTwo,
  passUntil,
  searchVehicles,
  startCrew,
  startHost,
  WAGON,
} from './vehicles-decks';
import { permanent, type Session } from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

type Reached = { session: Session & { host: GameHost }; seed: number };

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function reach(): Promise<Reached> {
  const reached = await searchVehicles(startHost, (view) => canCrewWagon(view));
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached as Reached;
}

/** The Wagon of the human in the session's latest view. */
function wagonOf(session: Session): ObjectView {
  const wagon = permanent(session.snapshot().view, WAGON, true);
  if (wagon === undefined) throw new Error('no Wagon');
  return wagon;
}

function modelOf(snap: Snapshot) {
  const pending = snap.view.pending;
  if (pending === null) throw new Error('nothing pending');
  const acts: unknown[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(snap.view, pending, initialUi(pending), ctl), acts };
}

describe('the Vehicle on the board', () => {
  test('a click offers one thing, the crew ability, labelled "Crew 3" in the chooser data', async () => {
    const { session } = await reach();
    const { view } = session.snapshot();
    const wagon = wagonOf(session);
    const priority = view.pending;
    if (priority?.kind !== 'priority') throw new Error('not at priority');
    const items = menuItems(priority, wagon.id, objectIndex(view));
    expect(items.map((i) => i.label)).toEqual(['Crew 3']);
    expect(wagon.keywords).toContain('crew');
    expect(wagon.printedPt).toEqual({ power: 4, toughness: 4 });
    expect(wagon.power).toBeNull();
  });
});

describe('crewing with two creatures', () => {
  test('the engine asks which creatures to tap, with the total and the powers', async () => {
    const { session } = await reach();
    const snap = await startCrew(session);
    const pending = snap.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
    expect(pending.purpose).toBe('crew');
    expect(pending.forCost).toBe(true);
    expect(pending.minTotalPower).toBe(3);
    expect(pending.legal.length).toBeGreaterThanOrEqual(2);
    for (const id of pending.legal) expect(pending.powers?.[id]).toBeGreaterThan(0);
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe(`Tap creatures with total power 3 or greater to crew ${WAGON}.`);
    expect(model.bar.detail).toBe('Total power: 0 of 3');
    expect(model.bar.buttons[0]?.disabled).toBe(true);
    expect(model.bar.cancel?.label).toBe('Cancel');
  });

  test('the answer taps them, logs "You crew ..." and makes the Wagon a 4/4 creature once it resolves', async () => {
    const { session } = await reach();
    const asked = await startCrew(session);
    const pending = asked.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
    const crewers = pending.legal.slice(0, 2);
    const names = crewers.map((id) => asked.view.battlefield.find((o) => o.id === id)?.name);
    const snap = await crewWithTwo(session);
    expect(texts(snap)).toContain(`You crew ${WAGON} with ${names[0]} and ${names[1]}.`);
    const line = snap.log.find((l) => l.text.startsWith('You crew'));
    expect(line?.level).toBe('major');
    expect(line?.rule).toBe('CR 702.122a');
    for (const id of crewers) {
      expect(snap.view.battlefield.find((o) => o.id === id)?.tapped).toBe(true);
    }
    // Still an artifact, not yet a creature: the ability is on the stack.
    expect(snap.view.stack.some((o) => o.name === WAGON)).toBe(true);
    expect(wagonOf(session).power).toBeNull();
    // Both pass: the ability resolves and the Wagon is a 4/4 artifact creature.
    const resolved = await passUntil(session, (v) => v.stack.length === 0, 3);
    const wagon = permanent(resolved.view, WAGON, true);
    expect(wagon?.types).toEqual(['artifact', 'creature']);
    expect([wagon?.power, wagon?.toughness]).toEqual([4, 4]);
    expect(wagon?.printedPt).toBeUndefined();
  });

  test('the crew answer clears Undo (it is a mid-activation answer, like a sacrifice cost)', async () => {
    const { session } = await reach();
    await startCrew(session);
    const snap = await crewWithTwo(session);
    expect(snap.undoDepth).toBe(0);
    expect((await session.host.undo()).error).toBe('Nothing to undo.');
  });
});

describe('cancelling the crew', () => {
  test('Cancel rewinds the activation: nothing tapped, nothing on the stack, no crew line, Undo as before', async () => {
    const { session } = await reach();
    const before = session.snapshot();
    const asked = await startCrew(session);
    expect(asked.undoDepth).toBe(before.undoDepth + 1);
    const snap = await session.act({ kind: 'cancel' });
    if (snap === null) throw new Error('the engine refused cancel');
    expect(snap.view.pending?.kind).toBe('priority');
    expect(snap.view.stack).toHaveLength(0);
    expect(snap.view.battlefield.filter((o) => o.tapped).map((o) => o.id)).toEqual(
      before.view.battlefield.filter((o) => o.tapped).map((o) => o.id),
    );
    expect(texts(snap).some((t) => t.includes(' crew'))).toBe(false);
    expect(snap.undoDepth).toBe(before.undoDepth);
    // The crew can be started again from the same position.
    expect(crewAsk((await startCrew(session)).view)).toBe(true);
  });
});

describe('after the crew', () => {
  test('the crewed Wagon is a legal attacker and can be sent at the opponent', async () => {
    const { session } = await reach();
    await startCrew(session);
    await crewWithTwo(session);
    await passUntil(session, (v) => v.stack.length === 0, 3);
    const snap = await passUntil(session, (v) => v.pending?.kind === 'declareAttackers', 6);
    const pending = snap.view.pending;
    if (pending?.kind !== 'declareAttackers') throw new Error(`got ${pending?.kind}`);
    const wagon = wagonOf(session);
    const candidate = pending.candidates.find((c) => c.attacker === wagon.id);
    expect(candidate).toBeDefined();
    const target = candidate?.targets[0];
    if (candidate === undefined || target === undefined) throw new Error('no target');
    const attacked = await session.act({
      kind: 'declareAttackers',
      attacks: [{ attacker: wagon.id, target }],
    });
    expect(attacked?.view.combat?.attackers.map((a) => a.object)).toContain(wagon.id);
    expect(attacked?.log.some((l) => l.text.includes(WAGON))).toBe(true);
  });

  test('cleanup ends the crew: next turn it is an artifact with no power or toughness again', async () => {
    const { session } = await reach();
    const turn = session.snapshot().view.turn;
    await startCrew(session);
    await crewWithTwo(session);
    // Pass through the rest of the turn without attacking, so combat cannot kill the Wagon.
    let snap = session.snapshot();
    for (let i = 0; i < 60 && snap.view.turn === turn; i += 1) {
      const pending = snap.view.pending;
      if (pending === null || pending.seat !== snap.view.viewer) break;
      const next = await session.act(
        pending.kind === 'declareAttackers'
          ? { kind: 'declareAttackers', attacks: [] }
          : pending.kind === 'priority'
            ? { kind: 'pass' }
            : pending.kind === 'chooseCards'
              ? { kind: 'chooseCards', objects: pending.legal.slice(0, pending.min) }
              : { kind: 'pass' },
      );
      if (next === null) break;
      snap = next;
    }
    expect(snap.view.turn).toBeGreaterThan(turn);
    const wagon = permanent(snap.view, WAGON, true);
    expect(wagon?.types).toEqual(['artifact']);
    expect(wagon?.power).toBeNull();
    expect(wagon?.printedPt).toEqual({ power: 4, toughness: 4 });
  });
});

describe('log wording of a crew', () => {
  const state = () =>
    ({
      objects: {
        o1: { card: 'c1', token: null, stack: null, controller: 0 },
        o2: { card: null, token: null, stack: { kind: 'ability', source: 'o1' }, controller: 0 },
        o3: { card: 'c2', token: null, stack: null, controller: 0 },
        o4: { card: 'c3', token: null, stack: null, controller: 0 },
        o5: { card: 'c4', token: null, stack: null, controller: 1 },
      },
      cards: {
        c1: { definition: 'd1' },
        c2: { definition: 'd2' },
        c3: { definition: 'd3' },
        c4: { definition: 'd4' },
      },
      definitions: {
        d1: { name: 'Rattle Wagon' },
        d2: { name: 'Grizzly Bears' },
        d3: { name: 'Youthful Knight' },
        d4: { name: 'Skiff' },
      },
      lki: {},
      pending: null,
    }) as unknown as GameState;
  const line = (event: object, seat: number) =>
    describeEvent(event as never, state(), state(), seat);
  const chosen = (seat: number, objects: string[], automatic = false, purpose = 'crew') => ({
    kind: 'permanentsChosen',
    seat,
    source: 'o2',
    objects,
    purpose,
    automatic,
  });

  test('you crew with two creatures; the opponent crews the same way', () => {
    expect(line(chosen(0, ['o3', 'o4']), 0)?.text).toBe(
      'You crew Rattle Wagon with Grizzly Bears and Youthful Knight.',
    );
    expect(line(chosen(1, ['o3', 'o4']), 0)?.text).toBe(
      'Opponent crews Rattle Wagon with Grizzly Bears and Youthful Knight.',
    );
    expect(line(chosen(0, ['o3', 'o4']), 1)?.text).toBe(
      'Opponent crews Rattle Wagon with Grizzly Bears and Youthful Knight.',
    );
  });

  test('an automatic crew (one candidate) reads the same, with one name; three names get commas', () => {
    expect(line(chosen(0, ['o3'], true), 0)?.text).toBe(
      'You crew Rattle Wagon with Grizzly Bears.',
    );
    expect(line(chosen(1, ['o3'], true), 0)?.text).toBe(
      'Opponent crews Rattle Wagon with Grizzly Bears.',
    );
    expect(line(chosen(0, ['o3', 'o4', 'o5']), 0)?.text).toBe(
      'You crew Rattle Wagon with Grizzly Bears, Youthful Knight and Skiff.',
    );
  });

  test('the sacrifice wording is kept for the other purposes', () => {
    expect(line(chosen(0, ['o3'], true, 'sacrifice'), 0)?.text).toBe(
      "You must sacrifice Grizzly Bears for Rattle Wagon's ability: no other choice.",
    );
    expect(line(chosen(0, ['o3'], false, 'sacrifice'), 0)?.text).toBe(
      "You choose Grizzly Bears to sacrifice for Rattle Wagon's ability.",
    );
  });
});
