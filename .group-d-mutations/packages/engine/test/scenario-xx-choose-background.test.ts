// CR 702.124k (Choose a Background, D-175): a deck-construction ability with no effect in the game. The card validates, plays as the
// creature it is and has the keyword; whether it can be a commander with a Background is `packages/cards`' check (D-053).
// The card is defined here: it is not a fixture of the engine.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const NAME = 'SYNTHETIC Background Seeker';
const seeker = singleFace({
  name: NAME,
  manaCost: ['2', 'R'],
  types: ['creature'],
  subtypes: ['Human'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 3,
  toughness: 2,
  oracleText: 'Choose a Background',
  abilities: [{ kind: 'keyword', keyword: { kind: 'chooseBackground' } }],
});

describe('CR 702.124k (Choose a Background): accepted, no effect in the game', () => {
  test('the card validates', () => {
    expect(validateCard(seeker)).toEqual([]);
  });

  test('it plays as a vanilla creature with the keyword', () => {
    const g = scenario().seat(0).define(seeker).battlefield(NAME).seat(1).build();
    g.expect.pt(NAME, 3, 2);
    g.expect.derived(NAME, { keywords: ['chooseBackground'] });
    g.expect.invariants();
  });

  test('casting it from the hand changes nothing else about the game', () => {
    const g = scenario()
      .seat(0)
      .define(seeker)
      .hand(NAME)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .at('precombatMain')
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });
});
