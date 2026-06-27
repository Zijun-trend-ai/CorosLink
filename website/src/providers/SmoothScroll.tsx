import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * Wraps the app in Lenis smooth (inertia) scrolling. Skipped entirely when the
 * user prefers reduced motion — native scrolling takes over and all scroll-linked
 * Framer Motion animations still work because Lenis drives the real window scroll.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      anchors: { offset: -72 }, // account for the fixed nav height
    });

    document.documentElement.classList.add("lenis-active");
    (window as unknown as { lenis?: Lenis }).lenis = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      document.documentElement.classList.remove("lenis-active");
    };
  }, [reduced]);

  return <>{children}</>;
}
