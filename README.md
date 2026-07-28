# Go Fish P2P

A browser-only Go Fish game that uses **PeerJS + WebRTC** for direct player-to-player play.

## What this does

- Host creates a room code
- Other players join with that code and a username
- The game state is hosted in one player's browser
- Game traffic is sent directly over WebRTC DataChannels

PeerJS uses a signaling server to broker the connection, and by default it connects to the free PeerJS Cloud server. After the connection is established, gameplay data goes peer-to-peer. citeturn703152search0turn703152search8turn703152search10

## Files

- `index.html`
- `styles.css`
- `app.js`

## Run locally

Open `index.html` through a local web server, not as a `file://` URL.

Examples:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deploy to GitHub Pages

1. Put these files in your repository root.
2. Push to GitHub.
3. Enable GitHub Pages for the branch/folder you want to publish.

## Notes

- The host is authoritative.
- This is fine for friends, but a malicious host can still cheat because the host runs in their own browser.
- If you want true zero-signaling too, that becomes a different design and needs manual connection exchange instead of PeerJS room joining.
