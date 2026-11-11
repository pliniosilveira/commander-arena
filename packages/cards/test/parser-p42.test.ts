// Stage P42 (M57): control-changing effects, read by the grammar (D-190; the engine's layer 2 `gainControl` and the trigger `tapsForMana`, D-189,
// ENGINE_VERSION 43). The first test is the real Oracle text of Treasure Nabber (the owner's request file of 2026-10-29), the name replaced by ~, with
// the nodes the grammar produces for it; the other tests read lines that say the same things over other words and the lines a rule must not read
// (flagged, never half run). Every sibling and refused line is SYNTHETIC. The engine runs what is lowered in convert-grammar-engine-p42.test.ts; a missing
// engine feature is named in parser-p42-needs.test.ts.
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const TARGET_CREATURE = {
  targets: [
    { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
  ],
};
const T1 = { kind: 'target', id: 't1' };

const spell = (text: string) => readAll(text, 'sorcery').spell;
const triggered = (text: string) => readAll(text, 'creature').abilities[0];

describe('the real card of the slice reads as the engine runs it (D-189, D-190)', () => {
  test('Treasure Nabber: an opponent taps an artifact for mana, and the Nabber controller takes it until the end of their next turn', () => {
    const parsed = readAll(
      'Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn.',
      'creature',
      ['Goblin', 'Rogue'],
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'tapsForMana', who: 'opponent', what: { types: ['artifact'] } },
        effect: {
          kind: 'gainControl',
          objects: { kind: 'triggerSubject' },
          duration: 'untilEndOfYourNextTurn',
        },
      },
    ]);
  });
});

describe('"gain control of ..." (CR 613.1b, 611.2)', () => {
  test.each([
    ['until end of turn', 'untilEndOfTurn'],
    ['until the end of your next turn', 'untilEndOfYourNextTurn'],
    ['', 'permanent'],
  ])('a target creature %s', (words, duration) => {
    const text = `Gain control of target creature${words === '' ? '' : ` ${words}`}.`;
    expect(spell(text)).toEqual({
      ...TARGET_CREATURE,
      effect: { kind: 'gainControl', objects: T1, duration },
    });
  });

  test('"for as long as you control ~" is the effect of an ability of a permanent', () => {
    expect(
      triggered('When ~ enters, gain control of target creature for as long as you control ~.'),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      ...TARGET_CREATURE,
      effect: { kind: 'gainControl', objects: T1, duration: 'forAsLongAsYouControlThis' },
    });
  });

  test('another kind of permanent, and a quality of the target', () => {
    expect(spell('Gain control of target artifact until end of turn.')?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } } },
    ]);
    expect(
      spell('Gain control of target creature an opponent controls until end of turn.')?.targets,
    ).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
        },
      },
    ]);
  });

  test('"and untap it" on the same sentence is the clause the grammar already joined', () => {
    expect(spell('Gain control of target creature until end of turn and untap it.')).toEqual({
      ...TARGET_CREATURE,
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainControl', objects: T1, duration: 'untilEndOfTurn' },
          { kind: 'untap', objects: T1 },
        ],
      },
    });
  });

  test('"untap it" and "it gains haste" after it are the sentences the grammar already read', () => {
    expect(
      spell(
        'Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.',
      ),
    ).toEqual({
      ...TARGET_CREATURE,
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainControl', objects: T1, duration: 'untilEndOfTurn' },
          { kind: 'untap', objects: T1 },
          {
            kind: 'grantKeyword',
            objects: T1,
            keyword: { kind: 'haste' },
            duration: 'untilEndOfTurn',
          },
        ],
      },
    });
  });

  test.each([
    'Gain control of target creature until your next turn.',
    'Gain control of target creature until end of combat.',
    'Gain control of target creature for as long as ~ remains tapped.',
    'Gain control of target creature for as long as you control a Dragon.',
    'Gain control of target creatures until end of turn.',
    'Gain control of up to one target creature until end of turn.',
    'Gain control of each creature until end of turn.',
    'Gain control of target player until end of turn.',
    'Target opponent gains control of target creature you control until end of turn.',
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'sorcery').reason).toBe('unrecognised');
  });

  test('"for as long as you control ~" in a spell is refused by the engine (a spell is not a permanent)', () => {
    const card = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Leash Spell',
        manaCost: '{2}{U}',
        typeLine: 'Sorcery',
        oracleText: 'Gain control of target creature for as long as you control ~.',
      }),
    );
    expect(card.support.status).toBe('unsupported');
    expect(validateCard(card.definition as CardDefinition).map((i) => i.message)).toContain(
      '"for as long as you control this" is the effect of an ability of a permanent',
    );
  });
});

describe('"whenever an opponent taps an artifact for mana" (CR 106.12, 603.2)', () => {
  const body = 'gain control of that artifact until end of turn';
  // "that permanent" is bound to the permanent tapped, whatever it is; "that artifact" only to an artifact
  const trigger = (event: string) =>
    (
      triggered(`Whenever ${event}, gain control of that permanent until end of turn.`) as
        | { trigger?: unknown }
        | undefined
    )?.trigger;

  test.each([
    ['an opponent taps an artifact for mana', 'opponent', { types: ['artifact'] }],
    ['a player taps a land for mana', 'any', { types: ['land'] }],
    ['an opponent taps a creature for mana', 'opponent', { types: ['creature'] }],
    ['an opponent taps a permanent for mana', 'opponent', {}],
  ])('%s', (event, who, what) => {
    expect(trigger(event)).toEqual({ kind: 'tapsForMana', who, what });
  });

  test.each([
    'an opponent taps an artifact',
    'an opponent taps an artifact for {C}',
    'an opponent taps two artifacts for mana',
    'an opponent taps an artifact an opponent controls for mana',
    'each opponent taps an artifact for mana',
  ])('%s stays unread', (event) => {
    expect(dropped(`Whenever ${event}, ${body}.`, 'creature').reason).toBe('unrecognised');
  });

  test('"you tap an artifact for mana" is the triggered mana ability, which cannot take this body', () => {
    expect(dropped(`Whenever you tap an artifact for mana, ${body}.`, 'creature').reason).not.toBe(
      undefined,
    );
  });
});
