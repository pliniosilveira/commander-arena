// "You may have this creature enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except its name is its own and it's
// legendary and a Trill in addition to its other types" (Federation Fleet deck, group C): the replacement `entersAsCopy` with `fromGraveyard`, `keepName` and `addSupertypes`.
// Pins (rule numbers the repository's own comments already use; the CR text file was not in the worktree, so none was looked up): CR 614.12 and 707.9 (it enters as the copy: the
// question is asked as it enters and what triggers sees the copy), CR 707.2 (copiable values), CR 707.9a and 707.9b (the exceptions are part of its copiable values), CR 700.4
// ("put there from the battlefield this turn": a card that went to the graveyard from anywhere else, or on an earlier turn, is not a choice), CR 400.7. The card is SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const EZRI = 'SYNTHETIC Newly Joined Advisor';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

const ezri = singleFace({
  name: EZRI,
  manaCost: ['1', 'W'],
  supertypes: ['legendary'],
  types: ['creature'],
  subtypes: ['Trill', 'Advisor'],
  power: 2,
  toughness: 2,
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'Flash. You may have this creature enter as a copy of a creature card in your graveyard.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flash' } },
    {
      kind: 'replacement',
      replacement: {
        kind: 'entersAsCopy',
        what: {
          types: ['creature'],
          controller: 'you',
          zone: 'graveyard',
          putFromBattlefieldThisTurn: true,
        },
        fromGraveyard: true,
        optional: true,
        duration: 'permanent',
        keepName: true,
        addSupertypes: ['legendary'],
        addSubtypes: ['Trill'],
      },
    },
  ],
});

const LANDS = ['Plains', 'Plains', 'Swamp', 'Swamp', 'Swamp'] as const;

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .define(ezri)
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

const asked = (g: ReturnType<typeof game>) => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected a question, got ${d?.kind}`);
  return d;
};

describe('the card is valid and the shapes are checked', () => {
  const withRule = (rule: Record<string, unknown>) =>
    ({
      ...ezri,
      faces: [
        {
          ...ezri.faces[0],
          abilities: [
            {
              kind: 'replacement',
              replacement: {
                kind: 'entersAsCopy',
                what: {
                  types: ['creature'],
                  controller: 'you',
                  zone: 'graveyard',
                  putFromBattlefieldThisTurn: true,
                },
                fromGraveyard: true,
                duration: 'permanent',
                ...rule,
              },
            },
          ],
        },
      ],
    }) as never;

  test('valid', () => {
    expect(validateCard(ezri)).toEqual([]);
    expect(validateCard(withRule({}))).toEqual([]);
  });

  test('refused: a zone without the flag, the flag without the zone, a bad flag, empty supertypes', () => {
    const issues = (rule: Record<string, unknown>) => validateCard(withRule(rule)).length;
    expect(issues({ fromGraveyard: undefined })).toBeGreaterThan(0);
    expect(issues({ what: { types: ['creature'], controller: 'you' } })).toBeGreaterThan(0);
    expect(issues({ fromGraveyard: false })).toBeGreaterThan(0);
    expect(issues({ keepName: false })).toBeGreaterThan(0);
    expect(issues({ addSupertypes: [] })).toBeGreaterThan(0);
    expect(issues({ addSupertypes: ['mighty'] })).toBeGreaterThan(0);
  });
});

describe('the copy', () => {
  test('a creature of mine that died this turn: the card is a choice, it enters as that creature with the exceptions', () => {
    const g = game((b) =>
      b
        .hand(EZRI, MURDER)
        .battlefield(...LANDS)
        .battlefield(BEARS),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard');
    g.act(0).cast(EZRI, { pay: true });
    g.passAll();
    const d = asked(g);
    expect(d.purpose).toBe('entersCopy');
    expect(d.min).toBe(0);
    expect(d.legal).toHaveLength(1);
    g.act(0).choosePermanents({ name: BEARS, zone: 'graveyard', seat: 0 });
    g.expect.pt(EZRI, 2, 2);
    g.expect.derived(EZRI, {
      types: ['creature'],
      supertypes: ['legendary'],
      subtypes: ['Bear', 'Trill'],
      colors: ['G'],
    });
    // The copy keeps its own name (CR 707.9a), and the card it copied is still in the graveyard.
    expect(g.view(0).battlefield.map((o) => o.name)).toContain(EZRI);
    g.expect.zone(BEARS, 'graveyard');
    g.expect.invariants();
  });

  test('the copy has what the copied creature has (Raging Goblin: haste) and its power and toughness', () => {
    const g = game((b) =>
      b
        .hand(EZRI, MURDER)
        .battlefield(...LANDS)
        .battlefield(GOBLIN),
    );
    g.act(0).cast(MURDER, { targets: [GOBLIN], pay: true });
    g.passAll();
    g.act(0).cast(EZRI, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: GOBLIN, zone: 'graveyard', seat: 0 });
    g.expect.pt(EZRI, 1, 1);
    g.expect.derived(EZRI, { keywords: ['haste'], supertypes: ['legendary'] });
  });

  test('declining: it enters as itself', () => {
    const g = game((b) =>
      b
        .hand(EZRI, MURDER)
        .battlefield(...LANDS)
        .battlefield(BEARS),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast(EZRI, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.derived(EZRI, { subtypes: ['Trill', 'Advisor'], colors: ['W'] });
    g.expect.pt(EZRI, 2, 2);
  });

  test('a creature card that was in the graveyard but did not come from the battlefield is not a choice', () => {
    const g = game((b) =>
      b
        .hand(EZRI)
        .battlefield(...LANDS)
        .graveyard(BEARS),
    );
    g.act(0).cast(EZRI, { pay: true });
    g.passAll();
    // No question: nothing can be copied, and it enters as itself.
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.derived(EZRI, { subtypes: ['Trill', 'Advisor'] });
  });

  test('a creature of the opponent that died this turn is not in my graveyard: not a choice', () => {
    const g = game((b) =>
      b
        .hand(EZRI, MURDER)
        .battlefield(...LANDS)
        .seat(1)
        .battlefield(BEARS)
        .seat(0),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.act(0).cast(EZRI, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.derived(EZRI, { subtypes: ['Trill', 'Advisor'] });
  });
});
