import { describe, expect, it } from 'vitest';
import { hiddenCards } from '../src/ui/board/hidden-cards';

const view = { left: 100, right: 500 };

describe('hiddenCards', () => {
  it('reports nothing when every card is inside the view', () => {
    expect(
      hiddenCards(view, [
        { left: 100, right: 200 },
        { left: 400, right: 500 },
      ]),
    ).toEqual({
      left: 0,
      right: 0,
    });
  });

  it('reports nothing for no cards, however much empty room there is', () => {
    expect(hiddenCards(view, [])).toEqual({ left: 0, right: 0 });
  });

  it('counts the cards wholly or partly past each edge', () => {
    const cards = [
      { left: -200, right: -100 },
      { left: 60, right: 160 },
      { left: 200, right: 300 },
      { left: 450, right: 550 },
      { left: 600, right: 700 },
      { left: 720, right: 820 },
    ];
    expect(hiddenCards(view, cards)).toEqual({ left: 2, right: 3 });
  });

  it('ignores a pixel or two of overshoot', () => {
    expect(hiddenCards(view, [{ left: 98.5, right: 501.5 }])).toEqual({ left: 0, right: 0 });
  });
});
