/**
 * The web side of D-272 (Dawnbreak Reclaimer: "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those
 * cards to the battlefield under their owners' control") as pure models: the picker lists the cards of any graveyard (every graveyard is public, CR 404.2), not only the chooser's
 * own; the words of the choice and of the one question for both cards; what the other player is shown while it waits. No DOM.
 */
import type {
  ChooseCardsDecision,
  ConfirmOptionalDecision,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  confirmLabel,
  discardTitle,
  foundBadge,
  pickerCards,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { optionalAsk } from '../src/ui/decisions/optional';
import { lookupIndexFor } from './decisions-helpers';

const card = (id: string, name: string, owner: 0 | 1, zone = 'graveyard'): ObjectView =>
  ({
    id,
    name,
    controller: owner,
    owner,
    types: ['creature'],
    subtypes: [],
    counters: {},
    zone,
    oracleText: '',
    keywords: [],
  }) as unknown as ObjectView;

const ANGEL = card('o1', 'Serra Angel', 1);
const BEARS = card('o2', 'Grizzly Bears', 1);
const SPIDER = card('o3', 'Giant Spider', 0);
const SOURCE = {
  ...card('o9', 'Dawnbreak Reclaimer', 0, 'stack'),
  abilitySource: 'o8',
} as unknown as ObjectView;

const view = (extra: Partial<GameView> = {}): GameView =>
  ({
    viewer: 0,
    battlefield: [],
    stack: [SOURCE],
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [SPIDER], command: [] },
      { id: 1, hand: null, graveyard: [ANGEL, BEARS], command: [] },
    ],
    ...extra,
  }) as unknown as GameView;

const choose = (seat: 0 | 1, legal: readonly string[]): ChooseCardsDecision =>
  ({
    kind: 'chooseCards',
    id: 'd1',
    seat,
    source: 'o9',
    purpose: 'pair',
    zone: 'graveyard',
    legal,
    min: 1,
    max: 1,
    reveal: true,
    prompt: "Choose a creature card in an opponent's graveyard.",
  }) as unknown as ChooseCardsDecision;

describe('the choice of a card in a graveyard', () => {
  test('the controller sees the cards of the opponent graveyard, which are not in their own', () => {
    const d = choose(0, ['o1', 'o2']);
    expect(pickerCards(view(), d).map((o) => o.name)).toEqual(['Serra Angel', 'Grizzly Bears']);
  });

  test('the opponent sees the cards of the controller graveyard', () => {
    const d = choose(1, ['o3']);
    expect(pickerCards(view({ viewer: 1 }), d).map((o) => o.name)).toEqual(['Giant Spider']);
  });

  test('only the legal cards are listed', () => {
    expect(pickerCards(view(), choose(0, ['o2'])).map((o) => o.id)).toEqual(['o2']);
  });

  test('the words: the button, the badge, the title, and what the other player sees', () => {
    const d = choose(0, ['o1', 'o2']);
    expect(confirmLabel(d, ['o1'])).toBe('Choose');
    expect(foundBadge(d, ['o1'], 'o1')).toBe('Chosen');
    expect(foundBadge(d, ['o1'], 'o2')).toBeNull();
    expect(discardTitle(d, lookupIndexFor([SOURCE]))).toBe(
      "Choose a card in a graveyard (Dawnbreak Reclaimer's ability)",
    );
    expect(
      waitingText(
        view({
          waitingOn: { seat: 1, purpose: 'pair', sourceName: "Dawnbreak Reclaimer's ability" },
        } as Partial<GameView>),
      ),
    ).toBe("Opponent is choosing a card in a graveyard (Dawnbreak Reclaimer's ability).");
  });
});

describe('the one question for both cards', () => {
  const ask = {
    kind: 'confirmOptional',
    id: 'd2',
    seat: 0,
    source: 'o9',
    sourceName: 'Dawnbreak Reclaimer',
    sourceOracleText: '',
    purpose: 'pairReturn',
    pair: { theirs: 'o1', mine: 'o3' },
  } as unknown as ConfirmOptionalDecision;
  const index = lookupIndexFor([ANGEL, BEARS, SPIDER, SOURCE]);

  test('it names both cards and says whose control they return under; there is no way to take it back', () => {
    const a = optionalAsk(ask, index);
    expect(a.prompt).toBe(
      "Dawnbreak Reclaimer: return Serra Angel and Giant Spider to the battlefield under their owners' control?",
    );
    expect(a.yes).toBe('Return them');
    expect(a.no).toBe("Don't return");
    expect(a.cancellable).toBe(false);
  });

  test('with only one card it names only that one', () => {
    const a = optionalAsk({ ...ask, pair: { theirs: 'o1' } } as ConfirmOptionalDecision, index);
    expect(a.prompt).toBe(
      "Dawnbreak Reclaimer: return Serra Angel to the battlefield under their owners' control?",
    );
  });
});
