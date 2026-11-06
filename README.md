# Sidebar system monitor

A Harness Web UI plugin that shows live CPU and memory load at the bottom of the
left sidebar, in the footer strip beside the Cordis panel action and above
Settings.

- **Wide sidebar**: stacked `CPU ▓▓▓░ 34%` and `MEM ▓▓░░ 65%` lanes in the footer
  strip, beside the Cordis panel action and above Settings.
- **Collapsed rail**: two compact `CPU` / `MEM` lines with micro bars.
- Hover the meter for `CPU 34% · memory 65% · 5.2 of 8.0 GB`.
- Bars shift accent → amber at 60% → red at 85%.
- Updates every 2 s; pauses while the tab is hidden and keeps the last good
  sample when a request fails.

## How it works

| Half | File | Role |
| --- | --- | --- |
| Host | `index.js` | Registers the authenticated read-only route `GET /api/sysmon.load` on the shared Connection channel. CPU comes from `os.cpus()` time deltas; memory prefers `/proc/meminfo` `MemAvailable` and falls back to `os.totalmem()`/`os.freemem()` elsewhere. |
| Client | `client.js` | Registers into the `sidebar.footer.action` slot and polls the route. Styles use only `--dsw-*` theme tokens; the title is localized through the `sysmon` locale namespace (en, zh). |

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

No build step and no dependencies. The host half's route is covered by
`node:test` against a stub Connection registry:

```bash
npm test
```

CI (`.github/workflows/ci.yml`) parses both halves and runs the tests on Node 20, 22, and 24.

## Notes

- The sidebar's global panel list has no insert slot, so the apps+ "More"
  launcher cannot host extra rows. This plugin uses the supported footer seat
  closest to it instead.
- CPU is the whole machine's busy share between two polls; a stale or very short
  gap triggers a fresh 150 ms measurement window.
