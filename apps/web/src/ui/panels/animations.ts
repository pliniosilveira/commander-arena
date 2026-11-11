/**
 * The "Combat animations" and "Animation speed" settings (issue 9, D-228): on and Normal by default,
 * remembered in localStorage like the text size and the side of the controls (which may be
 * unavailable: the choice then holds for the visit). They switch and pace the combat effects
 * (`ui/board/CombatEffects.tsx`); they never change what the engine does. `prefers-reduced-motion`
 * turns the effects off whatever they say (`motionAllowed`).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'commander-arena.combat-animations';
const DEFAULT = true;

export function readStoredCombatAnimations(): boolean | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    return null;
  }
}

let current = DEFAULT;
const listeners = new Set<() => void>();

/** Reads the remembered choice. Call once when the app starts. */
export function applyStoredCombatAnimations(): void {
  setCombatAnimations(readStoredCombatAnimations() ?? DEFAULT, false);
  setAnimationSpeed(readStoredAnimationSpeed() ?? SPEED_DEFAULT, false);
}

/** How fast the combat effects play: Normal is the full timing, Fast about half, Slow one and a half times. */
export type AnimationSpeed = 'fast' | 'normal' | 'slow';

export const SPEED_FACTOR: Readonly<Record<AnimationSpeed, number>> = {
  fast: 0.5,
  normal: 1,
  slow: 1.5,
};

const SPEED_KEY = 'commander-arena.animation-speed';
const SPEED_DEFAULT: AnimationSpeed = 'normal';

export function readStoredAnimationSpeed(): AnimationSpeed | null {
  try {
    const value = window.localStorage.getItem(SPEED_KEY);
    return value === 'fast' || value === 'normal' || value === 'slow' ? value : null;
  } catch {
    return null;
  }
}

let currentSpeed: AnimationSpeed = SPEED_DEFAULT;

export function currentAnimationSpeed(): AnimationSpeed {
  return currentSpeed;
}

export function setAnimationSpeed(speed: AnimationSpeed, remember: boolean): void {
  currentSpeed = speed;
  if (typeof document !== 'undefined') document.documentElement.dataset.animationSpeed = speed;
  if (remember) {
    try {
      window.localStorage.setItem(SPEED_KEY, speed);
    } catch {
      // Private windows and blocked storage: the choice still applies for this visit.
    }
  }
  for (const listener of listeners) listener();
}

export function useAnimationSpeed(): AnimationSpeed {
  return useSyncExternalStore(subscribe, currentAnimationSpeed, () => SPEED_DEFAULT);
}

export function currentCombatAnimations(): boolean {
  return current;
}

export function setCombatAnimations(on: boolean, remember: boolean): void {
  current = on;
  if (typeof document !== 'undefined')
    document.documentElement.dataset.combatAnimations = String(on);
  if (remember) {
    try {
      window.localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Private windows and blocked storage: the choice still applies for this visit.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCombatAnimations(): boolean {
  return useSyncExternalStore(subscribe, currentCombatAnimations, () => DEFAULT);
}

/** False when the player's system asks for no motion (`prefers-reduced-motion: reduce`). */
export function motionAllowed(): boolean {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}
