// Parsed text is only worth something if the engine runs it as written. This test imports a SYNTHETIC card through the grammar (never through a fixture) with the
// real lines of Deceptive Frostkite (golden corpus, acceptance card of issue 103): "Flying" and "You may have this creature enter as a copy of a creature you control with
// power 4 or greater, except it's a Dragon in addition to its other types and it has flying." (CR 614.12, 707.2, 707.9a, 707.9b). The name starts with "SYNTHETIC" and no
// real card's definition is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FROSTKITE = parsed(
  'SYNTHETIC Parsed Frostkite',
  'Creature — Dragon',
  "Flying\nYou may have this creature enter as a copy of a creature you control with power 4 or greater, except it's a Dragon in addition to its other types and it has flying.",
  { manaCost: '{U}{U}', colors: ['U'], power: '1', toughness: '1' },
);
const NAME = FROSTKITE.name;
const FILLER = Array.from({ length: 8 }, () => 'Island');

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(scenario().seat(0).define(FROSTKITE).hand(NAME).battlefield('Island', { count: 2 }))
    .library(...FILLER)
    .seat(1)
    .battlefield('Giant Spider')
    .library(...FILLER)
    .build();

describe('"You may have ~ enter as a copy of a creature you control with power 4 or greater, except it\'s a Dragon in addition to its other types and it has flying."', () => {
  test('the lowering is an entersAsCopy replacement with the exception, for good', () => {
    const ability = FROSTKITE.faces[0]?.abilities.find((a) => a.kind === 'replacement');
    expect(ability).toMatchObject({
      kind: 'replacement',
      replacement: {
        kind: 'entersAsCopy',
        what: { types: ['creature'], controller: 'you', power: { value: 4 } },
        optional: true,
        duration: 'permanent',
        addSubtypes: ['Dragon'],
        gains: [{ kind: 'flying' }],
      },
    });
  });

  test('only a creature I control with power 4 or greater may be copied: the opponent one and the small one are not offered', () => {
    const g = game((b) => b.battlefield('Serra Angel').battlefield('Grizzly Bears'));
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    expect(d.purpose).toBe('entersCopy');
    expect(d.min).toBe(0);
    expect(d.legal).toHaveLength(1);
    g.act(0).choosePermanents({ name: 'Serra Angel', seat: 0 });
    // A copy of Serra Angel (4/4 flying vigilance), a Dragon Angel with flying (CR 707.9b).
    g.expect.pt('Serra Angel[1]', 4, 4);
    g.expect.invariants();
  });

  test('the copy is a Dragon in addition to its other types, and has flying', () => {
    const g = game((b) => b.battlefield('Grizzly Bears').battlefield('Yargle, Glutton of Urborg'));
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: 'Yargle, Glutton of Urborg', seat: 0 });
    // The one that entered is the new object: Yargle's values, a Dragon too, with flying (CR 707.9a, 707.9b), and it is a copy of a legend: 9/3.
    g.expect.derived('Yargle, Glutton of Urborg[1]', {
      subtypes: ['Frog', 'Beast', 'Dragon'],
      keywords: ['flying'],
    });
    g.expect.pt('Yargle, Glutton of Urborg[1]', 9, 3);
    g.expect.derived('Yargle, Glutton of Urborg[0]', { subtypes: ['Frog', 'Beast'], keywords: [] });
  });

  test('"you may": I can decline and it stays a 1/1 Dragon with flying', () => {
    const g = game((b) => b.battlefield('Serra Angel'));
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.pt(NAME, 1, 1);
    g.expect.derived(NAME, { subtypes: ['Dragon'], keywords: ['flying'] });
  });

  test('with no creature of mine with power 4 or greater nothing is asked', () => {
    const g = game((b) => b.battlefield('Grizzly Bears'));
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.pt(NAME, 1, 1);
    g.expect.pending('priority', 0);
  });
});
