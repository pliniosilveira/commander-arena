// The Mind Flayarrrs deck, group 8: Psionic Ritual, the REAL card of the golden corpus read through the grammar only and played through applyAction. "Replicate—Tap an untapped Horror you
// control. Exile target instant or sorcery card from a graveyard and copy it. You may cast the copy without paying its mana cost. Exile Psionic Ritual." (CR 702.56a Replicate, 707.10, 118.3.)
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const RITUAL = real('Psionic Ritual');
const HORROR = parsed('SYNTHETIC Ritual Horror', 'Creature — Horror', '', {
  manaCost: '{1}{B}',
  power: '2',
  toughness: '2',
});
const FILLER = Array.from({ length: 30 }, () => 'Island');

describe('Psionic Ritual', () => {
  test('read as a replicate whose cost taps one untapped Horror', () => {
    const replicate = RITUAL.faces[0]?.abilities.find(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'replicate',
    );
    expect(replicate).toMatchObject({
      keyword: {
        kind: 'replicate',
        cost: [{ kind: 'tapPermanents', filter: { subtypes: ['Horror'] }, count: 1 }],
      },
    });
  });

  function game(seats: 2 | 3 | 4, horrors: number) {
    let b = scenario({ seats })
      .define(RITUAL)
      .define(HORROR)
      .seat(0)
      .hand(RITUAL.name)
      .battlefield('Island', { count: 6 })
      .library(...FILLER);
    if (horrors > 0) b = b.battlefield(HORROR.name, { count: horrors });
    for (let seat = 1; seat < seats; seat += 1) {
      b = b
        .seat(seat as 1 | 2 | 3)
        .library(...FILLER)
        .graveyard('Lightning Bolt');
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  }

  test('with no untapped Horror it is cast as a plain spell: nothing is asked about replicate', () => {
    const g = game(2, 0);
    g.act(0).cast(RITUAL.name, {
      targets: [{ name: 'Lightning Bolt', zone: 'graveyard' }],
      pay: true,
    });
    g.expect.stack([RITUAL.name]);
  });

  test('tapping a Horror pays the replicate cost: the spell is copied once, with the mana paid only for the spell', () => {
    const g = game(2, 1);
    g.act(0).cast(RITUAL.name, {
      replicas: 1,
      targets: [{ name: 'Lightning Bolt', zone: 'graveyard' }],
      pay: true,
    });
    expect(g.find({ name: HORROR.name, zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      1,
    );
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(6);
    // The cast trigger copies the spell; the copy is on the stack above it.
    expect(g.state.stack.length).toBeGreaterThanOrEqual(2);
  });

  test('the copy exiles the card and is cast free; the spell itself then has no target left', () => {
    const g = game(2, 1);
    g.act(0).cast(RITUAL.name, {
      replicas: 1,
      targets: [{ name: 'Lightning Bolt', zone: 'graveyard' }],
      pay: true,
    });
    g.passAll(); // the cast trigger resolves: one copy of the spell
    expect(g.state.stack).toHaveLength(2);
    g.passAll(); // the copy resolves: it exiles the Bolt and copies it
    const ask = g.state.pending;
    expect(ask?.kind, JSON.stringify(ask)).toBe('chooseCards');
    const [copy] = ask?.kind === 'chooseCards' ? ask.legal : [];
    if (copy === undefined) throw new Error('no card to cast');
    g.act(0).choose({ kind: 'chooseCards', objects: [copy] });
    expect(g.state.pending?.kind).toBe('targets');
    g.act(0).chooseTargets({ player: 1 });
    g.passAll(); // the free copy of the Bolt resolves
    expect(g.state.seats[1]?.life).toBe(37);
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1 });
    // The spell's own target is gone: it does not resolve, so its "Exile Psionic Ritual" does not happen either.
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(RITUAL.name, 'graveyard', { seat: 0 });
  });

  test('with four seats the card may be in the graveyard of any opponent', () => {
    const g = game(4, 1);
    g.act(0).cast(RITUAL.name, {
      replicas: 1,
      targets: [{ name: 'Lightning Bolt', zone: 'graveyard', seat: 3 }],
      pay: true,
    });
    expect(g.find({ name: HORROR.name, zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      1,
    );
    // The cast trigger copies the spell and asks the caster whether the copy has new targets (any of the three opponents' graveyards is open to it).
    g.passAll();
    expect(g.state.pending?.kind).toBe('targets');
  });
});
