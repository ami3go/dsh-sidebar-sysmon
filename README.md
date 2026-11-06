# Sidebar system monitor

[![ci](https://github.com/ami3go/dsh-sidebar-sysmon/actions/workflows/ci.yml/badge.svg)](https://github.com/ami3go/dsh-sidebar-sysmon/actions/workflows/ci.yml)

A Harness Web UI plugin that shows live CPU, memory, root-disk, and `/tmp` load
at the bottom of the left sidebar, in the footer strip beside the Cordis panel
action and above Settings.

- **Wide sidebar**: a 2×2 grid — `CPU ▓▓ 34%`, `MEM ▓▓ 65%`, `DISK ▓▓ 38G`,
  `TMP ▓ 7G` — in the footer strip, beside the Cordis panel action and above
  Settings.
- **Collapsed rail**: compact `CPU` / `MEM` / `DSK` / `TMP` lines.
- Hover the meter for `CPU 34% · memory 65% · disk 38.2 of 98.0 GB free · /tmp 7.1 of 7.9 GB free`.
- Bars shift accent → amber at the warning threshold → red at the critical one.
- Updates on the configured interval; pauses while the tab is hidden and keeps
  the last good sample when a request fails.
- **⋯ button** in the meter opens a quick popover with on/off switches for
  CPU, Memory, Disk, and `/tmp` — the same live values as the Settings page.
- **Settings → Plugins → System monitor** configures every parameter live.

## Settings

Everything is optional; the defaults below apply until the profile overrides a
field. Open **Settings → Plugins → System monitor** and change a control — the
write is live (no restart) and persists in the profile configuration.

| Setting | Default | Meaning |
| --- | --- | --- |
| `refreshMs` | `2000` | Poll interval in ms, 500–60000 |
| `showCpu` | `true` | Render the CPU lane |
| `showMem` | `true` | Render the memory lane |
| `showDisk` | `true` | Render the root-disk lane |
| `showTmp` | `true` | Render the `/tmp` lane |
| `diskPath` | `/` | Filesystem the DISK lane measures |
| `tmpPath` | `/tmp` | Filesystem the TMP lane measures (falls back to `os.tmpdir()`) |
| `warnPct` | `60` | Used-percent that turns a bar amber |
| `errorPct` | `85` | Used-percent that turns a bar red |

## How it works

| Half | File | Role |
| --- | --- | --- |
| Host | `index.js` | Registers the authenticated read-only route `GET /api/sysmon.load` on the shared Connection channel. CPU comes from `os.cpus()` time deltas; memory prefers `/proc/meminfo` `MemAvailable` and falls back to `os.totalmem()`/`os.freemem()` elsewhere; disk and `/tmp` capacity come from `fs.statfsSync()` (`/` and `/tmp`, falling back to `os.tmpdir()`). |
| Client | `client.js` | Registers the meter into `sidebar.footer.action` and the page into `settings.plugins.tab`, and polls the route. Writes go through the Settings domain's `configForms` service, so revisions and persistence are handled by the Host. Styles use only `--dsw-*` theme tokens; copy is localized through the `sysmon` namespace (en, zh). |

The route sits behind Connection's browser cookie, so the figures are never
exposed on an unauthenticated web route.

## Install and remove

Installed as the profile bundle `@local/sidebar-sysmon` from this directory
(linked install, so edits here are picked up after the entry restarts):

```text
plugin_manager install_bundle /path/to/dsh-sidebar-sysmon
```

Disable/hide it without uninstalling:

```text
plugin_manager set_plugin include:sidebar-sysmon false
plugin_manager set_plugin include:sidebar-sysmon true
```

Remove:

```text
plugin_manager remove_bundle @local/sidebar-sysmon
```

## Development

Install the one runtime dependency (`@deepseek-ai/schemastery`, for the Config
schema), then run the host tests:

```bash
npm install
npm test
```

The host half's route is covered by `node:test` against a stub Connection
registry, including the live re-read of volatile settings.

CI (`.github/workflows/ci.yml`) parses both halves and runs the tests on Node 20, 22, and 24.

## Notes

- The sidebar's global panel list has no insert slot, so the apps+ "More"
  launcher cannot host extra rows. This plugin uses the supported footer seat
  closest to it instead.
- CPU is the whole machine's busy share between two polls; a stale or very short
  gap triggers a fresh 150 ms measurement window.
