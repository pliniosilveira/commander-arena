// "As this creature enters, choose a player." / "Sewer Nemesis's power and toughness are each equal to the number of cards in the chosen player's graveyard." / "Whenever the
// chosen player casts a spell, that player mills a card." (Sewer Nemesis): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar with no override, is defined
// in an engine scenario and is played through applyAction, with 2, 3 and 4 seats.
// Pins (numbers as the code and docs already cite them; the CR text was not available here, so they are unchecked against it): CR 614.12a (the choice as the permanent enters),
// CR 607.2d (what reads the choice), CR 604.3 and 208.2a (a characteristic-defining ability), CR 613.4a (layer 7a), CR 601.2i (a spell is cast), CR 701.17a (mill), CR 108.3 (the
// owner of a card), CR 400.7 (a new object has made no choice).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

describe('Sewer Nemesis', () => {
  const nemesis = real('Sewer Nemesis');
  const NAME = nemesis.name;

  test('the card is valid and says what the engine runs', () => {
    expect(validateCard(nemesis)).toEqual([]);
    const graveyard = {
      kind: 'countOf',
      filter: { zone: 'graveyard', controller: 'chosenPlayer' },
    };
    expect(nemesis.faces[0]?.abilities).toMatchObject([
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'player' } },
      {
        kind: 'static',
        static: { kind: 'characteristicPt', power: graveyard, toughness: graveyard },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'chosenPlayer' },
        effect: { kind: 'mill', player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } } },
      },
    ]);
  });

  const table = (seats: 2 | 3 | 4) => {
    const b = scenario({ seats }).define(nemesis);
    return b;
  };

  test.each([2, 3, 4] as const)(
    '%i seats: the controller is asked for a player as it enters, any player still in the game, themselves too',
    (seats) => {
      const b = table(seats);
      b.seat(0)
        .hand(NAME)
        .library(...FILLER)
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp');
      for (let s = 1; s < seats; s += 1)
        b.seat(s as 1 | 2 | 3)
          .library(...FILLER)
          .graveyard(BEARS);
      const g = b.build();
      g.act(0).cast(NAME, { pay: true });
      g.passAll();
      const d = g.state.pending;
      expect(d?.kind).toBe('chooseOption');
      if (d?.kind !== 'chooseOption') return;
      expect(d.purpose).toBe('player');
      expect(d.seat).toBe(0);
      expect(d.options).toEqual(Array.from({ length: seats }, (_, i) => `seat:${i}`));
      // Only a player is an answer, and only from the player who is asked.
      for (const bad of ['seat:9', 'seat:-1', 'player:1', '1', '', 'W']) {
        expect(g.act(0).try.action({ kind: 'chooseOption', option: bad }).ok, bad).toBe(false);
      }
      expect(g.act(1).try.action({ kind: 'chooseOption', option: 'seat:0' }).ok).toBe(false);
      g.act(0).chooseOption(`seat:${seats - 1}`);
      g.expect.zone(NAME, 'battlefield', { seat: 0 });
      g.expect.chosen(NAME, { player: seats - 1 });
      g.expect.invariants();
    },
  );

  test("power and toughness are the number of cards in the chosen player's graveyard, and follow it", () => {
    const b = table(4);
    b.seat(0).battlefield(NAME, { chosen: { player: 2 } });
    b.seat(1).graveyard(BEARS, BEARS, BEARS, BEARS, BEARS);
    b.seat(2).graveyard(BEARS, BOLT, BEARS);
    b.seat(3).graveyard(BEARS);
    const g = b.build();
    // Seat 2's graveyard: three cards; the graveyards of the other players are not counted.
    g.expect.pt(NAME, 3, 3);
  });

  test('a creature that chose its own controller counts their graveyard (the choice may be oneself)', () => {
    const b = table(3);
    b.seat(0)
      .battlefield(NAME, { chosen: { player: 0 } })
      .graveyard(BEARS, BEARS);
    b.seat(1).graveyard(BEARS, BEARS, BEARS, BEARS);
    const g = b.build();
    g.expect.pt(NAME, 2, 2);
  });

  test('an empty graveyard makes it 0/0, and it dies as a state-based action (CR 704.5f)', () => {
    const b = table(2);
    b.seat(0).battlefield(NAME, { chosen: { player: 1 } });
    b.seat(1).library(...FILLER);
    const g = b.build();
    g.passAll();
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
  });

  test('the chosen player casting a spell mills that player, and nobody else', () => {
    const b = table(4).at('precombatMain', { active: 1, turn: 2 });
    b.seat(0)
      .battlefield(NAME, { chosen: { player: 1 } })
      .library(...FILLER);
    b.seat(1)
      .hand(BEARS)
      .battlefield('Forest', 'Forest')
      .library(...FILLER);
    b.seat(2).library(...FILLER);
    b.seat(3).library(...FILLER);
    const g = b.build();
    const before = g.state.seats.map((s) => s.library.length);
    g.act(1).cast(BEARS, { pay: true });
    // The trigger is on the stack above the spell.
    g.passAll();
    const after = g.state.seats.map((s) => s.library.length);
    expect(after[1]).toBe((before[1] ?? 0) - 1);
    expect([after[0], after[2], after[3]]).toEqual([before[0], before[2], before[3]]);
  });

  test('a spell cast by a player who was not chosen, the controller included, does nothing', () => {
    // Seat 2 is chosen; seats 0 (the controller) and 3 cast.
    const run = (caster: 0 | 3) => {
      const b = table(4).at('precombatMain', { active: caster, turn: 2 });
      b.seat(0)
        .battlefield(NAME, { chosen: { player: 2 } })
        .library(...FILLER);
      b.seat(1).library(...FILLER);
      b.seat(2).library(...FILLER);
      const spells = b.seat(caster);
      if (caster === 0) spells.hand(BEARS).battlefield('Forest', 'Forest');
      else
        spells
          .hand(BEARS)
          .battlefield('Forest', 'Forest')
          .library(...FILLER);
      if (caster === 3) b.seat(3).library(...FILLER);
      const g = b.build();
      const before = g.state.seats.map((s) => s.library.length);
      g.act(caster).cast(BEARS, { pay: true });
      g.passAll();
      return [before, g.state.seats.map((s) => s.library.length)] as const;
    };
    for (const caster of [0, 3] as const) {
      const [before, after] = run(caster);
      expect(after, `seat ${caster}`).toEqual(before);
    }
  });

  test('a creature cast again chooses again: the answer is the new one', () => {
    const b = table(2).at('precombatMain', { active: 0, turn: 2 });
    b.seat(0)
      .hand(NAME, BOLT)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Mountain')
      .library(...FILLER);
    b.seat(1)
      .graveyard(BEARS, BEARS)
      .library(...FILLER);
    const g = b.build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption('seat:1');
    g.expect.pt(NAME, 2, 2);
  });
});
