// Validation of the nodes of group 2 of the Lorehold Spirit deck (D-596 and later, provisional): `mayCast` of a card in exile (`from: 'exile'`, `free`, `bottomInstead`), the object filter
// `exiledWithSource` and the amounts `votesFor` and `thisWay` `milledValue` as the count of a `mill`, an `exileTop` and the amount of a damage. A node that the engine does not run (or runs in one
// place only) is refused with a message, never accepted and half run.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

/** The card with the ability at `index` replaced by `ability`. */
function withAbility(name: string, ability: unknown, index: number): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  const abilities = face.abilities.map((a, i) => (i === index ? ability : a));
  return { ...card, faces: [{ ...face, abilities }] } as never;
}

/** The card with the text of its spell replaced by `effect`. */
function withSpell(name: string, effect: unknown): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, spell: { effect } }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const ELEPHANT = 'SYNTHETIC Lore Elephant';
const TEMPEST = 'SYNTHETIC Verdict Tempest';
const T1 = { kind: 'target', id: 't1' } as const;
const YOU = { kind: 'you' } as const;

/** The activated ability of the Elephant (the third) with its effect or its target slots replaced. */
const activated = (changes: { effect?: unknown; targets?: unknown }) => {
  const [, , original] = syntheticCard(ELEPHANT).faces[0]?.abilities ?? [];
  return withAbility(ELEPHANT, { ...(original as object), ...changes }, 2);
};

const CAST = {
  kind: 'mayCast',
  objects: T1,
  duration: 'untilEndOfTurn',
  from: 'exile',
  free: true,
  bottomInstead: true,
};

describe('the cards are valid', () => {
  test.each([ELEPHANT, TEMPEST])('%s', (name) => {
    expect(messages(syntheticCard(name))).toEqual([]);
  });
});

describe('`mayCast` of a card in exile (CR 601.2, 118.9, 614.1a)', () => {
  test('with or without the rider and without paying, the permission of a card exiled with this permanent is valid', () => {
    expect(messages(activated({ effect: CAST }))).toEqual([]);
    expect(messages(activated({ effect: { ...CAST, bottomInstead: undefined } }))).toEqual([]);
    expect(messages(activated({ effect: { ...CAST, free: undefined } }))).toEqual([]);
  });

  test('the card is one exiled with this permanent: the slot says zone exile and exiledWithSource', () => {
    for (const targets of [
      [{ id: 't1', what: { kind: 'object', filter: { zone: 'exile' } } }],
      [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
      [{ id: 't1', what: { kind: 'object', filter: { exiledWithSource: true } } }],
    ]) {
      expect(messages(activated({ targets })).join(' | '), JSON.stringify(targets)).not.toBe('');
    }
    expect(
      messages(
        activated({
          targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
        }),
      ).join(' | '),
    ).toContain('exiledWithSource');
  });

  test('the filter itself is refused outside the zone exile (a card is exiled with a permanent only in exile)', () => {
    const targets = [{ id: 't1', what: { kind: 'object', filter: { exiledWithSource: true } } }];
    expect(messages(activated({ targets })).join(' | ')).toContain(
      "only a card in exile was exiled with a permanent: the filter's zone is 'exile'",
    );
  });

  test('free and bottomInstead are for a card in exile only, and are true when they are there', () => {
    const graveyard = [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }];
    const grave = (extra: object) => ({
      kind: 'mayCast',
      objects: T1,
      duration: 'untilEndOfTurn',
      ...extra,
    });
    expect(
      messages(activated({ targets: graveyard, effect: grave({ free: true }) })).join(' | '),
    ).toContain("free is only for a card in exile (from: 'exile')");
    expect(
      messages(activated({ targets: graveyard, effect: grave({ bottomInstead: true }) })).join(
        ' | ',
      ),
    ).toContain('bottomInstead is only for a card in exile');
    expect(messages(activated({ effect: { ...CAST, free: false } })).join(' | ')).toContain(
      'free must be true when present',
    );
    expect(messages(activated({ effect: { ...CAST, bottomInstead: 1 } })).join(' | ')).toContain(
      'bottomInstead must be true when present',
    );
    expect(messages(activated({ effect: { ...CAST, from: 'hand' } })).join(' | ')).toContain(
      "from, 'exile'",
    );
  });

  test('a card cast from exile has the library rider, not the exile one', () => {
    expect(messages(activated({ effect: { ...CAST, exileInstead: true } })).join(' | ')).toContain(
      'bottomInstead, not exileInstead',
    );
  });

  test('a face that has no linked exile cannot read it', () => {
    const [face] = syntheticCard(ELEPHANT).faces;
    if (face === undefined) throw new Error('no face');
    // Without the end step ability, nothing exiles with a link.
    const card = {
      ...syntheticCard(ELEPHANT),
      faces: [{ ...face, abilities: face.abilities.filter((_, i) => i !== 1) }],
    } as never as CardDefinition;
    expect(messages(card).join(' | ')).toContain('takeFromLinkedExile reads the cards');
  });

  test('a linked exile with no ability that reads it is refused', () => {
    const [face] = syntheticCard(ELEPHANT).faces;
    if (face === undefined) throw new Error('no face');
    const card = {
      ...syntheticCard(ELEPHANT),
      faces: [{ ...face, abilities: face.abilities.filter((_, i) => i !== 2) }],
    } as never as CardDefinition;
    expect(messages(card).join(' | ')).toContain('without one nothing uses the cards');
  });

  test('exiledWithSource is not read in a static ability: derive does not know what the permanent exiled', () => {
    const lord = {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { types: ['creature'], exiledWithSource: true } },
        power: 1,
        toughness: 1,
      },
    };
    expect(messages(withAbility(ELEPHANT, lord, 0)).join(' | ')).toContain(
      'a static ability cannot read resolution-only values',
    );
  });
});

describe('the count of a vote (CR 701.38a): `votesFor` as the amount of a mill and of an exile of the top cards', () => {
  const effects = (...e: unknown[]) => ({ kind: 'sequence', effects: e });
  const VOTE = { kind: 'vote', options: ['past', 'present'], startingWith: 'you' };

  test('valid after the vote, for an option the vote offers', () => {
    expect(
      messages(
        withSpell(
          TEMPEST,
          effects(
            VOTE,
            { kind: 'mill', player: YOU, count: { kind: 'votesFor', option: 'present' } },
            { kind: 'exileTop', count: { kind: 'votesFor', option: 'past' } },
          ),
        ),
      ),
    ).toEqual([]);
  });

  test('refused without a vote before it, or for an option the vote does not offer', () => {
    expect(
      messages(
        withSpell(TEMPEST, {
          kind: 'mill',
          player: YOU,
          count: { kind: 'votesFor', option: 'past' },
        }),
      ).join(' | '),
    ).toContain('votesFor needs a vote effect before it');
    expect(
      messages(
        withSpell(
          TEMPEST,
          effects(VOTE, { kind: 'exileTop', count: { kind: 'votesFor', option: 'future' } }),
        ),
      ).join(' | '),
    ).toContain('is not an option of the vote');
  });

  test('the milled value is refused before any mill of the sequence', () => {
    expect(
      messages(
        withSpell(
          TEMPEST,
          effects(VOTE, {
            kind: 'dealDamage',
            amount: { kind: 'thisWay', what: 'milledValue' },
            to: { kind: 'eachOpponent' },
          }),
        ),
      ).join(' | '),
    ).toContain('needs a mill effect before it');
  });
});
