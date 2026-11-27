// The Mind Flayarrrs deck, group 8: Overcharged Amalgam, the REAL card of the golden corpus read through the grammar only and played through applyAction. "Flash. Flying. Exploit. When this
// creature exploits a creature, counter target spell, activated ability, or triggered ability." (CR 702.110 Exploit, 702.8 Flash; the Exploit rules text was not available to check.)
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const AMALGAM = real('Overcharged Amalgam');
const FILLER = Array.from({ length: 30 }, () => 'Plains');

describe('Overcharged Amalgam', () => {
  test('read as flash, flying, exploit, and an exploit trigger that counters a spell or ability', () => {
    const abilities = AMALGAM.faces[0]?.abilities ?? [];
    const keywords = abilities.flatMap((a) => (a.kind === 'keyword' ? [a.keyword.kind] : []));
    expect(keywords).toEqual(['flash', 'flying', 'exploit']);
    expect(abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'exploits' },
      effect: { kind: 'counter' },
    });
  });

  function game(seats: 2 | 3 | 4) {
    let b = scenario({ seats })
      .define(AMALGAM)
      .seat(0)
      .hand(AMALGAM.name)
      .battlefield('Island', { count: 4 })
      .battlefield('Grizzly Bears')
      .library(...FILLER);
    for (let seat = 1; seat < seats; seat += 1) {
      b = b
        .seat(seat as 1 | 2 | 3)
        .library(...FILLER)
        .hand('Lightning Bolt')
        .battlefield('Mountain', { count: 2 });
    }
    return b.at('precombatMain', { active: 1, turn: 4, priority: 1 }).build();
  }

  /** The opponent `seat` casts a bolt at seat 0; seat 0 flashes in the Amalgam, exploits `sacrificed` and counters the bolt. */
  function counterTheBolt(seats: 2 | 3 | 4, sacrificed: string) {
    const g = game(seats);
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    for (let seat = 2; seat < seats; seat += 1) g.act(seat as 2 | 3).pass();
    g.act(0).cast(AMALGAM.name, { pay: true });
    g.passAll(); // the Amalgam resolves
    g.expect.stack([`${AMALGAM.name} (ability)`, 'Lightning Bolt']);
    g.passAll(); // the exploit ability resolves
    g.act(0).accept();
    g.act(0).choosePermanents(sacrificed);
    return g;
  }

  /** The exploit trigger is on the stack (its target, the bolt, is the only spell there): it resolves and counters it. */
  function finish(g: ReturnType<typeof game>) {
    g.expect.stack([`${AMALGAM.name} (ability)`, 'Lightning Bolt']);
    g.passAll();
    g.expect.stack([]);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 1 });
    expect(g.state.seats[0]?.life).toBe(40); // the bolt was countered
    g.expect.invariants();
  }

  test('flashed in response, it exploits another creature and its trigger counters the spell', () => {
    const g = counterTheBolt(2, 'Grizzly Bears');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone(AMALGAM.name, 'battlefield', { seat: 0 });
    finish(g);
  });

  test('it may sacrifice itself and the trigger still counters', () => {
    const g = counterTheBolt(2, AMALGAM.name);
    g.expect.zone(AMALGAM.name, 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    finish(g);
  });

  test('with four seats the creature sacrificed is still the controller’s own, and any opponent’s spell can be countered', () => {
    const g = counterTheBolt(4, 'Grizzly Bears');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    for (const seat of [1, 2, 3]) g.expect.zone('Mountain', 'battlefield', { seat });
    finish(g);
  });
});
