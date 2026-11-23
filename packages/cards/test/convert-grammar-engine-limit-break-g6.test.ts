// The Limit Break deck (issue 96), group 6: Ninjutsu. The REAL Oracle text of Yuffie, Materia Hunter (the corpus's golden.jsonl, taken from the issue) goes through the grammar, and a
// SYNTHETIC card with the same keyword line is defined in an engine scenario and played through applyAction with three seats, so the nodes the parser writes are what the engine runs.
// CR 702.49a (Ninjutsu) is UNVERIFIED here: the CR text is not in the repository.
import { readFileSync } from 'node:fs';
import { getLegalActions, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

describe('Yuffie, Materia Hunter: "Ninjutsu {1}{R}" (CR 702.49a)', () => {
  const card = GOLDEN.find((c) => c.name === 'Yuffie, Materia Hunter');
  if (card === undefined) throw new Error('Yuffie is not in the golden corpus');
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);

  test('the Ninjutsu line lowers to the keyword with its mana cost, and has no diagnostic', () => {
    expect(imported.definition.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'ninjutsu', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
    });
    expect(imported.support.unparsed.some((u) => u.text.toLowerCase().includes('ninjutsu'))).toBe(
      false,
    );
  });

  test('the whole card is supported: the Ninjutsu line and the enters ability both read', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
  });
});

describe('"Ninjutsu {2}{B}" on a card, played with three seats (CR 702.49a, 509.1h, 508.4)', () => {
  const NINJA = 'SYNTHETIC Parsed Ninja';
  const ninja = parsed(NINJA, 'Creature — Human Ninja', 'Ninjutsu {2}{B}', {
    manaCost: '{2}{B}',
    power: '2',
    toughness: '2',
    colors: ['B'],
  });
  const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

  const build = () =>
    scenario({ seats: 3 })
      .define(ninja)
      .seat(0)
      .life(20)
      .battlefield('Grizzly Bears', 'Raging Goblin', 'Swamp', 'Swamp', 'Swamp')
      .hand(NINJA)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the lowering is the engine keyword and the card is valid', () => {
    expect(validateCard(ninja)).toEqual([]);
    expect(ninja.faces[0]?.abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'ninjutsu', cost: [{ kind: 'mana', symbols: ['2', 'B'] }] },
      },
    ]);
  });

  test('the Ninja attacks the seat the returned Bears attacked (the third seat), not the first opponent', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: 'Raging Goblin', target: { player: 1 } },
      { attacker: 'Grizzly Bears', target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers');
    expect(
      getLegalActions(g.state, 0).filter((a) => a.kind === 'activate' && a.object === g.id(NINJA)),
    ).toHaveLength(1);
    g.act(0).activate(NINJA, { pay: true });
    g.act(0).choosePermanents('Grizzly Bears');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.tapped(NINJA, true);
    g.expect.combat({ targets: [{ attacker: NINJA, target: { player: 2 } }] });
    g.advanceTo('endOfCombat');
    g.expect.life(2, 18);
    g.expect.life(1, 19);
    g.expect.invariants();
  });
});

describe('Yuffie, Materia Hunter: the enters ability, with three seats (CR 701.3, 608.2d, 611.2b)', () => {
  const card = GOLDEN.find((c) => c.name === 'Yuffie, Materia Hunter');
  if (card === undefined) throw new Error('Yuffie is not in the golden corpus');
  const yuffie = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES).definition;
  const BLADE = 'SYNTHETIC Blade';
  const CLOAK = 'SYNTHETIC Cloak';

  const board = () =>
    scenario({ seats: 3 })
      .define(yuffie)
      .define(syntheticCard(BLADE))
      .define(syntheticCard(CLOAK))
      .seat(0)
      .life(20)
      .battlefield('Mountain', 'Mountain', 'Mountain', BLADE)
      .hand(yuffie.name)
      .library('Mountain', { count: 6 })
      .seat(1)
      .life(20)
      .battlefield(CLOAK)
      .library('Mountain', { count: 6 })
      .seat(2)
      .life(20)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();

  test('she gains control of the artifact and may attach an Equipment you control to herself', () => {
    const g = board();
    g.act(0).cast(yuffie.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(CLOAK);
    g.passAll();
    g.expect.zone(CLOAK, 'battlefield', { seat: 0 });
    g.act(0).choosePermanents(BLADE);
    g.expect.attached(BLADE, yuffie.name);
    g.expect.invariants();
  });

  test('declining every Equipment leaves them unattached; the artifact is still hers', () => {
    const g = board();
    g.act(0).cast(yuffie.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(CLOAK);
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.attached(BLADE, null);
    g.expect.zone(CLOAK, 'battlefield', { seat: 0 });
  });
});
