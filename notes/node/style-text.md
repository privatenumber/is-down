# `util.styleText` color decisions

`util.styleText(format, text, { stream })` decides whether to emit color for the stream passed in `options.stream` (default `process.stdout`), on every call. Since v22.8.0 and v20.18.0 it respects the stream's TTY state and `NO_COLOR`, `NODE_DISABLE_COLORS`, and `FORCE_COLOR`.

## Version boundary

The [`util.styleText` history](https://nodejs.org/api/util.html#utilstyletextformat-text-options) (v26.13.0 docs) lists: "v22.8.0, v20.18.0: Respect isTTY and environment variables such as NO_COLOR, NODE_DISABLE_COLORS, and FORCE_COLOR." The history implies that earlier versions emit escape codes regardless of the stream; this was not tested. is-down requires Node.js `>=22.8` (`package.json#engines`), so every supported version decides per stream.

## Decision logic

In v26.13.0, `styleText` calls `shouldColorize(stream)` from [`lib/internal/util/colors.js`](https://github.com/nodejs/node/blob/v26.13.0/lib/internal/util/colors.js):

```text
shouldColorize(stream) {
  if (process.env.FORCE_COLOR !== undefined) {
    return lazyInternalTTY().getColorDepth() > 2;
  }
  return stream?.isTTY && (
    typeof stream.getColorDepth === 'function' ?
      stream.getColorDepth() > 2 : true);
},
```

A non-TTY stream is plain unless `FORCE_COLOR` is set. `COLORTERM` and `CI` do not enable color for a pipe, unlike [ansis](../ansis/color-detection.md). With `COLORTERM=truecolor` and stdout piped, `styleText('red', 'x')` printed plain `x` on Node.js v24.22.1 (2026-10-31).

`tty.WriteStream#hasColors()` uses the same `getColorDepth()`, so `process.stdout.isTTY && process.stdout.hasColors()` matches `styleText`'s decision for stdout when `FORCE_COLOR` is unset.
