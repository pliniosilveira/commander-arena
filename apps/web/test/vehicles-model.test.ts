/**
 * Vehicles and Crew (CR 301.7, 702.122) as pure models: the crew choice (prompt, chips, running
 * total, Confirm, Cancel, badge), the "Crew N" label of the ability chooser, the keyword chip, the
 * corner stat of an uncrewed Vehicle, and the stop test. No DOM.
 */
import type {
  Action,
  ActivatedAbility,
  ChoosePermanentDecision,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { DEFAULT_STOPS, shouldStop } from '../src/policy/should-stop';
import { keywordName, keywordShort } from '../src/ui/board/keywords';
import { cornerStat, isCrewedVehicle } from '../src/ui/board/resolve';
import { activationLabel } from '../src/ui/decisions/ability-label';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import {
  choosePermanentPrompt,
  chosenBadge,
  crewChipLabel,
  crewTotal,
  crewTotalText,
  permanentLabels,
  permanentsDetail,
  permanentsHint,
  permanentsReady,
  togglePermanent,
} from '../src/ui/decisions/permanents';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const card = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    oracleText: '',
    keywords: [],
    isToken: false,
    power: null,
    toughness: null,
    zone: 'battlefield',
    ...patch,
  }) as ObjectView;

const wagon = card(1, 'Rattle Wagon', {
  types: ['artifact'],
  subtypes: ['Vehicle'],
  keywords: ['crew'],
  oracleText: 'Crew 3',
  printedPt: { power: 4, toughness: 4 },
});
// The crew ability on the stack is named after its Vehicle (CR 113.7a); `abilitySource` marks it.
const crewAbility = card(2, 'Rattle Wagon', {
  zone: 'stack',
  types: [],
  abilitySource: wagon.id,
  oracleText: 'Crew 3',
});
const bearA = card(3, 'Grizzly Bears', { power: 2, toughness: 2 });
const bearB = card(4, 'Grizzly Bears', { power: 2, toughness: 2 });
const knight = card(5, 'Youthful Knight', { power: 1, toughness: 1 });
const giant = card(6, 'Hill Giant', { power: 3, toughness: 3 });
const index = lookupIndexFor([wagon, crewAbility, bearA, bearB, knight, giant]);

const crew = (patch: Partial<ChoosePermanentDecision> = {}): ChoosePermanentDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'choosePermanent',
  source: crewAbility.id,
  purpose: 'crew',
  forCost: true,
  min: 1,
  max: 4,
  legal: [bearA.id, bearB.id, knight.id, giant.id],
  minTotalPower: 3,
  powers: { [bearA.id]: 2, [bearB.id]: 2, [knight.id]: 1, [giant.id]: 3 },
  ...patch,
});

function harness(pending: PendingDecision, chosen: readonly ObjectId[] = []) {
  const objects = [wagon, crewAbility, bearA, bearB, knight, giant];
  const view = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  const ui = { ...initialUi(pending), permanents: chosen };
  return { view, acts, model: buildModel(view, pending, ui, ctl) };
}

describe('the crew choice', () => {
  test('the prompt names the Vehicle and the power it needs, not a sacrifice', () => {
    expect(choosePermanentPrompt(crew(), index)).toBe(
      'Tap creatures with total power 3 or greater to crew Rattle Wagon.',
    );
    expect(choosePermanentPrompt(crew({ minTotalPower: 1 }), index)).toBe(
      'Tap creatures with total power 1 or greater to crew Rattle Wagon.',
    );
    const { model } = harness(crew());
    expect(model.bar.prompt).toBe(
      'Tap creatures with total power 3 or greater to crew Rattle Wagon.',
    );
    expect(model.bar.prompt).not.toContain('Sacrifice');
  });

  test('the sacrifice and legend-rule wordings are unchanged', () => {
    const sacrifice: ChoosePermanentDecision = {
      ...crew(),
      purpose: 'sacrifice',
      forCost: true,
      min: 1,
      max: 1,
    };
    expect(choosePermanentPrompt(sacrifice, index)).toBe(
      'Sacrifice a permanent to pay for Rattle Wagon.',
    );
    expect(chosenBadge(sacrifice)).toBe('Sacrifice');
    expect(permanentsDetail([], sacrifice)).toBe(
      'Click a highlighted permanent, or pick one from the list.',
    );
    expect(chosenBadge({ purpose: 'legendRule' })).toBe('Keep');
  });

  test('the running total adds the power of the chosen creatures and reads "X of N"', () => {
    const d = crew();
    expect(crewTotal([], d)).toBe(0);
    expect(crewTotalText([], d)).toBe('Total power: 0 of 3');
    expect(crewTotalText([bearA.id], d)).toBe('Total power: 2 of 3');
    expect(crewTotalText([bearA.id, bearB.id], d)).toBe('Total power: 4 of 3');
    expect(crewTotalText([giant.id], d)).toBe('Total power: 3 of 3');
    // A creature the decision lists no power for adds nothing; a negative power lowers the total.
    expect(crewTotal([bearA.id, 'o404'], d)).toBe(2);
    expect(crewTotal([bearA.id, knight.id], crew({ powers: { o3: 2, o5: -1 } }))).toBe(1);
    expect(permanentsDetail([bearA.id], d)).toBe('Total power: 2 of 3');
    expect(harness(crew(), [bearA.id]).model.bar.detail).toBe('Total power: 2 of 3');
  });

  test('Confirm is disabled below N and enabled from N, with more than N allowed', () => {
    const d = crew();
    const states: [ObjectId[], boolean][] = [
      [[], false],
      [[bearA.id], false],
      [[knight.id, bearA.id], true], // 1 + 2 = 3
      [[bearA.id, bearB.id], true],
      [[giant.id], true],
      [[giant.id, bearA.id, bearB.id, knight.id], true], // 8 of 3: any number may crew
    ];
    for (const [chosen, ready] of states) {
      expect(permanentsReady(chosen, d), chosen.join()).toBe(ready);
      const { model } = harness(crew(), chosen);
      expect(model.bar.buttons[0]?.disabled, chosen.join()).toBe(!ready);
    }
    expect(permanentsHint([bearA.id], d)).toBe('Choose creatures with total power 3 or greater');
    expect(permanentsHint([bearA.id, bearB.id], d)).toBeNull();
    // A sacrifice is still decided by the count alone.
    expect(permanentsReady([bearA.id], { min: 1, max: 1 })).toBe(true);
    expect(permanentsHint([], { min: 1, max: 1 })).toBe('Choose 1 more permanent');
  });

  test('Confirm sends the chosen creatures as choosePermanents', () => {
    const { model, acts } = harness(crew(), [bearA.id, bearB.id]);
    expect(model.bar.buttons.map((b) => [b.label, b.variant])).toEqual([['Confirm', 'primary']]);
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: [bearA.id, bearB.id] }]);
  });

  test('Cancel exists (the cost can be taken back), sends cancel, and is what Esc runs', () => {
    const { model, acts } = harness(crew());
    expect(model.bar.cancel?.label).toBe('Cancel');
    model.bar.cancel?.run();
    expect(acts).toEqual([{ kind: 'cancel' }]);
    // Without `forCost` there is nothing to rewind and no Cancel.
    expect(harness(crew({ forCost: false })).model.bar.cancel).toBeNull();
  });

  test('every legal creature is clickable, the chosen ones carry the badge "Crew", and a click toggles', () => {
    const { model } = harness(crew(), [bearA.id]);
    expect([...model.interaction.clickable].sort()).toEqual(
      [bearA.id, bearB.id, knight.id, giant.id].sort(),
    );
    expect(model.interaction.dimOthers).toBe(true);
    expect(model.interaction.badge(bearA.id)).toBe('Crew');
    expect(model.interaction.badge(bearB.id)).toBeNull();
    const d = crew();
    // More than one may be chosen, so a click adds and a second click takes it back.
    const two = togglePermanent([bearA.id], d, bearB.id);
    expect(two).toEqual([bearA.id, bearB.id]);
    expect(togglePermanent(two, d, bearA.id)).toEqual([bearB.id]);
    // The Vehicle is not a candidate.
    expect(togglePermanent([], d, wagon.id)).toEqual([]);
  });

  test('a chip names the creature and its power; equal names are numbered', () => {
    expect(crewChipLabel('Hill Giant', 3)).toBe('Hill Giant (3 power)');
    const labels = permanentLabels(crew().legal, index);
    expect(labels.get(bearA.id)).toBe('Grizzly Bears 1');
    expect(labels.get(bearB.id)).toBe('Grizzly Bears 2');
    expect(crewChipLabel(labels.get(bearB.id) ?? '', 2)).toBe('Grizzly Bears 2 (2 power)');
  });

  test('the crew choice always stops the autopilot', () => {
    const { view } = harness(crew());
    const pending = view.pending;
    if (pending === null) throw new Error('nothing pending');
    expect(shouldStop(view, DEFAULT_STOPS)).toBe(true);
  });
});

describe('labels, chips and corner stats', () => {
  const ability = (cost: ActivatedAbility['cost']): ActivatedAbility =>
    ({
      kind: 'activated',
      cost,
      effect: { kind: 'setTypes', objects: { kind: 'this' }, types: ['artifact', 'creature'] },
    }) as unknown as ActivatedAbility;
  const tap = (totalPower: number) => ({ kind: 'tapCreatures' as const, totalPower });

  test('the expanded crew ability reads "Crew N" in the chooser', () => {
    expect(activationLabel(wagon, { abilityIndex: 1, ability: ability([tap(3)]) })).toBe('Crew 3');
    expect(activationLabel(wagon, { abilityIndex: 1, ability: ability([tap(1)]) })).toBe('Crew 1');
  });

  test('without the crew keyword the same cost keeps its long reading', () => {
    const plain = card(9, 'Odd Engine', { keywords: [] });
    expect(activationLabel(plain, { abilityIndex: 0, ability: ability([tap(2)]) })).toContain(
      'Tap untapped creatures you control with total power 2 or greater',
    );
    expect(activationLabel(undefined, { abilityIndex: 0, ability: ability([tap(2)]) })).toContain(
      'total power 2 or greater',
    );
    expect(activationCostText([tap(3)])).toBe(
      'Tap untapped creatures you control with total power 3 or greater',
    );
  });

  test('the keyword chip for crew reads "Crew"', () => {
    expect(keywordShort('crew')).toBe('Crew');
    expect(keywordName('crew')).toBe('Crew');
  });

  test('an uncrewed Vehicle shows its printed pair as `printed`; a crewed one a live P/T', () => {
    expect(isCrewedVehicle(wagon)).toBe(false);
    expect(cornerStat(wagon)).toEqual({ kind: 'printed', text: '4/4' });
    const crewed = {
      ...wagon,
      types: ['artifact', 'creature'],
      power: 4,
      toughness: 4,
    } as unknown as ObjectView;
    const { printedPt: _gone, ...live } = crewed;
    expect(isCrewedVehicle(live as ObjectView)).toBe(true);
    expect(cornerStat(live as ObjectView)).toEqual({ kind: 'pt', text: '4/4' });
    // A creature that is not a Vehicle is never "crewed"; a card with no printed pair has no corner.
    expect(isCrewedVehicle(bearA)).toBe(false);
    expect(cornerStat(card(8, 'Sol Ring', { types: ['artifact'] }))).toBeNull();
    // The printed pair is only drawn on the battlefield.
    expect(cornerStat({ ...wagon, zone: 'hand' } as ObjectView)).toBeNull();
  });
});
