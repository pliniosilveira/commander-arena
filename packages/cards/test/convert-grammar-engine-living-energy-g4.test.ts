// The Aetherdrift energy deck (issue 105), group 4: the one-off wordings of the deck, REAL cards of the golden corpus read through the grammar only, defined in an engine scenario and
// played through applyAction: Confiscation Coup (an amount of {E} equal to a mana value, CR 107.14, 608.2c), Disallow (counter a spell or an ability, CR 701.6a), Triplicate Titan (three
// token groups, CR 111.2), Pia Nalaar and Saheeli (tokens), Aetherflux Conduit and Aetherworks Marvel (CR 608.2g), Panharmonicon (CR 603.2d).
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string) => {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return { golden, card: importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES) };
};

const COUP = real('Confiscation Coup');
const DISALLOW = real('Disallow');
const TITAN = real('Triplicate Titan');
const PIA = real('Pia Nalaar, Chief Mechanic');
const SAHEELI = real('Saheeli, Radiant Creator');
const CONDUIT = real('Aetherflux Conduit');
const MARVEL = real('Aetherworks Marvel');
const PANHARMONICON = real('Panharmonicon');

describe('the cards read', () => {
  test.each([COUP, DISALLOW, TITAN, PIA, SAHEELI, CONDUIT, MARVEL, PANHARMONICON])(
    '$golden.name: supported, nothing left unparsed, validateCard is clean',
    ({ card }) => {
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('Triplicate Titan makes three Golems, one with each keyword', () => {
    const dies = TITAN.card.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(dies).toMatchObject({
      trigger: { kind: 'dies' },
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'createToken' }, { kind: 'createToken' }, { kind: 'createToken' }],
      },
    });
  });

  test('Panharmonicon doubles the triggers of an artifact or creature entering', () => {
    const doubler = PANHARMONICON.card.definition.faces[0]?.abilities.find(
      (a) => a.kind === 'static',
    );
    expect(doubler).toMatchObject({
      static: {
        kind: 'doubleTriggers',
        cause: { kind: 'permanentEnters', entering: ['artifact', 'creature'] },
      },
    });
  });

  test('Aetherflux Conduit lets the player cast any number of spells from the hand for free', () => {
    const activated = CONDUIT.card.definition.faces[0]?.abilities.find(
      (a) => a.kind === 'activated',
    );
    expect(activated).toMatchObject({
      cost: [{ kind: 'tap' }, { kind: 'energy', count: 50 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', count: 7 },
          { kind: 'castFree', max: 'any' },
        ],
      },
    });
  });
});

describe('played in a game', () => {
  test('Confiscation Coup: four energy, then it pays the target’s mana value to take it', () => {
    const def = COUP.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .seat(1)
      .battlefield('Sol Ring')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(def.name, { pay: true, targets: ['Sol Ring'] });
    g.passAll();
    g.expect.energy(0, 4);
    // The offer: Sol Ring has mana value 1.
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional' });
    g.act(0).accept();
    g.passAll();
    g.expect.energy(0, 3);
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
  });

  test('Confiscation Coup: declining keeps the energy and the permanent', () => {
    const def = COUP.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .seat(1)
      .battlefield('Sol Ring')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(def.name, { pay: true, targets: ['Sol Ring'] });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.energy(0, 4);
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1 });
  });

  test('Confiscation Coup: too little energy for the mana value is not offered', () => {
    const def = COUP.card.definition;
    // Serra Angel has mana value 5, more than the four energy the spell gives.
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .seat(1)
      .battlefield('Serra Angel')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(def.name, { pay: true, targets: ['Serra Angel'] });
    g.passAll();
    g.expect.energy(0, 4);
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
  });

  test('Triplicate Titan: dying makes three 3/3 Golems', () => {
    const def = TITAN.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand('Murder')
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('Murder', { pay: true, targets: [def.name] });
    g.passAll();
    g.expect.zone('Golem', 'battlefield', { seat: 0, count: 3 });
  });
});
