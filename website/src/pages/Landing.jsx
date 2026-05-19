import { Suspense, lazy } from "react";
import Nav from "../components/Nav";
import Hero from "../components/Hero";
import Whispers from "../components/Whispers";

const MirageScene = lazy(() => import("../components/MirageScene"));

const Landing = () => {
    return (
        <main className="bg-[var(--obsidian)] text-[var(--sand)] h-screen overflow-hidden">
            <Nav />

            <div className="relative w-full h-screen overflow-hidden">
                <Suspense fallback={<div className="absolute inset-0 bg-[var(--obsidian)]" />}>
                    <MirageScene />
                </Suspense>

                {/* Vignette */}
                <div
                    className="absolute inset-0 pointer-events-none z-[3]"
                    style={{ background:"radial-gradient(ellipse at center, transparent 30%, rgba(6,6,6,0.9) 95%)" }}
                />

                {/* Scanline overlay */}
                <div
                    className="absolute inset-0 pointer-events-none z-[4] opacity-[0.06] mix-blend-overlay"
                    style={{ backgroundImage:"repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 3px)" }}
                />

                {/* Slow moving scan band */}
                <div className="absolute inset-x-0 h-32 z-[4] pointer-events-none scan-band" />

                {/* Watching indicator */}
                <div className="absolute top-6 right-32 z-[6] font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--sand-dim)] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/80 pulse-dot" />
                    <span>watching</span>
                </div>

                {/* Corner readouts */}
                <div className="absolute bottom-6 left-6 z-[6] font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--sand-dim)]/70">
                    34.0522°N · 118.2437°W · t+<span className="text-[var(--sand)]/70">0×∞</span>
                </div>
                <div className="absolute bottom-6 right-6 z-[6] font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--sand-dim)]/70">
                    pressure :: <span className="text-[var(--sand)]/70">0.84</span>
                </div>

                <Whispers />
                <Hero />
            </div>
        </main>
    );
};

export default Landing;
