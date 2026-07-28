/*
    network.js
    ==========
    Thin wrapper around PeerJS.

    Responsibilities:
    - Create peers
    - Accept connections
    - Send packets
    - Receive packets
    - Reconnect handling
    - Event system

    This file does NOT know Go Fish rules.
*/

export class NetworkManager {

    constructor() {

        this.peer = null;

        this.hostConnection = null;

        this.clientConnections = new Map();

        this.handlers = new Map();

        this.connected = false;

        this.myID = null;

        this.roomCode = null;

    }

    //--------------------------------------------------
    // Event System
    //--------------------------------------------------

    on(event, callback) {

        if (!this.handlers.has(event))
            this.handlers.set(event, []);

        this.handlers.get(event).push(callback);

    }

    emit(event, data) {

        if (!this.handlers.has(event))
            return;

        for (const callback of this.handlers.get(event)) {

            callback(data);

        }

    }

    //--------------------------------------------------
    // Host
    //--------------------------------------------------

    async host() {

        return new Promise((resolve, reject) => {

            this.peer = new Peer();

            this.peer.on("open", id => {

                this.myID = "host";

                this.roomCode = id;

                resolve(id);

            });

            this.peer.on("connection", conn => {

                this.acceptClient(conn);

            });

            this.peer.on("error", reject);

        });

    }

    acceptClient(conn) {

        conn.on("open", () => {

            this.clientConnections.set(
                conn.peer,
                conn
            );

            this.emit(
                "client_connected",
                conn.peer
            );

        });

        conn.on("data", packet => {

            this.emit(
                packet.type,
                {
                    peer: conn.peer,
                    data: packet
                }
            );

        });

        conn.on("close", () => {

            this.clientConnections.delete(
                conn.peer
            );

            this.emit(
                "client_disconnected",
                conn.peer
            );

        });

    }

    //--------------------------------------------------
    // Client
    //--------------------------------------------------

    async join(roomCode) {

        return new Promise((resolve, reject) => {

            this.peer = new Peer();

            this.peer.on("open", id => {

                this.myID = id;

                this.hostConnection =
                    this.peer.connect(roomCode);

                this.hostConnection.on(
                    "open",
                    () => {

                        this.connected = true;

                        resolve();

                    }
                );

                this.hostConnection.on(
                    "data",
                    packet => {

                        this.emit(
                            packet.type,
                            packet
                        );

                    }
                );

                this.hostConnection.on(
                    "close",
                    () => {

                        this.connected = false;

                        this.emit(
                            "host_disconnected"
                        );

                    }
                );

            });

            this.peer.on("error", reject);

        });

    }

    //--------------------------------------------------
    // Sending
    //--------------------------------------------------

    send(type, payload = {}) {

        if (!this.hostConnection)
            return;

        this.hostConnection.send({

            type,

            ...payload

        });

    }

    sendTo(peerID, type, payload = {}) {

        const conn =
            this.clientConnections.get(peerID);

        if (!conn)
            return;

        conn.send({

            type,

            ...payload

        });

    }

    broadcast(type, payload = {}) {

        for (const conn of this.clientConnections.values()) {

            conn.send({

                type,

                ...payload

            });

        }

    }

    //--------------------------------------------------
    // Shutdown
    //--------------------------------------------------

    disconnect() {

        if (this.hostConnection)
            this.hostConnection.close();

        for (const conn of this.clientConnections.values())
            conn.close();

        if (this.peer)
            this.peer.destroy();

        this.clientConnections.clear();

        this.connected = false;

    }

}

export const network =
    new NetworkManager();
