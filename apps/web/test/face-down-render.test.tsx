/**
 * A face-down permanent as rendered markup (D-315): the drawn card back with its label, "Creature", the 2/2 in the corner and the badge, for the controller and for everybody else;
 * the card behind it only when the view carries it (the controller's own), as the preview panel draws it. The picture of the Manifest token needs the page's effects and a network,
 * so it is not in the static markup: the drawn card is what stays without it.
 */
import { getView, type ObjectView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { realCardOf } from '../src/game/face-down-text';
import { CardFace } from '../src/ui/board/CardFace';

const BRUTE = 'SYNTHETIC Manifest Brute';
const FLIER = 'SYNTHETIC Manifest Flier';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const g = scenario()
  .seat(0)
  .life(20)
  .battlefield(BRUTE, { faceDown: true })
  .library(...FILLER)
  .seat(1)
  .life(20)
  .battlefield(FLIER, { faceDown: true })
  .library(...FILLER)
  .at('precombatMain', { active: 0, turn: 3 })
  .build();

const view = getView(g.state, 0);
const mine = view.battlefield.find((o) => o.id === g.id(BRUTE)) as ObjectView;
const theirs = view.battlefield.find((o) => o.id === g.id(FLIER)) as ObjectView;

test("the opponent's face-down permanent is a labelled card back that names nothing of its card", () => {
  const html = renderToStaticMarkup(<CardFace object={theirs} variant="full" />);
  expect(html).toContain('data-face-down-permanent="manifest"');
  expect(html).toContain('Face-down creature 2');
  expect(html).toContain('manifested');
  expect(html).toContain('Creature');
  expect(html).not.toContain(FLIER);
  expect(html).not.toContain('Flying');
  // The 2/2 in the corner.
  expect(html).toMatch(/2\/2/);
});

test('the controller sees the same card back on the board, with a title that says the card is theirs to look at', () => {
  const html = renderToStaticMarkup(<CardFace object={mine} variant="hand" />);
  expect(html).toContain('data-face-down-permanent="manifest"');
  expect(html).toContain('Face-down creature 1');
  expect(html).toContain('Only you can look at the card');
  // The tile itself still names the label, not the card; the preview panel draws the card.
  expect(html).not.toContain(`>${BRUTE}<`);
});

test('the preview draws the real card for the controller: its name, cost, type and printed 4/4', () => {
  const real = realCardOf(mine);
  expect(real).not.toBeNull();
  const html = renderToStaticMarkup(<CardFace object={real as ObjectView} variant="full" />);
  expect(html).toContain(BRUTE);
  expect(html).toContain('Beast');
  expect(html).toMatch(/4\/4/);
  expect(html).not.toContain('data-face-down-permanent');
});

test('the opponent view has no real card to draw', () => {
  expect(realCardOf(theirs)).toBeNull();
});
