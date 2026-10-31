# OpenCode: output from long-running commands

OpenCode's shell tool reports a background command to the model when it exits. The [tools documentation](https://opencode.ai/v2/docs/tools) (V2, accessed 2026-10-31) documents no way to read a background command's output while it runs.

From the documentation's Shell section:

- Foreground: "set `timeout` in milliseconds when the default two-minute foreground timeout is not suitable."
- Background: "Background calls return immediately and notify the session when they finish; they have no timeout unless one is supplied. Large output is shortened and the complete output is retained in a managed file."

So a command that streams events until some end state delivers them all at once, when it exits. To surface an intermediate event, the command has to exit on it.
