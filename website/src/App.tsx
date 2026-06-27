"use client";

import { MotionConfig } from "motion/react";
import { SmoothScroll } from "./providers/SmoothScroll";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { ProductNarrative } from "./components/ProductNarrative";
import { Download } from "./components/Download";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <SmoothScroll>
        <div className="site">
          <Nav />
          <main>
            <Hero />
            <ProductNarrative />
            <Download />
          </main>
          <Footer />
        </div>
      </SmoothScroll>
    </MotionConfig>
  );
}
