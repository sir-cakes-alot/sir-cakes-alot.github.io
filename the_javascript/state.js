/*
    state.js
    =========
    Single source of truth for the Go Fish game.

    Rules:
    - This file NEVER touches the DOM.
    - This file NEVER uses PeerJS.
    - This file NEVER contains game logic.

    It ONLY stores and updates state.
*/

export const GAME_VERSION = 1;

export const Phase = Object.freeze({
    MENU: "menu",
    HOSTING: "hosting",
    JOINING: "joining",
    LOBBY: "lobby",
    PLAYING: "playing",
    GAME_OVER: "game_over"
});

export const ConnectionState = Object.freeze({
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected"
});

class GameState {

    constructor() {
        this.reset();
    }

    reset() {

        // Incremented every time the host changes the game.
        this.version = 0;

        this.phase = Phase.MENU;

        this.connection = ConnectionState.DISCONNECTED;

        this.isHost = false;

        this.roomCode = "";

        this.myID = "";

        this.myName = "";

        this.currentTurn = null;

        this.deckCount = 52;

        this.gameLog = [];

        this.players = [];

        this.myHand = [];

        this.lastUpdated = Date.now();
    }

    //---------------------------------------------------
    // Player helpers
    //---------------------------------------------------

    getPlayer(id) {

        return this.players.find(p => p.id === id);

    }

    getMe() {

        return this.getPlayer(this.myID);

    }

    getCurrentPlayer() {

        return this.getPlayer(this.currentTurn);

    }

    //---------------------------------------------------
    // Logging
    //---------------------------------------------------

    addLog(text) {

        this.gameLog.push({
            text,
            timestamp: Date.now()
        });

        if (this.gameLog.length > 250)
            this.gameLog.shift();

    }

    clearLog() {

        this.gameLog.length = 0;

    }

    //---------------------------------------------------
    // State Updates
    //---------------------------------------------------

    applyServerState(serverState) {

        if (serverState.version < this.version)
            return false;

        this.version = serverState.version;

        this.phase = serverState.phase;

        this.players = structuredClone(serverState.players);

        this.currentTurn = serverState.currentTurn;

        this.deckCount = serverState.deckCount;

        this.myHand = structuredClone(serverState.myHand);

        this.lastUpdated = Date.now();

        if (Array.isArray(serverState.log)) {

            this.gameLog = structuredClone(serverState.log);

        }

        return true;

    }

    //---------------------------------------------------
    // Local state
    //---------------------------------------------------

    setConnection(state) {

        this.connection = state;

    }

    setRoom(code) {

        this.roomCode = code;

    }

    becomeHost(name) {

        this.reset();

        this.isHost = true;

        this.myName = name;

        this.myID = "host";

        this.phase = Phase.HOSTING;

    }

    becomeClient(name) {

        this.reset();

        this.isHost = false;

        this.myName = name;

        this.phase = Phase.JOINING;

    }

    //---------------------------------------------------
    // Host-only methods
    //---------------------------------------------------

    hostReplacePlayers(players) {

        this.players = players;

        this.bumpVersion();

    }

    hostSetTurn(id) {

        this.currentTurn = id;

        this.bumpVersion();

    }

    hostReplaceHand(cards) {

        this.myHand = cards;

        this.bumpVersion();

    }

    hostSetDeckCount(count) {

        this.deckCount = count;

        this.bumpVersion();

    }

    bumpVersion() {

        this.version++;

        this.lastUpdated = Date.now();

    }

}

export const state = new GameState();
