// Scions & Spellcraft deck, group G: "Whenever one or more opponents lose life, you may cast target instant or sorcery card from your graveyard. If that spell would be put into
// your graveyard, exile it instead. Do this only once each turn.", read from the real Oracle wording by the grammar alone and run by the engine in a three-seat game. Every card
// name starts with "SYNTHETIC".
// Pins: CR 603.2c (a "one or more" trigger triggers once for the simultaneous events, not once for each player), CR 119.3 (life loss), CR 608.2g and 601.2 (a cast as an effect
// resolves, paying its mana cost), CR 614.1a (exile instead of the graveyard), CR 115.1 (targets), CR 603.2h (do this only once each turn: the ability still triggers).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const WIZARD_TEXT =
  'Whenever one or more opponents lose life, you may cast target instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile it instead. Do this only once each turn.';

describe('"whenever one or more opponents lose life, you may cast target instant or sorcery card from your graveyard"', () => {
  const wizard = parsed('SYNTHETIC Parsed Graveyard Wizard', 'Creature — Wizard', WIZARD_TEXT, {
    manaCost: '{2}{B}',
    power: '2',
    toughness: '2',
    colors: ['B'],
  });
  const drain = parsed('SYNTHETIC Parsed Drain', 'Sorcery', 'Each opponent loses 2 life.', {
    manaCost: '{B}',
    colors: ['B'],
  });
  const rite = parsed('SYNTHETIC Parsed Rite', 'Sorcery', 'You gain 3 life.', {
    manaCost: '{1}{B}',
    colors: ['B'],
  });
  const bear = parsed('SYNTHETIC Parsed Cub', 'Creature — Bear', 'Vigilance', {
    manaCost: '{1}{B}',
    power: '2',
    toughness: '2',
    colors: ['B'],
  });
  const FILLER = ['Swamp', 'Swamp', 'Swamp', 'Swamp'] as const;

  const game = (seats: 2 | 3, mine: readonly string[], opposing: readonly string[] = []) => {
    let b = scenario({ seats })
      .define(wizard)
      .define(drain)
      .define(rite)
      .define(bear)
      .seat(0)
      .life(20)
      .hand(drain.name, drain.name)
      .battlefield(wizard.name)
      .battlefield('Swamp', { count: 6 })
      .library(...FILLER);
    for (const name of mine) b = b.graveyard(name);
    b = b
      .seat(1)
      .life(20)
      .library(...FILLER);
    for (const name of opposing) b = b.graveyard(name);
    if (seats === 3) {
      b = b
        .seat(2)
        .life(20)
        .library(...FILLER);
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };
  type Game = ReturnType<typeof game>;

  /** The Drain resolves: every opponent loses 2 life; the wizard's trigger is put on the stack and its target is asked (the Drain itself is in the graveyard too). */
  const drainAll = (g: Game, seats: number) => {
    g.act(0).cast(`${drain.name}[0]`, { pay: true });
    for (let i = 0; i < seats; i += 1) g.pass();
  };
  const riteRef = { name: rite.name, zone: 'graveyard', seat: 0, nth: 0 } as const;
  /** The trigger's target decision is answered with the Rite, and the trigger resolves up to the question "cast it?". */
  const chooseRite = (g: Game, seats: number) => {
    g.act(0).chooseTargets(riteRef);
    for (let i = 0; i < seats; i += 1) g.pass();
  };

  test('two opponents losing life in one event trigger it once, not once for each (CR 603.2c)', () => {
    const g = game(3, [rite.name]);
    drainAll(g, 3);
    g.expect.life(1, 18);
    g.expect.life(2, 18);
    // One trigger on the stack, with one target decision: not one for each opponent.
    expect(g.state.stack.length).toBe(1);
    chooseRite(g, 3);
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    // The mana cost of the Rite is paid by the player (CR 601.2h): this is the payment decision, not a free cast.
    expect(g.state.pending?.kind).toBe('payMana');
    g.act(0).payAuto();
    expect(g.state.objects[g.id(rite.name)]?.stack?.free).not.toBe(true);
    g.passAll();
    g.expect.life(0, 23);
    // The spell was exiled in place of the graveyard (CR 614.1a), and nothing else asks.
    g.expect.zone(rite.name, 'exile', { seat: 0 });
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('the mana cost is paid for the spell cast (CR 601.2)', () => {
    const g = game(2, [rite.name]);
    drainAll(g, 2);
    chooseRite(g, 2);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.life(0, 20);
    g.expect.stack([rite.name]);
    g.passAll();
    g.expect.life(0, 23);
  });

  test('declined: the card stays in the graveyard', () => {
    const g = game(2, [rite.name]);
    drainAll(g, 2);
    chooseRite(g, 2);
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone(rite.name, 'graveyard', { seat: 0 });
  });

  test('only an instant or sorcery card in my own graveyard is a legal target (CR 115.1)', () => {
    const g = game(2, [rite.name, bear.name], [rite.name]);
    drainAll(g, 2);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : null));
    expect(legal).toContain(g.id(riteRef));
    // The Drain just resolved is an instant-or-sorcery card of mine too; the creature card and the opponent's Rite are not targets.
    expect(legal).toContain(g.id({ name: drain.name, zone: 'graveyard', seat: 0 }));
    expect(legal).not.toContain(g.id(bear.name));
    expect(legal).not.toContain(g.id({ name: rite.name, zone: 'graveyard', seat: 1 }));
    expect(legal).toHaveLength(2);
  });

  test('a second loss in the same turn triggers it, but the cast is done only once each turn (CR 603.2h)', () => {
    const g = game(2, [rite.name, rite.name]);
    drainAll(g, 2);
    chooseRite(g, 2);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(0, 23);
    // The second Drain: nothing is put on the stack for the trigger again this turn (CR 603.2h, "Do this only once each turn").
    g.act(0).cast(`${drain.name}[0]`, { pay: true });
    g.pass();
    g.pass();
    g.expect.life(1, 16);
    expect(g.state.stack.length).toBe(0);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('the card is supported with no override, as the grammar reads it', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Graveyard Wizard',
        manaCost: '{2}{B}',
        typeLine: 'Creature — Wizard',
        oracleText: WIZARD_TEXT,
        power: '2',
        toughness: '2',
      }),
    );
    expect(imported.support.status).toBe('supported');
  });

  test('a creature card, a graveyard that is not mine or another batch are not read', () => {
    for (const text of [
      'Whenever one or more opponents lose life, you may cast target creature card from your graveyard.',
      'Whenever one or more opponents lose life, you may cast target instant or sorcery card from your graveyard, then draw a card.',
      'Whenever one or more players lose life, you may cast target instant or sorcery card from your graveyard.',
    ]) {
      const imported = parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Parsed Rejected',
          manaCost: '{2}{B}',
          typeLine: 'Creature — Wizard',
          oracleText: text,
          power: '2',
          toughness: '2',
        }),
      );
      expect(imported.support.status, text).toBe('unsupported');
    }
  });
});
