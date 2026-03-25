# LyricTab v2 – YouTube Lyrics in Side Panel

Opens a MetaMask-style side panel with lyrics for the YouTube video you're watching.

## Install (Developer Mode)

1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select this `lyrictab/` folder
4. Pin the extension to your toolbar

## Usage

1. Open any YouTube video
2. Click the **LyricTab** toolbar button
3. The side panel opens and auto-detects the song
4. Lyrics appear automatically — or edit the fields and hit **Find Lyrics**

## Files

```
lyrictab/
├── manifest.json     ← MV3 config with sidePanel permission
├── background.js     ← Service worker: opens panel, injects script, relays title
├── sidepanel.html    ← The side panel UI
├── sidepanel.js      ← Lyrics logic: parse title, fetch, display
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Permissions

| Permission   | Why |
|---|---|
| `activeTab`  | Read current tab URL/title |
| `tabs`       | Query open tabs |
| `sidePanel`  | Open Chrome's native side panel |
| `scripting`  | Inject script to get accurate YouTube title from DOM |
| `host_permissions: youtube.com` | Required for scripting injection |

## Lyrics API

Uses [lyrics.ovh](https://lyrics.ovh) — free, no API key.
Falls back to a Genius search link if lyrics aren't found.
