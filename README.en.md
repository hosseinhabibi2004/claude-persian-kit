# Persian font & RTL plugin for Claude Desktop and Claude Code

[فارسی](README.md) · English

[![CI](https://github.com/hosseinhabibi2004/claude-persian-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/hosseinhabibi2004/claude-persian-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Persian text in Claude looks wrong in three ways: the font is not made for Persian, mixed Persian/English lines
jump around, and Persian written by the model often has the wrong letters or no half-spaces. This kit fixes the
three, in the places a plugin can reach, and tells you plainly where it cannot.

> **Status: v0.1.0.** The mods are tested in CI on macOS, Linux and Windows. The Claude Desktop patcher
> (macOS, Linux) is tested against fixtures and stand-in apps, **not yet against a real Claude Desktop** by the
> author. Please report what you see. Windows has the mods only; its patcher is not in this version.

## What is in it

| Plugin | What it does |
|---|---|
| `persian-writing` | Adds a short section to Claude's system prompt so it writes correct Persian: half-space (ZWNJ) in `می‌خواهم`, `کتاب‌ها`; Persian `ی` and `ک`, never Arabic `ي` and `ك`; optionally Persian digits and `«»` quotes. `/persian` shows or changes the options. |
| `persian-fonts` | Chooses the Persian font: Vazirmatn (bundled) or any font installed on your computer. Only Arabic-script characters use it; code, monospace and Latin text keep their own font. `/persian-font` shows or sets it. |
| `persian-rtl` | Owns the patcher and the `/persian-patch` command. The patched Claude Desktop gets per-paragraph direction, mixed Persian/English lines, lists, tables and the input box, with math and code kept left-to-right. |
| `persian-kit` | Installs the three above. (Plugin names starting with `claude-` are reserved, so it is not called `claude-persian-kit`.) |

### Why a patch at all

A plugin cannot restyle the chat transcript in Claude Desktop. Fonts and direction inside messages need a small
script inside the app's own renderer. `/persian-patch` builds a **separate, patched copy** of Claude Desktop with
that script; your original app is never modified.

## Install

**In Claude Desktop:** click **+** next to the prompt box → **Plugins** → **Add marketplace**:

```
hosseinhabibi2004/claude-persian-kit
```

then add **persian-kit** (or only the plugins you want).

**In a terminal:**

```bash
claude plugin marketplace add hosseinhabibi2004/claude-persian-kit
claude plugin install persian-kit@claude-persian-kit
```

Inside a running session: `/plugin install persian-kit --marketplace hosseinhabibi2004/claude-persian-kit`.

### Patch Claude Desktop (macOS, Linux)

```
/persian-patch install
```

It prints the risks and changes nothing. Read them, then run the same command with `--confirm` (within 15 minutes):

```
/persian-patch install --confirm
```

Other commands: `/persian-patch status`, `/persian-patch uninstall`, `/persian-patch font "B Nazanin"`.
`install` needs Node.js 18 or newer. If the command cannot be run from inside Claude, it prints the exact
command line to run in your own terminal.

**After every Claude Desktop update, run `install` again:** Anthropic's updater only updates the original app.

## Per operating system

### macOS

- Creates `~/Applications/Claude-Persian.app` from `/Applications/Claude.app`. No sudo. The original is untouched.
- Needs **Node.js** and the **Xcode command line tools** (`xcode-select --install`, for `codesign`).
- The copy is signed with a local, *ad hoc* signature, so:
  - **Gatekeeper** may warn on first start: right-click the app → **Open** (or System Settings → Privacy &
    Security → **Open Anyway**).
  - **Keychain**: macOS asks once whether "Claude Safe Storage" may be used, because the signature differs
    from the original's. This is expected.
- Quit the original Claude before opening the copy: they share your login and settings.
- Remove: `/persian-patch uninstall`, or delete `~/Applications/Claude-Persian.app`.

### Linux (experimental)

- Anthropic does not ship an official Claude Desktop for Linux. The installer looks for an Electron build you
  already have and **says so clearly when it finds none** (nothing is changed then).
- Recognised: an installed **deb or rpm** (under `/opt`, `/usr/lib`, `/usr/share`), a **Flatpak** or **Snap**,
  an **AppImage** (`~/Applications`, `~/Downloads`, ...), or a community package. Point to one yourself with
  `patch-linux.sh install --path <folder | app.asar | file.AppImage>`.
- It copies the install to `~/.local/share/claude-persian-kit/Claude-Persian`, patches the copy, and adds a
  `claude-persian` launcher and an app-menu entry. The original is untouched.
- A copied Electron app may lack the setuid sandbox helper. If it does not start, reinstall with
  `--no-sandbox` (this turns Electron's sandbox off for the copy; the choice is yours).
- **Claude Code in a terminal works on Linux with the mods alone**, no patch needed.

### Windows

- **Mods:** `persian-writing`, `persian-fonts` and `persian-rtl` install and run the same as everywhere.
- **Patcher:** not in v0.1.0. `/persian-patch` says so and runs nothing. That also means there is no PowerShell
  script yet, so nothing about PowerShell versions or execution policy applies in this version.

## What works where

Legend: ✅ works, tested in CI · 🧪 built and tested against fixtures, not yet confirmed on a real Claude Desktop
· ➖ not something a plugin can do · ❌ not in v0.1.0.

| Feature | Desktop Chat | Desktop Code | Terminal | VS Code |
|---|---|---|---|---|
| Claude writes correct Persian (`persian-writing`, `/persian`) | ➖ plugins do not run in Chat | ✅ | ✅ | ✅ (same engine as the terminal) |
| Persian font in messages (`persian-fonts` + patch) | 🧪 macOS, Linux · ❌ Windows | 🧪 macOS, Linux · ❌ Windows | ➖ the terminal draws it | ➖ see below |
| Direction per paragraph, mixed lines, lists, tables | 🧪 macOS, Linux · ❌ Windows | 🧪 macOS, Linux · ❌ Windows | ➖ | ➖ |
| Input box follows the text | 🧪 macOS, Linux · ❌ Windows | 🧪 macOS, Linux · ❌ Windows | ➖ | ➖ |
| Math and code stay left-to-right | 🧪 | 🧪 | ➖ | ➖ |
| Views that already set `dir` themselves are left alone | 🧪 | 🧪 | ➖ | ➖ |

| Operating system | Mods | Desktop patcher |
|---|---|---|
| macOS | ✅ | 🧪 |
| Linux | ✅ | 🧪 experimental |
| Windows | ✅ | ❌ |

## Terminal and VS Code

In a terminal, Claude Code is drawn by the **terminal's own font and text engine**. A plugin cannot change either.
What you can do:

1. **Set a font that has Persian letters.** Most monospace fonts do not. Use a font with Arabic-script glyphs,
   or a fallback list so only Persian characters come from Vazirmatn (it is not monospace, so spacing can look
   uneven in a grid):
   - **Terminal.app:** Settings → Profiles → Text → Font.
   - **iTerm2:** Settings → Profiles → Text → Font (and the non-ASCII font).
   - **GNOME Terminal:** Preferences → your profile → Text → Custom font.
   - **Konsole:** Settings → Edit Current Profile → Appearance → Font.
   - **Windows Terminal:** Settings → your profile → Appearance → Font face.
   - **kitty:** `symbol_map U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF Vazirmatn` in `kitty.conf`.
   - **VS Code integrated terminal:** `"terminal.integrated.fontFamily": "'Your Mono Font', 'Vazirmatn'"`.
2. **Bidi (right-to-left ordering) is a terminal feature, and most terminals do not have it.** Without it,
   Persian text can appear with the letters of a line in the wrong order or unjoined. Whether your terminal
   supports it, and how to turn it on, is in its own documentation; at the time of writing this kit could not
   confirm it for every terminal, so we do not list a setting we have not verified. A recent iTerm2 has been
   reported to have an experimental right-to-left option under Settings → General → Experimental.
3. **VS Code:** the integrated terminal is a terminal (above). The Claude Code extension's own panel is not
   patched by this kit in v0.1.0. `persian-writing` works in both.

If reading Persian in the terminal is painful, Claude Desktop with the patch is the better place for it.

## Troubleshooting

| Problem | What to do |
|---|---|
| `/persian-patch` says Node.js is missing | Install Node.js 18+ from <https://nodejs.org> and run it again. |
| macOS: "cannot be opened" / "damaged" | Right-click the copy → Open, or System Settings → Privacy & Security → Open Anyway. |
| macOS asks for a Keychain password | Expected once for the copy ("Claude Safe Storage"). |
| The copy opens the original instead | Quit the original Claude first; both share one profile. |
| Nothing changed in the chat | Open **Claude Persian** (not the original). `status` shows whether the copy is patched. |
| Persian looks the same after `font` | The font must be installed on the computer, and the name must match. Vazirmatn is built in. |
| Claude Desktop updated, patch gone | Run `/persian-patch install --confirm` again. |
| Linux: "no installation found" | There is no official Linux build. Use `--path` with a build you have, or just use Claude Code in the terminal. |
| Linux: the copy does not start | Reinstall with `--no-sandbox` (see above). |
| Code or math looks mirrored | Please open an issue with a screenshot and the text. |

## Development

```bash
npm ci
npm run test:unit    # pure logic, jsdom, installers (node:test)
npm run test:mods    # claude plugin test for each mod
npm run validate     # claude plugin validate --strict for the marketplace and each plugin
npm run typecheck    # tsc
npm run sync         # copy patcher/ and fonts/ into the plugins (CI runs sync:check)
```

Layout: `.claude-plugin/marketplace.json`; `plugins/*` (the four plugins); `patcher/src/persian-rtl.js` (the one
script: pure detection plus a thin DOM layer), `patcher/src/*.cjs` (ASAR, plist and payload tools),
`patcher/patch-mac.sh`, `patcher/patch-linux.sh`; `fonts/` (Vazirmatn and its licence). An installed plugin only
receives its own folder, so `scripts/sync-assets.mjs` copies the patcher and the font into `persian-rtl` and
`persian-fonts`.

Type-checking uses Claude Code's own declaration file when you place it at `typings/claude-code/index.d.ts`
(Claude Code writes it next to a mod it loads); otherwise it uses a small stub in `types/`.

## Disclaimer

This is an unofficial project. It is not affiliated with or endorsed by Anthropic. The patcher modifies a **copy**
of Claude Desktop (re-signing it on macOS); that may not agree with Anthropic's terms of service, can stop
working with any Claude Desktop update, and is used at your own risk. The software is provided "as is", without
warranty of any kind (see [LICENSE](LICENSE)).

## Acknowledgements

Ideas learned from other projects (no code was copied; everything here is written from scratch):

- [shraga100/claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch): patching the app's
  `app.asar` renderer code, the `unicode-range` approach to a custom font, and leaving views that already handle
  RTL natively alone.
- [soguy/claude-desktop-rtl-mac](https://github.com/soguy/claude-desktop-rtl-mac): patching a separate copy of the
  app on macOS, ad hoc re-signing, the Keychain prompt, and keeping the script out of the main process.
- [mhghotbi/claude-desktop-rtl](https://github.com/mhghotbi/claude-desktop-rtl): the Persian use case, and
  embedding Vazirmatn into the page as a `data:` URI because of the app's content-security policy.
- [DavidiBellaire/Claude-UniMath](https://github.com/DavidiBellaire/Claude-UniMath): keeping math as a
  left-to-right island inside right-to-left text, the currency guard (`$5` is not LaTeX), and testing the logic.
- [Esi-Abolfazl/skills](https://github.com/Esi-Abolfazl/skills): how a plugin marketplace and a mod are laid out.

## License

MIT, copyright hosseinhabibi2004 ([LICENSE](LICENSE)). The only third-party asset is the
[Vazirmatn](https://github.com/rastikerdar/vazirmatn) font, under the SIL Open Font License 1.1
([fonts/OFL.txt](fonts/OFL.txt)).
