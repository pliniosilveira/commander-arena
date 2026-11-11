// Stage P43 (M59): damage redirection and damage that stays, read by the grammar (D-193; the engine's replacement `redirectDamage` and static
// `keepsDamage`, D-192, ENGINE_VERSION 45). The first test is the real Oracle text of Ancient Adamantoise (the owner's request file of 2026-10-29),
// the name replaced by ~, with the nodes the grammar produces for each of its lines; the other tests read lines that say the same things over other
// recipients and the lines a rule must not read (flagged, never half run). Every sibling and refused line is SYNTHETIC. The engine runs what is lowered
// in convert-grammar-engine-p43.test.ts; a missing engine feature is named in parser-p43-needs.test.ts.
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard as storedCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Turtle']).abilities;

describe('the real card of the slice reads as the engine runs it (D-192, D-193)', () => {
  const REAL =
    "Vigilance, ward {3}\nDamage isn't removed from ~ during cleanup steps.\nAll damage that would be dealt to you and other permanents you control is dealt to ~ instead.\nWhen ~ dies, exile it and create ten tapped Treasure tokens.";

  test('Ancient Adamantoise: every line reads, and the abilities are those of the engine fixture', () => {
    const parsed = readAll(REAL, 'creature', ['Turtle']);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual(
      syntheticCard('SYNTHETIC Ancient Adamantoise').faces[0]?.abilities,
    );
  });

  test('"Damage isn\'t removed from ~ during cleanup steps."', () => {
    expect(creature("Damage isn't removed from ~ during cleanup steps.")).toEqual([
      { kind: 'static', static: { kind: 'keepsDamage', subject: { kind: 'this' } } },
    ]);
  });

  test('"All damage that would be dealt to you and other permanents you control is dealt to ~ instead."', () => {
    expect(
      creature(
        'All damage that would be dealt to you and other permanents you control is dealt to ~ instead.',
      ),
    ).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'redirectDamage', you: true, permanents: { controller: 'you' } },
      },
    ]);
  });
});

describe('"All damage that would be dealt to ... is dealt to ~ instead." (CR 614.9, 614.1a)', () => {
  const redirect = (recipients: string) =>
    creature(`All damage that would be dealt to ${recipients} is dealt to ~ instead.`);

  test.each([
    ['you', { you: true }],
    [
      'you and other creatures you control',
      { you: true, permanents: { types: ['creature'], controller: 'you' } },
    ],
    [
      'other creatures you control',
      { you: false, permanents: { types: ['creature'], controller: 'you' } },
    ],
    [
      'other nonland permanents you control',
      { you: false, permanents: { notTypes: ['land'], controller: 'you' } },
    ],
  ])('%s', (recipients, replacement) => {
    expect(redirect(recipients)).toEqual([
      { kind: 'replacement', replacement: { kind: 'redirectDamage', ...replacement } },
    ]);
  });

  test.each([
    'All damage that would be dealt to you and permanents you control is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents your opponents control is dealt to ~ instead.',
    'All damage that would be dealt to your opponents is dealt to ~ instead.',
    'All damage that would be dealt to target player is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents you control is dealt to target creature instead.',
    'All combat damage that would be dealt to you is dealt to ~ instead.',
    'All damage that would be dealt by creatures you control is dealt to ~ instead.',
    'The next 3 damage that would be dealt to you is dealt to ~ instead.',
    'If damage would be dealt to you, it is dealt to ~ instead.',
    'All damage that would be dealt to you and another permanent you control is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents you control is dealt to ~ instead as long as you control a Turtle.',
    'All damage that would be dealt to you and other permanents you control is dealt to ~ instead and you gain 1 life.',
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });

  test('on a face that is not a creature the engine would refuse it, so it is not lowered: the card is flagged, never half run', () => {
    const card = parseOnly(
      storedCard({
        name: 'SYNTHETIC Redirect Trinket',
        manaCost: '{2}',
        typeLine: 'Artifact',
        oracleText:
          'All damage that would be dealt to you and other permanents you control is dealt to ~ instead.'.replaceAll(
            '~',
            'SYNTHETIC Redirect Trinket',
          ),
      }),
    );
    expect(card.support.status).toBe('unsupported');
    expect(card.support.unparsed.map((u) => u.reason)).toEqual(['notRunnable']);
    expect(validateCard(card.definition as CardDefinition)).toEqual([]);
  });
});

describe('"Damage isn\'t removed from ~ during cleanup steps." (CR 514.2)', () => {
  test.each([
    "Damage isn't removed from ~ during the cleanup step.",
    "Damage isn't removed from creatures you control during cleanup steps.",
    "Damage isn't removed from ~ during end steps.",
    "Damage isn't removed from ~.",
    "Damage isn't removed from ~ during cleanup steps as long as you control a Turtle.",
    "Damage isn't removed from ~ during cleanup steps this turn.",
    "Damage isn't removed from ~ during cleanup steps and ~ has hexproof.",
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });

  test('the curly apostrophe of the printed text reads too', () => {
    expect(creature('Damage isn’t removed from ~ during cleanup steps.')).toEqual([
      { kind: 'static', static: { kind: 'keepsDamage', subject: { kind: 'this' } } },
    ]);
  });
});
