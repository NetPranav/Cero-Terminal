import { Easing } from "remotion";

export const MOTION = {
  // Timing landmarks for 30s (900 frames @ 30fps)
  beats: {
    hookStart: 0,
    hookEnd: 90, // 0.0s - 3.0s: The friction/blocker
    intentStart: 90,
    intentEnd: 210, // 3.0s - 7.0s: Natural language + Sentinel transform
    executionStart: 210,
    executionEnd: 450, // 7.0s - 15.0s: Observable diagnosis + consent gate
    payoffStart: 450,
    payoffEnd: 660, // 15.0s - 22.0s: Auto-recovery & split pane server live
    heroStart: 660,
    heroEnd: 780, // 22.0s - 26.0s: Product hero rest & appreciation
    lockupStart: 780,
    lockupEnd: 900, // 26.0s - 30.0s: Final lockup and GitHub URL
  },

  // Easing presets
  easings: {
    standard: Easing.bezier(0.16, 1, 0.3, 1),
    smoothOut: Easing.out(Easing.cubic),
    smoothIn: Easing.in(Easing.cubic),
    cinematic: Easing.bezier(0.25, 0.1, 0.25, 1),
    anticipate: Easing.bezier(0.36, 0, 0.66, -0.56),
  },

  // Spring physics
  springs: {
    tight: { damping: 24, mass: 0.8, stiffness: 120 },
    gentle: { damping: 20, mass: 1.0, stiffness: 80 },
    docking: { damping: 28, mass: 0.9, stiffness: 100 },
  },
};
