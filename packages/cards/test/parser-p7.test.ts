// Stage P7a (D-063, the engine's damage prevention shields): "Prevent all combat damage that would be
// dealt this turn.", "... to you ...", "... to and dealt by target creature ...", "Prevent the next 3
// damage that would be dealt to any target this turn." and their relatives (CR 615, 616.1, 120.3). Each
// line is read through the whole pipeline and compared with the AST of the engine's SYNTHETIC fixtures
// (cards/fixtures/synthetic-prevention.ts) or with a node written out here. Lines come from the backlog
// (reports/backlog.md and templates.json, counts as printed, parser version 4) or say SYNTHETIC. The real
// cards named in comments (Fog, Holy Day) are from memory and UNVERIFIED: nothing here marks one supported.
import type { Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { compileLine } from '../src/convert/parser/index';
import {
  CREATURE_TARGET,
  dropped,
  END,
  fixture,
  read,
  readAll,
  SET,
  spellEffect,
  T1,
} from './parser-p5-helpers';

const ANY = { kind: 'any' } as const;
const T2 = { kind: 'target', id: 't2' } as const;
/** Every creature you control, as the prevention fixtures say it: no zone, a creature can only be damaged on the battlefield (CR 120.1). */
const MY_CREATURES = { kind: 'each', filter: { types: ['creature'], controller: 'you' } } as const;
const ANY_TARGET = { id: 't1', what: { kind: 'anyTarget' } } as const;
const PLAYER_TARGET = { id: 't1', what: { kind: 'player', filter: 'any' } } as const;

/** One `preventDamage` node; the defaults are Fog's. */
const shield = (over: Record<string, unknown> = {}): Effect =>
  ({
    kind: 'preventDamage',
    scope: 'all',
    amount: 'all',
    to: ANY,
    duration: END,
    ...over,
  }) as Effect;

describe('Prevent all ... damage that would be dealt this turn (CR 615.1, 615.6)', () => {
  test('the backlog shape (14 cards) equals SYNTHETIC Fog Spell', () => {
    const parsed = readAll('Prevent all combat damage that would be dealt this turn.');
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Fog Spell').spell);
    expect(spellEffect('Prevent all combat damage that would be dealt this turn.')).toEqual(
      shield({ scope: 'combat' }),
    );
    expect(parsed.abilities).toEqual([]);
  });

  test('"all damage" is scope all, "all noncombat damage" is SYNTHETIC Quiet Fog', () => {
    expect(spellEffect('Prevent all damage that would be dealt this turn.')).toEqual(shield());
    const quiet = readAll('Prevent all noncombat damage that would be dealt this turn.');
    expect(quiet.spell).toEqual(fixture('SYNTHETIC Quiet Fog').spell);
  });

  test('an instant, a sorcery, and a capital letter read the same', () => {
    const text = 'Prevent all combat damage that would be dealt this turn.';
    expect(spellEffect(text, 'sorcery')).toEqual(spellEffect(text, 'instant'));
    expect(spellEffect('prevent all combat damage that would be dealt this turn.')).toEqual(
      spellEffect(text),
    );
  });

  test('"to you" is SYNTHETIC Self Ward; with a scope it keeps the scope', () => {
    const parsed = readAll('Prevent all damage that would be dealt to you this turn.');
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Self Ward').spell);
    expect(spellEffect('Prevent all combat damage that would be dealt to you this turn.')).toEqual(
      shield({ scope: 'combat', to: { kind: 'you' } }),
    );
    expect(
      spellEffect('Prevent all noncombat damage that would be dealt to you this turn.'),
    ).toEqual(shield({ scope: 'noncombat', to: { kind: 'you' } }));
  });

  test('"to creatures you control" is SYNTHETIC Herd Shelter, "each creature you control" the same', () => {
    const parsed = readAll(
      'Prevent all damage that would be dealt to creatures you control this turn.',
    );
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Herd Shelter').spell);
    expect(
      spellEffect('Prevent all damage that would be dealt to each creature you control this turn.'),
    ).toEqual(shield({ to: MY_CREATURES }));
  });

  test('"to you and creatures you control" is a sequence of the you node and the each node', () => {
    expect(
      spellEffect(
        'Prevent all damage that would be dealt to you and creatures you control this turn.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [shield({ to: { kind: 'you' } }), shield({ to: MY_CREATURES })],
    });
  });

  test('the recipients of other nouns: a player, each opponent, each player', () => {
    const player = readAll('Prevent all damage that would be dealt to target player this turn.');
    expect(player.spell).toEqual({
      targets: [PLAYER_TARGET],
      effect: shield({ to: T1 }),
    });
    expect(
      spellEffect('Prevent all damage that would be dealt to each opponent this turn.'),
    ).toEqual(shield({ to: { kind: 'eachOpponent' } }));
    expect(spellEffect('Prevent all damage that would be dealt to each player this turn.')).toEqual(
      shield({ to: { kind: 'eachPlayer' } }),
    );
  });

  test('a target creature, and any target (a slot that may be a player)', () => {
    expect(
      readAll('Prevent all damage that would be dealt to target creature this turn.').spell,
    ).toEqual({ targets: [CREATURE_TARGET], effect: shield({ to: T1 }) });
    expect(
      readAll('Prevent all damage that would be dealt to any target this turn.').spell,
    ).toEqual({ targets: [ANY_TARGET], effect: shield({ to: T1 }) });
  });

  test('two targets are two shields, numbered in text order', () => {
    const parsed = readAll(
      'Prevent all damage that would be dealt to target creature and target player this turn.',
    );
    expect(parsed.spell).toEqual({
      targets: [CREATURE_TARGET, { id: 't2', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'sequence', effects: [shield({ to: T1 }), shield({ to: T2 })] },
    });
  });

  test('"dealt to and dealt by target creature" is SYNTHETIC Standoff: one target, two shields', () => {
    const parsed = readAll(
      'Prevent all combat damage that would be dealt to and dealt by target creature this turn.',
    );
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Standoff').spell);
    expect(parsed.spell?.targets).toEqual([CREATURE_TARGET]);
  });

  test('"dealt by target creature" alone is the by node only, "to and dealt by" keeps all damage when it says so', () => {
    expect(
      readAll('Prevent all combat damage that would be dealt by target creature this turn.').spell,
    ).toEqual({
      targets: [CREATURE_TARGET],
      effect: shield({ scope: 'combat', to: ANY, by: T1 }),
    });
    expect(
      spellEffect(
        'Prevent all damage that would be dealt to and dealt by target creature this turn.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [shield({ to: T1 }), shield({ to: ANY, by: T1 })],
    });
  });

  test('in an activated ability the same shield is read, with no target when it names none', () => {
    const parsed = readAll(
      '{1}{W}: Prevent all combat damage that would be dealt this turn.',
      'enchantment',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1', 'W'] }],
        effect: shield({ scope: 'combat' }),
      },
    ]);
  });
});

describe('Prevent the next N damage that would be dealt to ... this turn (CR 615.7, 615.11)', () => {
  test('"to any target" is SYNTHETIC Shield Three: one shield on a target that may be a player', () => {
    const parsed = readAll(
      'Prevent the next 3 damage that would be dealt to any target this turn.',
    );
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Shield Three').spell);
    expect(parsed.spell?.targets).toEqual([ANY_TARGET]);
  });

  test('"to target creature" has a creature slot, "to target player" a player slot', () => {
    expect(
      readAll('Prevent the next 1 damage that would be dealt to target creature this turn.').spell,
    ).toEqual({ targets: [CREATURE_TARGET], effect: shield({ amount: 1, to: T1 }) });
    expect(
      readAll('Prevent the next 2 damage that would be dealt to target player this turn.').spell,
    ).toEqual({ targets: [PLAYER_TARGET], effect: shield({ amount: 2, to: T1 }) });
  });

  test('"to you" with a scope is SYNTHETIC Soften Blow', () => {
    const parsed = readAll(
      'Prevent the next 2 combat damage that would be dealt to you this turn.',
    );
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Soften Blow').spell);
    expect(spellEffect('Prevent the next 5 damage that would be dealt to you this turn.')).toEqual(
      shield({ amount: 5, to: { kind: 'you' } }),
    );
    expect(
      spellEffect('Prevent the next 4 noncombat damage that would be dealt to you this turn.'),
    ).toEqual(shield({ scope: 'noncombat', amount: 4, to: { kind: 'you' } }));
  });

  test('"to each creature you control" is SYNTHETIC Ward Circle (one shield per creature, CR 615.11)', () => {
    const parsed = readAll(
      'Prevent the next 1 damage that would be dealt to each creature you control this turn.',
    );
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Ward Circle').spell);
  });

  test('the number may be a word from one to ten', () => {
    expect(
      spellEffect('Prevent the next three damage that would be dealt to any target this turn.'),
    ).toEqual(shield({ amount: 3, to: T1 }));
  });
});

describe('what stays unread, with the gap behind each (stoppedAt, closestRule)', () => {
  test.each([
    // CR 615.12: "can't be prevented" is another effect, and the engine has no unpreventable damage.
    [
      "Combat damage that would be dealt by creatures you control can't be prevented this turn.",
      "Combat damage that would be dealt by creatures you control can't be prevented this turn.",
    ],
    // CR 609.7a, 615.8, 615.9: a source chosen as the effect is created.
    [
      'The next time a source of your choice would deal damage to you this turn, prevent that damage.',
      'The next time a source of your choice would deal damage to you this turn, prevent that damage.',
    ],
    [
      'Prevent all damage that would be dealt to you this turn by a source of your choice.',
      'by a source of your choice.',
    ],
    // A duration other than "this turn" (CR 514.2: the shield ends at cleanup).
    [
      'Prevent all combat damage that would be dealt until your next turn.',
      'until your next turn.',
    ],
    ['Prevent all damage that would be dealt to you.', '.'],
    // The engine's `by` is one object; a group of creatures is its `byFilter` since stage P32 (D-147), and a group of sources that are
    // not permanents is not read.
    [
      'Prevent all damage that would be dealt by sources you control this turn.',
      'sources you control this turn.',
    ],
    [
      'Prevent all damage that would be dealt by sources you control this turn.',
      'sources you control this turn.',
    ],
    // A recipient that is not one object, one player or a group the engine can check as damage is dealt.
    [
      'Prevent all combat damage that would be dealt to two target creatures this turn.',
      'two target creatures this turn.',
    ],
    [
      'Prevent all combat damage that would be dealt by two target creatures this turn.',
      'two target creatures this turn.',
    ],
    [
      'Prevent all damage that would be dealt to target creature or player this turn.',
      'or player this turn.',
    ],
    // "That creature" is not read by any noun rule (Maze of Ith's second sentence).
    [
      'Prevent all combat damage that would be dealt to and dealt by that creature this turn.',
      'that creature this turn.',
    ],
  ] as const)('%s', (text, stoppedAt) => {
    const d = dropped(text);
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toBe(stoppedAt);
  });

  test('"instead" makes the line a replacement effect (CR 614), which no rule reads', () => {
    const d = dropped('Prevent all combat damage that would be dealt this turn instead.');
    expect(d).toMatchObject({ reason: 'unrecognised', slot: 'replacement', closestRule: 'none' });
    expect(d.stoppedAt).toBe('Prevent all combat damage that would be dealt this turn instead.');
  });

  test('the closest rule of a prevention that fails is the prevention rule', () => {
    expect(
      dropped('Prevent all damage that would be dealt to you until your next turn.'),
    ).toMatchObject({
      closestRule: 'effect.prevent-all',
    });
    expect(
      dropped('Prevent the next 3 damage that would be dealt to you until your next turn.'),
    ).toMatchObject({ closestRule: 'effect.prevent-next' });
  });

  test.each([
    // A number of damage needs a named recipient to be the shield's owner (CR 615.7).
    ['Prevent the next 3 damage that would be dealt this turn.', 'this turn.'],
    // X is a value chosen while casting, and the engine's shield takes a number.
    [
      'Prevent the next X damage that would be dealt to you this turn.',
      'X damage that would be dealt to you this turn.',
    ],
    [
      'Prevent the next 0 damage that would be dealt to you this turn.',
      '0 damage that would be dealt to you this turn.',
    ],
    // CR 615.11 covers "each of a number of untargeted creatures"; a list or a plural without "each" is not that.
    [
      'Prevent the next 1 damage that would be dealt to you and creatures you control this turn.',
      'and creatures you control this turn.',
    ],
    [
      'Prevent the next 1 damage that would be dealt to creatures you control this turn.',
      'creatures you control this turn.',
    ],
    // "Next N damage dealt by a source" is a shield on a source, not read for a number.
    [
      'Prevent the next 2 damage that would be dealt by target creature this turn.',
      'by target creature this turn.',
    ],
    // A shield of a number to "each player" and "each opponent" is not one CR 615.11 describes.
    [
      'Prevent the next 1 damage that would be dealt to each player this turn.',
      'each player this turn.',
    ],
  ] as const)('numeric: %s', (text, stoppedAt) => {
    const d = dropped(text);
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toBe(stoppedAt);
  });

  test('a second sentence the grammar does not read drops the whole line (Inkshield, 1 card)', () => {
    const text =
      'Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying.';
    const parsed = read(text);
    expect(parsed.unparsed).toHaveLength(1);
    expect(parsed.spell).toBeNull();
  });
});

describe('the lowering gates what the engine runs', () => {
  test('a prevention ability needs only the engine features of the shield and the target kind', () => {
    const ok = compileLine('Prevent all combat damage that would be dealt this turn.', {
      rules: SET,
      face: 'spell',
    });
    expect(ok.ok).toBe(true);
    const target = compileLine(
      'Prevent the next 3 damage that would be dealt to any target this turn.',
      { rules: SET, face: 'spell' },
    );
    expect(target.ok).toBe(true);
  });

  test('a clause with "this turn" and a duration the engine does not run is never produced', () => {
    // The rule reads only " this turn", so no other duration can reach the lowering.
    for (const text of [
      'Prevent all combat damage that would be dealt until end of turn.',
      'Prevent all combat damage that would be dealt until your next turn.',
      'Prevent all combat damage that would be dealt for as long as you control ~.',
    ]) {
      expect(dropped(text).reason, text).toBe('unrecognised');
    }
  });
});
