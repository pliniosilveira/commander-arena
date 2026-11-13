// The Hashaton deck (issue 31), group 7 (D-1130): the REAL Oracle text of Sphinx of the Second Sun (the corpus's golden.jsonl, taken from the issue) goes through the grammar
// as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine
// runs. Pins: CR 500.8 and 500.10 (the beginning phase is added directly after the postcombat main phase), CR 502 to 504 (untap, upkeep and draw steps), CR 505.1 (no
// second postcombat main phase, so the trigger does not recur), CR 603.2b (the step triggers fire again).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly, spellCard } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

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

describe('Sphinx of the Second Sun: "At the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase."', () => {
  const sphinx = real('Sphinx of the Second Sun');
  const SPHINX = sphinx.name;

  type Game = ReturnType<ReturnType<typeof scenario>['build']>;
  const steps = (g: Game): string[] =>
    g.events.flatMap((e) => (e.kind === 'stepBegan' ? [e.step] : []));

  test('the card is valid', () => {
    expect(validateCard(sphinx)).toEqual([]);
  });

  test('cast in the first main phase with eight lands: an extra untap, upkeep and draw step follow the postcombat main phase and untap the lands', () => {
    const g = scenario()
      .define(sphinx)
      .seat(0)
      .hand(SPHINX)
      .battlefield('Island', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SPHINX, { pay: true });
    g.passAll();
    g.expect.zone(SPHINX, 'battlefield');
    g.advanceTo('postcombatMain');
    g.expect.stack([`${SPHINX} (ability)`]);
    g.expect.tapped('Island[0]', true);
    const before = steps(g).length;
    g.advanceTo('upkeep');
    // the extra untap step untapped the lands I paid with: there is no more mana to be had than in a new turn
    g.expect.tapped('Island[0]', false);
    g.expect.tapped('Island[7]', false);
    g.advanceTo('end');
    expect(steps(g).slice(before)).toEqual(['untap', 'upkeep', 'draw', 'end']);
    expect(g.state.seats[0]?.hand.length).toBe(1);
    g.expect.invariants();
  });

  test('on the battlefield from the start: the opponent’s turn has no added phase and mine has one in each turn', () => {
    const g = scenario()
      .define(sphinx)
      .seat(0)
      .battlefield(SPHINX)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('postcombatMain');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('end');
    // turn 4 (the opponent's): untap, upkeep, draw, precombat main, beginning of combat, ..., end: no second beginning phase
    const turn4 = steps(g).slice(steps(g).lastIndexOf('untap'));
    expect(turn4.filter((s) => s === 'untap')).toHaveLength(1);
    expect(turn4.filter((s) => s === 'draw')).toHaveLength(1);
    g.advanceTo('postcombatMain', { turn: 'next' });
    g.expect.stack([`${SPHINX} (ability)`]);
  });
});

describe('the same words in a place where no postcombat main phase is going on are not run (never half-executed)', () => {
  test.each([
    ['At the beginning of your upkeep'],
    ['At the beginning of each of your precombat main phases'],
    ['At the beginning of your end step'],
    ['Whenever this creature attacks'],
  ])('%s', (trigger) => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Misplaced Sphinx',
        typeLine: 'Creature — Sphinx',
        manaCost: '{3}{U}',
        power: '2',
        toughness: '2',
        oracleText: `${trigger}, there is an additional beginning phase after this phase.`,
      }),
    );
    // the card is flagged unsupported (the engine refuses the effect there), so it is never played with half of its text
    expect(imported.support.status).not.toBe('supported');
    expect(imported.support.reasons.length).toBeGreaterThan(0);
  });

  test('a sorcery with the words is not run either', () => {
    const imported = parseOnly(
      spellCard(
        'SYNTHETIC Misplaced Phase',
        'There is an additional beginning phase after this phase.',
        {
          type: 'Sorcery',
        },
      ),
    );
    expect(imported.support.status).not.toBe('supported');
  });
});
