/**
 * Card Guesser - HUD Edition
 * A Mastermind-style card guessing game with camera detection
 */

class CardGuesser {
    constructor() {
        // DOM Elements
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('overlay');
        this.ctx = this.canvas.getContext('2d');
        this.statusEl = document.getElementById('status');
        this.attemptDots = document.querySelectorAll('#attempts-dots .dot');
        this.detectedDisplay = document.getElementById('detected-display');
        this.detectedLabelEl = document.getElementById('detected-label');
        this.reticle = document.getElementById('reticle');
        this.submitBtn = document.getElementById('submit-guess');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.switchCameraBtn = document.getElementById('switch-camera');
        this.gameResultEl = document.getElementById('game-result');
        this.resultIconEl = document.getElementById('result-icon');
        this.resultTextEl = document.getElementById('result-text');
        this.resultCardEl = document.getElementById('result-card');
        this.playAgainBtn = document.getElementById('play-again');

        // Camera state
        this.model = null;
        this.facingMode = 'environment';
        this.stream = null;
        this.isScanning = false;
        this.scanInterval = null;

        // Game state
        this.targetCard = null;
        this.currentDetectedCard = null;
        this.attemptsRemaining = 3;
        this.maxAttempts = 3;
        this.guessHistory = [];

        // Card data
        this.ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.suits = ['spades', 'hearts', 'diamonds', 'clubs'];
        this.suitSymbols = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

        // Detection settings
        this.confidenceThreshold = 0.5;

        // Roboflow config
        this.roboflowConfig = {
            publishable_key: "rf_3k3AdgcXetPKgPocWqxdIQa7ofw1",
            model: "playing-cards-ow27d",
            version: 2
        };

        this.init();
    }

    async init() {
        try {
            this.updateStatus('CAMERA ACCESS...');
            await this.setupCamera();

            this.updateStatus('LOADING MODEL...');
            await this.loadModel();

            this.setupEventListeners();
            this.resizeCanvas();

            this.hideLoading();
            this.startNewGame();

        } catch (error) {
            console.error('Init error:', error);
            this.showError(error.message);
        }
    }

    async setupCamera() {
        const constraints = {
            video: {
                facingMode: this.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        try {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;

            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
        } catch (error) {
            throw new Error('Camera access denied');
        }
    }

    async loadModel() {
        return new Promise((resolve, reject) => {
            if (typeof roboflow === 'undefined') {
                reject(new Error('Roboflow SDK not loaded'));
                return;
            }

            roboflow.auth({
                publishable_key: this.roboflowConfig.publishable_key
            }).load({
                model: this.roboflowConfig.model,
                version: this.roboflowConfig.version
            }).then((model) => {
                this.model = model;
                resolve();
            }).catch(() => {
                reject(new Error('Model load failed'));
            });
        });
    }

    setupEventListeners() {
        this.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        this.submitBtn.addEventListener('click', () => this.submitGuess());
        this.playAgainBtn.addEventListener('click', () => this.startNewGame());
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        await this.setupCamera();
    }

    // ===== GAME LOGIC =====

    startNewGame() {
        // Pick random target
        const randomRank = this.ranks[Math.floor(Math.random() * this.ranks.length)];
        const randomSuit = this.suits[Math.floor(Math.random() * this.suits.length)];
        this.targetCard = { rank: randomRank, suit: randomSuit };

        console.log('Target:', this.formatCard(this.targetCard));

        // Reset state
        this.attemptsRemaining = this.maxAttempts;
        this.guessHistory = [];
        this.currentDetectedCard = null;

        // Reset UI
        this.gameResultEl.classList.add('hidden');
        this.submitBtn.disabled = true;
        this.detectedDisplay.classList.add('hidden');
        this.reticle.classList.remove('detected');
        this.updateAttemptDots();
        this.clearFeedback();

        this.updateStatus('SCAN A CARD');
        this.startScanning();
    }

    startScanning() {
        if (this.isScanning) return;
        this.isScanning = true;
        this.scanInterval = setInterval(() => this.scanForCard(), 400);
    }

    stopScanning() {
        this.isScanning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }

    async scanForCard() {
        if (!this.model || !this.isScanning) return;

        try {
            const predictions = await this.model.detect(this.video);

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const valid = predictions.filter(p => p.confidence >= this.confidenceThreshold);

            if (valid.length > 0) {
                const best = valid.reduce((a, b) => a.confidence > b.confidence ? a : b);
                const parsed = this.parseCardLabel(best.class);

                if (parsed) {
                    this.currentDetectedCard = parsed;
                    this.detectedLabelEl.textContent = this.formatCard(parsed);
                    this.detectedDisplay.classList.remove('hidden');
                    this.reticle.classList.add('detected');
                    this.submitBtn.disabled = false;
                    this.updateStatus('CARD DETECTED');
                }
            } else {
                // Keep the last detected card (sticky)
                // Just update the reticle to show we lost tracking
                this.reticle.classList.remove('detected');

                if (!this.currentDetectedCard) {
                    this.updateStatus('SCAN A CARD');
                }
            }
        } catch (e) {
            console.error('Scan error:', e);
        }
    }

    submitGuess() {
        if (!this.currentDetectedCard || this.attemptsRemaining <= 0) return;

        const guess = this.currentDetectedCard;
        const feedback = this.calculateFeedback(guess, this.targetCard);

        this.guessHistory.push({ card: guess, feedback });
        this.attemptsRemaining--;

        this.displayFeedback(this.guessHistory.length, guess, feedback);
        this.updateAttemptDots();

        // Check win
        if (feedback.rankMatch === 'HIT' && feedback.colorMatch && feedback.suitMatch) {
            this.endGame(true);
        } else if (this.attemptsRemaining <= 0) {
            this.endGame(false);
        } else {
            // Reset for next
            this.currentDetectedCard = null;
            this.detectedDisplay.classList.add('hidden');
            this.reticle.classList.remove('detected');
            this.submitBtn.disabled = true;
            this.updateStatus('SCAN AGAIN');
        }
    }

    calculateFeedback(guess, target) {
        const guessIdx = this.ranks.indexOf(guess.rank);
        const targetIdx = this.ranks.indexOf(target.rank);

        let rankMatch = guessIdx === targetIdx ? 'HIT' : (guessIdx < targetIdx ? 'HIGHER' : 'LOWER');

        const redSuits = ['hearts', 'diamonds'];
        const colorMatch = redSuits.includes(guess.suit) === redSuits.includes(target.suit);
        const suitMatch = guess.suit === target.suit;

        return { rankMatch, colorMatch, suitMatch };
    }

    displayFeedback(num, guess, feedback) {
        const row = document.getElementById(`feedback-${num}`);
        if (!row) return;

        row.innerHTML = `
            <div class="feedback-item ${feedback.rankMatch === 'HIT' ? 'correct' : 'wrong'}">
                <span class="icon">${feedback.rankMatch === 'HIT' ? '✓' : (feedback.rankMatch === 'HIGHER' ? '↑' : '↓')}</span>
                <span>${feedback.rankMatch}</span>
            </div>
            <div class="feedback-item ${feedback.colorMatch ? 'correct' : 'wrong'}">
                <span class="icon">${feedback.colorMatch ? '✓' : '✗'}</span>
                <span>COLOR</span>
            </div>
            <div class="feedback-item ${feedback.suitMatch ? 'correct' : 'wrong'}">
                <span class="icon">${feedback.suitMatch ? '✓' : '✗'}</span>
                <span>SUIT</span>
            </div>
        `;
        row.classList.add('visible');
    }

    clearFeedback() {
        for (let i = 1; i <= 3; i++) {
            const row = document.getElementById(`feedback-${i}`);
            if (row) {
                row.innerHTML = '';
                row.classList.remove('visible');
            }
        }
    }

    updateAttemptDots() {
        this.attemptDots.forEach((dot, i) => {
            if (i >= this.attemptsRemaining) {
                dot.classList.add('used');
            } else {
                dot.classList.remove('used');
            }
        });
    }

    endGame(won) {
        this.stopScanning();

        if (won) {
            this.resultIconEl.textContent = '✓';
            this.resultIconEl.style.color = '#00ff88';
            this.resultTextEl.textContent = 'YOU WIN!';
            this.resultTextEl.className = 'win';
        } else {
            this.resultIconEl.textContent = '✗';
            this.resultIconEl.style.color = '#ff3b5c';
            this.resultTextEl.textContent = 'GAME OVER';
            this.resultTextEl.className = 'lose';
        }

        this.resultCardEl.textContent = this.formatCard(this.targetCard);
        this.gameResultEl.classList.remove('hidden');
    }

    // ===== CARD PARSING =====

    parseCardLabel(raw) {
        const match = raw.match(/^(\d{1,2}|[AKQJ])([shdc])$/i);
        if (match) {
            const suitMap = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
            return { rank: match[1].toUpperCase(), suit: suitMap[match[2].toLowerCase()] };
        }
        return null;
    }

    formatCard(card) {
        return `${card.rank}${this.suitSymbols[card.suit]}`;
    }

    // ===== UI =====

    updateStatus(text) {
        this.statusEl.textContent = text;
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    showError(msg) {
        this.loadingOverlay.innerHTML = `<div class="error-message">${msg}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => new CardGuesser());
