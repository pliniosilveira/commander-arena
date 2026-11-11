/**
 * Plays a plan of combat beats (issue 9, D-228) with the Web Animations API, on elements it adds to
 * the effects layer and on the tiles and life boxes it animates by their own `translate`, `rotate`,
 * `scale` and `filter` properties (never `transform`, which a tapped tile already uses).
 *
 * What a beat looks like, at Normal speed:
 * - hit (about 1.8 s): the attackers wind back a little, lunge at the recipient (a copy of each
 *   tile moves; the real tile dims where it stood) and come back; at 0.5 s the blow lands: a flash,
 *   two shockwave rings and sparks burst from the recipient, which shakes and glares; a big
 *   outlined number pops, rises and lingers, and a life total pulses. A recipient with no attacker to
 *   show (a spell) gets the same blow after 0.2 s.
 * - gain, loss, poison (1.4 s): a glow and a pulse on the life total and a signed number.
 * - death (2 s): the dying creature's tile is kept as a copy from the moment the snapshot arrives;
 *   when its turn comes it cracks and shakes for a quarter second, then desaturates, blurs, shrinks
 *   and fades while shards fly off it and ash drifts up.
 *
 * Boxes are measured when the snapshot arrives (a dying tile is still on the page then) and again
 * when a blow lands (the board may have moved); every duration is multiplied by the speed.
 */
import type { Plan, PlannedBeat } from './combat-effects';
import {
  addFx,
  boxAt,
  boxRect,
  centreOf,
  cloneTile,
  dotAt,
  elementOf,
  lifeBoxOf,
  type Rect,
  tileOf,
  visualRect,
} from './combat-fx-dom';

type Tone = 'damage' | 'heal' | 'loss' | 'poison';

interface Ghost {
  readonly el: HTMLElement;
  readonly rect: Rect;
}

export interface Player {
  play(plan: Plan, scale: number): void;
  /** Removes everything on screen and every effect still waiting for its turn. */
  clear(): void;
}

const NS = 'http://www.w3.org/2000/svg';

export function createPlayer(layer: HTMLElement): Player {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const ghosts = new Map<string, Ghost>();
  /** Many beats at once: fewer sparks on each. */
  let crowded = false;

  const at = (ms: number, run: () => void): void => {
    if (ms <= 0) {
      run();
      return;
    }
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };

  /** The sparks, flash and rings of a blow that lands on `rect`. */
  function burst(rect: Rect, tone: Tone, s: number, many: boolean): void {
    const { x, y } = centreOf(rect);
    const size = Math.max(rect.width, rect.height);
    const flash = boxAt(`fx-flash fx-tone-${tone}`, rect, size * 0.15);
    addFx(
      layer,
      flash,
      [
        { opacity: 0, scale: '0.5' },
        { opacity: 1, scale: '1.1', offset: 0.2 },
        { opacity: 0, scale: '1.5' },
      ],
      { duration: 550 * s },
    );
    for (const [delay, ms, width] of [
      [0, 900, 5],
      [150, 750, 3],
    ] as const) {
      const ring = dotAt(`fx-ring fx-tone-${tone}`, x, y, size * 0.6);
      ring.style.borderWidth = `${width}px`;
      addFx(
        layer,
        ring,
        [
          { opacity: 1, scale: '0.3' },
          { opacity: 0.8, scale: '1.6', offset: 0.5 },
          { opacity: 0, scale: '2.8' },
        ],
        { duration: ms * s, delay: delay * s, easing: 'ease-out' },
      );
    }
    const sparks = many ? 6 : 12;
    for (let i = 0; i < sparks; i += 1) {
      const angle = (360 / sparks) * i + (i % 2 === 0 ? 8 : -8);
      const rad = (angle * Math.PI) / 180;
      const reach = 60 + (i % 3) * 22 + size * 0.2;
      const spark = dotAt(`fx-spark fx-tone-${tone}`, x, y, 6);
      spark.style.rotate = `${angle}deg`;
      addFx(
        layer,
        spark,
        [
          { opacity: 1, translate: '0 0', scale: '1 1.6' },
          { opacity: 1, offset: 0.6 },
          {
            opacity: 0,
            translate: `${Math.cos(rad) * reach}px ${Math.sin(rad) * reach}px`,
            scale: '0.4 0.4',
          },
        ],
        { duration: 750 * s, easing: 'ease-out' },
      );
    }
  }

  /** A glow that holds around `rect` and then fades. */
  function glow(rect: Rect, tone: Tone, s: number): void {
    addFx(
      layer,
      boxAt(`fx-glow fx-tone-${tone}`, rect, 3),
      [
        { opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 0.85, offset: 0.55 },
        { opacity: 0 },
      ],
      { duration: 1200 * s },
    );
  }

  /** The number: pops large at the blow, rises and lingers, then fades. */
  function number(rect: Rect, text: string, tone: Tone, ms: number, onTop: boolean): void {
    const el = document.createElement('span');
    el.className = `fx-num fx-tone-${tone}`;
    el.textContent = text;
    const { x } = centreOf(rect);
    el.style.left = `${Math.min(Math.max(x, 56), window.innerWidth - 56)}px`;
    el.style.top = `${Math.max(rect.top + (onTop ? 4 : Math.min(rect.height * 0.4, 38)), 40)}px`;
    addFx(
      layer,
      el,
      [
        { opacity: 0, scale: '0.3', translate: '-50% 0', easing: 'ease-out' },
        { opacity: 1, scale: '1.8', translate: '-50% -8px', offset: 0.12, easing: 'ease-out' },
        { opacity: 1, scale: '1.3', translate: '-50% -26px', offset: 0.3, easing: 'linear' },
        { opacity: 1, scale: '1.3', translate: '-50% -46px', offset: 0.78, easing: 'ease-in' },
        { opacity: 0, scale: '1.1', translate: '-50% -74px' },
      ],
      { duration: Math.max(ms, 1) },
    );
  }

  /** The life total of a seat swells and settles. */
  function pulseLife(box: HTMLElement, s: number): void {
    const total = box.querySelector('.board-life-total');
    if (!(total instanceof HTMLElement)) return;
    total.animate(
      [
        { scale: '1', filter: 'brightness(1)' },
        { scale: '1.7', filter: 'brightness(1.8)', offset: 0.2 },
        { scale: '1.25', filter: 'brightness(1.3)', offset: 0.6 },
        { scale: '1', filter: 'brightness(1)' },
      ],
      { duration: 1000 * s, easing: 'ease-out' },
    );
  }

  /** A shake with a flash and a small squash, on a tile, a ghost or a life box. */
  function shake(el: HTMLElement, s: number, hard: boolean): void {
    const d = hard ? 1 : 0.5;
    el.animate(
      [
        { translate: '0 0', rotate: '0deg', scale: '1', filter: 'brightness(2.2) saturate(1.6)' },
        {
          translate: `${-8 * d}px 0`,
          rotate: `${-2.5 * d}deg`,
          scale: '0.93',
          filter: 'brightness(1.8) saturate(1.5)',
          offset: 0.1,
        },
        {
          translate: `${8 * d}px ${-2 * d}px`,
          rotate: `${2.5 * d}deg`,
          scale: '1.04',
          offset: 0.2,
        },
        {
          translate: `${-6 * d}px ${2 * d}px`,
          rotate: `${-2 * d}deg`,
          scale: '0.98',
          offset: 0.32,
        },
        { translate: `${5 * d}px 0`, rotate: `${1.5 * d}deg`, scale: '1.01', offset: 0.45 },
        { translate: `${-3 * d}px 0`, rotate: '0deg', scale: '1', offset: 0.6 },
        { translate: `${2 * d}px 0`, offset: 0.78 },
        { translate: '0 0', rotate: '0deg', scale: '1', filter: 'brightness(1) saturate(1)' },
      ],
      { duration: 850 * s, easing: 'ease-out' },
    );
  }

  /** Lunges the tile of `id` at a point, in `beat.impact` ms, and back. */
  function lunge(id: string, to: { x: number; y: number }, impact: number, s: number): void {
    const ghost = ghosts.get(id);
    const tile = ghost === undefined ? tileOf(id) : null;
    const box = ghost?.rect ?? (tile === null ? null : boxRect(tile));
    if (box === null || (ghost === undefined && tile === null)) return;
    const from = centreOf(box);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return;
    const ux = dx / dist;
    const uy = dy / dist;
    const travel = Math.min(dist * 0.6, 160);
    const wind = 16;
    const total = impact + 650 * s;
    const keyframes: Keyframe[] = [
      { translate: '0 0', scale: '1', easing: 'ease-out' },
      {
        translate: `${-ux * wind}px ${-uy * wind}px`,
        scale: '1.06',
        offset: (impact * 0.6) / total,
        easing: 'cubic-bezier(0.5, 0, 0.9, 0.4)',
      },
      {
        translate: `${ux * travel}px ${uy * travel}px`,
        scale: '1.12',
        offset: impact / total,
        easing: 'ease-out',
      },
      { translate: '0 0', scale: '1' },
    ];
    if (ghost !== undefined) {
      ghost.el.animate(keyframes, { duration: total });
      return;
    }
    if (tile === null) return;
    const sprite = cloneTile(tile, box);
    addFx(layer, sprite, keyframes, { duration: total });
    // The real tile stays where it stands, dimmed, while its copy goes.
    tile.animate([{ opacity: 0.3 }, { opacity: 0.3, offset: 0.9 }, { opacity: 1 }], {
      duration: total,
      easing: 'linear',
    });
  }

  function hit(
    beat: Extract<PlannedBeat, { kind: 'hit' }>,
    s: number,
    measured: Rect | null,
  ): void {
    const target = beat.to;
    const ghost = target.kind === 'object' ? ghosts.get(target.id) : undefined;
    const live = ghost === undefined ? elementOf(target) : null;
    const at0 = () => ghost?.rect ?? (live === null ? null : visualRect(live)) ?? measured;
    const first = at0();
    if (first === null) return;
    const c = centreOf(first);
    for (const source of beat.sources) lunge(source, c, beat.impact, s);
    at(beat.impact, () => {
      const rect = at0() ?? first;
      const tone: Tone = beat.poison ? 'poison' : 'damage';
      burst(rect, tone, s, crowded);
      glow(rect, tone, s);
      const shaken =
        ghost?.el ?? (target.kind === 'object' ? tileOf(target.id) : lifeBoxOf(target.seat));
      if (shaken !== null) shake(shaken, s, target.kind === 'object');
      if (target.kind === 'player') {
        const box = lifeBoxOf(target.seat);
        if (box !== null) pulseLife(box, s);
      }
      const text = beat.poison
        ? `+${beat.amount} poison`
        : beat.loyalty
          ? `−${beat.amount} loyalty`
          : `−${beat.amount}`;
      number(rect, text, tone, beat.duration - beat.impact, target.kind === 'player');
    });
  }

  /** Gain, loss and poison: a glow, a pulse and a signed number on a life box. */
  function onLife(
    seat: number,
    text: string,
    tone: Tone,
    beat: PlannedBeat,
    s: number,
    measured: Rect | null,
  ): void {
    at(beat.impact, () => {
      const box = lifeBoxOf(seat);
      const rect = (box === null ? null : visualRect(box)) ?? measured;
      if (rect === null) return;
      glow(rect, tone, s);
      burst(rect, tone, s, true);
      if (box !== null) pulseLife(box, s);
      number(rect, text, tone, beat.duration - beat.impact, true);
    });
  }

  function crack(): SVGSVGElement {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'fx-crack');
    for (const [d, cls] of [
      ['M52 0 L44 22 L58 38 L40 58 L55 78 L46 100', 'fx-crack-dark'],
      ['M52 0 L44 22 L58 38 L40 58 L55 78 L46 100', 'fx-crack-line'],
      ['M58 38 L84 46 L100 40', 'fx-crack-line'],
      ['M40 58 L16 66 L0 62', 'fx-crack-line'],
    ] as const) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', cls);
      svg.appendChild(path);
    }
    return svg;
  }

  function die(beat: Extract<PlannedBeat, { kind: 'died' }>, s: number): void {
    const ghost = ghosts.get(beat.id);
    if (ghost === undefined) return;
    ghosts.delete(beat.id);
    const total = beat.duration;
    const split = beat.impact / total;
    const { x, y } = centreOf(ghost.rect);
    const size = Math.max(ghost.rect.width, ghost.rect.height);
    ghost.el.appendChild(crack());
    const cracks = ghost.el.querySelector('.fx-crack');
    cracks?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: beat.impact * 0.5,
      fill: 'forwards',
    });
    const dissolve = ghost.el.animate(
      [
        {
          opacity: 1,
          filter: 'grayscale(0) blur(0px) brightness(1)',
          scale: '1',
          translate: '0 0',
        },
        {
          opacity: 1,
          filter: 'grayscale(0.7) blur(0px) brightness(1.4)',
          scale: '1',
          translate: '0 0',
          offset: split,
        },
        {
          opacity: 0.6,
          filter: 'grayscale(1) blur(2px) brightness(0.9)',
          scale: '0.94',
          translate: '0 4px',
          offset: 0.62,
        },
        {
          opacity: 0,
          filter: 'grayscale(1) blur(7px) brightness(0.7)',
          scale: '0.8',
          translate: '0 12px',
        },
      ],
      { duration: total, fill: 'forwards', easing: 'linear' },
    );
    const gone = () => ghost.el.remove();
    dissolve.onfinish = gone;
    dissolve.oncancel = gone;
    // The crack: a hard shake on top of the dissolve, which holds still for that quarter second.
    ghost.el.animate(
      [
        { translate: '0 0', rotate: '0deg' },
        { translate: '-5px 1px', rotate: '-2deg', offset: 0.15 },
        { translate: '5px -1px', rotate: '2deg', offset: 0.3 },
        { translate: '-4px 0', rotate: '-1.5deg', offset: 0.5 },
        { translate: '3px 1px', rotate: '1deg', offset: 0.7 },
        { translate: '0 0', rotate: '0deg' },
      ],
      { duration: beat.impact, easing: 'linear' },
    );
    // Shards fly off as the dissolve begins.
    const shards = 12;
    for (let i = 0; i < shards; i += 1) {
      const angle = ((360 / shards) * i + (i % 3) * 9) * (Math.PI / 180);
      const reach = size * 0.45 + (i % 4) * 16;
      const shard = dotAt('fx-shard', x + Math.cos(angle) * size * 0.12, y, 9 + (i % 3) * 4);
      shard.style.clipPath =
        i % 2 === 0 ? 'polygon(0 100%, 50% 0, 100% 100%)' : 'polygon(0 0, 100% 30%, 40% 100%)';
      addFx(
        layer,
        shard,
        [
          { opacity: 0, translate: '0 0', rotate: '0deg', offset: 0 },
          { opacity: 1, offset: 0.1 },
          {
            opacity: 0,
            translate: `${Math.cos(angle) * reach}px ${Math.sin(angle) * reach + 36}px`,
            rotate: `${(i % 2 === 0 ? 1 : -1) * (180 + i * 30)}deg`,
          },
        ],
        { duration: (total - beat.impact) * 0.8, delay: beat.impact, easing: 'ease-out' },
      );
    }
    // Ash drifts up from where it stood.
    for (let i = 0; i < 8; i += 1) {
      const ash = dotAt('fx-ash', x + (i - 3.5) * (size * 0.1), y + size * 0.15, 14 + (i % 3) * 6);
      addFx(
        layer,
        ash,
        [
          { opacity: 0, translate: '0 0', scale: '0.5' },
          { opacity: 0.7, offset: 0.25 },
          {
            opacity: 0,
            translate: `${(i % 2 === 0 ? 1 : -1) * 14}px ${-40 - (i % 4) * 14}px`,
            scale: '1.6',
          },
        ],
        {
          duration: (total - beat.impact) * 0.85,
          delay: beat.impact + i * 40 * s,
          easing: 'ease-out',
        },
      );
    }
    const label = document.createElement('span');
    label.className = 'fx-ghost-label';
    label.textContent = 'Dies';
    label.style.left = `${x}px`;
    label.style.top = `${ghost.rect.top + ghost.rect.height + 4}px`;
    addFx(
      layer,
      label,
      [
        { opacity: 0, translate: '-50% 0' },
        { opacity: 1, translate: '-50% 0', offset: 0.35 },
        { opacity: 1, translate: '-50% 6px', offset: 0.7 },
        { opacity: 0, translate: '-50% 12px' },
      ],
      { duration: total - beat.impact, delay: beat.impact * 0.6 },
    );
  }

  return {
    play(plan, scale) {
      // Everything on the page that a snapshot is about is measured before React redraws.
      crowded = plan.beats.length > 8;
      const measured = plan.beats.map((beat) => {
        if (beat.kind === 'died') {
          const tile = tileOf(beat.id);
          const box = tile === null ? null : boxRect(tile);
          if (tile !== null && box !== null && !ghosts.has(beat.id)) {
            const el = cloneTile(tile, box);
            el.classList.add('fx-ghost');
            layer.appendChild(el);
            ghosts.set(beat.id, { el, rect: visualRect(tile) ?? box });
          }
          return null;
        }
        if (beat.kind === 'hit') {
          const el = elementOf(beat.to);
          return el === null ? null : visualRect(el);
        }
        const el = lifeBoxOf(beat.seat);
        return el === null ? null : visualRect(el);
      });
      plan.beats.forEach((beat, i) => {
        const rect = measured[i] ?? null;
        at(beat.start, () => {
          if (beat.kind === 'hit') hit(beat, scale, rect);
          else if (beat.kind === 'died') die(beat, scale);
          else if (beat.kind === 'gain')
            onLife(beat.seat, `+${beat.amount}`, 'heal', beat, scale, rect);
          else if (beat.kind === 'loss')
            onLife(beat.seat, `−${beat.amount} life`, 'loss', beat, scale, rect);
          else onLife(beat.seat, `+${beat.amount} poison`, 'poison', beat, scale, rect);
        });
      });
    },
    clear() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      ghosts.clear();
      layer.replaceChildren();
    },
  };
}
