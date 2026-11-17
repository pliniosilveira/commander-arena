// Validation of the nodes of group 1 of the Lorehold Spirit deck (D-588 to D-594, provisional): the batch `discarded` trigger, the effects `exileFromTriggerCards` and
// `dealDamageToSelf`, the `castOnly` flag of `mayPlay`, a discard in the payment of a `mayPay`, and the `thisWay` count `searched`. A node that the engine does not run (or runs in one
// place only) is refused with a message, never accepted and half run.
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

/** The card with the text of its spell replaced by `effect`. */
function withSpell(name: string, effect: unknown): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, spell: { effect } }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const SEER = 'SYNTHETIC Doubting Seer';
const GOLEM = 'SYNTHETIC Quarantine Golem';
const CLAIMER = 'SYNTHETIC Land Claimer';
const TIDE = 'SYNTHETIC Reckoning Tide';
const YOU = { kind: 'you' } as const;
const DRAW = { kind: 'draw', player: YOU, count: 1 };

const triggered = (trigger: unknown, effect: unknown = DRAW) => ({
  kind: 'triggered',
  trigger,
  effect,
});

describe('the batch `discarded` trigger (CR 603.2c)', () => {
  test('a batch of any cards, of a kind of card, and of any player is valid', () => {
    for (const trigger of [
      { kind: 'discarded', who: 'you', batch: true },
      { kind: 'discarded', who: 'you', batch: true, filter: { notTypes: ['land'] } },
      { kind: 'discarded', who: 'opponent', batch: true },
      { kind: 'discarded', who: 'any', batch: true, filter: { types: ['creature'] } },
    ]) {
      expect(messages(withAbility(SEER, triggered(trigger), 1)), JSON.stringify(trigger)).toEqual(
        [],
      );
    }
  });

  test('batch is true when it is there', () => {
    expect(
      messages(
        withAbility(SEER, triggered({ kind: 'discarded', who: 'you', batch: false }), 1),
      ).join(' | '),
    ).toContain('batch must be true');
  });
});

describe('`exileFromTriggerCards`: one of the cards a batch trigger is about', () => {
  const BATCH = { kind: 'discarded', who: 'you', batch: true };
  const EXILE = { kind: 'exileFromTriggerCards' };

  test('valid in the ability of a batch discard trigger, with "if you do" and the permission to cast', () => {
    expect(messages(withAbility(SEER, triggered(BATCH, EXILE), 1))).toEqual([]);
    expect(messages(syntheticCard(SEER))).toEqual([]);
  });

  test('a trigger about one card has no cards: it is refused', () => {
    expect(
      messages(withAbility(SEER, triggered({ kind: 'discarded', who: 'you' }, EXILE), 1)).join(
        ' | ',
      ),
    ).toContain('needs a trigger about a batch of cards');
  });

  test('another trigger has none either', () => {
    expect(
      messages(
        withAbility(
          SEER,
          triggered({ kind: 'entersBattlefield', what: { kind: 'this' } }, EXILE),
          1,
        ),
      ).join(' | '),
    ).toContain('needs a trigger about a batch of cards');
  });

  test('a spell has no trigger: it is refused', () => {
    expect(messages(withSpell(TIDE, EXILE)).join(' | ')).toContain(
      'needs a trigger about a batch of cards',
    );
  });

  test('the card exiled is "it" for the permission and "if you do" for what comes after', () => {
    const sequence = {
      kind: 'sequence',
      effects: [
        EXILE,
        {
          kind: 'conditional',
          condition: { kind: 'didPrevious' },
          effect: { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
        },
      ],
    };
    expect(messages(withAbility(SEER, triggered(BATCH, sequence), 1))).toEqual([]);
  });
});

describe('`mayPlay` with `castOnly`', () => {
  const play = (extra: Record<string, unknown>) => ({
    kind: 'sequence',
    effects: [
      { kind: 'exile', objects: { kind: 'triggerSubject' } },
      { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn', ...extra },
    ],
  });
  const trigger = { kind: 'discarded', who: 'you' };

  test('castOnly true is valid', () => {
    expect(messages(withAbility(GOLEM, triggered(trigger, play({ castOnly: true }))))).toEqual([]);
  });

  test('castOnly is true when it is there', () => {
    expect(
      messages(withAbility(GOLEM, triggered(trigger, play({ castOnly: false })))).join(' | '),
    ).toContain('castOnly must be true');
  });
});

describe('`dealDamageToSelf`', () => {
  test('a group of creatures is valid, and so is a reference', () => {
    expect(messages(syntheticCard(TIDE))).toEqual([]);
    expect(
      messages(
        withSpell(TIDE, {
          kind: 'dealDamageToSelf',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        }),
      ),
    ).toEqual([]);
  });

  test('a choice is refused: the effect names the objects', () => {
    expect(
      messages(
        withSpell(TIDE, {
          kind: 'dealDamageToSelf',
          objects: { kind: 'choose', filter: { types: ['creature'], controller: 'you' } },
        }),
      ).join(' | '),
    ).toContain('dealDamageToSelf names the objects');
  });

  test('a target that no slot declares is refused', () => {
    expect(
      messages(withSpell(TIDE, { kind: 'dealDamageToSelf', objects: { kind: 'target', id: 't1' } }))
        .length,
    ).toBeGreaterThan(0);
  });
});

describe('a discard in the payment of a `mayPay`', () => {
  const pay = (cost: unknown[]) =>
    triggered({ kind: 'attacks', what: { kind: 'this' } }, { kind: 'mayPay', cost, effect: DRAW });
  const MANA = { kind: 'mana', symbols: ['1'] };

  test('mana and cards are valid, and so are cards alone', () => {
    expect(messages(withAbility(SEER, pay([MANA, { kind: 'discard', count: 1 }])))).toEqual([]);
    expect(messages(withAbility(SEER, pay([{ kind: 'discard', count: 2 }])))).toEqual([]);
    expect(messages(syntheticCard(SEER))).toEqual([]);
  });

  test('a card of a kind or of a name is refused: the engine discards any cards of the hand', () => {
    expect(
      messages(
        withAbility(SEER, pay([MANA, { kind: 'discard', count: 1, filter: { types: ['land'] } }])),
      ).join(' | '),
    ).toContain('takes any cards');
    expect(
      messages(withAbility(SEER, pay([MANA, { kind: 'discard', count: 1, named: true }]))).join(
        ' | ',
      ),
    ).toContain('takes any cards');
  });

  test('a cost the payment of an offer does not pay is refused as before', () => {
    expect(messages(withAbility(SEER, pay([MANA, { kind: 'tap' }]))).length).toBeGreaterThan(0);
  });
});

describe('the `thisWay` count `searched`: "if you search your library this way"', () => {
  const SEARCH = {
    kind: 'search',
    player: YOU,
    optional: true,
    filter: { subtypes: ['Plains'] },
    max: 1,
    destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
    reveal: false,
    shuffle: false,
  };
  const SHUFFLE_IF_SEARCHED = {
    kind: 'conditional',
    condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
    effect: { kind: 'shuffle', player: YOU },
  };
  const enters = (effect: unknown) => ({
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    effect,
  });

  test('after a search of the same sequence it is valid', () => {
    expect(
      messages(
        withAbility(
          CLAIMER,
          enters({ kind: 'sequence', effects: [SEARCH, SHUFFLE_IF_SEARCHED] }),
          1,
        ),
      ),
    ).toEqual([]);
    expect(messages(syntheticCard(CLAIMER))).toEqual([]);
  });

  test('with no search before it there is nothing to count: it is refused', () => {
    expect(
      messages(
        withAbility(CLAIMER, enters({ kind: 'sequence', effects: [DRAW, SHUFFLE_IF_SEARCHED] }), 1),
      ).length,
    ).toBeGreaterThan(0);
    expect(messages(withAbility(CLAIMER, enters(SHUFFLE_IF_SEARCHED), 1)).length).toBeGreaterThan(
      0,
    );
  });
});
