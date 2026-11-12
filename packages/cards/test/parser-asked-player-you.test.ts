// "You" and "your" of a sentence that asks another player (D-985, CR 608.2d, 101.4): with no "have you" the engine runs the clauses of the sentence with the asked player as "you"
// (`runsAs: 'chooser'`), which is right for the clauses that name nobody ("each opponent may draw a card": they draw) and wrong for a word of the text that says "you" or "your"
// of the controller. A sentence of that kind is not read, whatever the clause is; the texts are SYNTHETIC. The shapes that are read keep working: no "you" in the
// sentence, "may have you" (the controller acts) and the controller's own "you may".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const status = (text: string, typeLine = 'Creature — Bear') =>
  parseOnly(
    syntheticCard({
      name: 'SYNTHETIC Bear',
      manaCost: '{1}{G}',
      typeLine,
      oracleText: text,
      ...(typeLine.startsWith('Creature') ? { power: '2', toughness: '2' } : {}),
    }),
  ).support.status;

describe('a "you" of the controller in a sentence the asked player acts in is not read', () => {
  test.each([
    ['a second clause', 'each opponent may draw a card and you gain 1 life'],
    ['a second clause, a token', 'each opponent may draw a card and you create a Treasure token'],
    ['a second instruction after "then"', 'each opponent may draw a card, then you draw a card'],
    ['an amount per permanent', 'each opponent may draw a card for each creature you control'],
    [
      'an amount of the number of permanents',
      'each opponent may draw cards equal to the number of creatures you control',
    ],
    ['a target you control', 'each opponent may exile target creature you control'],
    [
      'a sacrifice of a permanent you control',
      'each opponent may sacrifice a creature you control',
    ],
    ['a zone of yours', 'each opponent may exile a card from your graveyard'],
    ['target opponent', 'target opponent may draw a card and you gain 1 life'],
    ['each player', 'each player may draw a card and you gain 1 life'],
    ['target player', 'target player may draw a card and you gain 1 life'],
  ])('is not read: %s', (_why, sentence) => {
    expect(status(`When ~ enters, ${sentence}.`)).toBe('unsupported');
  });

  test('nor in what is done for a player who declines', () => {
    expect(
      status("When ~ enters, each opponent may discard a card. If they don't, you gain 2 life."),
    ).toBe('unsupported');
  });
});

// An "opponent" of the text is an opponent of the controller; the engine would read it as an opponent of the player asked (D-985, CR 102.2).
describe('an "opponent" of the controller in a sentence the asked player acts in is not read', () => {
  test.each([
    [
      'a token per creature',
      'each opponent may create a Treasure token for each creature an opponent controls',
    ],
    ['destroy each', 'each opponent may destroy each creature an opponent controls'],
    ['exile each', 'each opponent may exile each creature an opponent controls'],
    ['tap each', 'each opponent may tap each creature an opponent controls'],
    ['untap each', 'each opponent may untap each creature an opponent controls'],
    [
      'a counter on each',
      'each opponent may put a +1/+1 counter on each creature an opponent controls',
    ],
    ['draw per land', 'each opponent may draw a card for each land an opponent controls'],
    [
      'gain life equal to a count',
      'each opponent may gain life equal to the number of creatures an opponent controls',
    ],
    [
      'lose life equal to a count',
      'each opponent may lose life equal to the number of creatures an opponent controls',
    ],
    [
      'draw cards equal to a count',
      'each opponent may draw cards equal to the number of creatures an opponent controls',
    ],
    ['all creatures', 'each opponent may exile all creatures an opponent controls'],
    [
      'all nonland permanents',
      'each opponent may exile all nonland permanents an opponent controls',
    ],
    ['a graveyard of an opponent', "each opponent may exile each opponent's graveyard"],
    [
      'a second instruction',
      'each opponent may sacrifice a creature, then exile all creatures an opponent controls',
    ],
    ['each player', 'each player may draw a card for each creature an opponent controls'],
    ['target opponent', 'target opponent may draw a card for each creature an opponent controls'],
    // These two do not parse at all today; pinned so that a later grammar rule does not read them as supported.
    ['another player', 'each opponent may draw a card for each creature another player controls'],
    ['other players', 'each opponent may exile all creatures other players control'],
  ])('is not read: %s', (_why, sentence) => {
    expect(status(`When ~ enters, ${sentence}.`)).toBe('unsupported');
  });

  test.each([
    'draw a card for each creature an opponent controls',
    'destroy each creature an opponent controls',
    'gain life equal to the number of creatures an opponent controls',
  ])('nor in what is done for a player who declines: %s', (clause) => {
    expect(
      status(`When ~ enters, each opponent may discard a card. If the player doesn't, ${clause}.`),
    ).toBe('unsupported');
  });

  test('the controller acts with "have you": "an opponent" is the opponent of the controller', () => {
    for (const sentence of [
      'each opponent may have you draw a card for each creature an opponent controls',
      'target opponent may have you create a Treasure token for each creature an opponent controls',
    ]) {
      expect(status(`When ~ enters, ${sentence}.`), sentence).toBe('supported');
    }
  });
});

describe('a quotation is lowered with no text of its own, so a sentence that asks another player there is not read', () => {
  test.each([
    [
      'a granted trigger',
      'As long as ~ is paired with another creature, each of those creatures has',
    ],
    ['a token', 'When ~ enters, create a 1/1 white Spirit creature token with'],
  ])('%s', (_why, head) => {
    for (const sentence of [
      'each opponent may draw a card and you gain 1 life',
      'each opponent may draw a card',
    ]) {
      const text = `${head} "When this creature dies, ${sentence}."`;
      expect(status(text, 'Creature — Angel'), text).toBe('unsupported');
    }
  });
});

describe('the shapes with no "you" of the controller in the sentence are read', () => {
  test.each([
    'each opponent may draw a card',
    'each opponent may gain 1 life and draw a card',
    'each player may discard their hand and draw seven cards',
    'target opponent may have you draw a card',
    'target opponent may have you draw a card and gain 1 life',
    'each opponent may have you draw a card for each creature you control',
  ])('is read: %s', (sentence) => {
    expect(status(`When ~ enters, ${sentence}.`), sentence).toBe('supported');
  });

  test('a later sentence of the ability says "you" for the controller as before', () => {
    expect(status('When ~ enters, each opponent may draw a card. You gain 1 life.')).toBe(
      'supported',
    );
  });
});

describe('what the engine does with the shapes that are read', () => {
  const FILLER = Array.from({ length: 30 }, () => 'Island');
  test('"each opponent may draw a card": the opponent draws, the controller does not', () => {
    const bear = parsed(
      'SYNTHETIC Drawing Bear',
      'Creature — Bear',
      'When ~ dies, each opponent may draw a card. You gain 1 life.',
      { manaCost: '{1}{G}', power: '2', toughness: '2' },
    );
    const g = scenario()
      .define(bear)
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield(bear.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [bear.name], pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.act(1).accept();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
    g.expect.life(0, 41);
    g.expect.life(1, 40);
    g.expect.invariants();
  });
});
