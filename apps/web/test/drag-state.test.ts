/**
 * Issue 8: the hover preview stopped working for good after a card was dragged from the hand. A
 * played card leaves the hand, so its element is gone before `dragend` and the "dragging" flag
 * that keeps the preview quiet stayed set. A pointer entering with no button held clears it.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { clearStaleDrag, isDragging, setDragging } from '../src/ui/dnd/drag-state';

afterEach(() => setDragging(false));

describe('a drag that never ended', () => {
  test('a pointer entering with no button held proves no drag is under way', () => {
    setDragging(true);
    clearStaleDrag(0);
    expect(isDragging()).toBe(false);
  });

  test('a pointer with a button down (a drag being simulated or a real press) keeps it', () => {
    setDragging(true);
    clearStaleDrag(1);
    expect(isDragging()).toBe(true);
  });

  test('with no drag it changes nothing', () => {
    clearStaleDrag(0);
    expect(isDragging()).toBe(false);
  });
});
