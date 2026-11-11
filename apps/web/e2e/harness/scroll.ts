/**
 * What a player would see as a stray scroll bar (issue 138, `scrollbars.e2e.ts`): run it in the page
 * with `page.evaluate(scrollProblems)`. The headless browser hides bars, so it reads the geometry: an
 * `overflow: auto` or `scroll` element, not `scrollbar-width: none`, whose content is larger than its
 * box is one that would show a bar. It lists a bar on the page itself, a horizontal bar anywhere, and a
 * scrolling area inside another scrolling area. Vertical bars that belong (the log, the stack list, a card
 * taller than its box) are not listed.
 */
export function scrollProblems(): string[] {
  const out: string[] = [];
  const page = document.documentElement;
  if (page.scrollWidth > page.clientWidth)
    out.push(`the page scrolls sideways (${page.scrollWidth})`);
  if (page.scrollHeight > page.clientHeight) out.push(`the page scrolls (${page.scrollHeight})`);
  const name = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`;
  const scrolls = (el: Element, axis: 'x' | 'y'): boolean => {
    const style = getComputedStyle(el);
    if (style.scrollbarWidth === 'none') return false;
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') return false;
    return axis === 'x' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
  };
  for (const el of document.querySelectorAll('*')) {
    if (scrolls(el, 'x'))
      out.push(`horizontal bar on ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    if (!scrolls(el, 'y')) continue;
    for (let up = el.parentElement; up !== null; up = up.parentElement) {
      if (scrolls(up, 'y')) out.push(`${name(el)} scrolls inside ${name(up)}`);
    }
  }
  return out;
}
