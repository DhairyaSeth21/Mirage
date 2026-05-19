import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/* Occasional glitch corruption on a string */
const useGlitchText = (clean, chance = 0.01) => {
    const [text, setText] = useState(clean);
    useEffect(() => {
        const glyphs = "█▓▒░01·×┘╪╤ǝ}{<>/\\@#";
        let raf;
        const tick = () => {
            if (Math.random() < chance) {
                let frames = 0;
                const max = 5 + Math.floor(Math.random() * 6);
                const corrupt = () => {
                    if (frames++ >= max) { setText(clean); return; }
                    const out = clean.split("").map(c =>
                        c !== " " && Math.random() < 0.3
                            ? glyphs[Math.floor(Math.random() * glyphs.length)]
                            : c
                    ).join("");
                    setText(out);
                    setTimeout(corrupt, 40);
                };
                corrupt();
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [clean, chance]);
    return text;
};

const TITLE = "mirage";

const Hero = () => {
    const [revealed, setRevealed] = useState(0);
    const tagline = useGlitchText("a reverse proxy that lies", 0.012);
    const title   = useGlitchText(TITLE, 0.006);

    useEffect(() => {
        if (revealed >= TITLE.length) return;
        const t = setTimeout(() => setRevealed(n => n + 1), 160);
        return () => clearTimeout(t);
    }, [revealed]);

    const visibleTitle = title.slice(0, revealed);

    return (
        <section className="relative min-h-screen w-full flex items-center justify-center pointer-events-none">
            <div className="relative z-10 px-6 text-center">
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.4 }}
                    className="font-mono text-[9px] tracking-[0.5em] uppercase text-[var(--sand-dim)]/60 mb-5"
                >
                    ▌ classified ▐
                </motion.div>

                <h1
                    className="relative mirage-title text-[var(--sand)] text-3xl md:text-5xl select-none"
                    style={{ lineHeight: 1 }}
                >
                    <span aria-hidden className="opacity-0">{TITLE}</span>
                    <span className="absolute inset-0 flex items-center justify-center">
                        {visibleTitle}
                        {revealed < TITLE.length && (
                            <motion.span
                                className="inline-block ml-[0.05em] text-[var(--sand-dim)]"
                                animate={{ opacity: [1, 0.1, 1] }}
                                transition={{ duration: 0.7, repeat: Infinity, ease: "steps(2)" }}
                            >_</motion.span>
                        )}
                    </span>
                </h1>

                {revealed >= TITLE.length && (
                    <style>{`
                        @keyframes mirage-flicker {
                            0%, 92%, 100% { opacity: 1; transform: translateX(0); }
                            93% { opacity: 0.65; transform: translateX(-0.5px); }
                            94% { opacity: 1; transform: translateX(0.5px); }
                            95% { opacity: 0.85; }
                        }
                        h1.mirage-title > span:last-child { animation: mirage-flicker 7s infinite; }
                    `}</style>
                )}

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: revealed >= TITLE.length ? 1 : 0 }}
                    transition={{ duration: 1.4, delay: 0.3 }}
                    className="mt-8 font-mono text-[10px] tracking-[0.45em] uppercase text-[var(--sand-dim)] min-h-[1em]"
                >
                    {tagline}
                </motion.p>
            </div>
        </section>
    );
};

export default Hero;
