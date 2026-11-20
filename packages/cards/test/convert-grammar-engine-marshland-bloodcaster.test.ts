// Marshland Bloodcaster (Witherbloom Witchcraft, issue 190): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, reads as supported, and is
// played through applyAction: "{1}{B}, {T}: Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value." (CR 118.9, 601.2b, 119.4)
import { readFileSync } from 'node:fs';
import { getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const load = (name: string) => {
  const found = cards.find((c) => c.name === name);
  if (found === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(found), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  return imported.definition;
};
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;
const BLOODCASTER = 'Marshland Bloodcaster';

function game(life = 20) {
  const caster = load(BLOODCASTER);
  return scenario()
    .define(caster)
    .seat(0)
    .life(life)
    .pool('BB')
    .library(...FILLER)
    .battlefield(caster.name)
    .hand('Grizzly Bears', 'Grizzly Bears')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const bearsOptions = (g: ReturnType<typeof game>) =>
  getLegalActions(g.state, 0).filter(
    (a) => a.kind === 'castSpell' && g.state.objects[a.object]?.zone === 'hand',
  );

describe('Marshland Bloodcaster as the corpus has it', () => {
  test('the ability turns on the life option for the next spell, which is then cast for its mana value in life', () => {
    const g = game();
    expect(bearsOptions(g)).toEqual([]);
    g.act(0).activate(BLOODCASTER, { pay: true });
    g.passAll();
    const options = bearsOptions(g);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((a) => a.kind === 'castSpell' && a.alternative === 'lifeForMana')).toBe(
      true,
    );
    g.act(0).cast({ name: 'Grizzly Bears', nth: 0 }, { alternative: 'lifeForMana' });
    g.expect.life(0, 18);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    // The permission is used up: the second Bears cannot be cast for life or for mana.
    expect(bearsOptions(g)).toEqual([]);
    g.expect.invariants();
  });

  test('with 1 life the 2 life the Bears cost cannot be paid', () => {
    const g = game(1);
    g.act(0).activate(BLOODCASTER, { pay: true });
    g.passAll();
    expect(bearsOptions(g)).toEqual([]);
  });
});
