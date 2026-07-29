
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const SUITS = [
    { sym: "♠", color: "black" },
    { sym: "♥", color: "red" },
    { sym: "♦", color: "red" },
    { sym: "♣", color: "black" },
  ];

  const els = {
    status: $("#netStatus"),
    footer: $("#footerNote"),
    splash: $("#screen-splash"),
    menu: $("#screen-menu"),
    create: $("#screen-create"),
    join: $("#screen-join"),
    lobby: $("#screen-lobby"),
    game: $("#screen-game"),
    gameover: $("#screen-gameover"),
    enterAppBtn: $("#enterAppBtn"),
    menuCreateBtn: $("#menuCreateBtn"),
    menuJoinBtn: $("#menuJoinBtn"),
    createName: $("#createName"),
    createRoomBtn: $("#createRoomBtn"),
    joinName: $("#joinName"),
    joinCode: $("#joinCode"),
    joinRoomBtn: $("#joinRoomBtn"),
    previewRoomCode: $("#previewRoomCode"),
    lobbyRoomCode: $("#lobbyRoomCode"),
    gameRoomCode: $("#gameRoomCode"),
    copyCodeBtn: $("#copyCodeBtn"),
    playerList: $("#playerList"),
    chatLog: $("#chatLog"),
    chatInput: $("#chatInput"),
    chatSendBtn: $("#chatSendBtn"),
    startGameBtn: $("#startGameBtn"),
    leaveLobbyBtn: $("#leaveLobbyBtn"),
    backToLobbyBtn: $("#backToLobbyBtn"),
    leaveGameBtn: $("#leaveGameBtn"),
    askBtn: $("#askBtn"),
    targetSelect: $("#targetSelect"),
    rankSelect: $("#rankSelect"),
    handCards: $("#handCards"),
    scoreboard: $("#scoreboard"),
    turnPlayer: $("#turnPlayer"),
    turnHint: $("#turnHint"),
    deckCount: $("#deckCount"),
    bookCount: $("#bookCount"),
    eventFeed: $("#eventFeed"),
    winnerTitle: $("#winnerTitle"),
    winnerText: $("#winnerText"),
    playAgainBtn: $("#playAgainBtn"),
  };

  const state = {
    screen: "splash",
    roomCode: "",
    username: "",
    isHost: false,
    peer: null,
    peerId: null,
    hostId: null,
    connections: new Map(), // peerId -> conn
    players: [], // {id, username, isHost, connected, books, handCount}
    chat: [],
    selectedCardId: null,
    myCards: [],
    game: null,
    joinedAt: Date.now(),
    lastEvent: "",
    localPeerId: null,
    ready: false,
    reconnectTimer: null,
    connectionAttempts: 0,
  };

  function showScreen(name) {
    state.screen = name;
    [els.splash, els.menu, els.create, els.join, els.lobby, els.game, els.gameover].forEach(el => el.classList.remove("screen-active"));
    const map = {
      splash: els.splash,
      menu: els.menu,
      create: els.create,
      join: els.join,
      lobby: els.lobby,
      game: els.game,
      gameover: els.gameover,
    };
    map[name].classList.add("screen-active");
    setFooter(`Screen: ${name}`);
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function setFooter(text) {
    els.footer.textContent = text;
  }

  function normalizeName(v) {
    return (v || "").trim().slice(0, 20) || "Player";
  }

  function normalizeCode(v) {
    return (v || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
  }

  function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function peerIdForCode(code) {
    return `gofish-${code}`;
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function notify(text) {
    state.lastEvent = text;
    els.eventFeed.insertAdjacentHTML("afterbegin", `<div class="event-item">${escapeHTML(text)}</div>`);
    while (els.eventFeed.children.length > 6) els.eventFeed.lastElementChild.remove();
  }

  function pushChat(user, text, system = false) {
    const item = { user, text, system, at: Date.now() };
    state.chat.push(item);
    if (state.chat.length > 100) state.chat.shift();
    renderChat();
  }

  function renderChat() {
    els.chatLog.innerHTML = state.chat.map((m) => `
      <div class="chat-item">
        <strong>${escapeHTML(m.system ? "System" : m.user)}</strong>
        <div>${escapeHTML(m.text)}</div>
      </div>
    `).join("");
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function deckCreate() {
    const deck = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) deck.push({ id: uid(), rank, suit: suit.sym, color: suit.color });
    }
    // Fisher-Yates
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function cardsByRank(hand, rank) {
    return hand.filter(c => c.rank === rank);
  }

  function handRanks(hand) {
    return [...new Set(hand.map(c => c.rank))];
  }

  function countBooks(hand) {
    let books = 0;
    const byRank = new Map();
    hand.forEach(c => byRank.set(c.rank, (byRank.get(c.rank) || 0) + 1));
    for (const v of byRank.values()) if (v === 4) books++;
    return books;
  }

  function removeBooksFromHand(hand) {
    const byRank = new Map();
    hand.forEach(c => byRank.set(c.rank, (byRank.get(c.rank) || []).concat(c)));
    const keep = [];
    let books = [];
    for (const [rank, cards] of byRank.entries()) {
      if (cards.length === 4) books.push(rank);
      else keep.push(...cards);
    }
    return { hand: keep, books };
  }

  function makeInitialGame(players) {
    const deck = deckCreate();
    const hands = {};
    players.forEach(p => hands[p.id] = []);
    const dealCount = 5;
    const n = players.length;
    for (let i = 0; i < dealCount; i++) {
      for (let j = 0; j < n; j++) {
        const card = deck.pop();
        if (card) hands[players[j].id].push(card);
      }
    }
    const books = {};
    players.forEach(p => books[p.id] = []);
    for (const p of players) {
      const cleaned = removeBooksFromHand(hands[p.id]);
      hands[p.id] = cleaned.hand;
      books[p.id].push(...cleaned.books);
    }
    return {
      deck,
      hands,
      books,
      turnOrder: players.map(p => p.id),
      turnIndex: 0,
      lastAction: "Game started.",
      lastTurnTarget: null,
      lastTurnRank: null,
      winner: null,
      phase: "playing",
    };
  }

  function currentPlayerId() {
    return state.game?.turnOrder?.[state.game.turnIndex] || null;
  }

  function playerById(id) {
    return state.players.find(p => p.id === id);
  }

  function isMyTurn() {
    return currentPlayerId() === state.localPeerId;
  }

  function broadcast(msg, exceptId = null) {
    for (const [peerId, conn] of state.connections.entries()) {
      if (exceptId && peerId === exceptId) continue;
      safeSend(conn, msg);
    }
  }

  function safeSend(conn, msg) {
    try {
      if (conn && conn.open) conn.send(msg);
    } catch (err) {
      console.warn("send failed", err);
    }
  }

  function hostBroadcastState() {
    if (!state.isHost || !state.game) return;
    const payload = buildPublicState();
    broadcast({ type: "state", state: payload });
    renderAll();
  }

  function buildPublicState() {
    return {
      roomCode: state.roomCode,
      players: state.players.map(p => ({
        id: p.id,
        username: p.username,
        isHost: p.isHost,
        connected: p.connected,
        books: state.game.books[p.id]?.length || 0,
        handCount: state.game.hands[p.id]?.length || 0,
      })),
      deckCount: state.game.deck.length,
      turnPlayerId: currentPlayerId(),
      turnIndex: state.game.turnIndex,
      phase: state.game.phase,
      winner: state.game.winner,
      lastAction: state.game.lastAction,
      hands: state.game.hands,
      books: state.game.books,
    };
  }

  function applyState(payload) {
    state.roomCode = payload.roomCode;
    state.players = payload.players.map(p => ({
      id: p.id,
      username: p.username,
      isHost: p.isHost,
      connected: p.connected,
      books: p.books || 0,
      handCount: p.handCount || 0,
    }));
    if (payload.phase === "playing") {
      state.game = {
        deck: new Array(payload.deckCount).fill(null),
        hands: payload.hands,
        books: payload.books,
        turnOrder: payload.players.map(p => p.id),
        turnIndex: payload.turnIndex,
        lastAction: payload.lastAction,
        phase: payload.phase,
        winner: payload.winner,
      };
      state.myCards = (payload.hands[state.localPeerId] || []).slice();
      state.selectedCardId = null;
      updateUIFromState();
    } else {
      state.game = {
        deck: new Array(payload.deckCount).fill(null),
        hands: payload.hands,
        books: payload.books,
        turnOrder: payload.players.map(p => p.id),
        turnIndex: payload.turnIndex,
        lastAction: payload.lastAction,
        phase: payload.phase,
        winner: payload.winner,
      };
      state.myCards = (payload.hands[state.localPeerId] || []).slice();
      updateUIFromState();
    }
  }

  function setLocalIdentity(username, peerId) {
    state.username = normalizeName(username);
    state.localPeerId = peerId;
    const existing = state.players.find(p => p.id === peerId);
    if (existing) existing.username = state.username;
    else state.players.unshift({ id: peerId, username: state.username, isHost: state.isHost, connected: true, books: 0, handCount: 0 });
  }

  function resetChatWithSystem(text) {
    state.chat = [];
    pushChat("System", text, true);
  }

  function initPeerForHost(code, username) {
    teardownPeer(false);
    const id = peerIdForCode(code);
    state.roomCode = code;
    state.isHost = true;
    state.username = normalizeName(username);
    state.hostId = id;
    setStatus("Connecting...");
    setFooter("Creating room.");
    state.peer = new Peer(id, {
      debug: 1,
    });
    attachPeerEventsHost();
  }

  function initPeerForGuest(code, username) {
    teardownPeer(false);
    const roomCode = normalizeCode(code);
    const hostId = peerIdForCode(roomCode);
    state.roomCode = roomCode;
    state.isHost = false;
    state.username = normalizeName(username);
    state.hostId = hostId;
    setStatus("Connecting...");
    setFooter("Joining room.");
    state.peer = new Peer(undefined, { debug: 1 });
    attachPeerEventsGuest(hostId);
  }

  function attachPeerEventsHost() {
    const peer = state.peer;
    peer.on("open", (id) => {
      state.localPeerId = id;
      state.connections.clear();
      state.players = [{ id, username: state.username, isHost: true, connected: true, books: 0, handCount: 0 }];
      setStatus(`Hosting ${state.roomCode}`);
      setFooter(`Room ${state.roomCode} ready.`);
      state.ready = true;
      showScreen("lobby");
      renderLobby();
      resetChatWithSystem(`Room ${state.roomCode} created.`);
      notify("Waiting for players...");
      createEmptyGameShell();
    });

    peer.on("connection", (conn) => {
      wireConnection(conn, true);
    });

    peer.on("error", (err) => {
      console.error(err);
      setStatus("Host error");
      notify(`Host error: ${err.type || err.message}`);
    });
  }

  function attachPeerEventsGuest(hostId) {
    const peer = state.peer;
    peer.on("open", (id) => {
      state.localPeerId = id;
      setStatus("Joining...");
      const conn = peer.connect(hostId, { reliable: true });
      wireConnection(conn, false);
    });

    peer.on("error", (err) => {
      console.error(err);
      setStatus("Peer error");
      notify(`Connection error: ${err.type || err.message}`);
    });
  }

  function wireConnection(conn, fromHost) {
    const peerId = conn.peer;
    state.connections.set(peerId, conn);

    conn.on("open", () => {
      setStatus(state.isHost ? `Hosting ${state.roomCode}` : `Connected to ${state.roomCode}`);
      if (state.isHost) {
        const existing = state.players.find(p => p.id === peerId);
        if (!existing) {
          state.players.push({ id: peerId, username: `Guest ${state.players.length}`, isHost: false, connected: true, books: 0, handCount: 0 });
        } else {
          existing.connected = true;
        }
        safeSend(conn, { type: "welcome", roomCode: state.roomCode, hostId: state.localPeerId });
        safeSend(conn, { type: "lobby", players: serializePlayers() });
        safeSend(conn, { type: "chat-sync", chat: state.chat });
        if (state.game) safeSend(conn, { type: "state", state: buildPublicState() });
        broadcast({ type: "lobby", players: serializePlayers() });
        renderLobby();
        notify(`${displayName(peerId)} joined.`);
        pushChat("System", `${displayName(peerId)} joined the room.`, true);
      } else {
        safeSend(conn, { type: "join", username: state.username, peerId: state.localPeerId });
      }
    });

    conn.on("data", (msg) => handleMessage(msg, conn));
    conn.on("close", () => {
      state.connections.delete(peerId);
      if (state.isHost) {
        const p = state.players.find(x => x.id === peerId);
        if (p) p.connected = false;
        broadcast({ type: "lobby", players: serializePlayers() });
        renderLobby();
        notify(`${displayName(peerId)} disconnected.`);
        pushChat("System", `${displayName(peerId)} disconnected.`, true);
      } else {
        setStatus("Disconnected");
        notify("Connection closed.");
      }
    });
    conn.on("error", (err) => {
      console.error(err);
      notify(`Connection issue: ${err.type || err.message}`);
    });
  }

  function displayName(id) {
    return playerById(id)?.username || id.slice(0, 6);
  }

  function serializePlayers() {
    return state.players.map(p => ({
      id: p.id,
      username: p.username,
      isHost: p.isHost,
      connected: p.connected !== false,
      books: state.game?.books?.[p.id]?.length || p.books || 0,
      handCount: state.game?.hands?.[p.id]?.length || p.handCount || 0,
    }));
  }

  function handleMessage(msg, conn) {
    if (!msg || typeof msg !== "object") return;
    if (state.isHost) {
      switch (msg.type) {
        case "join": {
          const p = state.players.find(x => x.id === conn.peer);
          if (p) {
            p.username = normalizeName(msg.username);
            p.connected = true;
          } else {
            state.players.push({ id: conn.peer, username: normalizeName(msg.username), isHost: false, connected: true, books: 0, handCount: 0 });
          }
          broadcast({ type: "lobby", players: serializePlayers() });
          safeSend(conn, { type: "lobby", players: serializePlayers() });
          pushChat("System", `${displayName(conn.peer)} is here.`, true);
          notify(`${displayName(conn.peer)} joined.`);
          renderLobby();
          break;
        }
        case "chat": {
          const user = displayName(conn.peer);
          pushChat(user, msg.text);
          broadcast({ type: "chat", user, text: msg.text });
          break;
        }
        case "start-request": {
          if (!state.game && state.players.length >= 2) startGame();
          break;
        }
        case "ask": {
          if (state.game && state.game.phase === "playing") handleAsk(conn.peer, msg);
          break;
        }
        case "play-again": {
          break;
        }
      }
    } else {
      switch (msg.type) {
        case "welcome":
          state.hostId = msg.hostId;
          break;
        case "lobby":
          state.players = msg.players;
          renderLobby();
          break;
        case "chat-sync":
          state.chat = msg.chat || [];
          renderChat();
          break;
        case "chat":
          pushChat(msg.user, msg.text);
          break;
        case "state":
          applyState(msg.state);
          if (msg.state.phase === "playing") showScreen("game");
          if (msg.state.phase === "finished") showScreen("gameover");
          break;
        case "game-started":
          notify("The game has started.");
          showScreen("game");
          break;
        case "event":
          notify(msg.text);
          break;
        case "game-over":
          showGameOver(msg.winnerName, msg.reason || "Game complete.");
          break;
      }
    }
  }

  function createEmptyGameShell() {
    state.game = null;
    state.myCards = [];
    state.selectedCardId = null;
    renderLobby();
  }

  function startGame() {
    if (!state.isHost) return;
    if (state.players.length < 2) {
      notify("Need at least 2 players.");
      return;
    }
    // ensure host is first
    state.players.sort((a, b) => Number(b.isHost) - Number(a.isHost));
    state.game = makeInitialGame(state.players);
    state.game.phase = "playing";
    state.game.turnIndex = 0;
    state.game.lastAction = "Game started.";
    state.game.winner = null;
    state.myCards = state.game.hands[state.localPeerId] || [];
    const cleaned = removeBooksFromHand(state.game.hands[state.localPeerId]);
    state.game.hands[state.localPeerId] = cleaned.hand;
    state.game.books[state.localPeerId] = state.game.books[state.localPeerId] || [];
    state.game.books[state.localPeerId].push(...cleaned.books);
    notify("Game started.");
    broadcast({ type: "game-started" });
    hostBroadcastState();
    showScreen("game");
    renderGame();
  }

  function handleAsk(fromId, { targetId, rank }) {
    if (!state.game || state.game.phase !== "playing") return;
    if (fromId !== currentPlayerId()) {
      safeSend(state.connections.get(fromId), { type: "event", text: "It is not your turn." });
      return;
    }
    if (!targetId || !rank) return;
    if (targetId === fromId) {
      safeSend(state.connections.get(fromId), { type: "event", text: "You cannot ask yourself." });
      return;
    }
    const asker = playerById(fromId);
    const target = playerById(targetId);
    if (!asker || !target) return;
    const targetHand = state.game.hands[targetId] || [];
    const matches = cardsByRank(targetHand, rank);
    let eventText = `${asker.username} asked ${target.username} for ${rank}s.`;
    if (matches.length > 0) {
      state.game.hands[targetId] = targetHand.filter(c => c.rank !== rank);
      state.game.hands[fromId] = (state.game.hands[fromId] || []).concat(matches);
      eventText += ` ${target.username} handed over ${matches.length} card${matches.length > 1 ? "s" : ""}.`;
      // asker gets another turn
    } else {
      const drawn = state.game.deck.pop();
      if (drawn) {
        state.game.hands[fromId] = (state.game.hands[fromId] || []).concat([drawn]);
        eventText += ` Go Fish — ${asker.username} drew ${drawn.rank}${drawn.suit}.`;
        if (drawn.rank === rank) {
          eventText += ` That matches, so ${asker.username} goes again.`;
        } else {
          advanceTurn();
        }
      } else {
        eventText += " The deck is empty.";
        advanceTurn();
      }
    }
    state.game.lastAction = eventText;
    checkBooksForPlayer(fromId);
    if (matches.length > 0) checkBooksForPlayer(fromId);
    checkBooksForPlayer(targetId);
    checkEndGame();
    broadcast({ type: "event", text: eventText });
    hostBroadcastState();
    notify(eventText);
    renderGame();
  }

  function advanceTurn() {
    if (!state.game) return;
    state.game.turnIndex = (state.game.turnIndex + 1) % state.game.turnOrder.length;
  }

  function checkBooksForPlayer(pid) {
    const hand = state.game.hands[pid] || [];
    const cleaned = removeBooksFromHand(hand);
    state.game.hands[pid] = cleaned.hand;
    state.game.books[pid] = state.game.books[pid] || [];
    if (cleaned.books.length) {
      state.game.books[pid].push(...cleaned.books);
      const name = displayName(pid);
      state.game.lastAction = `${name} completed ${cleaned.books.length} book${cleaned.books.length > 1 ? "s" : ""}.`;
      notify(state.game.lastAction);
    }
  }

  function checkEndGame() {
    const allBooks = Object.values(state.game.books).reduce((acc, arr) => acc + arr.length, 0);
    const totalBooksPossible = 13;
    if (allBooks >= totalBooksPossible) {
      const scores = state.players.map(p => ({
        id: p.id,
        username: p.username,
        books: state.game.books[p.id]?.length || 0,
      })).sort((a,b) => b.books - a.books);
      const winner = scores[0];
      state.game.phase = "finished";
      state.game.winner = winner?.id || null;
      broadcast({ type: "game-over", winnerName: winner?.username || "Unknown", reason: "All books collected." });
      hostBroadcastState();
      showGameOver(winner?.username || "Unknown", "All books collected.");
    }
  }

  function showGameOver(winnerName, reason) {
    state.game = state.game || {};
    state.game.phase = "finished";
    els.winnerTitle.textContent = winnerName === "Unknown" ? "Game over" : `${winnerName} wins!`;
    els.winnerText.textContent = reason || "Thanks for playing.";
    showScreen("gameover");
  }

  function renderLobby() {
    els.lobbyRoomCode.textContent = state.roomCode || "----";
    const players = state.isHost ? state.players : (state.players || []);
    els.playerList.innerHTML = players.map(p => `
      <div class="player-row">
        <div class="player-name">
          <span class="player-dot ${p.isHost ? "host" : (p.connected === false ? "offline" : "online")}"></span>
          <span>${escapeHTML(p.username || "Player")}${p.isHost ? " (host)" : ""}</span>
        </div>
        <span class="muted">${(p.books || 0)} books</span>
      </div>
    `).join("");
    $("#startGameBtn").style.display = state.isHost ? "inline-flex" : "none";
    renderChat();
  }

  function renderGame() {
    if (!state.game) return;
    els.gameRoomCode.textContent = state.roomCode || "----";
    els.turnPlayer.textContent = displayName(currentPlayerId()) || "Waiting…";
    els.turnHint.textContent = isMyTurn() ? "It is your turn." : "Wait for the current player.";
    els.deckCount.textContent = `Deck: ${state.game.deck.length}`;
    els.bookCount.textContent = `Books: ${state.game.books[state.localPeerId]?.length || 0}`;
    els.scoreboard.innerHTML = state.players.map(p => `
      <div class="score-row">
        <span>${escapeHTML(p.username || "Player")}${p.id === state.localPeerId ? " (you)" : ""}${p.isHost ? " • host" : ""}</span>
        <strong>${state.game.books[p.id]?.length || 0}</strong>
      </div>
    `).join("");
    const targetOptions = state.players.filter(p => p.id !== state.localPeerId).map(p => `<option value="${p.id}">${escapeHTML(p.username || "Player")}</option>`).join("");
    els.targetSelect.innerHTML = targetOptions || `<option value="">No target</option>`;
    els.rankSelect.innerHTML = RANKS.map(r => `<option value="${r}">${r}</option>`).join("");
    const cards = (state.game.hands[state.localPeerId] || []).slice().sort((a,b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
    state.myCards = cards;
    els.handCards.innerHTML = cards.map(card => renderCard(card)).join("");
    updateAskButton();
    renderEventFeed();
    renderScores();
  }

  function updateUIFromState() {
    renderLobby();
    renderGame();
    if (state.game?.phase === "finished") showGameOver(displayName(state.game.winner), "All books collected.");
  }

  function renderScores() {
    els.scoreboard.innerHTML = state.players.map(p => `
      <div class="score-row">
        <span>${escapeHTML(p.username || "Player")}${p.id === state.localPeerId ? " (you)" : ""}${p.isHost ? " • host" : ""}</span>
        <strong>${state.game?.books[p.id]?.length || 0}</strong>
      </div>
    `).join("");
  }

  function renderEventFeed() {
    if (!state.game) return;
    if (!state.game.lastAction) return;
    if (!els.eventFeed.children.length) {
      notify(state.game.lastAction);
    }
  }

  function renderCard(card) {
    const cls = card.color === "red" ? "red" : "black";
    return `
      <button class="card ${cls} ${state.selectedCardId === card.id ? 'selected' : ''}" data-card-id="${card.id}" title="${card.rank}${card.suit}">
        <div class="rank">${escapeHTML(card.rank)}</div>
        <div class="center">${escapeHTML(card.suit)}</div>
        <div class="suit">${escapeHTML(card.rank)}${escapeHTML(card.suit)}</div>
      </button>
    `;
  }

  function updateAskButton() {
    const onTurn = isMyTurn();
    els.askBtn.disabled = !onTurn || !state.game || state.game.phase !== "playing";
    els.targetSelect.disabled = !onTurn;
    els.rankSelect.disabled = !onTurn;
    els.askBtn.textContent = onTurn ? "Ask" : "Waiting…";
  }

  function escapeHTML(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function teardownPeer(clearUI = true) {
    try {
      for (const conn of state.connections.values()) {
        try { conn.close(); } catch {}
      }
      state.connections.clear();
      if (state.peer) {
        try { state.peer.destroy(); } catch {}
      }
    } catch {}
    state.peer = null;
    state.game = null;
    state.players = [];
    state.chat = [];
    state.selectedCardId = null;
    state.localPeerId = null;
    state.roomCode = "";
    state.hostId = null;
    state.isHost = false;
    state.ready = false;
    if (clearUI) {
      els.playerList.innerHTML = "";
      els.chatLog.innerHTML = "";
      els.scoreboard.innerHTML = "";
      els.handCards.innerHTML = "";
      els.eventFeed.innerHTML = "";
      els.turnPlayer.textContent = "Waiting…";
      els.turnHint.textContent = "Listen for your turn.";
      els.deckCount.textContent = "Deck: 52";
      els.bookCount.textContent = "Books: 0";
    }
    setStatus("Offline");
  }

  function sendChatMessage() {
    const text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = "";
    if (state.isHost) {
      const user = state.username;
      pushChat(user, text);
      broadcast({ type: "chat", user, text });
    } else {
      const conn = state.connections.get(state.hostId);
      safeSend(conn, { type: "chat", text });
      pushChat(state.username, text);
    }
  }

  function connectAsGuest() {
    const code = normalizeCode(els.joinCode.value);
    const name = normalizeName(els.joinName.value);
    if (!code) return alert("Enter a room code.");
    if (!name) return alert("Enter a username.");
    state.joinedAt = Date.now();
    initPeerForGuest(code, name);
    showScreen("menu");
  }

  function startCreateFlow() {
    const name = normalizeName(els.createName.value);
    const code = randomCode();
    els.previewRoomCode.textContent = code;
    initPeerForHost(code, name);
    showScreen("menu");
  }

  function joinRoom() {
    const code = normalizeCode(els.joinCode.value);
    const name = normalizeName(els.joinName.value);
    if (!code) return alert("Enter a room code.");
    if (!name) return alert("Enter a username.");
    showScreen("menu");
    initPeerForGuest(code, name);
  }

  function copyCode() {
    if (!state.roomCode) return;
    navigator.clipboard?.writeText(state.roomCode).then(() => {
      setFooter("Room code copied.");
    }).catch(() => {
      setFooter(`Room code: ${state.roomCode}`);
    });
  }

  function backToMenu() {
    teardownPeer();
    showScreen("menu");
  }

  function leaveGame() {
    teardownPeer();
    showScreen("menu");
  }

  function askMove() {
    if (!state.game || !isMyTurn()) return;
    const targetId = els.targetSelect.value;
    const rank = els.rankSelect.value;
    if (!targetId || !rank) return;
    if (state.isHost) {
      handleAsk(state.localPeerId, { targetId, rank });
      // after successful ask, if turn should advance and the asker did not draw matching card, handleAsk already advanced
      // if asker received cards / matched draw, they keep turn
      state.game.lastAction = `${displayName(state.localPeerId)} asked ${displayName(targetId)} for ${rank}s.`;
      updateAskButton();
      renderGame();
    } else {
      const conn = state.connections.get(state.hostId);
      safeSend(conn, { type: "ask", targetId, rank });
    }
  }

  function initialScreenTimer() {
    setTimeout(() => {
      if (state.screen === "splash") showScreen("menu");
    }, 900);
  }

  function bindUI() {
    els.enterAppBtn.addEventListener("click", () => showScreen("menu"));
    els.menuCreateBtn.addEventListener("click", () => showScreen("create"));
    els.menuJoinBtn.addEventListener("click", () => showScreen("join"));
    els.createRoomBtn.addEventListener("click", () => {
      const name = normalizeName(els.createName.value);
      if (!name) return alert("Enter a username.");
      const code = randomCode();
      els.previewRoomCode.textContent = code;
      initPeerForHost(code, name);
      showScreen("lobby");
    });
    els.joinRoomBtn.addEventListener("click", () => {
      const code = normalizeCode(els.joinCode.value);
      const name = normalizeName(els.joinName.value);
      if (!code) return alert("Enter a room code.");
      if (!name) return alert("Enter a username.");
      initPeerForGuest(code, name);
    });
    els.copyCodeBtn.addEventListener("click", copyCode);
    els.chatSendBtn.addEventListener("click", sendChatMessage);
    els.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatMessage();
    });
    els.startGameBtn.addEventListener("click", () => {
      if (state.isHost) startGame();
      else safeSend(state.connections.get(state.hostId), { type: "start-request" });
    });
    els.leaveLobbyBtn.addEventListener("click", leaveGame);
    els.backToLobbyBtn.addEventListener("click", () => showScreen("lobby"));
    els.leaveGameBtn.addEventListener("click", leaveGame);
    els.askBtn.addEventListener("click", askMove);
    els.playAgainBtn.addEventListener("click", () => {
      teardownPeer();
      showScreen("menu");
    });

    $$(".link-btn[data-back]").forEach(btn => {
      btn.addEventListener("click", () => showScreen(btn.dataset.back));
    });

    els.handCards.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-card-id]");
      if (!btn) return;
      state.selectedCardId = btn.dataset.cardId;
      renderGame();
    });

    window.addEventListener("beforeunload", () => {
      try { teardownPeer(false); } catch {}
    });
  }

  function boot() {
    bindUI();
    showScreen("splash");
    initialScreenTimer();
    setStatus("Offline");
    setFooter("Ready.");
    els.previewRoomCode.textContent = randomCode();
    els.createName.value = "Blake";
    els.joinName.value = "Blake";
    els.joinCode.value = "";
    renderChat();
    updateAskButton();
    notify("Welcome to Go Fish.");
  }

  boot();
})();
