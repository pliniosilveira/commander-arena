import { type RefObject, useLayoutEffect, useState } from 'react';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The content-box size of an element, kept current by a ResizeObserver. Null until measured. */
export function useMeasure(ref: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const read = () => {
      const style = getComputedStyle(el);
      const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const next = {
        width: Math.max(0, Math.floor(el.clientWidth - padX)),
        height: Math.max(0, Math.floor(el.clientHeight - padY)),
      };
      setSize((prev) =>
        prev !== null && prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
