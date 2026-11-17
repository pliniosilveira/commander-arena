/** A spell with several targets for different effects: the dock lists the legal targets under what each slot is for (the owner's report). */
import type { ChosenTarget, GameView, TargetsDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { TargetsPanel } from '../src/ui/decisions/TargetsPanel';
import { initialUi } from '../src/ui/decisions/ui-state';

/** SYNTHETIC: a view shaped like a GameView with one creature, not taken from a real game. */
const bears = {
  id: 'o1',
  name: 'Grizzly Bears',
  controller: 0,
  owner: 0,
  zone: 'battlefield',
  types: ['creature'],
};
const view = {
  viewer: 0,
  battlefield: [bears],
  stack: [],
  exile: [],
  seats: [
    { id: 0, hand: [], graveyard: [], command: [] },
    { id: 1, hand: null, graveyard: [], command: [] },
  ],
} as unknown as GameView;
const none = () => {};

describe('one list of targets for each slot of a spell with several targets', () => {
  const decision = {
    id: 'd1',
    seat: 0,
    kind: 'targets',
    source: 'o9',
    specs: [
      {
        specId: 'who',
        min: 1,
        max: 1,
        target: { id: 'who', what: { kind: 'player', filter: 'any' } },
        legal: [{ kind: 'player', seat: 0, specId: 'who' }],
      },
      {
        specId: 'pal',
        min: 1,
        max: 1,
        target: {
          id: 'pal',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
        legal: [{ kind: 'object', id: 'o1', specId: 'pal' }],
      },
    ],
  } as unknown as TargetsDecision;

  test('each slot has a heading with what it takes and its own chips', () => {
    const ui = { ...initialUi(decision), targets: [] as ChosenTarget[] };
    const out = renderToStaticMarkup(
      <TargetsPanel decision={decision} view={view} ui={ui} update={none} />,
    );
    expect(out).toContain('Slot 1: target player');
    expect(out).toContain('Slot 2: target creature you control');
    expect(out).toContain('data-slot="pal"');
    expect(out).toContain('Grizzly Bears');
  });
});
