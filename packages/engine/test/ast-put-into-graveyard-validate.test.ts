// Validation of the `putIntoGraveyard` trigger (Death Toll deck, group B; CR 603.2, 603.2c, 404.1): what is accepted, and what is refused with a message, never half run.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

/** The card with its first ability replaced by `ability`. */
function withAbility(name: string, ability: unknown): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const NAME = 'SYNTHETIC Rivendell Warden';
const triggered = (trigger: unknown) => ({
  kind: 'triggered',
  trigger,
  effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
});
const land = { types: ['land'] };
const creature = { types: ['creature'] };

describe('the trigger "putIntoGraveyard"', () => {
  test.each([
    { kind: 'putIntoGraveyard', who: 'you', from: 'anywhere' },
    { kind: 'putIntoGraveyard', who: 'you', from: 'anywhere', filter: land },
    // Yuma, Proud Protector: a land type of the card in the graveyard (CR 205.3i).
    { kind: 'putIntoGraveyard', who: 'you', from: 'anywhere', filter: { subtypes: ['Desert'] } },
    { kind: 'putIntoGraveyard', who: 'you', from: 'library', batch: true },
    // Syr Konrad, the Grim: any player's graveyard, from any zone but the battlefield.
    { kind: 'putIntoGraveyard', who: 'any', from: 'notBattlefield', filter: creature },
    // Insidious Roots and Syr Konrad: the creature cards that leave your graveyard, in a batch or each.
    { kind: 'leftGraveyard', who: 'you' },
    { kind: 'leftGraveyard', who: 'you', filter: creature },
    { kind: 'leftGraveyard', who: 'you', filter: creature, each: true },
    {
      kind: 'putIntoGraveyard',
      who: 'you',
      from: 'anywhere',
      filter: land,
      batch: true,
      firstTimeEachTurn: true,
    },
  ])('%o is valid', (trigger) => {
    expect(messages(withAbility(NAME, triggered(trigger)))).toEqual([]);
  });

  test.each([
    [{ kind: 'putIntoGraveyard', who: 'opponent', from: 'anywhere' }, 'unknown player'],
    [{ kind: 'putIntoGraveyard', who: 'you', from: 'hand' }, 'from must be'],
    [
      {
        kind: 'putIntoGraveyard',
        who: 'any',
        from: 'anywhere',
        batch: true,
        firstTimeEachTurn: true,
      },
      'goes with the graveyard of "you"',
    ],
    [{ kind: 'leftGraveyard', who: 'any' }, 'unknown player'],
    [{ kind: 'leftGraveyard', who: 'you', each: false }, 'each must be true'],
    [
      { kind: 'leftGraveyard', who: 'you', filter: { zone: 'graveyard' } },
      'no zone, controller or owner',
    ],
    [{ kind: 'putIntoGraveyard', who: 'you', from: 'anywhere', batch: false }, 'batch must be'],
    [
      { kind: 'putIntoGraveyard', who: 'you', from: 'anywhere', firstTimeEachTurn: true },
      'goes with batch',
    ],
    [
      {
        kind: 'putIntoGraveyard',
        who: 'you',
        from: 'anywhere',
        batch: true,
        firstTimeEachTurn: true,
        filter: { types: ['creature'], other: true },
      },
      'card types only',
    ],
    [
      { kind: 'putIntoGraveyard', who: 'you', from: 'anywhere', filter: { zone: 'graveyard' } },
      'no zone, controller or owner',
    ],
  ])('%o is refused', (trigger, message) => {
    expect(messages(withAbility(NAME, triggered(trigger))).join(' | ')).toContain(message);
  });
});

const effectOf = (effect: unknown) =>
  withAbility(NAME, { kind: 'triggered', trigger: { kind: 'upkeep', whose: 'you' }, effect });
const toBattlefield = { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield' };

describe('the effect "chooseRandomFromGraveyard" (Death Toll deck, group B)', () => {
  test.each([
    { kind: 'chooseRandomFromGraveyard', count: 1 },
    { kind: 'chooseRandomFromGraveyard', count: 2, filter: land },
  ])('%o, then a move of the cards, is valid', (pick) => {
    expect(messages(effectOf({ kind: 'sequence', effects: [pick, toBattlefield] }))).toEqual([]);
  });

  test.each([
    [{ kind: 'chooseRandomFromGraveyard', count: 0 }, 'one or more'],
    [{ kind: 'chooseRandomFromGraveyard', count: 1.5 }, 'one or more'],
    [
      { kind: 'chooseRandomFromGraveyard', count: 1, filter: { zone: 'graveyard' } },
      'your graveyard',
    ],
    [
      { kind: 'chooseRandomFromGraveyard', count: 1, filter: { controller: 'you' } },
      'your graveyard',
    ],
  ])('%o is refused', (pick, message) => {
    expect(
      messages(effectOf({ kind: 'sequence', effects: [pick, toBattlefield] })).join(' | '),
    ).toContain(message);
  });

  test('a move of "moved" with no instruction before it that moved or picked cards is refused', () => {
    expect(messages(effectOf(toBattlefield)).length).toBeGreaterThan(0);
  });
});

describe('the effect "revealUntil" that puts the cards found into the graveyard', () => {
  const reveal = (put: string) => ({
    kind: 'revealUntil',
    filter: { types: ['creature'] },
    count: 2,
    put,
  });
  test('graveyard is a place the cards may go', () => {
    expect(messages(effectOf(reveal('graveyard')))).toEqual([]);
  });
  test('a place that is none of the five is refused', () => {
    expect(messages(effectOf(reveal('library'))).join(' | ')).toContain('into the graveyard');
  });
});

describe('the trigger "attackBatch" with eachAttackedPlayer, and the condition "movedShareAllCardTypes" (Death Toll deck, group B)', () => {
  const attack = (extra: Record<string, unknown>) =>
    withAbility(NAME, triggered({ kind: 'attackBatch', who: 'you', atLeast: 1, ...extra }));
  test('eachAttackedPlayer is valid, and only true', () => {
    expect(messages(attack({ eachAttackedPlayer: true }))).toEqual([]);
    expect(messages(attack({ eachAttackedPlayer: false })).join(' | ')).toContain('is true');
  });

  const sacrificeIfShared = (effects: readonly unknown[]) =>
    effectOf({
      kind: 'sequence',
      effects: [
        ...effects,
        {
          kind: 'conditional',
          condition: { kind: 'movedShareAllCardTypes' },
          effect: { kind: 'sacrifice', objects: { kind: 'this' } },
        },
      ],
    });
  test('after a mill it is valid', () => {
    expect(
      messages(sacrificeIfShared([{ kind: 'mill', player: { kind: 'you' }, count: 2 }])),
    ).toEqual([]);
  });
  test('with no instruction before it that moved cards it is refused', () => {
    expect(messages(sacrificeIfShared([])).length).toBeGreaterThan(0);
  });
});
