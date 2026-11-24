// The party of Stick Together (`chooseParty`, CR 700.8d) without a DOM: the picks of the dialog, the answer the model sends, and the log line of the event.
import type { Action, ChoosePartyDecision, GameState, ObjectId } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvents } from '../src/game/describe';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { filledBy, initialParty, partyInOrder, togglePartyMember } from '../src/ui/decisions/party';
import { initialUi } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';

const o = (n: number): ObjectId => `o${n}`;

// A Cleric Wizard (o1), a Rogue (o2) and a Cleric (o3).
const decision: ChoosePartyDecision = {
  kind: 'chooseParty',
  id: 'd1',
  seat: 0,
  source: o(9),
  slots: [
    { type: 'Cleric', legal: [o(1), o(3)] },
    { type: 'Rogue', legal: [o(2)] },
    { type: 'Warrior', legal: [] },
    { type: 'Wizard', legal: [o(1)] },
  ],
};

describe('the picks of the party dialog', () => {
  test('it starts with the fullest party the engine lists', () => {
    expect(initialParty(decision)).toEqual([
      { type: 'Cleric', object: o(3) },
      { type: 'Rogue', object: o(2) },
      { type: 'Wizard', object: o(1) },
    ]);
  });

  test('picking a creature for a place moves it from the place it filled, and picking it again leaves it out', () => {
    const start = initialParty(decision);
    const moved = togglePartyMember(start, 'Cleric', o(1));
    expect(filledBy(moved, 'Cleric')).toBe(o(1));
    // The Cleric Wizard stands in as the Cleric now: it no longer fills the Wizard place.
    expect(filledBy(moved, 'Wizard')).toBeUndefined();
    expect(filledBy(togglePartyMember(moved, 'Cleric', o(1)), 'Cleric')).toBeUndefined();
  });

  test('the answer names the places in the order of the decision', () => {
    const picks = [
      { type: 'Wizard' as const, object: o(1) },
      { type: 'Cleric' as const, object: o(3) },
    ];
    expect(partyInOrder(decision, picks).map((m) => m.type)).toEqual(['Cleric', 'Wizard']);
  });
});

describe('the model and the bot', () => {
  test('Confirm sends the party picked, and an empty one is labelled as choosing no one', () => {
    const sent: Action[] = [];
    const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
    const view = { battlefield: [], stack: [], exile: [], seats: [], viewer: 0 } as never;
    const make = (party: ReturnType<typeof initialParty>) =>
      buildModel(view, decision, { ...initialUi(decision), party }, ctl);
    const full = make(initialParty(decision));
    expect(full.bar.buttons[0]?.label).toBe('Confirm party');
    full.bar.buttons[0]?.run();
    expect(sent).toEqual([{ kind: 'chooseParty', party: initialParty(decision) }]);
    expect(make([]).bar.buttons[0]?.label).toBe('Choose no one');
    expect(full.bar.inOverlay).toBe(true);
    expect(chooseAction(view, decision)).toEqual({
      kind: 'chooseParty',
      party: initialParty(decision),
    });
  });
});

describe('the log line', () => {
  const names: Record<string, string> = { o1: 'Elf Cleric Wizard', o2: 'Rogue', o3: 'Cleric' };
  const objects: Record<string, unknown> = {};
  const cards: Record<string, unknown> = {};
  const definitions: Record<string, unknown> = {};
  for (const [id, name] of Object.entries(names)) {
    objects[id] = { card: `c${id}`, token: null, stack: null, controller: 0 };
    cards[`c${id}`] = { definition: `d${id}` };
    definitions[`d${id}`] = { name };
  }
  const state = { objects, cards, definitions, pending: null, combat: null, lki: {} } as unknown as GameState;
  const text = (events: Parameters<typeof describeEvents>[0]): string[] =>
    describeEvents(events, state, state, 0).map((l) => l.text);

  test('names the creatures and the place each fills, or says that none was chosen', () => {
    const [line] = text([
      {
        kind: 'partyChosen',
        seat: 0,
        source: o(9),
        party: [
          { type: 'Cleric', object: o(3) },
          { type: 'Wizard', object: o(1) },
        ],
        automatic: false,
      },
    ]);
    expect(line).toContain('a party:');
    expect(line).toContain('(Cleric)');
    expect(line).toContain('(Wizard)');
    const [none] = text([
      { kind: 'partyChosen', seat: 0, source: o(9), party: [], automatic: true },
    ]);
    expect(none).toContain('no party');
  });
});
