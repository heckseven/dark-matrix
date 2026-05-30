# Notification Styles

dark-matrix displays notifications from multiple sources (desktop apps, EC switches, VM events, Claude activity, manual triggers). Each source can be configured with a display style, composite mode, and optional asset.

## Sources

| Source | Description |
|---|---|
| `desktop-notification` | System desktop notifications via D-Bus |
| `ec-switch` | Embedded controller events (mic/cam mute) |
| `vm` | VM start/stop events |
| `claude` | Claude agent and tool activity |
| `manual` | Manually triggered via socket |

## Styles

| Style | Description |
|---|---|
| `scroll` | Scrolling text — the default |
| `image` | Static image (PNG, JPEG, BMP) displayed for `durationMs` |
| `gif` | Animated GIF looped for `durationMs` |
| `dmx` | DMX animation file (`.dmx.json`) played for `durationMs` |
| `none` | Suppress — show nothing |

## Composite modes

| Mode | Description |
|---|---|
| `replace` | Stop current animation, show notification, then resume. Default. |
| `overlay` | Blend notification pixels over the running animation (HUD, etc.) |

Blend function: additive clamp — `min(255, base + overlay)`. BW and grayscale both use the same function.

For `scroll` overlay: text is rendered into the bottom 8 rows of each panel.

## Asset directory

Assets live at `~/.config/dark-matrix/assets/`. Rules reference filenames only (no path separators).

```
~/.config/dark-matrix/assets/
  alert.gif
  reminder.dmx.json
  slack-icon.png
```

Supported formats:
- `.png`, `.jpg`, `.jpeg`, `.bmp` — loaded as grayscale frames
- `.gif` — animated via sharp; loops for the configured duration
- `.dmx.json` — DMX animation projects from the deck

## Configuration

Rules live in `~/.config/dark-matrix/config.json` under `notification_rules`. First match wins; the default when no rule matches is `scroll + replace`.

### Rule schema

```json
{
  "source": "desktop-notification",
  "app_name_glob": "Slack",
  "urgency": "normal",
  "content_glob": null,
  "animation": "scroll",
  "asset_path": null,
  "composite": "replace",
  "duration_ms_override": null
}
```

| Field | Type | Description |
|---|---|---|
| `source` | string (optional) | Match by source. Omit to match all sources. |
| `app_name_glob` | string (optional) | Glob matched against notification app name. Only applies when `source=desktop-notification`. |
| `urgency` | string (optional) | `low`, `normal`, `critical`, or `any`. Only applies when `source=desktop-notification`. |
| `content_glob` | string (optional) | Glob matched against the intent content string. Applies to all sources. |
| `animation` | string (required) | Display style: `scroll`, `image`, `gif`, `dmx`, or `none`. |
| `asset_path` | string (optional) | Asset filename relative to the assets directory. Required for `image`, `gif`, `dmx`. |
| `composite` | string (optional) | `replace` or `overlay`. Defaults to `replace`. |
| `duration_ms_override` | number (optional) | Override the default display duration in milliseconds. |

### Examples

Suppress all VM events:
```json
{ "source": "vm", "animation": "none" }
```

EC switch overlay scroll (mic/cam mute shows over HUD):
```json
{ "source": "ec-switch", "animation": "scroll", "composite": "overlay" }
```

Slack critical notifications get a GIF for 8 seconds:
```json
{
  "source": "desktop-notification",
  "app_name_glob": "Slack",
  "urgency": "critical",
  "animation": "gif",
  "asset_path": "alert.gif",
  "duration_ms_override": 8000
}
```

All other desktop notifications scroll (replace):
```json
{ "source": "desktop-notification", "app_name_glob": "*", "animation": "scroll" }
```

Image overlay for any notification matching a content pattern:
```json
{
  "content_glob": "Build failed*",
  "animation": "image",
  "asset_path": "red-cross.png",
  "composite": "overlay",
  "duration_ms_override": 5000
}
```

## Testing

The deck's Notifications tab has a test panel that fires a synthetic desktop notification and shows which rule matched. The `notify-test` socket command supports additional override fields for ad-hoc style testing:

```json
{
  "cmd": "notify-test",
  "appName": "test",
  "summary": "test notification",
  "style": "gif",
  "assetPath": "alert.gif",
  "composite": "overlay",
  "durationMsOverride": 3000
}
```

Override fields take priority over config rules. Omit them to use the configured routing.

## Backwards compatibility

Rules written before this feature (with only `app_name_glob`, `urgency`, and `animation: 'scroll'|'dmx'|'none'`) continue to work unchanged. `dmx_path` is accepted in stored rules but not surfaced in the new UI — use `asset_path` for new rules.
