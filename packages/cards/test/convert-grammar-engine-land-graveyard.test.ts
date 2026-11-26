// The World Shaper deck, land and graveyard group: Centaur Vinecrasher (enters with a counter for each land card in all graveyards; returns from the graveyard when a land card is put into any
// graveyard), Scouring Swarm (a tapped copy of itself or a tapped Insect when a land is sacrificed), The Gitrog Monster ("sacrifice ~ unless you sacrifice a land") and Groundskeeper (return a
// target basic land card from your graveyard). The REAL Oracle text of each card (the corpus's golden.jsonl) goes through the grammar with no override and is played through applyAction;
// the spells that move lands are SYNTHETIC. Rulings checked: the Scryfall rulings of these cards (Centaur Vinecrasher 2015-11-04, Scouring Swarm 2025-07-25, The Gitrog Monster 2025-01-24).
// Rules cited are those the repository's own code already cites: CR 122.6 and 614.12 (enters with counters, counted as it enters), 603.2 (triggers), 404.1 (graveyard), 113.6b (an ability that
// works from the graveyard), 701.21a (Sacrifice), 118.12a ("unless" a cost is paid), 707.2 (copiable values), 110.5b (a token that enters tapped), 205.4 (the supertype basic). They are not
// looked up here: the CR text is not in this checkout.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { read, readAll, spellEffect } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const NONBASIC = parsed('SYNTHETIC Nonbasic Land', 'Land', '');
const SMASH = parsed('SYNTHETIC Land Smash', 'Sorcery', 'Destroy target land.', {
  manaCost: '{R}',
  colors: ['R'],
});
const SACRIFICER = parsed(
  'SYNTHETIC Land Sacrificer',
  'Artifact',
  '{T}, Sacrifice a land: Draw a card.',
  { manaCost: '{1}' },
);

describe('Groundskeeper: "{1}{G}: Return target basic land card from your graveyard to your hand." (CR 205.4)', () => {
  const GK = 'Groundskeeper';
  const groundskeeper = real(GK);

  const board = () =>
    scenario()
      .define(groundskeeper)
      .define(NONBASIC)
      .seat(0)
      .battlefield(GK, 'Forest', 'Forest')
      .graveyard('Forest', NONBASIC.name, 'Grizzly Bears')
      .library('Forest', 'Forest')
      .seat(1)
      .graveyard('Swamp')
      .library('Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(groundskeeper)).toEqual([]);
  });

  test('returns a basic land card from your graveyard to your hand', () => {
    const g = board();
    g.act(0).activate(GK, { targets: [{ zone: 'graveyard', name: 'Forest', seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone('Forest', 'hand', { seat: 0, count: 1 });
    g.expect.zone('Forest', 'graveyard', { seat: 0, count: 0 });
    g.expect.invariants();
  });

  test('a land card that is not basic, a card that is not a land and an opponent graveyard card are no target', () => {
    for (const name of [NONBASIC.name, 'Grizzly Bears']) {
      const g = board();
      expect(() =>
        g.act(0).activate(GK, { targets: [{ zone: 'graveyard', name, seat: 0 }], pay: true }),
      ).toThrow();
    }
    const g = board();
    expect(() =>
      g
        .act(0)
        .activate(GK, { targets: [{ zone: 'graveyard', name: 'Swamp', seat: 1 }], pay: true }),
    ).toThrow();
  });
});

describe('Centaur Vinecrasher: enters with a +1/+1 counter for each land card in all graveyards (CR 122.6, 614.12)', () => {
  const CV = 'Centaur Vinecrasher';
  const centaur = real(CV);

  const board = (mine: number, theirs: number) => {
    const b = scenario()
      .define(centaur)
      .seat(0)
      .hand(CV)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library('Forest', 'Forest');
    if (mine > 0) b.graveyard('Forest', { count: mine });
    b.graveyard('Grizzly Bears');
    b.seat(1).library('Swamp', 'Swamp');
    if (theirs > 0) b.graveyard('Swamp', { count: theirs });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('is valid', () => {
    expect(validateCard(centaur)).toEqual([]);
  });

  test('counts the land cards of every graveyard, and no other card', () => {
    const g = board(1, 2);
    g.act(0).cast(CV, { pay: true });
    g.passAll();
    g.expect.counters(CV, { '+1/+1': 3 });
    g.expect.pt(CV, 4, 4);
    g.expect.invariants();
  });

  test('with no land card in a graveyard it enters with no counter', () => {
    const g = board(0, 0);
    g.act(0).cast(CV, { pay: true });
    g.passAll();
    g.expect.counters(CV, {});
    g.expect.pt(CV, 1, 1);
  });
});

describe('Centaur Vinecrasher: "Whenever a land card is put into a graveyard from anywhere, you may pay {G}{G}. If you do, return this card from your graveyard to your hand."', () => {
  const CV = 'Centaur Vinecrasher';
  const centaur = real(CV);

  const board = () =>
    scenario()
      .define(centaur)
      .define(SMASH)
      .seat(0)
      .hand(SMASH.name)
      .graveyard(CV)
      .battlefield('Mountain', 'Forest', 'Forest', 'Forest')
      .battlefield('Forest', { label: 'mine' })
      .library('Forest', 'Forest')
      .seat(1)
      .battlefield('Swamp')
      .library('Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  test('a land of an opponent put into their graveyard triggers it, and paying {G}{G} returns the card', () => {
    const g = board();
    g.act(0).cast(SMASH.name, {
      targets: [{ zone: 'battlefield', name: 'Swamp', seat: 1 }],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Swamp', 'graveyard', { seat: 1 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.zone(CV, 'hand', { seat: 0 });
    g.expect.zone(CV, 'graveyard', { count: 0 });
    g.expect.invariants();
  });

  test('declining the payment leaves the card in the graveyard', () => {
    const g = board();
    g.act(0).cast(SMASH.name, {
      targets: [{ zone: 'battlefield', name: 'Swamp', seat: 1 }],
      pay: true,
    });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(CV, 'graveyard', { seat: 0 });
  });

  test('a land of your own put into your graveyard triggers it too', () => {
    const g = board();
    g.act(0).cast(SMASH.name, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.zone('Forest', 'graveyard', { seat: 0, count: 1 });
    g.expect.pending('confirmOptional', 0);
  });
});

describe('Scouring Swarm: a tapped copy of itself with seven or more land cards in your graveyard, otherwise a tapped Insect', () => {
  const SS = 'Scouring Swarm';
  const swarm = real(SS);

  const board = (inGraveyard: number) => {
    const b = scenario()
      .define(swarm)
      .define(SACRIFICER)
      .seat(0)
      .battlefield(SS, SACRIFICER.name, 'Forest')
      .battlefield('Forest', { label: 'victim' })
      .library('Forest', 'Forest')
      .graveyard('Forest', { count: inGraveyard });
    b.seat(1).library('Swamp', 'Swamp');
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('is valid', () => {
    expect(validateCard(swarm)).toEqual([]);
  });

  test('with fewer than seven land cards in the graveyard the sacrificed land makes a tapped 1/1 black Insect with flying', () => {
    // Five already there, the sacrificed one is the sixth: counted as the ability resolves (ruling 2025-07-25).
    const g = board(5);
    g.act(0).activate(SACRIFICER.name);
    g.act(0).choosePermanents('victim');
    g.passAll();
    g.expect.zone('Insect', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped('Insect');
    g.expect.pt('Insect', 1, 1);
    g.expect.zone(SS, 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('with seven land cards in the graveyard (the sacrificed one counts) it makes a tapped token copy of the Swarm', () => {
    const g = board(6);
    g.act(0).activate(SACRIFICER.name);
    g.act(0).choosePermanents('victim');
    g.passAll();
    g.expect.zone(SS, 'battlefield', { seat: 0, count: 2 });
    g.expect.noObject('Insect', { zone: 'battlefield' });
    const copies = g.find({ name: SS, zone: 'battlefield' });
    const token = copies.find((o) => o.card === null);
    expect(token?.id).toBeDefined();
    g.expect.tapped(token?.id ?? 'missing');
    g.expect.tapped(copies.find((o) => o.card !== null)?.id ?? 'missing', false);
    g.expect.invariants();
  });
});

describe('The Gitrog Monster: "At the beginning of your upkeep, sacrifice The Gitrog Monster unless you sacrifice a land." (CR 118.12a, 701.21a)', () => {
  const GM = 'The Gitrog Monster';
  const gitrog = real(GM);

  const board = (lands: number) => {
    const b = scenario()
      .define(gitrog)
      .seat(0)
      .battlefield(GM)
      .library('Forest', 'Forest', 'Forest', 'Forest');
    if (lands > 0) b.battlefield('Forest', { count: lands });
    const g = b
      .seat(1)
      .library('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('upkeep', { turn: 5 });
    return g;
  };

  test('is valid', () => {
    expect(validateCard(gitrog)).toEqual([]);
  });

  test('sacrificing a land keeps the Gitrog Monster, and the land card is put into the graveyard', () => {
    const g = board(2);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).choosePermanents('Forest[0]');
    g.expect.zone('Forest', 'graveyard', { seat: 0, count: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(GM, 'battlefield', { seat: 0 });
  });

  test('declining to sacrifice a land sacrifices the Gitrog Monster', () => {
    const g = board(2);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(GM, 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 2 });
  });

  test('with no land to sacrifice nobody is asked and the Gitrog Monster is sacrificed', () => {
    const g = board(0);
    g.passAll();
    g.expect.zone(GM, 'graveyard', { seat: 0 });
  });
});

describe('the nodes the grammar writes for the new wordings', () => {
  test('"create a tapped token that\'s a copy of target creature" is a tapped createToken of a copy', () => {
    const spell = spellEffect("Create a tapped token that's a copy of target creature.", 'sorcery');
    expect(spell).toMatchObject({
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target' } },
      count: 1,
      tapped: true,
    });
  });

  test('"sacrifice ~ unless you sacrifice a land" is an unlessPays with a sacrifice cost of a land', () => {
    const [upkeep] =
      readAll(
        'At the beginning of your upkeep, sacrifice ~ unless you sacrifice a land.',
        'creature',
      ).abilities ?? [];
    expect(upkeep).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'unlessPays',
        player: { kind: 'you' },
        cost: [{ kind: 'sacrifice', what: { types: ['land'] } }],
        effect: { kind: 'sacrifice', objects: { kind: 'this' } },
      },
    });
  });

  test('"unless you sacrifice ~", "another" and several permanents are not read', () => {
    for (const text of [
      'At the beginning of your upkeep, sacrifice ~ unless you sacrifice ~.',
      'At the beginning of your upkeep, sacrifice ~ unless you sacrifice another creature.',
      'At the beginning of your upkeep, sacrifice ~ unless you sacrifice two lands.',
    ]) {
      expect(read(text, 'creature').unparsed, text).not.toEqual([]);
    }
  });

  test('"a land card is put into a graveyard from anywhere" is a putIntoGraveyard trigger of any graveyard', () => {
    const [trigger] =
      readAll(
        'Whenever a land card is put into a graveyard from anywhere, draw a card.',
        'creature',
      ).abilities ?? [];
    expect(trigger).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'putIntoGraveyard',
        who: 'any',
        from: 'anywhere',
        filter: { types: ['land'] },
      },
    });
  });

  test('"seven or more land cards are in your graveyard" is the count of the land cards of your graveyard', () => {
    const effect = spellEffect(
      'Draw a card if seven or more land cards are in your graveyard.',
      'sorcery',
    );
    expect(effect).toMatchObject({ kind: 'conditional', condition: { kind: 'amountIs' } });
  });
});
