// Stage P96 (provisional D-961): the Bruna deck program (issue 5), Dismantling Wave: "For each opponent, destroy up to one target artifact or enchantment that player controls."
// The first line is the real Oracle text of the acceptance card of the golden corpus, with the node the grammar produces; the other lines are SYNTHETIC siblings the
// grammar reads and SYNTHETIC near misses it must not read. CR 115.1 and 601.2c (a slot with up to one target for each opponent), CR 701.8a (destroy).
import { describe, expect, test } from 'vitest';
import { dropped, readAll, T1 } from './parser-p5-helpers';

const WAVE =
  'For each opponent, destroy up to one target artifact or enchantment that player controls.';

const slot = (filter: Record<string, unknown>) => [
  {
    id: 't1',
    onePerOpponent: true,
    what: { kind: 'object', filter: { zone: 'battlefield', controller: 'opponent', ...filter } },
  },
];

describe('"For each opponent, destroy up to one target ... that player controls."', () => {
  test('Dismantling Wave: a sorcery with the slot of one target for each opponent', () => {
    const parsed = readAll(WAVE, 'sorcery');
    expect(parsed.spell).toEqual({
      targets: slot({ anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] }),
      effect: { kind: 'destroy', objects: T1 },
    });
  });

  test('the same in an instant (SYNTHETIC)', () => {
    const parsed = readAll(WAVE, 'instant');
    expect(parsed.spell?.effect).toEqual({ kind: 'destroy', objects: T1 });
  });

  test('a creature, a nonland permanent and one type read the same way (SYNTHETIC)', () => {
    expect(
      readAll(
        'For each opponent, destroy up to one target creature that player controls.',
        'sorcery',
      ).spell,
    ).toEqual({ targets: slot({ types: ['creature'] }), effect: { kind: 'destroy', objects: T1 } });
    expect(
      readAll(
        'For each opponent, destroy up to one target nonland permanent that player controls.',
        'sorcery',
      ).spell?.targets,
    ).toEqual(slot({ notTypes: ['land'] }));
    expect(
      readAll(
        'For each opponent, destroy up to one target artifact that player controls.',
        'sorcery',
      ).spell?.targets,
    ).toEqual(slot({ types: ['artifact'] }));
  });

  test('in an ability of a permanent the slot is the same (SYNTHETIC)', () => {
    const parsed = readAll(
      'When this enchantment enters, for each opponent, destroy up to one target artifact or enchantment that player controls.',
      'enchantment',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      targets: slot({ anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] }),
      effect: { kind: 'destroy', objects: T1 },
    });
  });

  test('a second instruction after "and" is a second effect of the sequence, not part of the slot (SYNTHETIC)', () => {
    const parsed = readAll(
      'For each opponent, destroy up to one target artifact or enchantment that player controls and you draw a card.',
      'sorcery',
    );
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'destroy', objects: T1 }, { kind: 'draw' }],
    });
  });

  test('the exile of the same slot is unchanged', () => {
    const parsed = readAll(
      'For each opponent, exile up to one target artifact or enchantment that player controls.',
      'sorcery',
    );
    expect(parsed.spell?.effect).toEqual({ kind: 'exile', objects: T1 });
  });
});

const MISSES = [
  // Each opponent would need a target, which the slot does not say.
  ['no "up to"', 'For each opponent, destroy target artifact or enchantment that player controls.'],
  ['two targets', 'For each opponent, destroy up to two target artifacts that player controls.'],
  ['any number', 'For each opponent, destroy any number of target artifacts that player controls.'],
  ['a plural', 'For each opponent, destroy up to one target artifacts that player controls.'],
  // Whose permanent, and who is counted.
  ['no controller', 'For each opponent, destroy up to one target artifact or enchantment.'],
  ['my own', 'For each opponent, destroy up to one target artifact or enchantment you control.'],
  [
    'any opponent',
    'For each opponent, destroy up to one target artifact or enchantment an opponent controls.',
  ],
  [
    'ownership',
    'For each opponent, destroy up to one target artifact or enchantment that player owns.',
  ],
  [
    'each player',
    'For each player, destroy up to one target artifact or enchantment that player controls.',
  ],
  [
    'each other opponent',
    'For each other opponent, destroy up to one target artifact or enchantment that player controls.',
  ],
  // Another zone.
  [
    'a graveyard',
    "For each opponent, destroy up to one target artifact card in that player's graveyard.",
  ],
  // Something more in the same instruction.
  [
    'a duration',
    'For each opponent, destroy up to one target artifact or enchantment that player controls until end of turn.',
  ],
  [
    'a cost for them',
    'For each opponent, destroy up to one target artifact or enchantment that player controls unless they pay {2}.',
  ],
  [
    'a quality after the controller',
    'For each opponent, destroy up to one target artifact that player controls with flying.',
  ],
  [
    'optional',
    'For each opponent, you may destroy up to one target artifact or enchantment that player controls.',
  ],
  [
    'a second verb',
    'For each opponent, destroy up to one target artifact or enchantment that player controls and exile up to one target creature that player controls.',
  ],
] as const;

describe('near misses are dropped, never guessed (SYNTHETIC)', () => {
  test.each(MISSES)('%s', (_name, text) => {
    expect(() => dropped(text, 'sorcery'), text).not.toThrow();
  });

  test('without the "for each opponent" the line is an ordinary destroy with a target of the player\'s choice', () => {
    // A single target "that player controls" has no player to name: it is not read.
    expect(() =>
      dropped('Destroy up to one target artifact or enchantment that player controls.', 'sorcery'),
    ).not.toThrow();
  });

  test('a rider after the sentence is not dropped silently', () => {
    const text = `${WAVE} It can't be regenerated.`;
    const parsed = readAll(text, 'sorcery');
    // "It can't be regenerated" attaches to the destroy only if the engine can run it; the instruction must not read as a plain destroy.
    expect(JSON.stringify(parsed.spell?.effect)).not.toBe(
      JSON.stringify({ kind: 'destroy', objects: T1 }),
    );
  });
});
