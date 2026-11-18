// Stage P98: Exert. "You may exert ~ as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls." is the real paragraph of
// Glorybringer (golden corpus, acceptance card of issue 103). It is one triggered ability to the parser (the first sentence is the trigger, `trigger.exerted`) and two
// abilities to the engine (CR 701.43d, 607.2h): the static ability that offers the optional cost of attacking and the triggered ability linked to it. Every other line is
// SYNTHETIC: the effects after "When you do", the near misses and the parenthesis standing for reminder text.
import type { Ability } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const LINE =
  'You may exert ~ as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls.';
const REMINDER = "(An exerted creature won't untap during your next untap step.)";

const EXERT: Ability = { kind: 'static', static: { kind: 'exertOnAttack' } };

describe('trigger.exerted: "You may exert ~ as it attacks. When you do, ..." (CR 701.43d, 607.2h)', () => {
  test('the real paragraph of Glorybringer lowers to the exert ability and the linked trigger', () => {
    const parsed = readAll(LINE, 'creature');
    expect(parsed.abilities).toEqual([
      EXERT,
      {
        kind: 'triggered',
        trigger: { kind: 'exerted' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'battlefield',
                types: ['creature'],
                notSubtypes: ['Dragon'],
                controller: 'opponent',
              },
            },
          },
        ],
        effect: {
          kind: 'dealDamage',
          amount: 4,
          to: { kind: 'target', id: 't1' },
          from: { kind: 'triggerSubject' },
        },
      },
    ]);
  });

  test('the reminder text of the real card is dropped by the normalizer', () => {
    const parsed = readAll(`${LINE} ${REMINDER}`, 'creature');
    expect(parsed.abilities).toHaveLength(2);
    expect(parsed.lines).toEqual([LINE]);
  });

  test('a different effect after "When you do" is lowered like the body of any triggered ability (SYNTHETIC)', () => {
    const parsed = readAll(
      'You may exert ~ as it attacks. When you do, you gain 3 life.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      EXERT,
      {
        kind: 'triggered',
        trigger: { kind: 'exerted' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ]);
  });

  test('"this creature" is read for the creature as "~" is (SYNTHETIC)', () => {
    const parsed = readAll(
      'You may exert this creature as it attacks. When you do, you gain 3 life.',
      'creature',
    );
    expect(parsed.abilities[0]).toEqual(EXERT);
  });

  test.each([
    [
      'You may exert ~ as it attacks.',
      'no linked ability: the exert alone has no payoff and is not read',
    ],
    [
      'You may exert ~ as it attacks. If you do, you gain 3 life.',
      '"If you do" is not "When you do"',
    ],
    ['You may exert ~ as it blocks. When you do, you gain 3 life.', 'blocking is not attacking'],
    [
      'You may exert target creature as it attacks. When you do, you gain 3 life.',
      'another creature',
    ],
    [
      'You may exert ~ as it attacks. When you do, ~ gains flying until end of turn and unknown words.',
      'a body the grammar does not read',
    ],
    ['You may exert ~ as it attacks. When you do,', 'no body'],
    ['Exert ~ as it attacks. When you do, you gain 3 life.', 'not optional'],
  ])('"%s" is not read (SYNTHETIC: %s)', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });

  test('the whole of Glorybringer imports as supported', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Glorybringer',
        manaCost: '{3}{R}{R}',
        typeLine: 'Creature — Dragon',
        oracleText: `Flying, haste\nYou may exert SYNTHETIC Parsed Glorybringer as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls. ${REMINDER}`,
        colors: ['R'],
        power: '4',
        toughness: '4',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.abilities.map((a) => a.kind)).toEqual([
      'keyword',
      'keyword',
      'static',
      'triggered',
    ]);
  });

  test('on a card that is not a creature the engine refuses it (CR 701.43d)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Exert Relic',
        manaCost: '{3}',
        typeLine: 'Artifact',
        oracleText:
          'You may exert SYNTHETIC Parsed Exert Relic as it attacks. When you do, you gain 3 life.',
      }),
    );
    expect(imported.support.status).not.toBe('supported');
  });
});
