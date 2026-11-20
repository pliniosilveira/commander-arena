// What validateCard accepts and refuses about `grantKeywordToSpells` (issue 145): "Creature spells you cast have demonstrate." Pins: CR 702.144a (Demonstrate), CR 702.51a (Convoke),
// CR 613.1f (an ability given to an object), CR 604.2 (a static ability of a permanent). The spells are the ones the permanent's controller casts, named by what they are on the stack.
// Cards are SYNTHETIC probes built here.
import { describe, expect, test } from 'vitest';
import { unsupportedFeatureIssues } from '../src/ast/supported';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type CardDefinition,
  isFeatureSupported,
  type ObjectFilter,
  type StaticEffect,
  validateCard,
} from '../src/index';

const probe = (effect: unknown): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Spell Grant Probe',
    manaCost: ['3', 'W'],
    types: ['creature'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'SYNTHETIC probe',
    abilities: [{ kind: 'static', static: effect as StaticEffect }],
  });

const grant = (what: unknown, keyword: unknown = { kind: 'demonstrate' }) =>
  probe({ kind: 'grantKeywordToSpells', what: what as ObjectFilter, keyword });

const issues = (card: CardDefinition): string[] =>
  validateCard(card).map((i) => `${i.path}: ${i.message}`);

describe('grantKeywordToSpells is a supported feature', () => {
  test('the static kind is listed', () => {
    expect(isFeatureSupported('static:grantKeywordToSpells')).toBe(true);
    expect(unsupportedFeatureIssues(grant({ types: ['creature'], controller: 'you' }))).toEqual([]);
  });
});

describe('what it accepts', () => {
  const ok: [string, unknown, unknown?][] = [
    ['creature spells you cast have demonstrate', { types: ['creature'], controller: 'you' }],
    [
      'creature spells you cast have convoke',
      { types: ['creature'], controller: 'you' },
      { kind: 'convoke' },
    ],
    ['every spell you cast', { controller: 'you' }],
    [
      'instant and sorcery spells you cast',
      { controller: 'you', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
    ],
    ['red creature spells', { types: ['creature'], colors: ['R'], controller: 'you' }],
  ];
  for (const [name, what, keyword] of ok) {
    test(name, () => {
      expect(issues(grant(what, keyword))).toEqual([]);
    });
  }
});

describe('what it refuses', () => {
  const bad: [string, unknown, unknown, string][] = [
    [
      'a keyword the engine does not read from a spell',
      { types: ['creature'], controller: 'you' },
      { kind: 'flying' },
      'only demonstrate and convoke',
    ],
    [
      'no keyword',
      { types: ['creature'], controller: 'you' },
      null,
      'only demonstrate and convoke',
    ],
    [
      'spells of every player',
      { types: ['creature'] },
      { kind: 'demonstrate' },
      "controller is 'you'",
    ],
    [
      'spells of the opponents',
      { types: ['creature'], controller: 'opponent' },
      { kind: 'demonstrate' },
      "controller is 'you'",
    ],
    [
      'a member of anyOf of another player',
      { controller: 'you', anyOf: [{ types: ['instant'], controller: 'opponent' }] },
      { kind: 'demonstrate' },
      "controller is 'you'",
    ],
    [
      'a zone',
      { types: ['creature'], controller: 'you', zone: 'hand' },
      { kind: 'demonstrate' },
      'no zone',
    ],
    [
      'a stack kind',
      { types: ['creature'], controller: 'you', stackKind: 'spell' },
      { kind: 'demonstrate' },
      'no zone',
    ],
    [
      'an owner',
      { types: ['creature'], controller: 'you', owner: 'you' },
      { kind: 'demonstrate' },
      'no zone',
    ],
    [
      'a keyword of the spell',
      { types: ['creature'], controller: 'you', keywords: ['flying'] },
      { kind: 'demonstrate' },
      'no zone',
    ],
    [
      'a target of the spell',
      { types: ['creature'], controller: 'you', targetsObject: { types: ['creature'] } },
      { kind: 'demonstrate' },
      'no zone',
    ],
  ];
  for (const [name, what, keyword, fragment] of bad) {
    test(name, () => {
      const found = issues(grant(what, keyword));
      expect(
        found.some((m) => m.includes(fragment)),
        `${fragment} in ${found.join(' | ')}`,
      ).toBe(true);
    });
  }
});
