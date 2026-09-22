/**
 * Smoothly scrolls the page to an element by id, offsetting for the sticky
 * site nav (`#site-nav`) height plus a small safety gap, and updates the URL
 * hash via history.pushState once the animation finishes — never a native
 * anchor jump. Falls back to an instant scroll when the user prefers
 * reduced motion.
 */
export function smoothScrollToId(id: string, extraOffset = 20) {
  if (typeof window === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;

  const nav = document.getElementById("site-nav");
  const navRect = nav?.getBoundingClientRect();
  const navHeight = navRect ? navRect.top + navRect.height : 0;

  const destY = Math.max(
    0,
    target.getBoundingClientRect().top + window.scrollY - Math.max(navHeight, 0) - extraOffset,
  );

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    window.scrollTo(0, destY);
    history.pushState(null, "", `#${id}`);
    return;
  }

  const startY = window.scrollY;
  const distance = destY - startY;
  // Adaptive but snappy: 550ms for short hops, capped at 800ms for long ones.
  const duration = Math.min(800, Math.max(550, Math.abs(distance) * 0.35));
  const startTime = performance.now();

  function easeInOutCubic(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now: number) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    window.scrollTo(0, startY + distance * easeInOutCubic(t));
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      history.pushState(null, "", `#${id}`);
    }
  }
  requestAnimationFrame(step);
}
