import type {
  Ability,
  CardDefinition,
  Condition,
  Effect,
  StackAbility,
  TargetSpec,
} from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { amountPhrase, createDefinitions } from '../src/game/amount-text';
import { gameConditionWords } from '../src/game/condition-text';
import { conditionText, triggerGist } from '../src/ui/decisions/ability-label';

/**
 * The words of the counted amounts, the player selectors, the tokens and the conditions of D-131, read
 * from the engine's SYNTHETIC fixtures (`synthetic-amounts.ts`, `synthetic-player-effects.ts`): the
 * wording is composed from the AST, so a fixture's effect is all a test needs.
 */
const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

/** The gist of a spell's effect, as the stack words an ability. */
function spellGist(name: string): string {
  const spell = faceOf(syntheticCard(name)).spell;
  if (spell === null || spell.effect === undefined) throw new Error(`${name} has no effect`);
  const targets: readonly TargetSpec[] | undefined = spell.targets;
  const ability = {
    kind: 'activated',
    cost: [],
    effect: spell.effect,
    ...(targets === undefined ? {} : { targets }),
  } as unknown as StackAbility;
  return triggerGist(ability, { types: faceOf(syntheticCard(name)).types } as never);
}

/** The gist of the card's n-th triggered ability. */
function triggerOf(name: string, n = 0): string {
  const face = faceOf(syntheticCard(name));
  const trigger = face.abilities.filter(
    (a): a is Ability & { kind: 'triggered' } => a.kind === 'triggered',
  )[n];
  if (trigger === undefined) throw new Error(`${name} has no trigger ${n}`);
  return triggerGist(trigger as unknown as StackAbility, { types: face.types } as never);
}

test('"where X is ..." is said once, after every place X is read (CR 107.3c)', () => {
  expect(triggerOf('SYNTHETIC Zombie Mourner')).toBe(
    'You draw X cards. You lose X life, where X is the number of Zombies you control',
  );
  expect(spellGist('SYNTHETIC Swamp Siphon')).toBe(
    'Deal X damage to target creature. You gain X life, where X is the number of Swamps you control',
  );
  expect(spellGist('SYNTHETIC Chain Reaction')).toBe(
    'Deal X damage to each creature, where X is the number of creatures on the battlefield',
  );
  // An announced X is not defined by the text.
  expect(spellGist('SYNTHETIC Double X Draw')).toBe('You draw X cards');
});

test('each kind of amount has its own words', () => {
  expect(triggerOf('SYNTHETIC Rank Raiser')).toBe(
    'Create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down',
  );
  expect(spellGist('SYNTHETIC Blood Devotion')).toBe(
    'You gain X life, where X is your devotion to black and red',
  );
  expect(spellGist('SYNTHETIC Identity Tithe')).toBe(
    "You gain X life, where X is the number of colors in your commander's color identity",
  );
  expect(triggerOf('SYNTHETIC Hearty Host')).toBe(
    "You gain X life, where X is that creature's toughness",
  );
  expect(spellGist('SYNTHETIC Web Swarm')).toBe(
    'Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you',
  );
  expect(spellGist('SYNTHETIC Mighty Feast')).toBe(
    'You gain 2 life for each creature you control with power 4 or greater',
  );
  const owner = { kind: 'this' } as const;
  expect(
    amountPhrase({ kind: 'countersOn', of: owner, counter: 'age' }, { self: 'creature' }),
  ).toBe('the number of age counters on this creature');
  expect(amountPhrase({ kind: 'countersOn', of: { kind: 'moved' }, counter: 'age' })).toBe(
    'the number of age counters on it',
  );
  const creatures = { types: ['creature'], controller: 'you' } as const;
  expect(
    amountPhrase({ kind: 'aggregate', how: 'greatest', stat: 'power', filter: creatures }),
  ).toBe('the greatest power among creatures you control');
  expect(amountPhrase({ kind: 'aggregate', how: 'total', stat: 'power', filter: creatures })).toBe(
    'the total power of creatures you control',
  );
  expect(amountPhrase({ kind: 'sum', of: [{ kind: 'countOf', filter: creatures }, 2] })).toBe(
    'the number of creatures you control plus 2',
  );
  expect(
    amountPhrase({ kind: 'multiple', factor: 2, of: { kind: 'countOf', filter: creatures } }),
  ).toBe('twice the number of creatures you control');
});

test('an amount or a filter the words cannot say is "a number", never JSON', () => {
  expect(amountPhrase({ kind: 'countOf', filter: { chosenType: true } })).toBe('a number');
  expect(amountPhrase({ kind: 'somethingNew' } as never)).toBe('a number');
  const defs = createDefinitions();
  expect(defs.say({ kind: 'somethingNew' } as never)).toBe('a number');
  expect(defs.tail()).toBe('');
});

test('two different definitions get X and Y, a repeated one keeps its letter', () => {
  const defs = createDefinitions();
  const zombies = {
    kind: 'countOf',
    filter: { types: ['creature'], subtypes: ['Zombie'] },
  } as const;
  const lands = { kind: 'countOf', filter: { types: ['land'], controller: 'you' } } as const;
  expect([defs.say(zombies), defs.say(lands), defs.say(zombies)]).toEqual(['X', 'Y', 'X']);
  expect(defs.tail()).toBe(
    ', where X is the number of Zombies on the battlefield and Y is the number of lands you control',
  );
});

test('a subtype names its type only where the plural is a plain "s"', () => {
  const of = (subtype: string) => ({
    kind: 'countOf' as const,
    filter: { types: ['creature' as const], subtypes: [subtype], controller: 'you' as const },
  });
  expect(amountPhrase(of('Zombie'))).toBe('the number of Zombies you control');
  expect(amountPhrase(of('Human'))).toBe('the number of Humans you control');
  // Irregular and unchanged plurals read right (`filter-text.test.ts` has the whole table).
  expect(amountPhrase(of('Elf'))).toBe('the number of Elves you control');
  expect(amountPhrase(of('Merfolk'))).toBe('the number of Merfolk you control');
  expect(amountPhrase(of('Fish'))).toBe('the number of Fish you control');
});

test('tapped tokens say "tapped", with a number or with a count', () => {
  expect(spellGist('SYNTHETIC Army Muster')).toBe(
    'Create 13 tapped 2/2 black Zombie creature tokens',
  );
  expect(spellGist('SYNTHETIC Tapped Hoard')).toBe(
    'Create X tapped Treasure tokens, where X is the number of Zombies you control',
  );
  expect(spellGist('SYNTHETIC Tapped Twin')).toBe(
    "Create a tapped token that's a copy of target creature you control",
  );
});

test('several players in one selector: "you and target opponent each ..."', () => {
  expect(spellGist('SYNTHETIC Shared Rendezvous')).toBe(
    'You and target opponent each draw 2 cards',
  );
  expect(spellGist('SYNTHETIC Shared Mill')).toBe('You and target opponent each mill 2 cards');
  expect(spellGist('SYNTHETIC Shared Burn')).toBe('Deal 2 damage to you and target opponent');
  expect(spellGist('SYNTHETIC Overlapping Feast')).toBe('You and each player each gain 3 life');
});

test('each player sacrifices a creature of their choice, and what was sacrificed this way', () => {
  expect(spellGist('SYNTHETIC Instant Culling')).toBe(
    'Each player sacrifices a creature of their choice',
  );
  expect(spellGist('SYNTHETIC Necrotic Sweep')).toBe(
    'Each player sacrifices 2 creatures of their choice. Create X tapped 2/2 black Zombie creature tokens, where X is the number of permanents sacrificed this way',
  );
  expect(spellGist('SYNTHETIC Weighted Toll')).toBe(
    'Each opponent sacrifices X creatures of their choice, where X is the number of Zombies you control',
  );
  expect(spellGist('SYNTHETIC Tide Mill')).toBe(
    'Each player mills X cards, where X is the number of creatures you control',
  );
});

test("a bite names the creature that deals the damage; it is not the spell's", () => {
  expect(spellGist('SYNTHETIC Gnash Down')).toBe(
    'Target creature you control deals damage equal to its power to target creature or planeswalker an opponent controls',
  );
  expect(spellGist('SYNTHETIC Flat Bite')).toBe(
    'Target creature you control deals 3 damage to target creature or planeswalker an opponent controls',
  );
  expect(triggerOf('SYNTHETIC Surge Watcher')).toBe(
    'That creature deals damage equal to its power to any target',
  );
  expect(triggerOf('SYNTHETIC Dragon Scourge')).toBe(
    'That creature deals X damage to any target, where X is the number of Dragons you control',
  );
});

test('conditions: the monarch, and an amount compared with a number', () => {
  expect(triggerOf('SYNTHETIC Court of Grace Cousin', 1)).toBe(
    "If you're the monarch, create a 4/4 white Angel creature token with flying. Otherwise, create a 1/1 white Spirit creature token with flying",
  );
  expect(triggerOf('SYNTHETIC Usurper Scout')).toBe(
    'You draw a card if an opponent is the monarch',
  );
  expect(triggerOf('SYNTHETIC Power Scout')).toBe(
    'You draw a card if the total power of creatures you control is 8 or greater',
  );
  expect(triggerOf('SYNTHETIC Envious Cleric')).toBe(
    'You gain 4 life if an opponent has more life than you',
  );
  expect(spellGist('SYNTHETIC Graveyard Count')).toBe(
    'If the number of creature cards in your graveyard is 3 or greater, you gain 5 life. Otherwise, you lose 1 life',
  );
});

test('a negated condition, a combination, and a shape the words do not know', () => {
  const monarch: Condition = {
    kind: 'playerHasDesignation',
    player: { kind: 'you' },
    designation: 'monarch',
  };
  expect(gameConditionWords({ kind: 'not', term: monarch })).toBe("you're not the monarch");
  const power: Condition = {
    kind: 'amountIs',
    amount: { kind: 'devotion', colors: ['B'] },
    compare: { cmp: 'atLeast', value: 5 },
  };
  expect(gameConditionWords({ kind: 'not', term: power })).toBe(
    'your devotion to black is less than 5',
  );
  expect(gameConditionWords({ kind: 'and', terms: [monarch, power] })).toBe(
    "you're the monarch and your devotion to black is 5 or greater",
  );
  // De Morgan: not (a and b) is not a or not b.
  expect(gameConditionWords({ kind: 'not', term: { kind: 'and', terms: [monarch, power] } })).toBe(
    "you're not the monarch or your devotion to black is less than 5",
  );
  expect(gameConditionWords({ kind: 'kicked' })).toBeNull();
  expect(conditionText({ kind: 'kicked' })).toBeNull();
  // Several players at once have no sentence of their own.
  expect(
    gameConditionWords({
      kind: 'playerHasDesignation',
      player: { kind: 'all', of: [{ kind: 'you' }, { kind: 'eachOpponent' }] },
      designation: 'monarch',
    }),
  ).toBeNull();
});

test('nothing it words prints undefined, JSON or [object]', () => {
  const odd = {
    kind: 'draw',
    player: { kind: 'you' },
    count: { kind: 'somethingNew' },
  } as unknown as Effect;
  const text = triggerGist(
    { kind: 'triggered', trigger: { kind: 'landfall' }, effect: odd } as unknown as StackAbility,
    undefined,
  );
  expect(text).toBe('You draw a number cards');
  expect(text).not.toMatch(/undefined|\{|\[object/);
});
