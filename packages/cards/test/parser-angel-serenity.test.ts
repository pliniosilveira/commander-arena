// Angel of Serenity (D-931, D-932), the Bruna deck program (issue 5): a target slot of two zones ("up to three other target creatures from the battlefield and/or creature
// cards from graveyards") and the linked leaves trigger that returns the exiled cards to their owners' hands. The lines are the real Oracle text of the acceptance card of the
// golden corpus (name replaced by ~) with the nodes the grammar produces, played through applyAction where the engine reads them; the other lines are SYNTHETIC siblings
// and the near misses the grammar must not read.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const ENTERS =
  'When ~ enters, you may exile up to three other target creatures from the battlefield and/or creature cards from graveyards.';
const LEAVES = "When ~ leaves the battlefield, return the exiled cards to their owners' hands.";
const TEXT = `Flying\n${ENTERS}\n${LEAVES}`;

const SLOT = {
  id: 't1',
  what: {
    kind: 'objectOrGraveyardCard',
    filter: { zone: 'battlefield', types: ['creature'], other: true },
    card: { zone: 'graveyard', types: ['creature'] },
  },
  min: 0,
  max: 3,
};

describe('Angel of Serenity as the parser reads it', () => {
  test('flying, an optional enters trigger with the slot of two zones, and the linked leaves trigger', () => {
    expect(readAll(TEXT, 'creature', ['Angel']).abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [SLOT],
        // The exile is marked linked because the leaves trigger reads what it exiled (CR 607.2a).
        effect: { kind: 'exile', objects: { kind: 'target', id: 't1' }, linked: true },
        optional: true,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
        effect: { kind: 'moveToZone', objects: { kind: 'linkedExile' }, to: 'hand' },
      },
    ]);
  });

  test('the real card is supported and the golden text is the one tested here', () => {
    const card = cards.find((c) => c.name === 'Angel of Serenity');
    expect(card?.faces[0]?.oracleText).toContain(ENTERS.replace('~', 'this creature'));
    expect(card?.faces[0]?.oracleText).toContain(LEAVES.replace('~', 'this creature'));
    expect(validateCard(real('Angel of Serenity'))).toEqual([]);
  });

  test('without "you may" the trigger is not optional (SYNTHETIC)', () => {
    const face = readAll(`${ENTERS.replace('you may exile', 'exile')}\n${LEAVES}`, 'creature', [
      'Angel',
    ]);
    expect(face.abilities[0]).toMatchObject({ kind: 'triggered' });
    expect(face.abilities[0]).not.toHaveProperty('optional');
  });

  test('a smaller count and no "other" are read as they say (SYNTHETIC)', () => {
    const face = readAll(
      `When ~ enters, exile up to two target creatures from the battlefield and/or creature cards from graveyards.\n${LEAVES}`,
      'creature',
    );
    expect(face.abilities[0]).toMatchObject({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'objectOrGraveyardCard',
            // No "other": the creature the ability is on may be one of the targets.
            filter: { zone: 'battlefield', types: ['creature'] },
            card: { zone: 'graveyard', types: ['creature'] },
          },
          min: 0,
          max: 2,
        },
      ],
    });
    expect(face.abilities[0]).not.toHaveProperty('targets.0.what.filter.other');
  });
});

describe('what the slot of two zones does not read (SYNTHETIC)', () => {
  const trigger = (body: string) => `When ~ enters, ${body}`;

  test.each([
    // Another second half: one graveyard, yours, an opponent's, exile, another card type, "or".
    'exile up to three other target creatures from the battlefield and/or creature cards from a graveyard.',
    'exile up to three other target creatures from the battlefield and/or creature cards from your graveyard.',
    'exile up to three other target creatures from the battlefield and/or creature cards from exile.',
    'exile up to three other target creatures from the battlefield and/or artifact cards from graveyards.',
    'exile up to three other target creatures from the battlefield or creature cards from graveyards.',
    // Another count: one, exactly three, no number.
    'exile up to one other target creature from the battlefield and/or creature card from a graveyard.',
    'exile three other target creatures from the battlefield and/or creature cards from graveyards.',
    // Another type than creatures.
    'exile up to three other target permanents from the battlefield and/or permanent cards from graveyards.',
    // "until": the cards of a graveyard are not put back by it.
    'exile up to three other target creatures from the battlefield and/or creature cards from graveyards until ~ leaves the battlefield.',
  ])('%s', (body) => {
    expect(dropped(trigger(body), 'creature').reason).toBeDefined();
  });

  test('another verb takes the slot of two zones: it is read by exile alone', () => {
    for (const verb of ['destroy', 'tap', 'untap', 'sacrifice', 'return']) {
      expect(
        dropped(
          trigger(
            `${verb} up to three other target creatures from the battlefield and/or creature cards from graveyards.`,
          ),
          'creature',
        ).reason,
        verb,
      ).toBeDefined();
    }
  });

  test('"them" or "it" after the exile does not name the targets of two zones', () => {
    for (const next of [
      'Return them to the battlefield.',
      "Return them to their owners' hands.",
      'Put a +1/+1 counter on each of them.',
      'Return it to the battlefield.',
    ]) {
      expect(
        dropped(
          trigger(
            `exile up to three other target creatures from the battlefield and/or creature cards from graveyards. ${next}`,
          ),
          'creature',
        ).reason,
        next,
      ).toBeDefined();
    }
  });

  test('on a spell the slot is not read: the engine reads it in a triggered ability only', () => {
    const text =
      'Exile up to three other target creatures from the battlefield and/or creature cards from graveyards.';
    expect(dropped(text, 'sorcery').reason).toBeDefined();
  });

  test('on an activated ability the slot is read and then refused by the engine, so the card is not supported', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Activated Banisher',
        typeLine: 'Creature — Angel',
        manaCost: '{4}{W}',
        power: '2',
        toughness: '2',
        colors: ['W'],
        oracleText: `{T}: Exile up to three other target creatures from the battlefield and/or creature cards from graveyards.\n${LEAVES.replace('~', 'SYNTHETIC Parsed Activated Banisher')}`,
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join(' ')).toContain('two zones');
  });
});

describe('"return the exiled cards to their owners\' hands" (D-932)', () => {
  test("one effect: the cards the permanent exiled, to their owners' hands", () => {
    // Read after an exile of the same face, which it is linked to.
    const face = readAll(
      `When ~ enters, exile up to two other target creatures from the battlefield and/or creature cards from graveyards.\n${LEAVES}`,
      'creature',
    );
    expect(face.abilities[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
      effect: { kind: 'moveToZone', objects: { kind: 'linkedExile' }, to: 'hand' },
    });
  });

  test.each([
    "return the exiled card to its owner's hand",
    'return the exiled cards to your hand',
    "return the exiled cards to their owners' graveyards",
    'return the exiled cards to the battlefield under their owners’ control',
    "return the exiled cards to their owners' hands and draw a card",
    "return all cards exiled with ~ to their owners' hands",
    "return those cards to their owners' hands",
  ])('%s is not read (SYNTHETIC)', (body) => {
    expect(dropped(`When ~ leaves the battlefield, ${body}.`, 'creature').reason).toBeDefined();
  });

  test('a reader with nothing that exiles is refused, and so is a reader of two exiling abilities', () => {
    // Without an ability that exiles, nothing is linked to the leaves trigger (CR 607.2a): it is dropped, never run on nothing.
    expect(dropped(LEAVES, 'creature').reason).toBeDefined();
    // Two abilities that exile: which of them the leaves trigger is linked to is not known.
    const two = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Two Banishers',
        typeLine: 'Creature — Angel',
        manaCost: '{4}{W}',
        power: '2',
        toughness: '2',
        colors: ['W'],
        oracleText: `${ENTERS.replace('~', 'SYNTHETIC Parsed Two Banishers')}\nWhenever SYNTHETIC Parsed Two Banishers attacks, exile up to two other target creatures from the battlefield and/or creature cards from graveyards.\n${LEAVES.replace('~', 'SYNTHETIC Parsed Two Banishers')}`,
      }),
    );
    expect(two.support.status).toBe('unsupported');
    expect(two.support.unparsed.map((u) => u.text).join(' ')).toContain('return the exiled cards');
  });
});

describe('the parsed card played through applyAction', () => {
  const def = () =>
    parsed('SYNTHETIC Parsed Serenity', 'Creature — Angel', `Flying\n${ENTERS}\n${LEAVES}`, {
      manaCost: '{6}',
      power: '5',
      toughness: '6',
      colors: [],
    });

  const build = () => {
    const card = def();
    return scenario()
      .define(card)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .hand(card.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .graveyard('Grizzly Bears', { label: 'myDead' })
      .graveyard('Lightning Bolt', { label: 'myBolt' })
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .battlefield('Giant Spider', { label: 'spider' })
      .graveyard('Serra Angel', { label: 'angel' })
      .build();
  };

  test('it exiles a creature of the battlefield and creature cards of graveyards, and returns each to its owner when it dies', () => {
    const g = build();
    const name = 'SYNTHETIC Parsed Serenity';
    g.act(0).cast(name, { pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('spider', 'myDead', 'angel');
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.zone('Giant Spider', 'exile', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Serra Angel', 'exile', { seat: 1 });
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.pass();
    g.act(1).cast('Murder', { targets: [name], pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'hand', { seat: 1 });
    g.expect.zone('Serra Angel', 'hand', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the noncreature card of a graveyard and the Angel itself are not offered', () => {
    const g = build();
    const name = 'SYNTHETIC Parsed Serenity';
    g.act(0).cast(name, { pay: true });
    g.pass();
    g.pass();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : -1)).sort();
    expect(legal).toEqual([g.id('spider'), g.id('myDead'), g.id('angel')].sort());
    expect(d.specs[0]).toMatchObject({ min: 0, max: 3 });
  });
});
