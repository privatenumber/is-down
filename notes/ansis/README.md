# ansis

Behavior of the [`ansis`](https://github.com/webdiscus/ansis) terminal color library that matters for a CLI writing to more than one stream.

- [color-detection.md](./color-detection.md): one color level per process, decided from stdout, with `COLORTERM` and `CI` checked before the TTY.
