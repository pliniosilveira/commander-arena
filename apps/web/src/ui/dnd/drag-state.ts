/**
 * Whether a drag is in progress, readable outside React: the hover preview checks it so the card
 * panel stays quiet while a card is being carried.
 */
let dragging = false;

export function setDragging(on: boolean): void {
  dragging = on;
}

export function isDragging(): boolean {
  return dragging;
}

/**
 * A pointer that enters something with no button held proves that no drag is under way: the
 * browser sends no mouse events during a native drag. A drag whose `dragend` never arrived (the
 * dragged card left the hand when it was played, so its element was gone) would otherwise keep
 * the hover preview quiet for the rest of the game (issue 8).
 */
export function clearStaleDrag(buttons: number): void {
  if (buttons === 0) dragging = false;
}
