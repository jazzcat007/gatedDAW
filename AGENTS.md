# Repository guidance

## Encoding and Unicode

- Save text files as UTF-8. Never commit mojibake, C1 control characters, or a literal Unicode replacement character (`U+FFFD`). Run `npm run check:unicode` after changing user-visible text.
- Prefer an existing `IconSymbol`/SVG for interface icons. For small CSS-only shapes such as disclosure triangles, draw the shape with CSS instead of putting a Unicode glyph in `content`.
- When a specific symbol must live in a JavaScript/TypeScript string, use an ASCII Unicode escape (`\uXXXX` or `\u{XXXXX}`) and keep the intended code point clear from the surrounding name or comment. Use `"\uFFFD"` only when replacement-character behavior is deliberate.
- Raw Unicode is appropriate when it is the data being represented: human names and natural language, international note names, musical or mathematical labels, and tests that verify Unicode round trips. Normal punctuation in prose and comments is also fine.
- Do not replace meaningful characters such as `♯`, `°`, `μ`, `∞`, or localized text with lookalike ASCII merely to satisfy an ASCII-only preference. The integrity check targets corrupted encoding, not valid Unicode.
