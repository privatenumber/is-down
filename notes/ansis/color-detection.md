# ansis color detection

ansis decides one color level for the whole process when it is imported, from `process.stdout` only. `COLORTERM` and `CI` are checked before whether stdout is a TTY, so piped or redirected output can still be colored. Audited at [v4.4.0](https://github.com/webdiscus/ansis/blob/v4.4.0/src/color-support.js). [v4.5.0](#v450-pipes-stay-plain-ci-does-not) stops `COLORTERM` from coloring pipes, but `CI` still does.

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

Without `COLORTERM`, the same command prints `undefined 0 "x"`. Reported upstream as [webdiscus/ansis#54](https://github.com/webdiscus/ansis/issues/54) and fixed in v4.5.0 (see below). The similar inherited-`COLORTERM` case for `TERM=dumb` was fixed in v4.4.0 ([#49](https://github.com/webdiscus/ansis/issues/49)).

## v4.5.0: pipes stay plain, CI does not

[v4.5.0](https://github.com/webdiscus/ansis/blob/v4.5.0/CHANGELOG.md) fixed #54: `COLORTERM` now only picks the level once the output is known to support color. That check, in `getLevel` in [`src/color-support.js`](https://github.com/webdiscus/ansis/blob/v4.5.0/src/color-support.js), is:

```js
outputSupported = isTTY() || isCI() || detectPM2() || detectNextJs();
```

So `CI` still enables color for any output, including a pipe inside a CI job. GitHub Actions still gets truecolor. The changelog says this is intended: "Color output in supported non-TTY environments such as CI, PM2, and Next.js edge still works."

The reproduction above, with `ansis@4.5.0` and Node.js v26.13.0 on macOS (2026-11-04), `COLORTERM` unset unless shown:

| Environment, output piped to `cat` | Output |
| --- | --- |
| `COLORTERM=truecolor` | `undefined 0 "x"` |
| `CI=true GITHUB_ACTIONS=true` | `undefined 3 "\u001b[31mx\u001b[39m"` |
| `CI=true GITHUB_ACTIONS=true NO_COLOR=1` | `undefined 0 "x"` |

A CI step that captures output into a file, such as `cmd | tee log`, needs `NO_COLOR` to keep escape codes out of the file. ansis cannot tell that pipe from the one GitHub Actions uses for its log view. `.github/workflows/live.yml` sets `NO_COLOR` on the live check for this reason, because manten bundles its own copy of ansis to color test output.

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
