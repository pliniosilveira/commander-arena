/**
 * The wording of the D-092 / D-096 decisions without a game: the "may search" question for the
 * caster's own spell, the payment prompt of a counterspell's cost, the prompt and badge of an
 * effect's permanent choice and its fallbacks, the autopilot never answering these questions, and
 * the log lines of `describeEvent` for each answer.
 */
import type {
  ConfirmOptionalDecision,
  GameState,
  ObjectView,
  PayManaDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { DEFAULT_STOPS, shouldStop } from '../src/policy/should-stop';
import { optionalAsk } from '../src/ui/decisions/optional';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import {
  choosePermanentPrompt,
  chosenBadge,
  effectDestination,
  legalNoun,
} from '../src/ui/decisions/permanents';
import { lookupIndexFor } from './decisions-helpers';

const view = (id: string, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({ id, name, controller: 0, owner: 0, types: ['land'], oracleText: '', ...patch }) as ObjectView;

const confirm = (patch: Partial<ConfirmOptionalDecision>): ConfirmOptionalDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'confirmOptional',
  source: 'o1' as ConfirmOptionalDecision['source'],
  sourceName: 'SYNTHETIC X',
  sourceOracleText: '',
  ...patch,
});

describe('the "may search" question', () => {
  const spell = view('o1', 'SYNTHETIC Optional Land Fetch', { types: ['sorcery'] });

  test("for the caster's own spell the prompt says you may search", () => {
    const ask = optionalAsk(
      confirm({ purpose: 'search', sourceName: spell.name }),
      lookupIndexFor([spell]),
    );
    expect(ask.prompt).toBe('SYNTHETIC Optional Land Fetch lets you search your library. Search?');
    expect([ask.yes, ask.no, ask.cancellable]).toEqual(['Search', "Don't search", false]);
  });

  test("for the opponent's spell the prompt says so", () => {
    const ask = optionalAsk(
      confirm({ purpose: 'search', sourceName: spell.name }),
      lookupIndexFor([{ ...spell, controller: 1 }]),
    );
    expect(ask.prompt).toBe(
      "SYNTHETIC Optional Land Fetch (the opponent's spell) lets you search your library. Search?",
    );
  });
});

describe('the counterspell payment', () => {
  const index = lookupIndexFor([
    view('o1', 'SYNTHETIC Soft Counter', { types: ['instant'] }),
    view('o2', 'Lightning Bolt', { types: ['instant'], controller: 1 }),
  ]);
  const pay = (purpose: PayManaDecision['purpose']): PayManaDecision => ({
    id: 'd2',
    seat: 0,
    kind: 'payMana',
    source: 'o1' as PayManaDecision['source'],
    totalCost: ['3'],
    manaSources: [],
    ...(purpose === undefined ? {} : { purpose, subject: 'o2' as PayManaDecision['source'] }),
  });

  test('the prompt names the counterspell where Ward says "ward"', () => {
    expect(payBarPrompt(pay('counterUnlessPays'), index)).toBe(
      'Pay {3} for SYNTHETIC Soft Counter or Lightning Bolt is countered: tap your mana sources.',
    );
    expect(payBarPrompt(pay('ward'), index)).toBe(
      'Pay {3} for ward or Lightning Bolt is countered: tap your mana sources.',
    );
    expect(payBarPrompt(pay(undefined), index)).toBe(
      'Pay for SYNTHETIC Soft Counter: tap your mana sources.',
    );
  });

  test('Cancel says the spell is countered for both purposes, and is Cancel for a cast', () => {
    expect(payCancelLabel(pay('counterUnlessPays'))).toBe("Don't pay (it is countered)");
    expect(payCancelLabel(pay('ward'))).toBe("Don't pay (it is countered)");
    expect(payCancelLabel(pay(undefined))).toBe('Cancel');
  });
});

describe("an effect's choice of permanents", () => {
  const forest = view('o1', 'Forest');
  const island = view('o2', 'Island');
  const bear = view('o3', 'Grizzly Bears', { types: ['creature'] });
  const land = (text: string) =>
    view('o9', 'SYNTHETIC Bounce Land', { oracleText: text, types: ['land'] });
  const decision = { purpose: 'effect' as const, min: 1, max: 1, source: 'o9' as never, legal: [] };

  test('"return a land you control to its owner\'s hand" in the source text gives the full prompt', () => {
    const index = lookupIndexFor([
      forest,
      island,
      land('When this land enters, return a land you control to its owner’s hand.'),
    ]);
    expect(choosePermanentPrompt({ ...decision, legal: ['o1', 'o2'] as never }, index)).toBe(
      "Choose a land you control to return to its owner's hand.",
    );
  });

  test('without such a clause the prompt names the source and never a destination', () => {
    const index = lookupIndexFor([forest, island, land('Something else entirely.')]);
    expect(choosePermanentPrompt({ ...decision, legal: ['o1', 'o2'] as never }, index)).toBe(
      'Choose a land you control for SYNTHETIC Bounce Land.',
    );
  });

  test('the noun comes from the legal permanents: an article, a common type or "permanent"', () => {
    const index = lookupIndexFor([forest, island, bear, land('')]);
    expect(legalNoun(['o1', 'o2'] as never, index)).toBe('land');
    expect(legalNoun(['o3'] as never, index)).toBe('creature');
    expect(legalNoun(['o1', 'o3'] as never, index)).toBe('permanent');
    expect(legalNoun([] as never, index)).toBe('permanent');
    expect(choosePermanentPrompt({ ...decision, legal: ['o3'] as never }, index)).toBe(
      'Choose a creature you control for SYNTHETIC Bounce Land.',
    );
  });

  test('two clauses are ambiguous: no destination is claimed', () => {
    expect(effectDestination('Return a land you control to its owner’s hand.')).toBe(
      "to return to its owner's hand",
    );
    expect(
      effectDestination(
        'Return a land you control to its owner’s hand. Return an artifact you control to its owner’s hand.',
      ),
    ).toBeNull();
    expect(effectDestination('')).toBeNull();
  });

  test('the badge is "Chosen", not "Sacrifice"', () => {
    expect(chosenBadge({ purpose: 'effect' })).toBe('Chosen');
    expect(chosenBadge({ purpose: 'sacrifice' })).toBe('Sacrifice');
  });
});

describe('the autopilot never answers these questions', () => {
  test.each(['search', 'counterUnlessPays', 'ward', 'kicker'] as const)(
    'confirmOptional %s stops, whatever the settings',
    (purpose) => {
      const pending = confirm({ purpose });
      const v = { pending, stack: [], viewer: 0 } as never;
      expect(shouldStop(v, DEFAULT_STOPS)).toBe(true);
      expect(shouldStop(v, { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] })).toBe(
        true,
      );
    },
  );

  test('a choosePermanent effect stops too', () => {
    const pending = {
      id: 'd3',
      seat: 0,
      kind: 'choosePermanent',
      purpose: 'effect',
      source: 'o9',
      min: 1,
      max: 1,
      legal: ['o1', 'o2'],
    };
    expect(shouldStop({ pending, stack: [], viewer: 0 } as never, DEFAULT_STOPS)).toBe(true);
  });
});

describe('describeEvent for the answers', () => {
  /** A minimal state whose pending decision is `pending`, with names for the objects it names. */
  function stateWith(pending: unknown, names: Record<string, string>): GameState {
    const objects = Object.fromEntries(
      Object.entries(names).map(([id, name]) => [
        id,
        { id, card: null, token: { characteristics: { name } }, stack: null },
      ]),
    );
    return { pending, objects, lki: {}, turn: { number: 3 } } as unknown as GameState;
  }

  test('a counterspell question: pay and decline name the spell, and the countered line is not repeated', () => {
    const before = stateWith(
      {
        kind: 'confirmOptional',
        purpose: 'counterUnlessPays',
        source: 'o1',
        subject: 'o2',
        cost: [{ kind: 'mana', symbols: ['3'] }],
        seat: 0,
      },
      { o1: 'SYNTHETIC Soft Counter', o2: 'Lightning Bolt' },
    );
    const text = (accepted: boolean, viewer = 0) =>
      describeEvent(
        { kind: 'optionalAnswered', seat: 0, source: 'o1' as never, accepted },
        before,
        before,
        viewer,
      )?.text;
    expect(text(true)).toBe('You pay {3} so Lightning Bolt is not countered.');
    expect(text(false)).toBe("You don't pay; Lightning Bolt is countered.");
    expect(text(true, 1)).toBe('Opponent pays {3} so Lightning Bolt is not countered.');
    expect(
      describeEvent({ kind: 'countered', object: 'o2' as never }, before, before, 0),
    ).toBeNull();
  });

  test('the payment cancelled for a counterspell: the countered line carries "don\'t pay"', () => {
    const before = stateWith(
      { kind: 'payMana', purpose: 'counterUnlessPays', source: 'o1', subject: 'o2', seat: 0 },
      { o1: 'SYNTHETIC Soft Counter', o2: 'Lightning Bolt' },
    );
    expect(
      describeEvent({ kind: 'countered', object: 'o2' as never }, before, before, 0)?.text,
    ).toBe("You don't pay; Lightning Bolt is countered.");
  });

  test('the search question: choose or decline, for either player', () => {
    const before = stateWith(
      {
        kind: 'confirmOptional',
        purpose: 'search',
        source: 'o1',
        sourceName: 'SYNTHETIC Banish Seek Land',
        seat: 0,
      },
      { o1: 'SYNTHETIC Banish Seek Land' },
    );
    const line = (seat: number, accepted: boolean) =>
      describeEvent(
        { kind: 'optionalAnswered', seat, source: 'o1' as never, accepted },
        before,
        before,
        0,
      );
    expect(line(0, true)?.text).toBe(
      'You choose to search your library (SYNTHETIC Banish Seek Land).',
    );
    expect(line(0, false)?.text).toBe(
      'You decline to search your library (SYNTHETIC Banish Seek Land).',
    );
    expect(line(1, true)?.text).toBe(
      'Opponent chooses to search their library (SYNTHETIC Banish Seek Land).',
    );
    expect(line(1, false)?.text).toBe(
      'Opponent declines to search their library (SYNTHETIC Banish Seek Land).',
    );
  });

  test('an effect choice names the permanents and the source; an automatic one says there was no choice', () => {
    const before = stateWith(null, { o1: 'Forest', o9: 'SYNTHETIC Bounce Land' });
    const line = (automatic: boolean, seat = 0) =>
      describeEvent(
        {
          kind: 'permanentsChosen',
          seat,
          source: 'o9' as never,
          objects: ['o1' as never],
          purpose: 'effect',
          automatic,
        },
        before,
        before,
        0,
      )?.text;
    expect(line(false)).toBe('You choose Forest for SYNTHETIC Bounce Land.');
    expect(line(true)).toBe('You must choose Forest for SYNTHETIC Bounce Land: no other choice.');
    expect(line(false, 1)).toBe('Opponent chooses Forest for SYNTHETIC Bounce Land.');
  });
});
