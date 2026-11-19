// What validateCard says about Rooms (CR 709.5) and the amount of the cards of a batch trigger (CR 603.2c, 205.2a): a split card with a shared type line is a supported layout; its halves
// are both permanents with one type line; the trigger "When you unlock this door" is an ability of a Room; and "the number of card types among those cards" is read only where a trigger
// is about a batch of cards. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type CardFace,
  syntheticCard,
  validateCard,
} from '../src/index';

const ROOM = syntheticCard('SYNTHETIC Watch Room // Vault Room');
const messages = (def: CardDefinition): string[] => validateCard(def).map((i) => i.message);
const withFace = (
  def: CardDefinition,
  index: number,
  patch: Partial<CardFace>,
): CardDefinition => ({
  ...def,
  faces: def.faces.map((f, i) => (i === index ? { ...f, ...patch } : f)),
});

const LOSE: Ability = {
  kind: 'triggered',
  trigger: { kind: 'doorUnlocked', who: 'you', door: 'this' },
  effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
};

describe('a Room', () => {
  test('a split card with two permanent halves of one type line validates clean', () => {
    expect(validateCard(ROOM)).toEqual([]);
    expect(validateCard(syntheticCard('SYNTHETIC Plain Room // Bare Room'))).toEqual([]);
  });

  test('a split card with one permanent half is refused: a Room has both', () => {
    const half = withFace(ROOM, 1, { types: ['instant'] });
    expect(messages(half).join('\n')).toContain('a split card is a Room');
  });

  test('the halves share one type line (CR 709.5a)', () => {
    const other = withFace(ROOM, 1, { types: ['artifact'], subtypes: [] });
    expect(messages(other).join('\n')).toContain('the halves of a Room share one type line');
    const subtype = withFace(ROOM, 1, { subtypes: ['Aura'] });
    expect(messages(subtype).join('\n')).toContain('the halves of a Room share one type line');
  });

  test('"when you unlock this door" is an ability of a Room, never of another card', () => {
    const single = syntheticCard('SYNTHETIC Turn Over');
    const abusing: CardDefinition = withFace(single, 0, { abilities: [LOSE] });
    expect(messages(abusing).join('\n')).toContain('only a Room');
    const spells = withFace(syntheticCard('SYNTHETIC Singe // Mend'), 0, { abilities: [LOSE] });
    expect(messages(spells).join('\n')).toContain('only a Room');
  });

  test('the trigger names the player and the door: "you" and "this"', () => {
    const bad = withFace(ROOM, 1, {
      abilities: [
        { ...LOSE, trigger: { kind: 'doorUnlocked', who: 'opponent', door: 'this' } } as never,
      ],
    });
    expect(messages(bad).join('\n')).toContain('unknown player');
  });
});

describe('the number of card types among those cards', () => {
  const putBatch = (amount: unknown, trigger: Ability): Ability =>
    ({
      ...(trigger as object),
      effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount },
    }) as never;
  const BATCH = {
    kind: 'triggered',
    trigger: { kind: 'putIntoGraveyard', who: 'you', from: 'library', batch: true },
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  } as unknown as Ability;
  const AMOUNT = { kind: 'cardTypesAmongTriggerCards' };

  test('a batch putIntoGraveyard trigger carries the cards: the amount is read there', () => {
    const def = withFace(ROOM, 0, { abilities: [putBatch(AMOUNT, BATCH)] });
    expect(validateCard(def)).toEqual([]);
  });

  test('a trigger of one card at a time has no batch of cards', () => {
    const single = {
      ...(BATCH as object),
      trigger: { kind: 'putIntoGraveyard', who: 'you', from: 'library' },
    } as unknown as Ability;
    const def = withFace(ROOM, 0, { abilities: [putBatch(AMOUNT, single)] });
    expect(messages(def).join('\n')).toContain('cardTypesAmongTriggerCards');
  });

  test('a spell has no cards of a trigger', () => {
    const spell = withFace(syntheticCard('SYNTHETIC Singe // Mend'), 1, {
      spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: AMOUNT } },
    } as never);
    expect(messages(spell).join('\n')).toContain('cardTypesAmongTriggerCards');
  });
});
