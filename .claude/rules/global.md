# Global rules — all agents follow these

1. Write tests before implementation. No exceptions.
2. Import all thresholds and config values from src/config.js. Never hardcode numbers.
3. Run `npm test` before committing. All tests must pass.
4. Every public function has a JSDoc comment.
5. Use descriptive variable names. No abbreviations.
6. ES modules only (import/export).
7. Async/await for all async operations.
8. Handle errors explicitly — never swallow them silently.
9. Log decisions at key points so the evaluation dashboard can trace what happened.
10. Keep dependencies minimal. Don't add packages without justification.
