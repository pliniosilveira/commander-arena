// Manifest dread (CR 701.62a): "Look at the top two cards of your library. Manifest one of them, then put the cards you looked at that were not manifested this way into
// your graveyard." Pins: CR 701.62a (the player chooses which of the two is manifested; the other goes to the graveyard), 701.40a and 708.2a (the card is a face-down 2/2 creature
// under the control of the player who manifests it), 708.5 (nothing says which card it is), 701.40f/701.62a with fewer than two cards (one card is manifested without a choice,
// no card does nothing). The `lookAtTop` effect with `take.to: 'manifest'`. Cards are SYNTHETIC (src/cards/fixtures/synthetic-manifest.ts) or basic lands.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { graveyardNames, kinds } from './scry-helpers';

const DREAD = 'SYNTHETIC Manifest Dread';

function game(names: readonly string[]): ScenarioGame {
  let b = scenario().seat(0).hand(DREAD).pool('GCC');
  names.forEach((name, i) => {
    b = b.library(name, { label: String.fromCharCode(97 + i) });
  });
  return b.seat(1).library('Llanowar Elves').build();
}

/** The graveyard without the resolved spell. */
const dead = (g: ScenarioGame): string[] => graveyardNames(g, 0).filter((n) => n !== DREAD);

function cast(g: ScenarioGame): ScenarioGame {
  g.act(0).cast(DREAD, { pay: true });
  g.pass();
  return g.pass();
}

describe('the card and the effect are known to the engine', () => {
  test('the SYNTHETIC card is valid', () => {
    expect(validateCard(syntheticCard(DREAD))).toEqual([]);
    expect(isFeatureSupported('effect:lookAtTop')).toBe(true);
  });
});

describe('manifest dread (CR 701.62a)', () => {
  test('asks for one of the top two cards, unrevealed', () => {
    const g = cast(game(['Island', 'Forest', 'Plains']));
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(false);
    expect(d.legal).toEqual([g.id('a'), g.id('b')]);
  });

  test('the card chosen is a face-down 2/2 creature under the controller, the other goes to the graveyard', () => {
    const g = cast(game(['Island', 'Forest', 'Plains']));
    const mark = g.mark();
    g.act(0).chooseCards('b');
    expect(dead(g)).toEqual(['Island']);
    const down =
      g.state.objects[
        Object.keys(g.state.objects).find((id) => {
          const o = g.state.objects[id as keyof typeof g.state.objects];
          return o?.zone === 'battlefield' && o.faceDown !== undefined && o.faceDown !== null;
        }) as keyof typeof g.state.objects
      ];
    expect(down?.faceDown).toEqual({ by: 'manifest', n: 1 });
    expect(down?.controller).toBe(0);
    expect(kinds(g.eventsSince(mark))).not.toContain('cardsRevealed');
    g.expect.invariants();
  });

  test('the third card stays on top of the library', () => {
    const g = cast(game(['Island', 'Forest', 'Plains']));
    g.act(0).chooseCards('a');
    g.expect.librarySize(0, 1);
  });

  test('with one card in the library it is manifested and nobody is asked (CR 701.62a)', () => {
    const g = cast(game(['Forest']));
    g.expect.pending('priority', 0);
    g.expect.librarySize(0, 0);
    expect(dead(g)).toEqual([]);
    expect(
      Object.values(g.state.objects).some((o) => o?.faceDown && o.zone === 'battlefield'),
    ).toBe(true);
  });

  test('with an empty library nothing happens', () => {
    const g = cast(game([]));
    g.expect.pending('priority', 0);
    expect(
      Object.values(g.state.objects).some((o) => o?.faceDown && o.zone === 'battlefield'),
    ).toBe(false);
  });
});
