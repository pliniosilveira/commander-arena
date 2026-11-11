/**
 * Counted and defined power and toughness through the game host with the hidden SYNTHETIC deck
 * `synthetic-pt` (D-109, D-115): the note the host sends for a card whose face prints `*`, what the
 * corner shows in the hand and on the battlefield, and an Equipment's "for each artifact" on its host.
 */
import type { ObjectView } from '@commander-arena/engine';
import { expect, test, vi } from 'vitest';
import type { Snapshot } from '../src/game/protocol';
import { cornerStat } from '../src/ui/board/resolve';
import { canActivate, equip, mine, myCreatures } from './attachments-decks';
import { inHand, mustReachPt, myArtifacts, myLands, onField } from './pt-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

const LURKER = 'SYNTHETIC Land Lurker';

test('a hand card printing */* has a note and shows * with the derived number in its title', async () => {
  const { snap } = await mustReachPt((s) => inHand(s.view, LURKER) !== undefined);
  const card = inHand(snap.view, LURKER);
  if (card === undefined) throw new Error('no Land Lurker in hand');
  const note = snap.definedPt?.[card.id];
  expect(note).toEqual({
    power: true,
    toughness: true,
    text: 'Defined by an ability: equal to the number of lands you control',
  });
  // The engine derives the number in the hand too: no lands in play means 0/0 there.
  expect(card.power).toBe(myLands(snap.view));
  const stat = cornerStat(card, note);
  expect(stat?.text).toBe('*/*');
  expect(stat?.title).toBe(
    `Defined by an ability: equal to the number of lands you control (now ${card.power}/${card.toughness})`,
  );
  // Without the note (any other card) the number is shown as it is.
  expect(cornerStat(card)?.text).toBe(`${card.power}/${card.toughness}`);
  // Cards that print numbers have no note.
  const others = (snap.view.seats[snap.view.viewer]?.hand ?? []).filter((o) => o.id !== card.id);
  for (const other of others) {
    const printed = ['SYNTHETIC Hand Hydra', 'SYNTHETIC Horde Hound', LURKER].includes(other.name);
    expect(snap.definedPt?.[other.id] !== undefined, other.name).toBe(printed);
  }
});

test('a power-only definition stars only the power', async () => {
  const { snap } = await mustReachPt((s) => inHand(s.view, 'SYNTHETIC Horde Hound') !== undefined);
  const hound = inHand(snap.view, 'SYNTHETIC Horde Hound');
  if (hound === undefined) throw new Error('no Horde Hound in hand');
  const note = snap.definedPt?.[hound.id];
  expect(note).toEqual({
    power: true,
    toughness: false,
    text: 'Defined by an ability: power equal to the number of creatures you control',
  });
  expect(cornerStat(hound, note)?.text).toBe(`*/${hound.toughness}`);
  expect(hound.toughness).toBe(3);
});

test('on the battlefield the number is shown and follows the lands as they enter', async () => {
  // A Lurker in play and a land to play now.
  const canPlayLand = (s: Snapshot): boolean =>
    s.view.pending?.kind === 'priority' &&
    s.view.pending.options.some((o) => o.kind === 'playLand');
  const { host, snap } = await mustReachPt(
    (s) => onField(s.view, LURKER).length > 0 && canPlayLand(s),
  );
  const lurker = onField(snap.view, LURKER)[0];
  if (lurker === undefined) throw new Error('no Land Lurker in play');
  const note = snap.definedPt?.[lurker.id];
  expect(note).toBeDefined();
  expect(lurker.power).toBe(myLands(snap.view));
  expect(cornerStat(lurker, note)?.text).toBe(`${lurker.power}/${lurker.toughness}`);
  expect(cornerStat(lurker, note)?.title).toBe(
    'Defined by an ability: equal to the number of lands you control',
  );
  // Play on until a land enters: the same permanent has one more power and toughness.
  let now = snap;
  const lands = myLands(snap.view);
  for (let i = 0; i < 200 && myLands(now.view) === lands; i += 1) {
    const pending = now.view.pending;
    if (pending === null || now.view.result !== null) break;
    const land =
      pending.kind === 'priority' ? pending.options.find((o) => o.kind === 'playLand') : undefined;
    const next = await host.act(land ?? { kind: 'pass' });
    if (next.error !== null) break;
    now = next;
  }
  const after = onField(now.view, LURKER).find((o) => o.id === lurker.id);
  expect(myLands(now.view)).toBeGreaterThan(lands);
  if (after === undefined) throw new Error('the Land Lurker left the battlefield');
  expect(after.power).toBe(myLands(now.view));
  expect(after.toughness).toBe(myLands(now.view));
});

// Creatures whose own numbers move with the board: the Equipment test wants one that is steady.
const MOVING = new Set([
  'SYNTHETIC Land Lurker',
  'SYNTHETIC Hand Hydra',
  'SYNTHETIC Horde Hound',
  'SYNTHETIC Pack Wolf',
]);
const steady = (c: ObjectView): boolean => !MOVING.has(c.name) && c.power !== null;

test('an Equipment that gives +1/+1 for each artifact shows on its host and follows the artifacts', async () => {
  const BLADE = 'SYNTHETIC Artisan Blade';
  const { host, snap } = await mustReachPt(
    (s) => canActivate(s, BLADE) && myCreatures(s.view).some(steady),
  );
  const creature = myCreatures(snap.view).find(steady);
  if (creature === undefined || creature.power === null) throw new Error('no plain creature');
  const before = creature.power;
  const { last } = await equip(host, snap, BLADE, creature.id);
  const after = last.view.battlefield.find((o) => o.id === creature.id);
  const artifacts = myArtifacts(last.view);
  expect(mine(last.view, BLADE)[0]?.attachedTo).toBe(creature.id);
  expect(after?.power).toBe(before + artifacts);
  expect(after?.toughness).toBe((creature.toughness ?? 0) + artifacts);
  // A creature that prints a number has no `*` note: its tile shows the number.
  expect(last.definedPt?.[creature.id]).toBeUndefined();
});
