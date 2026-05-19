import { useEffect, useState } from "react";

const FRAGMENTS = [
    "GET /users/4271 → 200 OK · {id: 9421, ...}",
    "// you are seeing what you should not see",
    "decoy injected · idx=07 · session=··",
    "list_order: permuted",
    "field_mutation: applied",
    "pressure = 0.84 · level 3",
    "ja3 :: 6f9a··d2··ce",
    "GET /orders/$ID → · degraded",
    "the model is lying back",
    "404 → suppressed",
    "client thinks: success",
    "extraction_accuracy ↓ 71.3%",
    "watchpoint armed",
    "// nothing here is real",
    "trace marker embedded · b7a4··",
    "they cannot tell",
];

const positions = [
    { top: "14%", left:  "3%", align: "left"  },
    { top: "32%", right: "3%", align: "right" },
    { top: "62%", left:  "3%", align: "left"  },
    { top: "78%", right: "3%", align: "right" },
    { top: "47%", left:  "3%", align: "left"  },
    { top: "22%", right: "3%", align: "right" },
];

const Whisper = ({ slot, position }) => {
    const [text, setText] = useState("");
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let mounted = true;
        let timer;
        const cycle = () => {
            const next = FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)];
            if (!mounted) return;
            setText(next);
            setVisible(true);
            timer = setTimeout(() => {
                if (!mounted) return;
                setVisible(false);
                timer = setTimeout(cycle, 1200 + Math.random() * 2200);
            }, 2400 + Math.random() * 2400);
        };
        timer = setTimeout(cycle, slot * 900 + Math.random() * 1500);
        return () => { mounted = false; clearTimeout(timer); };
    }, [slot]);

    return (
        <div
            className="absolute font-mono text-[10px] tracking-wider text-[var(--sand-dim)] pointer-events-none select-none whitespace-nowrap"
            style={{
                ...position,
                opacity: visible ? 0.55 : 0,
                transition: "opacity 1.6s ease",
                textAlign: position.align,
            }}
        >
            <span className="opacity-60 mr-2">›</span>{text}
        </div>
    );
};

const Whispers = () => (
    <div className="absolute inset-0 z-[5] pointer-events-none">
        {positions.map((p, i) => <Whisper key={i} slot={i} position={p} />)}
    </div>
);

export default Whispers;
