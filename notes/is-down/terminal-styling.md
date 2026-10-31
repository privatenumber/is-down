# Terminal styling

**Decision:** colors and styles use Node's `util.styleText`, passing the stream each text is written to. Hyperlinks use ansis `link()`, gated on `process.stdout.isTTY && ansis.isSupported()` (`linkTo` in [`src/cli/format.ts`](../../src/cli/format.ts)).

## Why `styleText` for colors

The CLI writes results to stdout and the progress view and errors to stderr. `styleText` decides color per stream on every supported Node.js version ([node/style-text.md](../node/style-text.md)), so `is-down | jq` keeps a colored progress view on the terminal while the piped results stay plain.

ansis decides once, from stdout only, and enables color in CI and when `COLORTERM` is set even for pipes ([ansis/color-detection.md](../ansis/color-detection.md)). Styling everything with ansis would color stderr by stdout's state and, until [webdiscus/ansis#54](https://github.com/webdiscus/ansis/issues/54) is resolved, put escape codes into piped output for iTerm2 and VS Code users.

## Why ansis for hyperlinks

Node has no hyperlink helper, and the alternative is writing the OSC 8 sequence inline (`\u001B]8;;URL\u0007TEXT\u001B]8;;\u0007`), which is hard to read and review. ansis is small, and the gate keeps its detection from mattering:

- `process.stdout.isTTY` keeps links out of pipes, redirected files, and CI logs, the cases where ansis enables color and `styleText` does not.
- `ansis.isSupported()` turns links off with `NO_COLOR`, and avoids ansis's `text (url)` fallback.
- Hyperlinks are only written to stdout, so ansis's stdout-only detection is the right stream.

An inline OSC 8 helper was tried and rejected for readability. Its output was byte-identical to ansis `link()`.

## When to revisit

- Revisit styling everything with ansis if the CLI needs features `styleText` lacks (themes, nested templates, truecolor with fallbacks), or if ansis gains per-stream detection and #54 is fixed.
- [`terminal-link`](https://www.npmjs.com/package/terminal-link) detects hyperlink support itself (through `supports-hyperlinks`) instead of inferring it from color support, but bundles three more packages and prints `text (url)` by default. Revisit if users report hyperlinks rendering as raw text in terminals without OSC 8 support.
