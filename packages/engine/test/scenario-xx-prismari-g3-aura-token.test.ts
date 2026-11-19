// The Prismari deck (issue 87), group 3: Replication Technique, "Create a token that's a copy of target permanent you control" (SYNTHETIC Copy Technique,
// src/cards/fixtures/synthetic-prismari-g3.ts), aimed at an Aura (D-668). Pins: CR 303.4f (an Aura that enters other than by resolving as an Aura spell, with no object named, is put
// on what its controller chooses as it enters), CR 303.4g (with nothing it can enchant it does not enter: a token never was in another zone), CR 707.2 and 111.10 (the token has the
// copiable values of the Aura), CR 704.5m (an Aura attached to an illegal object goes to the graveyard).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const COPY = 'SYNTHETIC Copy Technique';
const AURA = 'SYNTHETIC Artisan Aura'; // Enchant creature
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const FILLER = ['Island', 'Island', 'Island'] as const;

function game(extra: (b: ReturnType<typeof scenario>) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .hand(COPY)
    .pool('UUUUU')
    .library(...FILLER);
  b.battlefield(BEARS, { label: 'bears' });
  b.battlefield(AURA, { label: 'aura', attachedTo: 'bears' });
  extra(b);
  const g = b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(COPY, { pay: true, targets: [{ name: AURA, zone: 'battlefield', seat: 0 }] });
  g.passAll();
  g.act(0).decline(); // demonstrate: no copy of the spell
  g.passAll();
  return g;
}

describe('a token that is a copy of an Aura (CR 303.4f)', () => {
  test('the card is valid now', () => expect(validateCard(syntheticCard(COPY))).toEqual([]));

  test('with several creatures the controller chooses what the token enchants', () => {
    const g = game((b) => b.battlefield(SPIDER, { label: 'spider' }));
    const d = choosePermanentDecision(g);
    expect(d).toMatchObject({ seat: 0, purpose: 'auraHost' });
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('spider');
    const tokens = Object.values(g.state.objects).filter(
      (o) => o.token !== null && o.zone === 'battlefield',
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.attachedTo).toBe(g.id('spider'));
    g.expect.invariants();
  });

  test('with a single permanent it could enchant, nothing is asked', () => {
    const g = game();
    expect(g.state.pending?.kind).toBe('priority');
    const token = Object.values(g.state.objects).find(
      (o) => o.token !== null && o.zone === 'battlefield',
    );
    expect(token?.attachedTo).toBe(g.id('bears'));
  });

  test('with no creature at all the token does not enter', () => {
    const g = scenario()
      .seat(0)
      .hand(COPY)
      .pool('UUUUU')
      .library(...FILLER)
      .battlefield(AURA, { label: 'aura' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(COPY, { pay: true, targets: [{ name: AURA, zone: 'battlefield', seat: 0 }] });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(Object.values(g.state.objects).filter((o) => o.token !== null)).toHaveLength(0);
  });
});
