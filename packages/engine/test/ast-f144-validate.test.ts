// Deck support issue 144: what `validateCard` allows of the effects and the static ability it adds. Exiling the top card of the library of the player an event is about (CR 701.13), a
// permission to cast with mana of any color (CR 609.4b), a delayed move of exiled cards to the graveyard followed by tokens (CR 603.7c), and the activated abilities of the top card of the
// library (CR 613.1f, 401.5).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type Effect, validateCard } from '../src/index';

const base = {
  manaCost: ['1'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Test.',
} as const;

const sorcery = (effect: Effect) =>
  singleFace({ ...base, name: 'SYNTHETIC Test Sorcery', types: ['sorcery'], spell: { effect } });

const creature = (abilities: readonly Ability[]) =>
  singleFace({
    ...base,
    name: 'SYNTHETIC Test Creature',
    types: ['creature'],
    power: 1,
    toughness: 1,
    abilities,
  });

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card).map((i) => i.message);

const trigger = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'dealsCombatDamage', what: { controller: 'you' }, to: 'player' },
  effect,
});

describe('exileTop from the player of the event', () => {
  const exile = (from: unknown): Effect =>
    ({ kind: 'exileTop', count: 1, from }) as unknown as Effect;

  test('triggerPlayer is the library of the player damaged', () => {
    expect(messages(creature([trigger(exile({ kind: 'triggerPlayer' }))]))).toEqual([]);
  });

  test('the controller of the effect is not named: left out is their own library', () => {
    expect(
      messages(creature([trigger(exile({ kind: 'you' }))])).some((m) =>
        m.includes('the library whose top cards are exiled'),
      ),
    ).toBe(true);
  });
});

describe('mayPlay with anyManaColor', () => {
  const play = (extra: Record<string, unknown>): Effect =>
    ({
      kind: 'sequence',
      effects: [
        { kind: 'exileTop', count: 1 },
        { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn', ...extra },
      ],
    }) as unknown as Effect;

  test('a cast with mana of any color is valid', () => {
    expect(messages(sorcery(play({ castOnly: true, anyManaColor: true })))).toEqual([]);
  });

  test('without castOnly it is valid too (Breeches: "play those cards ... mana of any color to cast those spells"): a land is played, a spell is paid for with any color', () => {
    expect(messages(sorcery(play({ anyManaColor: true })))).toEqual([]);
  });

  test('anyManaColor is true when present', () => {
    expect(messages(sorcery(play({ castOnly: true, anyManaColor: false }))).length).toBeGreaterThan(
      0,
    );
  });
});

describe('a delayed move of exiled cards to the graveyard, then tokens', () => {
  const token = {
    kind: 'createToken',
    token: { kind: 'predefined', name: 'Treasure' },
    count: { kind: 'movedCount' },
  };
  const delayed = (inner: unknown): Effect =>
    ({
      kind: 'sequence',
      effects: [
        { kind: 'exileTop', count: 3 },
        {
          kind: 'delayedTrigger',
          at: { step: 'end', whose: 'each' },
          effect: inner,
        },
      ],
    }) as unknown as Effect;
  const move = { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'graveyard' };

  test('the cards the effect before it exiled, then a token for each moved', () => {
    expect(
      messages(sorcery(delayed({ kind: 'sequence', effects: [move, token] }))).filter((m) =>
        m.includes('delayed'),
      ),
    ).toEqual([]);
  });

  test('the tokens are one for each card moved, not a fixed number', () => {
    expect(
      messages(
        sorcery(delayed({ kind: 'sequence', effects: [move, { ...token, count: 2 }] })),
      ).some((m) => m.includes('delayed')),
    ).toBe(true);
  });

  test('after nothing that exiled cards the move has nothing to name', () => {
    const lone: Effect = {
      kind: 'delayedTrigger',
      at: { step: 'end', whose: 'each' },
      effect: { kind: 'sequence', effects: [move, token] },
    } as unknown as Effect;
    expect(messages(sorcery(lone)).some((m) => m.includes('delayed'))).toBe(true);
  });
});

describe('grantActivatedAbilitiesOfTopCard', () => {
  const grant = (extra: Record<string, unknown>): Ability =>
    ({
      kind: 'static',
      static: {
        kind: 'grantActivatedAbilitiesOfTopCard',
        subject: { kind: 'this' },
        card: { subtypes: ['Goblin'] },
        ...extra,
      },
    }) as unknown as Ability;

  test('the permanent itself, with the card on top described by a filter', () => {
    expect(messages(creature([grant({})]))).toEqual([]);
  });

  test('another subject is refused', () => {
    expect(messages(creature([grant({ subject: { kind: 'attached' } })])).length).toBeGreaterThan(
      0,
    );
  });

  test('the card is read as printed: no zone, owner or controller', () => {
    expect(
      messages(creature([grant({ card: { subtypes: ['Goblin'], zone: 'library' } })])).length,
    ).toBeGreaterThan(0);
    expect(
      messages(creature([grant({ card: { subtypes: ['Goblin'], controller: 'you' } })])).length,
    ).toBeGreaterThan(0);
  });
});
