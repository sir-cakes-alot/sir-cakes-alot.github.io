/* Go Fish P2P
   Host-authoritative Go Fish over PeerJS/WebRTC.
*/

const ROOM_PREFIX = 'gf-';
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['♠','♥','♦','♣'];
const CARD_SUITS = ['S','H','D','C'];
const STARTING_HAND_2_TO_3 = 7;
const STARTING_HAND_4_PLUS = 5;

const $ = (id) => document.getElementById(id);

const ui = {
  setupPanel: $('setupPanel'),
  usernameInput: $('usernameInput'),
  roomInput: $('roomInput'),
  createBtn: $('createBtn'),
  joinBtn: $('joinBtn'),
  connStatus: $('connStatus'),
  peerIdOut: $('peerIdOut'),
  roomOut: $('roomOut'),
  lobbyList: $('lobbyList'),
  startBtn: $('startBtn'),
  turnBadge: $('turnBadge'),
  turnOut: $('turnOut'),
  deckOut: $('deckOut'),
  booksOut: $('booksOut'),
  askPanel: $('askPanel'),
  targetSelect: $('targetSelect'),
  rankSelect: $('rankSelect'),
  askBtn: $('askBtn'),
  hand: $('hand'),
  handHint: $('handHint'),
  log: $('log'),
  copyRoomBtn: $('copyRoomBtn'),
};

const state = {
  peer: null,
  conn: null,
  isHost: false,
  roomCode: '',
  me: {
    id: null,
    username: '',
  },
  hostId: null,
  players: [],
  started: false,
  turnId: null,
  deckCount: 0,
  yourHand: [],
  yourBooks: 0,
  lastWinner: null,
  error: '',
  pendingConnections: new Map(),
};

const hostState = {
  deck: [],
  players: new Map(),   // id -> { id, username, conn, hand: [], books: 0, connected: true }
  order: [],
  started: false,
  turnIndex: 0,
  logs: [],
  roomCode: '',
};

function sanitizeName(name) {
  const n = (name || '').trim().replace(/\s+/g, ' ');
  return n.slice(0, 20) || 'Player';
}

function makeRoomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function hostPeerIdFromRoom(room) {
  return `${ROOM_PREFIX}${room.toLowerCase()}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createDeck() {
  const deck = [];
  for (const rank of RANKS) {
    for (const suit of CARD_SUITS) deck.push(`${rank}${suit}`);
  }
  return shuffle(deck);
}

function rankOf(card) {
  return card.slice(0, card.length - 1);
}

function suitSymbol(card) {
  const suit = card.slice(-1);
  const idx = CARD_SUITS.indexOf(suit);
  return SUITS[idx] || suit;
}

function cardSortValue(card) {
  const rank = rankOf(card);
  const suit = card.slice(-1);
  return RANKS.indexOf(rank) * 10 + CARD_SUITS.indexOf(suit);
}

function ensureUniqueName(baseName, existingNames) {
  let name = baseName;
  let n = 2;
  const taken = new Set(existingNames.map(s => s.toLowerCase()));
  while (taken.has(name.toLowerCase())) {
    name = `${baseName} #${n++}`;
  }
  return name;
}

function addLog(msg, kind = '') {
  const line = document.createElement('div');
  line.className = `log-line ${kind}`.trim();
  line.textContent = msg;
  ui.log.prepend(line);
  while (ui.log.children.length > 60) ui.log.removeChild(ui.log.lastChild);
}

function setStatus(text) {
  ui.connStatus.textContent = text;
}

function setRoom(code) {
  state.roomCode = code || '';
  ui.roomOut.textContent = code || '—';
  ui.copyRoomBtn.disabled = !code;
}

function setPeerId(id) {
  ui.peerIdOut.textContent = id || '—';
}

function isConnected() {
  return state.peer && (state.isHost ? true : state.conn && state.conn.open);
}

function sendToConn(conn, message) {
  if (!conn || !conn.open) return;
  conn.send(message);
}

function sendToClient(playerId, message) {
  const p = hostState.players.get(playerId);
  if (p && p.conn && p.conn.open) p.conn.send(message);
}

function broadcast(message) {
  for (const p of hostState.players.values()) {
    if (p.conn && p.conn.open) p.conn.send(message);
  }
}

function publicPlayerList() {
  return state.players.map(p => ({
    id: p.id,
    username: p.username,
    cards: p.cards,
    books: p.books,
    isHost: p.id === state.hostId,
  }));
}

function hostPublicPlayerList() {
  return [...hostState.players.values()].map(p => ({
    id: p.id,
    username: p.username,
    cards: p.hand.length,
    books: p.books,
    isHost: p.id === state.hostId,
    connected: !!(p.conn && p.conn.open),
  }));
}

function currentTurnPlayer() {
  if (!state.turnId) return null;
  return state.players.find(p => p.id === state.turnId) || null;
}

function nextTurnIdFromOrder(order, startIndex) {
  if (!order.length) return null;
  for (let i = 0; i < order.length; i++) {
    const idx = (startIndex + i) % order.length;
    const pid = order[idx];
    const player = hostState.players.get(pid);
    if (player && player.hand.length > 0) return pid;
  }
  return null;
}

function nextLivingTurnIndex(fromIndex = hostState.turnIndex + 1) {
  if (!hostState.order.length) return 0;
  for (let i = 0; i < hostState.order.length; i++) {
    const idx = (fromIndex + i) % hostState.order.length;
    const pid = hostState.order[idx];
    const p = hostState.players.get(pid);
    if (p && p.hand.length > 0) return idx;
  }
  return fromIndex % hostState.order.length;
}

function countRanks(hand) {
  const counts = new Map();
  for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) || 0) + 1);
  return counts;
}

function removeBooksFromPlayer(player) {
  let removed = 0;
  const counts = countRanks(player.hand);
  for (const [rank, count] of counts.entries()) {
    if (count === 4) {
      player.hand = player.hand.filter(c => rankOf(c) !== rank);
      player.books += 1;
      removed += 1;
      addLog(`${player.username} completed a book of ${rank}s.`, 'good');
    }
  }
  return removed;
}

function dealStartingHands(numPlayers) {
  const per = numPlayers <= 3 ? STARTING_HAND_2_TO_3 : STARTING_HAND_4_PLUS;
  for (const pid of hostState.order) {
    const p = hostState.players.get(pid);
    p.hand = [];
    p.books = 0;
    for (let i = 0; i < per; i++) {
      if (hostState.deck.length) p.hand.push(hostState.deck.pop());
    }
    p.hand.sort((a, b) => cardSortValue(a) - cardSortValue(b));
    removeBooksFromPlayer(p);
  }
}

function syncHostView() {
  state.started = hostState.started;
  state.players = hostPublicPlayerList();
  state.hostId = state.me.id;
  state.turnId = hostState.started ? hostState.order[hostState.turnIndex] || null : null;
  state.deckCount = hostState.deck.length;
  state.yourBooks = hostState.players.get(state.me.id)?.books || 0;
  state.yourHand = [...(hostState.players.get(state.me.id)?.hand || [])].sort((a, b) => cardSortValue(a) - cardSortValue(b));
  render();
}

function makeViewFor(playerId) {
  const me = hostState.players.get(playerId);
  return {
    type: 'state',
    roomCode: hostState.roomCode,
    hostId: state.hostId,
    started: hostState.started,
    turnId: hostState.started ? hostState.order[hostState.turnIndex] || null : null,
    deckCount: hostState.deck.length,
    players: hostPublicPlayerList(),
    yourHand: me ? [...me.hand].sort((a,b) => cardSortValue(a) - cardSortValue(b)) : [],
    yourBooks: me ? me.books : 0,
    logs: hostState.logs.slice(-8),
    winner: hostState.winner || null,
  };
}

function syncAllClients() {
  for (const p of hostState.players.values()) {
    sendToClient(p.id, makeViewFor(p.id));
  }
  syncHostView();
}

function isGameOver() {
  if (!hostState.started) return false;
  const anyCards = [...hostState.players.values()].some(p => p.hand.length > 0);
  const deckEmpty = hostState.deck.length === 0;
  return deckEmpty && !anyCards;
}

function scoreBoard() {
  return [...hostState.players.values()]
    .map(p => ({ username: p.username, books: p.books }))
    .sort((a, b) => b.books - a.books || a.username.localeCompare(b.username));
}

function endGame() {
  hostState.started = false;
  const scores = scoreBoard();
  const top = scores[0]?.books ?? 0;
  const winners = scores.filter(s => s.books === top).map(s => s.username);
  const winnerText = winners.length === 1 ? winners[0] : winners.join(', ');
  hostState.winner = winnerText;
  hostState.logs.push(`Game over. Winner: ${winnerText}`);
  broadcast({ type: 'game_over', scores, winner: winnerText });
  syncAllClients();
  addLog(`Game over. Winner: ${winnerText}`, 'good');
}

function advanceTurn(skipToNext = true) {
  if (!hostState.order.length) return;
  if (hostState.started) {
    if (skipToNext) {
      hostState.turnIndex = nextLivingTurnIndex(hostState.turnIndex + 1);
    } else {
      hostState.turnIndex = nextLivingTurnIndex(hostState.turnIndex);
    }
    hostState.turnIndex %= hostState.order.length;
  }
}

function maybeAutoDrawIfEmptyTurnPlayer() {
  const pid = hostState.order[hostState.turnIndex];
  const p = hostState.players.get(pid);
  if (!p) return;
  if (p.hand.length === 0 && hostState.deck.length > 0) {
    const drawn = hostState.deck.pop();
    p.hand.push(drawn);
    p.hand.sort((a, b) => cardSortValue(a) - cardSortValue(b));
    addLog(`${p.username} had no cards and drew a card to continue.`);
    removeBooksFromPlayer(p);
  }
}

function startGame() {
  if (!state.isHost) return;
  if (hostState.started) return;
  if (hostState.players.size < 2) {
    addLog('Need at least 2 players to start.', 'bad');
    return;
  }
  hostState.deck = createDeck();
  hostState.started = true;
  hostState.turnIndex = 0;
  hostState.winner = null;
  hostState.logs.push('Game started.');
  dealStartingHands(hostState.players.size);
  hostState.order = [...hostState.players.keys()];
  hostState.turnIndex = 0;
  maybeAutoDrawIfEmptyTurnPlayer();
  syncAllClients();
  addLog('Game started.', 'good');
}

function hostSendLobby() {
  const list = [...hostState.players.values()].map(p => ({
    id: p.id,
    username: p.username,
    cards: p.hand.length,
    books: p.books,
    isHost: p.id === state.me.id,
  }));
  broadcast({
    type: 'lobby',
    roomCode: hostState.roomCode,
    hostId: state.me.id,
    players: list,
    started: hostState.started,
  });
}

function renderLobby() {
  ui.lobbyList.innerHTML = '';
  const players = state.players.length ? state.players : [];
  if (!players.length) {
    const empty = document.createElement('div');
    empty.className = 'player-row';
    empty.innerHTML = '<div>No players yet</div><div class="meta">Waiting for connections</div>';
    ui.lobbyList.appendChild(empty);
    return;
  }
  for (const p of players) {
    const row = document.createElement('div');
    row.className = `player-row ${p.id === state.me.id ? 'me' : ''}`;
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(p.username)}${p.id === state.me.id ? ' (you)' : ''}</strong>
        <div class="meta">${p.cards} cards · ${p.books} books</div>
      </div>
      <div class="meta">${p.isHost ? 'Host' : (p.connected === false ? 'Disconnected' : 'Ready')}</div>
    `;
    ui.lobbyList.appendChild(row);
  }
}

function renderHand() {
  ui.hand.innerHTML = '';
  const hand = state.yourHand || [];
  if (!state.started) {
    ui.handHint.textContent = 'Create or join a room, then start the game.';
  } else if (!hand.length) {
    ui.handHint.textContent = 'No cards in hand.';
  } else {
    ui.handHint.textContent = `${hand.length} cards`;
  }
  if (!hand.length) return;
  for (const card of hand) {
    const chip = document.createElement('div');
    chip.className = 'card-chip';
    const rank = rankOf(card);
    chip.innerHTML = `<div class="rank">${escapeHtml(rank)}</div><div class="suit">${escapeHtml(suitSymbol(card))}</div>`;
    ui.hand.appendChild(chip);
  }
}

function renderGameMeta() {
  ui.turnOut.textContent = state.turnId ? (state.players.find(p => p.id === state.turnId)?.username || '—') : '—';
  ui.deckOut.textContent = String(state.deckCount ?? 0);
  const books = state.players.map(p => `${p.username}: ${p.books}`).join(' · ') || '—';
  ui.booksOut.textContent = books;
  const meTurn = state.started && state.turnId === state.me.id;
  ui.turnBadge.textContent = !state.started ? 'Waiting' : (meTurn ? 'Your turn' : 'In progress');
  ui.turnBadge.className = `badge ${meTurn ? 'good' : ''}`.trim();
}

function renderAskPanel() {
  const meTurn = state.started && state.turnId === state.me.id;
  ui.askPanel.classList.toggle('hidden', !meTurn);
  ui.askBtn.disabled = !meTurn;
  if (!meTurn) return;

  const otherPlayers = state.players.filter(p => p.id !== state.me.id && (p.cards > 0 || state.deckCount > 0));
  ui.targetSelect.innerHTML = '';
  for (const p of otherPlayers) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.username} (${p.cards})`;
    ui.targetSelect.appendChild(opt);
  }
  ui.rankSelect.innerHTML = '';
  const ranksInHand = [...new Set((state.yourHand || []).map(rankOf))];
  for (const r of ranksInHand) {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    ui.rankSelect.appendChild(opt);
  }
  ui.askBtn.disabled = !otherPlayers.length || !ranksInHand.length;
}

function renderControls() {
  ui.startBtn.classList.toggle('hidden', !state.isHost);
  ui.startBtn.disabled = !state.isHost || state.started || state.players.length < 2;
  ui.createBtn.disabled = isConnected();
  ui.joinBtn.disabled = isConnected();
  ui.usernameInput.disabled = isConnected();
  ui.roomInput.disabled = isConnected();
}

function render() {
  renderLobby();
  renderGameMeta();
  renderHand();
  renderAskPanel();
  renderControls();
  ui.roomOut.textContent = state.roomCode || '—';
  if (!state.isHost && state.started && state.players.length < 2) {
    ui.handHint.textContent = 'Waiting for host.';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function localPlayerRecord() {
  if (state.isHost) {
    return hostState.players.get(state.me.id);
  }
  return null;
}

function connectAsHost(peerId, username) {
  state.isHost = true;
  state.me.username = username;
  state.hostId = peerId;
  hostState.roomCode = peerId.replace(ROOM_PREFIX, '').toUpperCase();
  hostState.started = false;
  hostState.winner = null;
  hostState.deck = [];
  hostState.players.clear();
  hostState.order = [];
  hostState.logs = [];

  state.me.id = peerId;
  state.roomCode = hostState.roomCode;
  setRoom(state.roomCode);
  setPeerId(peerId);
  setStatus('Creating room…');
  addLog(`Creating room ${state.roomCode}…`);

  state.peer = new Peer(peerId);

  state.peer.on('open', (id) => {
    setStatus(`Hosting room ${state.roomCode}`);
    hostState.players.set(id, {
      id,
      username,
      conn: null,
      hand: [],
      books: 0,
      connected: true,
    });
    hostState.order = [id];
    state.players = hostPublicPlayerList();
    syncHostView();
    render();
    addLog(`You are hosting as ${username}. Share room code ${state.roomCode}.`, 'good');
  });

  state.peer.on('connection', (conn) => {
    conn.on('data', (msg) => handleHostMessage(conn, msg));
    conn.on('close', () => handleHostDisconnect(conn.peer));
    conn.on('error', (err) => addLog(`Connection error: ${err.message || err}`, 'bad'));
  });

  state.peer.on('error', (err) => {
    const msg = String(err?.type || err?.message || err);
    if (msg.includes('unavailable-id')) {
      addLog('Room code collision. Try creating again.', 'bad');
      setStatus('Room code collision');
    } else {
      addLog(`Peer error: ${msg}`, 'bad');
      setStatus(`Error: ${msg}`);
    }
  });
}

function handleHostDisconnect(peerId) {
  const p = hostState.players.get(peerId);
  if (!p) return;
  p.connected = false;
  addLog(`${p.username} left the room.`);
  if (hostState.order.includes(peerId)) {
    hostState.order = hostState.order.filter(id => id !== peerId);
  }
  hostState.players.delete(peerId);
  if (hostState.started && hostState.order.length < 2) {
    endGame();
    return;
  }
  if (hostState.started && hostState.order[hostState.turnIndex] === peerId) {
    hostState.turnIndex = 0;
    maybeAutoDrawIfEmptyTurnPlayer();
  }
  hostSendLobby();
  syncAllClients();
}

function ensureHostPlayer(conn, msg) {
  const id = conn.peer;
  const username = sanitizeName(msg.username || 'Player');
  const existingNames = [...hostState.players.values()].map(p => p.username);
  const finalName = ensureUniqueName(username, existingNames);

  if (hostState.started) {
    sendToConn(conn, { type: 'error', message: 'Game already started.' });
    conn.close();
    return null;
  }

  const rec = {
    id,
    username: finalName,
    conn,
    hand: [],
    books: 0,
    connected: true,
  };
  hostState.players.set(id, rec);
  hostState.order = [...hostState.players.keys()];
  addLog(`${finalName} joined the room.`, 'good');
  sendToConn(conn, {
    type: 'welcome',
    roomCode: hostState.roomCode,
    hostId: state.me.id,
    yourId: id,
    username: finalName,
  });
  hostSendLobby();
  syncAllClients();
  return rec;
}

function handleHostMessage(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  const type = msg.type;
  if (type === 'join') {
    ensureHostPlayer(conn, msg);
    return;
  }
  const player = hostState.players.get(conn.peer);
  if (!player) return;

  if (type === 'ask') {
    handleAskMove(player.id, msg.targetId, msg.rank);
  } else if (type === 'chat') {
    const text = String(msg.text || '').trim().slice(0, 200);
    if (text) {
      addLog(`${player.username}: ${text}`);
      broadcast({ type: 'chat', from: player.username, text });
    }
  } else if (type === 'ready') {
    // no-op for now
  }
}

function drawFromDeck(player) {
  if (!hostState.deck.length) return null;
  const card = hostState.deck.pop();
  player.hand.push(card);
  player.hand.sort((a, b) => cardSortValue(a) - cardSortValue(b));
  removeBooksFromPlayer(player);
  return card;
}

function transferCards(fromPlayer, toPlayer, rank) {
  const moving = fromPlayer.hand.filter(c => rankOf(c) === rank);
  fromPlayer.hand = fromPlayer.hand.filter(c => rankOf(c) !== rank);
  toPlayer.hand.push(...moving);
  toPlayer.hand.sort((a, b) => cardSortValue(a) - cardSortValue(b));
  fromPlayer.hand.sort((a, b) => cardSortValue(a) - cardSortValue(b));
  return moving;
}

function handleAskMove(askerId, targetId, rank) {
  if (!hostState.started) return;
  if (hostState.order[hostState.turnIndex] !== askerId) return;

  const asker = hostState.players.get(askerId);
  const target = hostState.players.get(targetId);
  rank = String(rank || '').trim();

  if (!asker || !target) {
    sendToClient(askerId, { type: 'error', message: 'Invalid player selection.' });
    return;
  }
  if (askerId === targetId) {
    sendToClient(askerId, { type: 'error', message: 'You cannot ask yourself.' });
    return;
  }
  if (!RANKS.includes(rank)) {
    sendToClient(askerId, { type: 'error', message: 'Invalid rank.' });
    return;
  }
  if (!asker.hand.some(c => rankOf(c) === rank)) {
    sendToClient(askerId, { type: 'error', message: `You must have at least one ${rank} to ask for it.` });
    return;
  }

  const beforeCount = target.hand.filter(c => rankOf(c) === rank).length;
  if (beforeCount > 0) {
    const transferred = transferCards(target, asker, rank);
    removeBooksFromPlayer(asker);
    removeBooksFromPlayer(target);
    const moveText = `${asker.username} asked ${target.username} for ${rank}s and got ${transferred.length}.`;
    addLog(moveText, 'good');
    hostState.logs.push(moveText);
    broadcast({
      type: 'move',
      message: moveText,
      detail: { asker: asker.username, target: target.username, rank, took: transferred.length },
    });
    syncAllClients();

    if (isGameOver()) {
      endGame();
      return;
    }
    // successful ask: same player keeps turn
    maybeAutoDrawIfEmptyTurnPlayer();
    syncAllClients();
  } else {
    const moveText = `${asker.username} asked ${target.username} for ${rank}s and had to go fish.`;
    addLog(moveText);
    hostState.logs.push(moveText);
    broadcast({
      type: 'move',
      message: moveText,
      detail: { asker: asker.username, target: target.username, rank, took: 0 },
    });
    const drawn = drawFromDeck(asker);
    if (drawn) {
      const drawRank = rankOf(drawn);
      const fishText = `${asker.username} drew ${drawRank}.`;
      addLog(fishText);
      hostState.logs.push(fishText);
      broadcast({ type: 'move', message: fishText, detail: { draw: drawn, asker: asker.username } });
      removeBooksFromPlayer(asker);
      if (drawRank === rank) {
        addLog(`${asker.username} drew the rank they asked for and goes again.`, 'good');
      } else {
        advanceTurn(true);
      }
    } else {
      addLog('Deck is empty.', 'bad');
      advanceTurn(true);
    }

    if (isGameOver()) {
      endGame();
      return;
    }

    syncAllClients();
  }

  if (!isGameOver() && hostState.order[hostState.turnIndex] === askerId) {
    // same turn continues after successful ask or matching draw
    maybeAutoDrawIfEmptyTurnPlayer();
  }
  if (isGameOver()) {
    endGame();
    return;
  }
  syncAllClients();
}

function connectAsClient(roomCode, username) {
  state.isHost = false;
  state.roomCode = roomCode;
  setRoom(roomCode);
  setStatus('Connecting…');
  addLog(`Connecting to ${roomCode}…`);
  state.peer = new Peer();

  state.peer.on('open', (id) => {
    state.me.id = id;
    setPeerId(id);
    const hostId = hostPeerIdFromRoom(roomCode);
    state.conn = state.peer.connect(hostId, { reliable: true });
    state.conn.on('open', () => {
      setStatus(`Connected to ${roomCode}`);
      sendToConn(state.conn, { type: 'join', username });
    });
    state.conn.on('data', handleClientMessage);
    state.conn.on('close', () => {
      setStatus('Disconnected');
      addLog('Disconnected from host.', 'bad');
    });
    state.conn.on('error', (err) => {
      addLog(`Connection error: ${err.message || err}`, 'bad');
      setStatus('Connection error');
    });
  });

  state.peer.on('error', (err) => {
    const msg = String(err?.type || err?.message || err);
    addLog(`Peer error: ${msg}`, 'bad');
    setStatus(`Error: ${msg}`);
  });
}

function handleClientMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'welcome') {
    state.me.username = msg.username || state.me.username;
    state.hostId = msg.hostId;
    state.roomCode = msg.roomCode || state.roomCode;
    setRoom(state.roomCode);
    addLog(`Joined as ${state.me.username}.`, 'good');
  } else if (msg.type === 'lobby') {
    state.hostId = msg.hostId;
    state.started = !!msg.started;
    state.players = msg.players || [];
    render();
  } else if (msg.type === 'state') {
    state.started = !!msg.started;
    state.hostId = msg.hostId;
    state.players = msg.players || [];
    state.turnId = msg.turnId || null;
    state.deckCount = msg.deckCount || 0;
    state.yourHand = msg.yourHand || [];
    state.yourBooks = msg.yourBooks || 0;
    if (Array.isArray(msg.logs)) {
      // show only the newest logs; avoid spam
      const latest = msg.logs[msg.logs.length - 1];
      if (latest) addLog(latest);
    }
    render();
    if (msg.winner) {
      addLog(`Winner: ${msg.winner}`, 'good');
    }
  } else if (msg.type === 'chat') {
    addLog(`${msg.from}: ${msg.text}`);
  } else if (msg.type === 'move') {
    addLog(msg.message, msg.detail?.took > 0 ? 'good' : '');
  } else if (msg.type === 'game_over') {
    const scores = (msg.scores || []).map(s => `${s.username} (${s.books})`).join(' · ');
    addLog(`Game over. Winner: ${msg.winner}. Scores: ${scores}`, 'good');
    state.started = false;
    render();
  } else if (msg.type === 'error') {
    addLog(msg.message || 'Unknown error', 'bad');
  }
}

function createRoom() {
  const username = sanitizeName(ui.usernameInput.value);
  const room = makeRoomCode();
  state.me.username = username;
  connectAsHost(hostPeerIdFromRoom(room), username);
  ui.roomInput.value = room;
}

function joinRoom() {
  const username = sanitizeName(ui.usernameInput.value);
  const room = sanitizeName(ui.roomInput.value).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!room) {
    addLog('Enter a room code.', 'bad');
    return;
  }
  state.me.username = username;
  connectAsClient(room, username);
}

function copyRoom() {
  if (!state.roomCode) return;
  navigator.clipboard?.writeText(state.roomCode).then(() => {
    addLog(`Room code copied: ${state.roomCode}`, 'good');
  }).catch(() => addLog(`Room code: ${state.roomCode}`));
}

function askMove() {
  if (!state.started || state.turnId !== state.me.id) return;
  const targetId = ui.targetSelect.value;
  const rank = ui.rankSelect.value;
  if (!targetId || !rank) return;
  if (state.isHost) {
    handleAskMove(state.me.id, targetId, rank);
  } else {
    sendToConn(state.conn, { type: 'ask', targetId, rank });
  }
}

ui.createBtn.addEventListener('click', createRoom);
ui.joinBtn.addEventListener('click', joinRoom);
ui.startBtn.addEventListener('click', startGame);
ui.askBtn.addEventListener('click', askMove);
ui.copyRoomBtn.addEventListener('click', copyRoom);

ui.usernameInput.value = 'Player';
ui.roomInput.value = '';
setStatus('Idle');
render();

// allow Enter key to connect
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (!isConnected()) {
      if (document.activeElement === ui.roomInput) joinRoom();
      else if (document.activeElement === ui.usernameInput && ui.roomInput.value.trim()) joinRoom();
    } else if (state.started && state.turnId === state.me.id) {
      askMove();
    }
  }
});
