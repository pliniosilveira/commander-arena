// Mirkwood Trapper: "Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn." and "Whenever a player attacks, if they aren't attacking you, that player
// chooses an attacking creature. It gets +2/+0 until end of turn." (CR 508.1b, 603.2, 603.4, 608.2d). The lines are the real Oracle text; the SYNTHETIC lines are near misses and siblings.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Elf', 'Scout']).abilities;
const droppedCreature = (text: string) => dropped(text, 'creature', ['Elf', 'Scout']).text;

const FIRST =
  'Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn.';
const SECOND =
  "Whenever a player attacks, if they aren't attacking you, that player chooses an attacking creature. It gets +2/+0 until end of turn.";

describe('"Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn."', () => {
  test('the real line: an attackBatch trigger that needs an attack at the controller', () => {
    expect(creature(FIRST)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'any', atLeast: 1, attackedYou: true },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], attacking: true },
            },
          },
        ],
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'target', id: 't1' },
          power: -2,
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test.each([
    'Whenever a player attacks you or a planeswalker you control, target attacking creature gets -2/-0 until end of turn.',
    'Whenever a player attacks you with two or more creatures, target attacking creature gets -2/-0 until end of turn.',
    'Whenever an opponent attacks you, target attacking creature gets -2/-0 until end of turn.',
    'Whenever a player attack you, target attacking creature gets -2/-0 until end of turn.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedCreature(text)).toBe(text);
  });
});

describe('"Whenever a player attacks, if they aren\'t attacking you, that player chooses an attacking creature. It gets +2/+0 until end of turn."', () => {
  test('the real line: the attacking player chooses, the creature chosen gets the bonus', () => {
    expect(creature(SECOND)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'any', atLeast: 1 },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'chooseObjects',
              id: 'm1',
              filter: { types: ['creature'], attacking: true, zone: 'battlefield' },
              count: 1,
              exactly: true,
              chooser: { kind: 'triggerPlayer' },
            },
            {
              kind: 'modifyPt',
              objects: { kind: 'chosen', id: 'm1' },
              power: 2,
              toughness: 0,
              duration: 'untilEndOfTurn',
            },
          ],
        },
        interveningIf: { kind: 'not', term: { kind: 'attackersAttackedYou' } },
      },
    ]);
  });

  test('another bonus (SYNTHETIC)', () => {
    expect(
      creature(
        "Whenever a player attacks, if they aren't attacking you, that player chooses an attacking creature. It gets +1/+1 until end of turn.",
      ),
    ).toMatchObject([
      {
        kind: 'triggered',
        effect: { effects: [{ kind: 'chooseObjects' }, { power: 1, toughness: 1 }] },
      },
    ]);
  });

  test.each([
    "Whenever a player attacks, if they aren't attacking you or a planeswalker you control, that player chooses an attacking creature. It gets +2/+0 until end of turn.",
    "Whenever a player attacks, if they aren't attacking you, that player chooses a creature. It gets +2/+0 until end of turn.",
    "Whenever a player attacks, if they aren't attacking you, that player chooses an attacking creature you control. It gets +2/+0 until end of turn.",
    "Whenever a player attacks, if they aren't attacking you, that opponent chooses an attacking creature. It gets +2/+0 until end of turn.",
    "Whenever a player attacks with two or more creatures, if they aren't attacking you, that player chooses an attacking creature. It gets +2/+0 until end of turn.",
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedCreature(text)).toBe(text);
  });

  test('"that player chooses" in an ability with no player to name is dropped (SYNTHETIC)', () => {
    const text =
      'At the beginning of combat on your turn, that player chooses an attacking creature. It gets +2/+0 until end of turn.';
    expect(droppedCreature(text)).toBe(text);
  });
});
