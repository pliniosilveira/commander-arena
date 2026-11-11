/**
 * The drag image. The browser's default is a screenshot of the dragged element, which for a hand
 * card is a sliver of the fan, so we draw a small legible tag instead and hand it to `setDragImage`.
 */
export function startGhost(data: DataTransfer, name: string): void {
  const el = document.createElement('div');
  el.className = 'dnd-ghost';
  const title = document.createElement('b');
  title.textContent = name;
  el.append(title);
  document.body.append(el);
  data.setDragImage(el, 16, 16);
  // The browser has copied the image by the end of the event; the element is not needed again.
  setTimeout(() => el.remove(), 0);
}
