// Validation of the nodes of group 1 of the Galadriel deck (issue 43): the `surveils` trigger, `revealTop` with `then`, the conditions `abilityResolvedTimes` and `ringBearerChosen`, and
// the `may` of a reveal. A node that the engine does not run (or runs in one place only) is refused with a message, never accepted and half run.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

/** The card with the ability at `index` replaced by `ability`. */
function withAbility(name: string, ability: unknown, index = 0): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  const abilities = face.abilities.map((a, i) => (i === index ? ability : a));
  return { ...card, faces: [{ ...face, abilities }] } as never;
}

/** The spell card with its effect replaced by `effect`. */
function withSpell(name: string, effect: unknown): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, spell: { ...face.spell, effect } }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const WARDEN = 'SYNTHETIC Rivendell Warden';
const LADY = 'SYNTHETIC Lorien Lady';
const SEER = 'SYNTHETIC Archon Seer';
const RUN = 'SYNTHETIC Run Down';
const YOU = { kind: 'you' };
const DRAW = { kind: 'draw', player: YOU, count: 1 };
const RING = { kind: 'ringTempts' };
const REVEAL = { kind: 'revealTop', player: YOU, ifMatches: { types: ['land'] } };

const triggered = (trigger: unknown, extra: Record<string, unknown> = {}) => ({
  kind: 'triggered',
  trigger,
  effect: DRAW,
  ...extra,
});

describe('the trigger "surveils"', () => {
  test.each(['you', 'opponent', 'any'])('%s is valid', (who) => {
    expect(messages(withAbility(SEER, triggered({ kind: 'surveils', who })))).toEqual([]);
  });

  test('another player word is refused', () => {
    expect(
      messages(withAbility(SEER, triggered({ kind: 'surveils', who: 'nobody' }))).join(' | '),
    ).toContain('unknown player');
  });

  test('"that many" of a surveil is the cards looked at (a number the trigger has)', () => {
    expect(
      messages(
        withAbility(
          SEER,
          triggered(
            { kind: 'surveils', who: 'you' },
            { effect: { kind: 'draw', player: YOU, count: { kind: 'triggerDamage' } } },
          ),
        ),
      ),
    ).toEqual([]);
  });
});

describe('revealTop: exactly one of "to" and "then"', () => {
  test('either one is valid', () => {
    expect(
      messages(withSpell(RUN, { ...REVEAL, then: DRAW })),
      'then',
    ).toEqual([]);
    expect(messages(withSpell(RUN, { ...REVEAL, to: 'hand' })), 'to').toEqual([]);
    expect(messages(withSpell(RUN, { ...REVEAL, to: 'battlefield', tapped: true })), 'tapped').toEqual(
      [],
    );
  });

  test('both, or neither, is refused', () => {
    expect(messages(withSpell(RUN, { ...REVEAL, to: 'hand', then: DRAW })).join(' | ')).toContain(
      'exactly one of to',
    );
    expect(messages(withSpell(RUN, REVEAL)).join(' | ')).toContain('exactly one of to');
  });

  test('tapped goes with a card put onto the battlefield, not with a then', () => {
    expect(
      messages(withSpell(RUN, { ...REVEAL, then: DRAW, tapped: true })).join(' | '),
    ).toContain('tapped is true, and only for a card put onto the battlefield');
  });

  test('what is done is itself checked: an effect with a target nobody declared is refused', () => {
    expect(
      messages(
        withSpell(RUN, {
          ...REVEAL,
          then: { kind: 'destroy', objects: { kind: 'target', id: 'nope' } },
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('a may of a reveal is valid ("you may reveal the top card")', () => {
    expect(messages(withSpell(RUN, { kind: 'may', effect: { ...REVEAL, then: DRAW } }))).toEqual(
      [],
    );
  });
});

describe('the condition "abilityResolvedTimes"', () => {
  test('in the conditional effect of a triggered ability it is valid', () => {
    expect(messages(syntheticCard(WARDEN) as never)).toEqual([]);
  });

  test.each([0, -1, 1.5])('times %s is refused', (times) => {
    const effect = {
      kind: 'conditional',
      condition: { kind: 'abilityResolvedTimes', times },
      effect: RING,
    };
    expect(messages(withAbility(WARDEN, triggered({ kind: 'ringTempted' }, { effect }))).join(' | ')).toContain(
      'times is a whole number from 1',
    );
  });

  test('in a spell it is refused: only a triggered ability resolves again and again from one source', () => {
    const effect = {
      kind: 'conditional',
      condition: { kind: 'abilityResolvedTimes', times: 2 },
      effect: RING,
    };
    expect(messages(withSpell(RUN, effect)).join(' | ')).toContain(
      'only valid in the effect of one',
    );
  });

  test('as the intervening "if" it is refused (it reads a resolution, not an event)', () => {
    expect(
      messages(
        withAbility(
          WARDEN,
          triggered(
            { kind: 'ringTempted' },
            { interveningIf: { kind: 'abilityResolvedTimes', times: 2 } },
          ),
        ),
      ).join(' | '),
    ).toContain('only valid in a conditional effect');
  });
});

describe('the condition "ringBearerChosen"', () => {
  test('the intervening "if" of a ringTempted trigger is valid, with or without "other"', () => {
    for (const interveningIf of [
      { kind: 'ringBearerChosen' },
      { kind: 'ringBearerChosen', other: true },
    ]) {
      expect(messages(withAbility(LADY, triggered({ kind: 'ringTempted' }, { interveningIf })))).toEqual(
        [],
      );
    }
  });

  test('another trigger has no creature the Ring chose', () => {
    expect(
      messages(
        withAbility(
          LADY,
          triggered(
            { kind: 'scries', who: 'you' },
            { interveningIf: { kind: 'ringBearerChosen', other: true } },
          ),
        ),
      ).join(' | '),
    ).toContain('needs a ringTempted trigger');
  });

  test('in a conditional effect it is refused: the creature is read as the ability triggers and as it resolves', () => {
    const effect = {
      kind: 'conditional',
      condition: { kind: 'ringBearerChosen', other: true },
      effect: DRAW,
    };
    expect(messages(withAbility(LADY, triggered({ kind: 'ringTempted' }, { effect }))).join(' | ')).toContain(
      'intervening "if" of a ringTempted trigger',
    );
  });

  test('"other" is true or left out', () => {
    expect(
      messages(
        withAbility(
          LADY,
          triggered(
            { kind: 'ringTempted' },
            { interveningIf: { kind: 'ringBearerChosen', other: false } },
          ),
        ),
      ).join(' | '),
    ).toContain('other must be true when present');
  });
});
