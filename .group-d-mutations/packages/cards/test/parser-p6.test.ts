// Stage P6 (D-063, D-084, D-085), part 1: Ward, Crew and the return to the battlefield with a stated
// control (CR 110.2a). Each line is read through the whole pipeline and compared with the AST of the
// engine's SYNTHETIC fixtures (cards/fixtures/synthetic-ward.ts, synthetic-vehicles.ts) or with a
// node written out here. Lines come from the backlog (reports/backlog.md and templates.json, counts
// as printed, parser version 4) or say SYNTHETIC; no real card is marked supported by anything in
// this file (their Oracle texts were not fetched).
import { describe, expect, test } from 'vitest';
import { PARSER_VERSION } from '../src/index';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, fixture, read, readAll, spellEffect, T1 } from './parser-p5-helpers';

const ward = (...cost: object[]) => ({ kind: 'keyword', keyword: { kind: 'ward', cost } });
const crew = (power: number) => ({ kind: 'keyword', keyword: { kind: 'crew', power } });

describe('PARSER_VERSION', () => {
  test('is at least 10: ward, crew, copies, additive types and controlled returns change statuses', () => {
    expect(PARSER_VERSION).toBeGreaterThanOrEqual(10);
  });
});

describe('Ward (CR 702.21a): "Ward {2}" and "Ward—Pay 3 life."', () => {
  test('"Ward {2}" is the keyword with a mana cost: SYNTHETIC Warded Sentinel', () => {
    const parsed = readAll('Ward {2}', 'creature');
    expect(parsed.abilities).toEqual([ward({ kind: 'mana', symbols: ['2'] })]);
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Warded Sentinel').abilities);
  });

  test('"Ward {1}" is SYNTHETIC Warded Guard; colored and several symbols read too', () => {
    expect(readAll('Ward {1}', 'creature').abilities).toEqual(
      fixture('SYNTHETIC Warded Guard').abilities,
    );
    expect(readAll('Ward {W}', 'creature').abilities).toEqual([
      ward({ kind: 'mana', symbols: ['W'] }),
    ]);
    expect(readAll('Ward {1}{U}', 'creature').abilities).toEqual([
      ward({ kind: 'mana', symbols: ['1', 'U'] }),
    ]);
  });

  test('"Ward—Pay 2 life." is the keyword with a life cost: SYNTHETIC Blood Warded Guard', () => {
    const parsed = readAll('Ward—Pay 2 life.', 'creature');
    expect(parsed.abilities).toEqual([ward({ kind: 'payLife', amount: 2 })]);
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Blood Warded Guard').abilities);
  });

  test('the period after a life cost is optional, as for the other dash keywords', () => {
    expect(readAll('Ward—Pay 3 life', 'creature').abilities).toEqual([
      ward({ kind: 'payLife', amount: 3 }),
    ]);
  });

  test('the reminder text is dropped (CR 702.21a wording), and the keyword is case-insensitive', () => {
    const reminder =
      '(Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)';
    expect(readAll(`Ward {2} ${reminder}`, 'creature').abilities).toEqual(
      readAll('ward {2}', 'creature').abilities,
    );
  });

  test('on any permanent face, and on its own line beside others', () => {
    expect(readAll('Ward {2}', 'artifact').abilities).toHaveLength(1);
    expect(readAll('Flying\nWard {2}', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      ward({ kind: 'mana', symbols: ['2'] }),
    ]);
  });

  test('a cost the engine does not pay for ward is still the keyword; validateCard refuses it', () => {
    const parsed = readAll('Ward—Sacrifice a permanent.', 'creature');
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'keyword',
      keyword: { kind: 'ward', cost: [{ kind: 'sacrifice' }] },
    });
    const card = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Costly Ward',
        manaCost: '{1}{G}',
        typeLine: 'Creature — Bear',
        oracleText: 'Ward—Sacrifice a permanent.',
        power: '2',
        toughness: '2',
        colors: ['G'],
      }),
    );
    expect(card.support.unparsed).toEqual([]);
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons.join('\n')).toContain(
      'cost "sacrifice" is not implemented by the engine yet',
    );
  });

  test.each([
    ['Ward', 'Ward'],
    ['Ward {X}', '{X}'],
    ['Ward {R/W}', '{R/W}'],
    ['Ward {2}.', '.'],
    ['Ward—Pay 0 life.', '0 life.'],
    ['Ward—Pay 3 life..', '.'],
    ['Ward—Discard a creature card.', 'creature card.'],
    ['Ward—Discard your hand.', 'your hand.'],
    ['Ward {2}, flying', ', flying'],
    ['Wardx {2}', 'Wardx {2}'],
    ['Ward {2} {1}', '{1}'],
  ] as const)('stays unread: %s', (text, part) => {
    const d = dropped(text, 'creature');
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toContain(part);
  });

  test('a keyword list that ends with a plain ward is read by keyword.line (22 cards: "Flying, ward {M}")', () => {
    const flying = { kind: 'keyword', keyword: { kind: 'flying' } };
    expect(readAll('Flying, ward {2}', 'creature').abilities).toEqual([
      flying,
      ward({ kind: 'mana', symbols: ['2'] }),
    ]);
    expect(readAll('Flying, ward {2}', 'creature').abilities).toEqual([
      ...readAll('Flying', 'creature').abilities,
      ...readAll('Ward {2}', 'creature').abilities,
    ]);
    expect(readAll('Haste; first strike, ward {1}{W}', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'haste' } },
      { kind: 'keyword', keyword: { kind: 'firstStrike' } },
      ward({ kind: 'mana', symbols: ['1', 'W'] }),
    ]);
  });

  test.each([
    ['Flying, ward—Discard a card.', 'ward—Discard a card.'],
    ['Flying, ward—Pay 2 life.', 'ward—Pay 2 life.'],
    ['Flying, ward {2}, haste', ', haste'],
    ['Ward {2}, flying', ', flying'],
    ['Flying, ward {X}', '{X}'],
    ['Flying ward {2}', 'ward {2}'],
  ] as const)('a ward is read only last in a list, with a plain cost: %s', (text, part) => {
    const d = dropped(text, 'creature');
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toContain(part);
  });

  test('"gains ward until end of turn" is not read: ward is not grantable (D-083)', () => {
    expect(dropped('Target creature gains ward {2} until end of turn.')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('Crew (CR 702.122a): "Crew N"', () => {
  test('"Crew 3" on a Vehicle is the keyword: SYNTHETIC Rattle Wagon', () => {
    const parsed = readAll('Crew 3', 'artifact', ['Vehicle']);
    expect(parsed.abilities).toEqual([crew(3)]);
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Rattle Wagon').abilities);
  });

  test.each([1, 2, 10])('"Crew %i"', (n) => {
    expect(readAll(`Crew ${n}`, 'artifact', ['Vehicle']).abilities).toEqual([crew(n)]);
  });

  test('the reminder text is dropped, and the keyword beside Flying is SYNTHETIC Scout Skiff', () => {
    const reminder =
      '(Tap any number of untapped creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)';
    const parsed = readAll(`Flying\nCrew 1 ${reminder}`, 'artifact', ['Vehicle']);
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Scout Skiff').abilities);
  });

  test('a face that is not a Vehicle has no crew ability: read, not runnable, no engine gap named', () => {
    const d = dropped('Crew 2', 'creature');
    expect(d).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.crew',
      stoppedAt: 'Crew 2',
    });
    expect(d.needs ?? []).toEqual([]);
    expect(dropped('Crew 2', 'artifact')).toMatchObject({ reason: 'notRunnable' });
  });

  test.each([
    ['Crew', 'Crew'],
    ['Crew 0', '0'],
    ['Crew X', 'X'],
    ['Crew 1.', '.'],
    ['Crew two', 'two'],
    ['Crew 1, flying', ', flying'],
    ['Crewed 1', 'Crewed 1'],
    ['Crew 1 2', '2'],
  ] as const)('stays unread: %s', (text, part) => {
    const d = dropped(text, 'artifact', ['Vehicle']);
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toContain(part);
  });

  test('a Vehicle with only "Crew N" imports as supported with its type line and printed P/T', () => {
    const card = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Wagon',
        manaCost: '{3}',
        typeLine: 'Artifact — Vehicle',
        oracleText:
          'Crew 3 (Tap any number of untapped creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)',
        power: '4',
        toughness: '4',
      }),
    );
    expect(card.support.unparsed).toEqual([]);
    expect(card.support.reasons).toEqual([]);
    expect(card.support.status).toBe('supported');
    const [face] = card.definition.faces;
    expect(face).toMatchObject({
      types: ['artifact'],
      subtypes: ['Vehicle'],
      power: 4,
      toughness: 4,
    });
    expect(face?.abilities).toEqual(fixture('SYNTHETIC Rattle Wagon').abilities);
  });
});

describe('return to the battlefield: who controls it (CR 110.2a)', () => {
  const GRAVE = { zone: 'graveyard', types: ['creature'] };
  const BARE = 'Return target creature card from a graveyard to the battlefield.';
  const YOURS =
    'Return target creature card from a graveyard to the battlefield under your control.';
  const OWNERS =
    "Return target creature card from a graveyard to the battlefield under its owner's control.";
  const move = (controller: 'you' | 'owner', extra: object = {}) => ({
    kind: 'moveToZone',
    objects: T1,
    to: 'battlefield',
    controller,
    ...extra,
  });

  test('the bare form means the caster controls it, and says so in the node', () => {
    const parsed = readAll(BARE, 'sorcery');
    expect(parsed.spell).toEqual({
      targets: [{ id: 't1', what: { kind: 'object', filter: GRAVE } }],
      effect: move('you'),
    });
  });

  test('"under your control" gives the same node as the bare form', () => {
    expect(readAll(YOURS, 'sorcery').spell).toEqual(readAll(BARE, 'sorcery').spell);
  });

  test('"under its owner\'s control" gives controller owner', () => {
    expect(spellEffect(OWNERS, 'sorcery')).toEqual(move('owner'));
    expect(spellEffect(OWNERS.replace("owner's", 'owner’s'), 'sorcery')).toEqual(move('owner'));
  });

  test('from your own graveyard and with "tapped", in either order with the control', () => {
    expect(
      spellEffect('Return target creature card from your graveyard to the battlefield.', 'sorcery'),
    ).toEqual(move('you'));
    expect(
      spellEffect(
        'Return target creature card from your graveyard to the battlefield tapped.',
        'sorcery',
      ),
    ).toEqual(move('you', { tapped: true }));
    expect(
      spellEffect(
        "Return target creature card from an opponent's graveyard to the battlefield tapped under your control.",
        'sorcery',
      ),
    ).toEqual(move('you', { tapped: true }));
    expect(
      spellEffect(
        "Return target creature card from a graveyard to the battlefield tapped under its owner's control.",
        'sorcery',
      ),
    ).toEqual(move('owner', { tapped: true }));
  });

  test('all land cards from your graveyard: explicit control (the Splendid Reclamation shape)', () => {
    expect(
      spellEffect(
        'Return all land cards from your graveyard to the battlefield tapped.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'moveToZone',
      objects: { kind: 'each', filter: { zone: 'graveyard', types: ['land'], controller: 'you' } },
      to: 'battlefield',
      tapped: true,
      controller: 'you',
    });
  });

  test('a return to a hand never takes a control, and never from a graveyard that is not yours', () => {
    expect(
      spellEffect('Return target creature card from your graveyard to your hand.', 'sorcery'),
    ).toEqual({ kind: 'moveToZone', objects: T1, to: 'hand' });
    for (const text of [
      'Return target creature card from a graveyard to your hand.',
      "Return target creature card from an opponent's graveyard to your hand.",
      'Return target creature card from your graveyard to your hand under your control.',
    ]) {
      expect(read(text, 'sorcery').unparsed, text).toHaveLength(1);
    }
  });

  test.each([
    'Return target creature card from a graveyard to the battlefield under his control.',
    'Return target creature card from a graveyard to the battlefield under their control.',
    'Return target creature card from a graveyard to the battlefield under your command.',
    'Return target creature card from a graveyard to the battlefield under your control tapped.',
    'Return target creature card from a graveyard to the battlefield at the beginning of the next end step.',
  ])('stays unread: %s', (text) => {
    expect(read(text, 'sorcery').unparsed).toHaveLength(1);
  });
});
