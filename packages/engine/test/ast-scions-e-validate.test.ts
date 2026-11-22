// Validation of what group E of the Scions & Spellcraft deck adds: the object `triggerAttackers` ("those creatures" of an attack batch, CR 508.1, 603.2), the condition
// `triggerPlayerTurn` ("it isn't that player's turn", CR 603.4, 500.1) and the keyword Rebound (CR 702.88a). The synthetic cards say SYNTHETIC; nothing here is real card data.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  SUPPORTED_FEATURES,
  validateCard,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const pump: Effect = {
  kind: 'modifyPt',
  objects: { kind: 'triggerAttackers' },
  power: 4,
  toughness: 4,
  duration: 'untilEndOfTurn',
} as Effect;

function permanent(ability: Ability): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Treefolk'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [ability],
  });
}

function spell(types: readonly ('instant' | 'sorcery' | 'creature')[], keywordRebound: boolean) {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['U'],
    types: [...types],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: '',
    ...(types.includes('creature') ? { power: 1, toughness: 1 } : {}),
    abilities: keywordRebound ? [{ kind: 'keyword', keyword: { kind: 'rebound' } }] : [],
    ...(types.includes('creature')
      ? {}
      : { spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } as Effect } }),
  });
}

const messages = (c: CardDefinition) => validateCard(c).map((i) => `${i.path}: ${i.message}`);

describe('the new kinds are supported', () => {
  test('they are in SUPPORTED_FEATURES', () => {
    expect(SUPPORTED_FEATURES.selectorKinds).toContain('triggerAttackers');
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('triggerPlayerTurn');
    expect(SUPPORTED_FEATURES.keywordKinds).toContain('rebound');
  });
});

describe('triggerAttackers', () => {
  test('is valid in the effect of an attackBatch trigger', () => {
    expect(
      messages(
        permanent({
          kind: 'triggered',
          trigger: { kind: 'attackBatch', who: 'you', atLeast: 8 },
          effect: pump,
        }),
      ),
    ).toEqual([]);
  });

  test('is refused in the effect of any other trigger, and of an activated ability', () => {
    const other = messages(
      permanent({
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: pump,
      }),
    );
    expect(other.join('\n')).toContain('triggerAttackers');
    const player = messages(
      permanent({
        kind: 'triggered',
        trigger: { kind: 'playerAttacksOpponent' },
        effect: pump,
      } as Ability),
    );
    expect(player.join('\n')).toContain('triggerAttackers');
  });
});

describe('triggerPlayerTurn', () => {
  const drawn = (who: 'you' | 'opponent'): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'drawn', who },
    interveningIf: { kind: 'not', term: { kind: 'triggerPlayerTurn' } },
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  });

  test('is valid as the intervening "if" of a trigger about a player', () => {
    expect(messages(permanent(drawn('opponent')))).toEqual([]);
  });

  test('is refused where the trigger is about no player', () => {
    const upkeepless = messages(
      permanent({
        kind: 'triggered',
        trigger: { kind: 'enters', what: { kind: 'this' } },
        interveningIf: { kind: 'triggerPlayerTurn' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      } as unknown as Ability),
    );
    expect(upkeepless.join('\n')).toContain('triggerPlayerTurn');
  });
});

describe('Rebound', () => {
  test('is valid on an instant or a sorcery', () => {
    expect(messages(spell(['instant'], true))).toEqual([]);
    expect(messages(spell(['sorcery'], true))).toEqual([]);
  });

  test('is refused on a creature (CR 702.88a)', () => {
    expect(messages(spell(['creature'], true)).join('\n')).toContain('rebound');
  });
});
