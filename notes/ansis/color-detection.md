# ansis color detection

ansis decides one color level for the whole process when it is imported, from `process.stdout` only. `COLORTERM` and `CI` are checked before whether stdout is a TTY, so piped or redirected output can still be colored. Audited at [v4.4.0](https://github.com/webdiscus/ansis/blob/v4.4.0/src/color-support.js).

## Detection order

`autoDetectLevel` in [`src/color-support.js`](https://github.com/webdiscus/ansis/blob/v4.4.0/src/color-support.js) returns the first match:

1. `TERM=dumb`: no color.
2. `COLORTERM` is `truecolor`, `24bit`, `ansi256`, or `ansi`: that level ([lines 58-65](https://github.com/webdiscus/ansis/blob/v4.4.0/src/color-support.js#L58-L65)).
3. `CI` is set: truecolor on GitHub Actions, 16 colors elsewhere.
4. stdout is not a TTY, and not PM2 or a Next.js edge runtime: no color ([line 81](https://github.com/webdiscus/ansis/blob/v4.4.0/src/color-support.js#L81)).
5. Windows: truecolor. `TERM` containing `-256`: 256 colors. Otherwise 16 colors.

`getLevel` then applies, from highest priority: `FORCE_COLOR`, then `--color` and `--no-color` read from `process.argv`, then `NO_COLOR`.

Consequences for a CLI:

- **stderr follows stdout.** The only TTY consulted is `process.stdout`, so text written to stderr is colored by stdout's state.
- **Pipes can be colored.** iTerm2, VS Code, kitty, and Konsole set `COLORTERM` for child processes, so step 2 matches before step 4.
- **CI logs are colored** even though stdout is not a TTY.
- **It reads the host CLI's argv.** A CLI's own `--color` or `--no-color` flag changes ansis's level.

## Pipe reproduction

```sh
npm i ansis@4.4.0
cat > repro.mjs <<'JS'
import ansis from 'ansis'
console.log(process.stdout.isTTY, ansis.level, JSON.stringify(ansis.red('x')))
JS
COLORTERM=truecolor node repro.mjs | cat
```

Output on macOS with Node.js v24.22.1 (2026-10-31):

```text
undefined 3 "\u001b[31mx\u001b[39m"
```

Without `COLORTERM`, the same command prints `undefined 0 "x"`. Reported upstream as [webdiscus/ansis#54](https://github.com/webdiscus/ansis/issues/54) (open as of 2026-10-31). The similar inherited-`COLORTERM` case for `TERM=dumb` was fixed in v4.4.0 ([#49](https://github.com/webdiscus/ansis/issues/49)).

## Separate stderr instance

The constructor accepts a mock `globalThis` ([#47](https://github.com/webdiscus/ansis/issues/47), v4.3.0). Replacing `stdout` with `stderr` gives an instance that checks stderr's TTY:

```js
import { Ansis } from 'ansis'

const stderrColor = new Ansis({
    process: {
        ...process,
        stdout: process.stderr
    }
})
```

With `COLORTERM` unset, this instance reported level 0 when stderr was not a terminal and level 2 under a pseudo-terminal (`script -q /dev/null`). Steps 1-3 above still apply.

## Hyperlinks

`link(url, text)` returns the OSC 8 sequence `\x1b]8;;URL\x07TEXT\x1b]8;;\x07` when colors are enabled, and `text (url)` otherwise ([`src/index.js`](https://github.com/webdiscus/ansis/blob/v4.4.0/src/index.js)).
