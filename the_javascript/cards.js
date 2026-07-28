/*
    cards.js
    =========

    Contains every class related to playing cards.

    No networking.
    No HTML.
    No PeerJS.

    This file only knows how Go Fish cards behave.
*/

export const SUITS = Object.freeze([
    {
        name: "Spades",
        symbol: "♠",
        red: false
    },
    {
        name: "Hearts",
        symbol: "♥",
        red: true
    },
    {
        name: "Diamonds",
        symbol: "♦",
        red: true
    },
    {
        name: "Clubs",
        symbol: "♣",
        red: false
    }
]);

export const RANKS = Object.freeze([
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K"
]);



export class Card {

    constructor(rank, suit) {

        this.rank = rank;
        this.suit = suit.symbol;
        this.red = suit.red;

    }

    clone() {

        return new Card(
            this.rank,
            {
                symbol: this.suit,
                red: this.red
            }
        );

    }

}



export class Deck {

    constructor() {

        this.cards = [];

        this.reset();

    }

    reset() {

        this.cards = [];

        for (const suit of SUITS) {

            for (const rank of RANKS) {

                this.cards.push(
                    new Card(rank, suit)
                );

            }

        }

    }

    shuffle() {

        for (let i = this.cards.length - 1; i > 0; i--) {

            const j = Math.floor(
                Math.random() * (i + 1)
            );

            [
                this.cards[i],
                this.cards[j]
            ] = [
                this.cards[j],
                this.cards[i]
            ];

        }

    }

    draw() {

        if (this.cards.length === 0)
            return null;

        return this.cards.pop();

    }

    size() {

        return this.cards.length;

    }

}



export class Hand {

    constructor() {

        this.cards = [];

    }

    add(card) {

        if (!card)
            return;

        this.cards.push(card);

        this.sort();

    }

    addMany(cards) {

        for (const card of cards)
            this.cards.push(card);

        this.sort();

    }

    draw(deck) {

        const card = deck.draw();

        if (card)
            this.add(card);

        return card;

    }

    remove(card) {

        const index = this.cards.indexOf(card);

        if (index >= 0)
            this.cards.splice(index, 1);

    }

    removeRank(rank) {

        const removed = [];

        this.cards = this.cards.filter(card => {

            if (card.rank === rank) {

                removed.push(card);

                return false;

            }

            return true;

        });

        return removed;

    }

    hasRank(rank) {

        return this.cards.some(
            c => c.rank === rank
        );

    }

    countRank(rank) {

        return this.cards.filter(
            c => c.rank === rank
        ).length;

    }

    uniqueRanks() {

        return [
            ...new Set(
                this.cards.map(
                    c => c.rank
                )
            )
        ];

    }

    sort() {

        this.cards.sort((a, b) => {

            const rankDiff =
                RANKS.indexOf(a.rank) -
                RANKS.indexOf(b.rank);

            if (rankDiff !== 0)
                return rankDiff;

            return a.suit.localeCompare(b.suit);

        });

    }

    size() {

        return this.cards.length;

    }

}



export class BookCollection {

    constructor() {

        this.books = [];

    }

    add(rank) {

        if (!this.books.includes(rank)) {

            this.books.push(rank);

            this.books.sort(
                (a, b) =>
                    RANKS.indexOf(a) -
                    RANKS.indexOf(b)
            );

        }

    }

    has(rank) {

        return this.books.includes(rank);

    }

    size() {

        return this.books.length;

    }

}



export class PlayerCards {

    constructor() {

        this.hand = new Hand();

        this.books = new BookCollection();

    }

    giveRank(rank) {

        return this.hand.removeRank(rank);

    }

    receive(cards) {

        this.hand.addMany(cards);

    }

    checkForBooks() {

        const completed = [];

        for (const rank of RANKS) {

            if (
                this.hand.countRank(rank) === 4
            ) {

                this.hand.removeRank(rank);

                this.books.add(rank);

                completed.push(rank);

            }

        }

        return completed;

    }

}
