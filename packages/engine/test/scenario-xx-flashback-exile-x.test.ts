// "Flashback—{3}{U}{R}, Exile X cards from your graveyard." (Summons of Saruman): the flashback cost pays mana and exiles as many other cards of the caster's graveyard as the X
// announced as the spell is cast; the X is also the X of the spell's text.
// Pins: CR 702.34a (flashback: cast from the graveyard for its flashback cost, an alternative cost), CR 118.9 (the alternative cost replaces the mana cost, so the {X} of the mana
// cost is not paid), CR 107.3a and 601.2b (X is announced as the spell is cast, even if an alternative cost has none in its mana), CR 601.2h (exiling is part of the cost),
// CR 400.7 (an exiled card is a new object). Written to hold with three seats: only the caster's graveyard is read.
// The card is SYNTHETIC, defined in this file (a synthetic fixture of this shape would change the derive digests).
import { describe, expect, test } from 'vitest';
import { getLegalActions, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { chooseXDecision } from './pending-helpers';

const RITE = 'SYNTHETIC Exile Rite'; // sorcery {X}{U}{R}: you gain X life; Flashback—{3}{U}{R}, Exile X cards from your graveyard
const FILLER = ['Grizzly Bears', 'Giant Spider', 'Typhoid Rats', 'Youthful Knight', 'Fencing Ace'];

const rite = singleFaceCard({
  name: RITE,
  manaCost: ['X', 'U', 'R'],
  types: ['sorcery'],
  colors: ['U', 'R'],
  colorIdentity: ['U', 'R'],
  oracleText: 'You gain X life. Flashback—{3}{U}{R}, Exile X cards from your graveyard.',
  abilities: [
    {
      kind: 'keyword',
      keyword: {
        kind: 'flashback',
        cost: [
          { kind: 'mana', symbols: ['3', 'U', 'R'] },
          { kind: 'exileFromGraveyard', filter: {}, count: 1, countX: true },
        ],
      },
    },
  ],
  spell: { x: true, effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'x' } } },
});

function board(graveyard: readonly string[], seats: 2 | 3 = 2) {
  const b = scenario({ seats: seats })
    .define(rite)
    .seat(0)
    .graveyard(RITE, ...graveyard)
    .battlefield('Island', 'Island', 'Mountain', 'Mountain', 'Mountain')
    .life(10)
    .seat(1)
    .graveyard('Forest', 'Forest');
  return (seats === 3 ? b.seat(2).graveyard('Forest') : b)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('the card is valid', () => {
  test('flashback cost with an exile of X cards', () => {
    expect(validateCard(rite)).toEqual([]);
  });
});

describe('the cost pays X other cards of the caster graveyard (CR 702.34a, 107.3a, 601.2h)', () => {
  test('X = 2: the cards are chosen and exiled, the mana is the flashback cost, the spell has X = 2', () => {
    const g = board(FILLER);
    g.act(0).cast(RITE, { alternative: 'flashback', pay: true, x: 2 });
    expect(g.state.casting?.stage).toBe('exile');
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider');
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 0 });
    // The mana cost of the card is not paid: five lands for {3}{U}{R}, nothing for the {X}.
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).every((o) => o.tapped)).toBe(true);
    g.passAll();
    g.expect.life(0, 12);
    g.expect.invariants();
  });

  test('X = 0: nothing is exiled and the spell has X = 0', () => {
    const g = board(FILLER);
    g.act(0).cast(RITE, { alternative: 'flashback', pay: true, x: 0 });
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.life(0, 10);
    FILLER.forEach((name) => {
      g.expect.zone(name, 'graveyard', { seat: 0 });
    });
  });

  test('exactly as many other cards as X: they are exiled without a question', () => {
    const g = board(FILLER.slice(0, 2));
    g.act(0).cast(RITE, { alternative: 'flashback', pay: true, x: 2 });
    g.expect.pending('priority', 0);
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
  });

  test('X is offered up to the other cards of the graveyard: the card itself is not one of them', () => {
    const g = board(FILLER.slice(0, 2));
    g.act(0).cast(RITE, { alternative: 'flashback' });
    expect(chooseXDecision(g)).toMatchObject({ seat: 0, purpose: 'spell', min: 0, max: 2 });
  });

  test('with three seats only the caster graveyard counts', () => {
    const g = board(FILLER.slice(0, 1), 3);
    // The opponents' graveyards hold three Forests, which do not raise the largest X.
    g.act(0).cast(RITE, { alternative: 'flashback' });
    expect(chooseXDecision(g).max).toBe(1);
    const h = board(FILLER.slice(0, 1), 3);
    h.act(0).cast(RITE, { alternative: 'flashback', pay: true, x: 1 });
    h.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    h.expect.zone('Forest', 'graveyard', { seat: 1 });
  });

  test('without the mana for the flashback cost it is not offered, whatever the graveyard holds', () => {
    const g = scenario()
      .define(rite)
      .seat(0)
      .graveyard(RITE, ...FILLER)
      .battlefield('Island', 'Mountain')
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    expect(
      getLegalActions(g.state, 0).filter(
        (a) => a.kind === 'castSpell' && a.alternative === 'flashback',
      ),
    ).toEqual([]);
  });

  test('the spell is exiled as it resolves (CR 702.34a), not put back into the graveyard', () => {
    const g = board(FILLER);
    g.act(0).cast(RITE, { alternative: 'flashback', pay: true, x: 1 });
    g.act(0).chooseCards('Grizzly Bears');
    g.passAll();
    g.expect.zone(RITE, 'exile', { seat: 0 });
  });
});
