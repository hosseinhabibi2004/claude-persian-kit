# persian-rtl

Right-to-left fixes for Persian in Claude Desktop. This plugin owns the patcher and the `/persian-patch` command
(`install`, `status`, `uninstall`, `font <name>`). The patch builds a separate copy of Claude Desktop whose chat gets
per-paragraph direction, mixed Persian/English lines, lists, tables and the input box, with math and code kept
left-to-right. It asks for explicit consent first and never modifies the original app. macOS and Linux (experimental) in
v0.1.0; on Windows the command explains that the patcher is not included yet.

Part of [claude-persian-kit](../../README.en.md) ([فارسی](../../README.md)). MIT.
