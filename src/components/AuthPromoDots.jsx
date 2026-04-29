import React, { useEffect, useMemo, useRef } from "react";

// Number of dots scattered across the auth promo panel. Tuned to the
// same visual density as the previous CSS `::before` tiled-radial
// pattern -- enough to read as ambient texture, few enough that the
// per-frame cursor-distance math stays cheap.
const DOT_COUNT = 180;

// Cursor-avoidance tuning. A dot whose base position is within
// REPEL_RADIUS pixels of the cursor gets pushed *away*; the further
// inside that radius it sits, the harder the push, capped at
// REPEL_STRENGTH. The 1-d/r linear falloff feels softer than 1/r^2
// and avoids the "dot snaps right to the rim" effect.
const REPEL_RADIUS = 90;
const REPEL_STRENGTH = 28;

// Deterministic pseudo-random in [0, 1). Sine-hash so dot positions
// look organic but stay stable across re-renders / tab reloads (no
// shifting layout between mount events).
const pseudoRandom = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const generateDots = () => {
  const dots = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const x = pseudoRandom(i * 13.37) * 100;
    const y = pseudoRandom(i * 7.13 + 0.5) * 100;
    const size = 1.5 + pseudoRandom(i * 21.5 + 0.7) * 2;
    const opacity = 0.1 + pseudoRandom(i * 11.0 + 0.3) * 0.18;
    dots.push({ id: i, x, y, size, opacity });
  }
  return dots;
};

// Decorative dotted background for the auth promo panel that *flees*
// the cursor. Each dot is a real DOM element so we can transform it
// independently. On every mousemove inside the panel we recompute
// each dot's distance to the cursor and translate it outward; on
// mouseleave the cursor is parked far off-canvas so all dots ease
// back to their base positions through the CSS transition.
//
// Updates are batched into a single rAF tick so a fast mousemove
// doesn't queue dozens of redundant relayouts.
const AuthPromoDots = () => {
  const containerRef = useRef(null);
  const dotsRef = useRef([]);
  const rafRef = useRef(0);
  // Cursor in viewport coords; we convert to local on each rAF tick.
  // Park off-canvas initially so no dot is ever shoved on first mount.
  const cursorRef = useRef({ x: -100000, y: -100000 });

  const dots = useMemo(generateDots, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    // Respect the reduced-motion preference: dots stay perfectly
    // still (no flee effect) for users who'd find the chasing motion
    // distracting or motion-sickness inducing.
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    dotsRef.current = Array.from(
      container.querySelectorAll(".auth-promo-dot"),
    );

    const apply = () => {
      rafRef.current = 0;
      const rect = container.getBoundingClientRect();
      const cxLocal = cursorRef.current.x - rect.left;
      const cyLocal = cursorRef.current.y - rect.top;

      // Re-cap radius/strength to local copies so the inner loop
      // doesn't keep dereferencing the module-scope constants.
      const radius = REPEL_RADIUS;
      const strength = REPEL_STRENGTH;
      const w = rect.width;
      const h = rect.height;

      const list = dotsRef.current;
      for (let i = 0; i < list.length; i++) {
        const dot = list[i];
        const baseX = (parseFloat(dot.dataset.x) / 100) * w;
        const baseY = (parseFloat(dot.dataset.y) / 100) * h;
        const dx = baseX - cxLocal;
        const dy = baseY - cyLocal;
        const dist = Math.hypot(dx, dy);

        if (dist < radius && dist > 0) {
          const force = (1 - dist / radius) * strength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          dot.style.transform = `translate(${fx.toFixed(1)}px, ${fy.toFixed(1)}px)`;
        } else {
          dot.style.transform = "translate(0, 0)";
        }
      }
    };

    const handleMove = (e) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      if (!rafRef.current) rafRef.current = requestAnimationFrame(apply);
    };

    const handleLeave = () => {
      cursorRef.current = { x: -100000, y: -100000 };
      if (!rafRef.current) rafRef.current = requestAnimationFrame(apply);
    };

    container.addEventListener("mousemove", handleMove);
    container.addEventListener("mouseleave", handleLeave);

    return () => {
      container.removeEventListener("mousemove", handleMove);
      container.removeEventListener("mouseleave", handleLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="auth-promo-dots"
      aria-hidden="true"
    >
      {dots.map((d) => (
        <span
          key={d.id}
          className="auth-promo-dot"
          data-x={d.x}
          data-y={d.y}
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
          }}
        />
      ))}
    </div>
  );
};

export default AuthPromoDots;
