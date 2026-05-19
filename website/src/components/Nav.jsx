const Nav = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-12 py-6 flex items-center justify-between mix-blend-difference">
        <span className="font-display text-base tracking-[-0.03em] text-[var(--sand)] lowercase">mirage</span>
        <a
            href="https://github.com/DhairyaSeth21/Mirage"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--sand-dim)] hover:text-[var(--sand)] transition-colors"
        >
            src ↗
        </a>
    </nav>
);

export default Nav;
