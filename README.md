# Go Fish P2P

A browser-only Go Fish game that uses **PeerJS + WebRTC** for direct player-to-player play.

## What this does

- Host creates a room code
- Other players join with that code and a username
- The game state is hosted in one player's browser
- Game traffic is sent directly over WebRTC DataChannels

PeerJS uses a signaling server to broker the connection, and by default it connects to the free PeerJS Cloud server. After the connection is established, gameplay data goes peer-to-peer.

## Files

- `index.html`
- `styles.css`
- `app.js`

## Notes

- The host is authoritative.
- This is fine for friends, but a malicious host can still cheat because the host runs in their own browser.
- If you want true zero-signaling too, that becomes a different design and needs manual connection exchange instead of PeerJS room joining.
