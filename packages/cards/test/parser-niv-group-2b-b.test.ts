// The Niv-Mizzet deck (issue 25), group 2b-b (D-327 to D-330): "Mill a card. You may play that card this turn." (Tablet of Discovery), "Spend this mana only to
// cast instant and sorcery spells." (Tablet of Discovery) and "When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose
// new targets for the copy." (Pyromancer's Goggles). The lines are the real Oracle text of the acceptance cards of the golden corpus read through the whole
// pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-niv-group-2b-b.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { dropped, read, readAll, withoutFeature } from './parser-p5-helpers';

const MILL_PLAY = 'When this artifact enters, mill a card. You may play that card this turn.';
const RIDER =
  '{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy.';

describe('"Mill a card. You may play that card this turn." (CR 701.17, 601.2, 305.1)', () => {
  test('the real first ability: the enters trigger mills, then the permission names what was milled', () => {
    const parsed = readAll(MILL_PLAY, 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'mill', player: { kind: 'you' }, count: 1 },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
      },
    ]);
  });

  test('several cards: "those cards", and the longer permission (SYNTHETIC)', () => {
    const two = readAll(
      'When this artifact enters, mill two cards. You may play those cards this turn.',
      'artifact',
    );
    expect(JSON.stringify(two.abilities)).toContain(
      '"kind":"mill","player":{"kind":"you"},"count":2',
    );
    const long = readAll(
      'When this artifact enters, mill a card. Until the end of your next turn, you may play that card.',
      'artifact',
    );
    expect(JSON.stringify(long.abilities)).toContain('"lasts":"endOfYourNextTurn"');
  });

  test('a spell that mills reads the same (SYNTHETIC)', () => {
    const parsed = readAll('Mill a card. You may play that card this turn.', 'sorcery');
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'mill', player: { kind: 'you' }, count: 1 },
        { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
      ],
    });
  });

  test.each([
    // "that card" after a mill by another player is not the controller's to play (the engine names only cards of the graveyard of the controller)
    'When this artifact enters, target opponent mills a card. You may play that card this turn.',
    'When this artifact enters, each player mills a card. You may play that card this turn.',
    // "for as long as it remains exiled" and "look at" have nothing to mean in a graveyard
    'When this artifact enters, mill a card. You may play that card for as long as it remains exiled.',
    'When this artifact enters, mill a card. You may look at and play that card for as long as it remains exiled.',
    // nothing before it milled
    'When this artifact enters, draw a card. You may play that card this turn.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'artifact');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('"Spend this mana only to cast instant and sorcery spells." (CR 106.6)', () => {
  test('the real third ability: the two card types, and never an ability', () => {
    const parsed = readAll(
      '{T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spells.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['R', 'R'] },
        spendOnly: { types: ['instant', 'sorcery'] },
      },
    ]);
  });

  test('artifact and creature spells read the same way, as a choice of types (SYNTHETIC)', () => {
    const parsed = readAll(
      '{T}: Add {C}{C}. Spend this mana only to cast artifact and creature spells.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain(
      '"spendOnly":{"types":["artifact","creature"]}',
    );
  });

  test.each([
    '{T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spell.',
    '{T}: Add {R}{R}. Spend this mana only to cast instant and spells.',
    '{T}: Add {R}{R}. Spend this mana only to cast instant, sorcery spells.',
    '{T}: Add {R}{R}. Spend this mana only to cast instant and sorcery.',
    '{T}: Add {R}{R}. Spend this mana only to cast red instant and sorcery spells.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });
});

describe('"When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy." (CR 707.10, 707.10c, 603.2)', () => {
  test('the real ability: a mana ability whose mana carries the copy, of a red instant or sorcery', () => {
    const parsed = readAll(RIDER, 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['R'] },
        spentRider: {
          spells: { types: ['instant', 'sorcery'], colors: ['R'] },
          grants: { copySpell: 'may' },
        },
      },
    ]);
  });

  test('without the new targets, one type, no color (SYNTHETIC)', () => {
    const parsed = readAll(
      '{T}: Add {U}. When that mana is spent to cast an instant spell, copy that spell.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities[0])).toContain(
      '"spentRider":{"spells":{"types":["instant"]},"grants":{"copySpell":"no"}}',
    );
  });

  test('another color, and a sorcery (SYNTHETIC)', () => {
    const parsed = readAll(
      '{T}: Add {U}. When that mana is spent to cast a blue sorcery spell, copy that spell and you may choose new targets for the copy.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities[0])).toContain(
      '"spells":{"types":["sorcery"],"colors":["U"]},"grants":{"copySpell":"may"}',
    );
  });

  test.each([
    // a spell with no type or color says nothing the rider could use
    '{T}: Add {R}. When that mana is spent to cast a spell, copy that spell.',
    '{T}: Add {R}. When that mana is spent to cast a red spell, copy that spell.',
    // two colors, or a color of the type list only, are more than the engine's colors of one spell
    '{T}: Add {R}. When that mana is spent to cast a red or blue instant spell, copy that spell.',
    // not the copy of that spell
    '{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy it and you may choose new targets for the copy.',
    '{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, you may copy that spell.',
    '{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell twice.',
    '{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets.',
    '{T}: Add {R}. When this mana is spent to cast a red instant or sorcery spell, copy that spell.',
    // spent on an ability
    '{T}: Add {R}. When that mana is spent to activate an ability, copy that spell.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });

  test('outside a mana ability the sentence is read and not run', () => {
    const parsed = read(
      '{T}: You gain 1 life. When that mana is spent to cast a red instant or sorcery spell, copy that spell.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([]);
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [
    ['ability:manaSpentRiderCopy', RIDER, 'artifact'],
    ['ability:mayPlayFromGraveyard', MILL_PLAY, 'artifact'],
  ] as const;

  test.each(CASES)('without %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, type).abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of ['ability:manaSpentRiderCopy', 'ability:mayPlayFromGraveyard'] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
