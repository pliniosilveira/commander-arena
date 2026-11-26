// Ahoy Mateys deck, group 2: what `validateCard` allows of the permission to cast an exiled card with mana of any type or with "exile it instead" (`mayPlay.anyManaType`, `mayPlay.exileInstead`,
// CR 609.4b, 614.1a), and of "you may exile a creature card from each graveyard" with the cards remembered by the permanent (`moveToZone` `eachGraveyard`, `linked`, CR 608.2d, 607.2a).
// The CR text was not available here: the numbers are those the engine's comments cite.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type Effect, validateCard } from '../src/index';

const base = {
  manaCost: ['1'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Test.',
} as const;

const creature = (abilities: readonly Ability[]) =>
  singleFace({
    ...base,
    name: 'SYNTHETIC Test Creature',
    types: ['creature'],
    power: 1,
    toughness: 1,
    abilities,
  });

const sorcery = (effect: Effect) =>
  singleFace({ ...base, name: 'SYNTHETIC Test Sorcery', types: ['sorcery'], spell: { effect } });

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card).map((i) => i.message);

const enters = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect,
});

describe('mayPlay with anyManaType and exileInstead', () => {
  const play = (extra: Record<string, unknown>): Effect =>
    ({
      kind: 'sequence',
      effects: [
        { kind: 'exileTop', count: 1 },
        { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn', ...extra },
      ],
    }) as unknown as Effect;

  test('both riders go with a permission to cast', () => {
    expect(
      messages(sorcery(play({ castOnly: true, anyManaType: true, exileInstead: true }))),
    ).toEqual([]);
  });

  test('exileInstead is about the spell: it needs castOnly', () => {
    expect(
      messages(sorcery(play({ exileInstead: true }))).some((m) => m.includes('needs castOnly')),
    ).toBe(true);
  });

  test('anyManaType goes with a permission to play too (Lidless Gaze: a land card among the cards is played as usual)', () => {
    expect(messages(sorcery(play({ anyManaType: true })))).toEqual([]);
    expect(messages(sorcery(play({ anyManaType: true, free: true }))).length).toBeGreaterThan(0);
  });

  test('anyManaType must be true, and a free play spends no mana', () => {
    expect(
      messages(sorcery(play({ castOnly: true, anyManaType: false }))).some((m) =>
        m.includes('must be true'),
      ),
    ).toBe(true);
    expect(
      messages(sorcery(play({ castOnly: true, anyManaType: true, free: true }))).some((m) =>
        m.includes('spends no mana'),
      ),
    ).toBe(true);
  });
});

describe('a card from each graveyard, exiled with the permanent', () => {
  const each = (extra: Record<string, unknown> = {}, selector: Record<string, unknown> = {}) =>
    ({
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { zone: 'graveyard', controller: 'you', types: ['creature'] },
        count: 1,
        optional: true,
        eachGraveyard: true,
        ...selector,
      },
      to: 'exile',
      ...extra,
    }) as unknown as Effect;

  test('an ability of a permanent may link the cards it exiles', () => {
    // A linked exile is read by another instruction of the face ("exiled with this creature"), or the cards would silently do nothing.
    const reads: Effect = {
      kind: 'mayPlay',
      objects: { kind: 'linkedExile' },
      lasts: 'endOfTurn',
      castOnly: true,
    };
    expect(messages(creature([enters(each({ linked: true })), enters(reads)]))).toEqual([]);
  });

  test('linked is an ability of a permanent: a spell has nothing to remember them', () => {
    expect(
      messages(sorcery(each({ linked: true }))).some((m) =>
        m.includes('an ability of a permanent'),
      ),
    ).toBe(true);
  });

  test('the choice is of one card, from the graveyard, into exile (optional, or not: issue 97, Summon: Esper Valigarmanda)', () => {
    const bad = (e: Effect) =>
      messages(creature([enters(e)])).some((m) => m.includes('eachGraveyard is true'));
    expect(bad(each({}, { optional: undefined }))).toBe(false);
    expect(bad(each({}, { optional: false }))).toBe(true);
    expect(bad(each({}, { count: 2 }))).toBe(true);
    expect(bad(each({ to: 'hand' }))).toBe(true);
    expect(
      bad(each({}, { filter: { zone: 'hand', controller: 'you', types: ['creature'] } })),
    ).toBe(true);
  });
});
