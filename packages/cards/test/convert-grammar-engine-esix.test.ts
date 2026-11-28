// Esix, Fractal Bloom (Deep Clue Sea deck, issue 128): "The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than Esix and
// create that many tokens that are copies of that creature." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction. The helper spells are SYNTHETIC.
// Rules pinned: CR 614.1a and 614.5 (the tokens are replaced, once for the event), 616.1 (it applies first: the player chooses), 707.2 and 111.4 (copies of the creature as it is), 101.4 (three
// seats: another player's creature may be copied, and an opponent's token creation is not replaced), and the rulings: declining does not offer it again that turn, a token made before Esix
// came under the player's control that turn uses up the "first time", any token (not only creatures) is replaced.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const ESIX = real('Esix, Fractal Bloom');
const LOOK = parsed('SYNTHETIC Parsed Look Twice', 'Sorcery', 'Investigate twice.', {
  manaCost: '{U}',
  colors: ['U'],
});
const GLINT = parsed('SYNTHETIC Parsed Glint', 'Instant', 'Create a Treasure token.', {
  manaCost: '{G}',
  colors: ['G'],
});
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('Esix, Fractal Bloom', () => {
  const game = () =>
    scenario({ seats: 3 })
      .define(ESIX)
      .define(LOOK)
      .define(GLINT)
      .seat(0)
      .library(...LIBRARY)
      .hand(LOOK.name, GLINT.name, GLINT.name)
      .battlefield('Island', 'Island', 'Forest', 'Forest', ESIX.name, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .hand(GLINT.name)
      .battlefield('Forest', SPIDER)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(ESIX)).toEqual([]);
  });

  test('the first creation of tokens asks: copy a creature (mine or another player’s) or decline; copying replaces every token with a copy', () => {
    const g = game();
    g.act(0).cast(LOOK.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('not asked');
    expect(d.purpose).toBe('replacement');
    const texts = (d.replacement?.choices ?? []).map((c) => c.text);
    expect(texts[0]).toBe("Don't replace the tokens");
    expect(texts).toContain(`Create copies of ${BEARS} instead`);
    expect(texts).toContain(`Create copies of ${SPIDER} instead`);
    expect(texts.some((t) => t.includes(ESIX.name))).toBe(false);
    const copyBears = d.options.find(
      (o) => o.includes(':copy:') && o.endsWith(String(g.id(BEARS))),
    );
    if (copyBears === undefined) throw new Error('no option to copy the Bears');
    g.act(0).chooseOption(copyBears);
    g.passAll();
    // "Investigate twice" would have made two Clues: two copies of the Bears instead.
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 3 });
    g.expect.noObject('Clue');
    g.expect.invariants();
  });

  test('declining makes the tokens as written and does not offer it again this turn', () => {
    const g = game();
    g.act(0).cast(`${GLINT.name}[0]`, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('not asked');
    const decline = d.options.find((o) => o.endsWith(':decline'));
    if (decline === undefined) throw new Error('no option to decline');
    g.act(0).chooseOption(decline);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    // The second creation of the turn is not asked.
    g.act(0).cast(GLINT.name, { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
  });

  test('it replaces any token, a Treasure too, and the copy is a creature that entered untapped and mine', () => {
    const g = game();
    g.act(0).cast(`${GLINT.name}[0]`, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('not asked');
    const copySpider = d.options.find((o) => o.endsWith(`:copy:${g.id(SPIDER)}`));
    if (copySpider === undefined) throw new Error('no option to copy the Spider');
    g.act(0).chooseOption(copySpider);
    g.passAll();
    g.expect.noObject('Treasure');
    g.expect.zone(SPIDER, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1, count: 1 });
  });

  test('on an opponent’s turn, or for an opponent’s tokens, nothing is asked', () => {
    const g = game();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(GLINT.name, { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 1, count: 1 });
    g.expect.noObject('Treasure', { seat: 0 });
  });

  test('a token made earlier in the turn uses up the first time even before Esix is on the battlefield', () => {
    const g = scenario({ seats: 3 })
      .define(ESIX)
      .define(GLINT)
      .seat(0)
      .library(...LIBRARY)
      .hand(GLINT.name, GLINT.name, ESIX.name)
      .battlefield(
        'Island',
        'Island',
        'Island',
        'Island',
        'Island',
        'Forest',
        'Forest',
        'Forest',
        BEARS,
      )
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${GLINT.name}[0]`, { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.act(0).cast(ESIX.name, { pay: true });
    g.passAll();
    g.act(0).cast(GLINT.name, { pay: true });
    g.passAll();
    // Not asked: the Treasure made before Esix was the first creation of tokens this turn.
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
  });
});
