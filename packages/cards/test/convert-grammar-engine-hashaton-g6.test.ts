// The Hashaton deck program (issue 31), group 6 (D-376, D-377, provisional): the REAL Oracle text of Serra's Emissary (the corpus's golden.jsonl, taken from the issue)
// goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real
// text are what the engine runs. Pins: CR 614.12a (the choice as the creature enters), CR 205.2a (card types), CR 702.16a, 702.16b, 702.16e (protection from a card
// type for a permanent and for a player), CR 604.1 (a static ability of the permanent).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt'; // {R} instant: 3 damage to any target
const BEARS = 'Grizzly Bears'; // creature
const SMALL = 'SYNTHETIC Vanilla 3/3'; // creature, colorless

describe("Serra's Emissary: choose a card type, protection for you and your creatures", () => {
  const emissary = real("Serra's Emissary");
  const EMISSARY = emissary.name;

  test('the card is valid and says what the engine runs', () => {
    expect(validateCard(emissary)).toEqual([]);
    const [face] = emissary.faces;
    expect(face?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'cardType' } },
      { kind: 'static', static: { kind: 'playerProtection', from: 'chosenCardType' } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'protection', from: 'chosenCardType' },
        },
      },
    ]);
  });

  const cast = () => {
    const g = scenario()
      .define(emissary)
      .seat(0)
      .hand(EMISSARY)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain')
      .library(...FILLER)
      .build();
    g.act(0).cast(EMISSARY, { pay: true });
    g.passAll();
    return g;
  };

  test('it asks for a card type as it enters, and keeps the answer', () => {
    const g = cast();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind !== 'chooseOption') return;
    expect(d.purpose).toBe('cardType');
    expect(d.options).toContain('artifact');
    expect(d.options).toContain('creature');
    g.act(0).chooseOption('instant');
    g.expect.chosen(EMISSARY, { cardType: 'instant' });
    g.expect.invariants();
  });

  test('chosen creature: a creature of the opponent deals no combat damage to me', () => {
    const g = scenario()
      .define(emissary)
      .seat(0)
      .battlefield(EMISSARY, { chosen: { cardType: 'creature' } })
      .library(...FILLER)
      .seat(1)
      .battlefield(SMALL)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(SMALL);
    g.advanceTo('endOfCombat');
    g.expect.life(0, 40);
  });

  test('chosen artifact: the same creature does damage me', () => {
    const g = scenario()
      .define(emissary)
      .seat(0)
      .battlefield(EMISSARY, { chosen: { cardType: 'artifact' } })
      .library(...FILLER)
      .seat(1)
      .battlefield(SMALL)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(SMALL);
    g.advanceTo('endOfCombat');
    g.expect.life(0, 37);
  });

  test('chosen instant: the opponent can not Bolt me or my creatures; with sorcery chosen the Bolt can (CR 702.16b)', () => {
    const targets = (chosen: 'instant' | 'sorcery') => {
      const g = scenario()
        .define(emissary)
        .seat(0)
        .battlefield(EMISSARY, { chosen: { cardType: chosen } })
        .battlefield(BEARS)
        .library(...FILLER)
        .seat(1)
        .hand(BOLT)
        .battlefield('Mountain')
        .library(...FILLER)
        .at('precombatMain', { active: 1, turn: 2 })
        .build();
      g.act(1).cast(BOLT);
      const pending = g.state.pending;
      if (pending?.kind !== 'targets') return { players: [] as number[], objects: [] as number[] };
      const legal = pending.specs[0]?.legal ?? [];
      return {
        players: legal.flatMap((t) => (t.kind === 'player' ? [t.seat] : [])),
        objects: legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])),
      };
    };
    expect(targets('instant').players).toEqual([1]);
    expect(targets('instant').objects).toEqual([]);
    expect(targets('sorcery').players.sort()).toEqual([0, 1]);
    expect(targets('sorcery').objects.length).toBe(2);
  });
});
