// Connect to Socket.IO server
const socket = io();

// DOM Elements
// Setup screen
const setupScreen = document.getElementById('setup-screen');
const apiKeyInput = document.getElementById('api-key');
const hostNameInput = document.getElementById('host-name');
const createRoomIdInput = document.getElementById('create-room-id');
const generateRoomIdBtn = document.getElementById('generate-room-id');
const gameModeSelect = document.getElementById('game-mode');
const livesInput = document.getElementById('lives');
const createLanguageSelect = document.getElementById('create-language');
const createGameBtn = document.getElementById('create-game-btn');
const joinRoomIdInput = document.getElementById('join-room-id');
const playerNameInput = document.getElementById('player-name');
const joinGameBtn = document.getElementById('join-game-btn');
const languageEnBtn = document.getElementById('language-en');
const languageEsBtn = document.getElementById('language-es');

// Game screen
const gameScreen = document.getElementById('game-screen');
const displayRoomId = document.getElementById('display-room-id');
const gameModeElement = document.getElementById('current-game-mode'); // Renamed variable
const changeLanguageBtn = document.getElementById('change-language-btn');
const gameLanguageSelect = document.getElementById('game-language');
const gameStateDisplay = document.getElementById('game-state');
const startGameBtn = document.getElementById('start-game-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const switchModeBtn = document.getElementById('switch-mode-btn');
const wordContainer = document.getElementById('word-container');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const hintBtn = document.getElementById('hint-btn');
const hintsList = document.getElementById('hints-list');
const guessedLettersList = document.getElementById('guessed-letters-list');
const guessedWordsList = document.getElementById('guessed-words-list');
const playersList = document.getElementById('players-list');
const messagesList = document.getElementById('messages-list');
const leaveGameBtn = document.getElementById('leave-game-btn');

// Game state
let currentRoom = null;
let isHost = false;
let currentLanguage = 'en';
let currentGameMode = 'words';
let apiKey = '';

// Check for saved API key in localStorage
if (localStorage.getItem('openrouterApiKey')) {
    apiKeyInput.value = localStorage.getItem('openrouterApiKey');
}

// Helper function to update UI language
function updateLanguage(lang) {
    currentLanguage = lang;
    
    document.querySelectorAll('[data-en], [data-es]').forEach(el => {
        el.innerText = el.getAttribute(`data-${lang}`);
    });
    
    // Update mode display
    updateGameModeDisplay();
    
    // Update placeholders
    if (lang === 'en') {
        apiKeyInput.placeholder = 'sk-or-...';
        hostNameInput.placeholder = 'Enter your name';
        createRoomIdInput.placeholder = 'Enter a unique room ID';
        joinRoomIdInput.placeholder = 'Enter room ID to join';
        playerNameInput.placeholder = 'Enter your name';
        guessInput.placeholder = 'Letter or word';
    } else {
        apiKeyInput.placeholder = 'sk-or-...';
        hostNameInput.placeholder = 'Ingresa tu nombre';
        createRoomIdInput.placeholder = 'Ingresa un ID único para la sala';
        joinRoomIdInput.placeholder = 'Ingresa el ID de la sala';
        playerNameInput.placeholder = 'Ingresa tu nombre';
        guessInput.placeholder = 'Letra o palabra';
    }
    
    // Update language buttons
    languageEnBtn.classList.toggle('active', lang === 'en');
    languageEsBtn.classList.toggle('active', lang === 'es');
}

// Helper function to update game mode display
function updateGameModeDisplay(mode) {
    if (mode) {
        currentGameMode = mode;
    }
    
    const modeAttr = `data-${currentLanguage}-${currentGameMode}`;
    
    if (gameModeElement.hasAttribute(modeAttr)) {
        gameModeElement.innerText = gameModeElement.getAttribute(modeAttr);
    }
    
    // Update guess input placeholder based on game mode
    if (currentGameMode === 'idioms') {
        guessInput.placeholder = currentLanguage === 'en' 
            ? 'Letter, word, or full idiom' 
            : 'Letra, palabra, o refrán completo';
    } else {
        guessInput.placeholder = currentLanguage === 'en' 
            ? 'Letter or word' 
            : 'Letra o palabra';
    }
}

// Function to generate a random room ID
function generateRoomId() {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    createRoomIdInput.value = roomId;
}

// Event Listeners for UI language selection
languageEnBtn.addEventListener('click', () => updateLanguage('en'));
languageEsBtn.addEventListener('click', () => updateLanguage('es'));

// Generate room ID button
generateRoomIdBtn.addEventListener('click', generateRoomId);

// Create a new game room
createGameBtn.addEventListener('click', () => {
    const roomId = createRoomIdInput.value.trim();
    const playerName = hostNameInput.value.trim();
    apiKey = apiKeyInput.value.trim();
    const language = createLanguageSelect.value;
    const initialLives = parseInt(livesInput.value);
    const gameMode = gameModeSelect.value;
    
    if (!roomId) {
        showMessage(currentLanguage === 'en' ? 'Please enter a room ID' : 'Por favor, ingresa un ID de sala', 'error');
        return;
    }
    
    if (!apiKey) {
        showMessage(currentLanguage === 'en' ? 'Please enter an OpenRouter API key' : 'Por favor, ingresa una clave API de OpenRouter', 'error');
        return;
    }
    
    // Save API key to localStorage
    localStorage.setItem('openrouterApiKey', apiKey);
    
    // Create room
    socket.emit('createRoom', { 
        roomId, 
        playerName, 
        apiKey, 
        language, 
        initialLives, 
        gameMode 
    });
    isHost = true;
    
    showMessage(currentLanguage === 'en' ? 'Creating game...' : 'Creando juego...', 'system');
});

// Join an existing game room
joinGameBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim();
    const playerName = playerNameInput.value.trim();
    
    if (!roomId || !playerName) {
        showMessage(currentLanguage === 'en' ? 'Please enter both room ID and your name' : 'Por favor, ingresa el ID de sala y tu nombre', 'error');
        return;
    }
    
    socket.emit('joinRoom', { roomId, playerName });
    
    showMessage(currentLanguage === 'en' ? 'Joining game...' : 'Uniéndose al juego...', 'system');
});

// Start the game
startGameBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('startGame', { roomId: currentRoom });
    }
});

// Play again with the same players
playAgainBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('playAgain', { roomId: currentRoom });
    }
});

// Switch game mode
switchModeBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('switchGameMode', { roomId: currentRoom });
    }
});

// Make a guess
guessBtn.addEventListener('click', () => {
    makeGuess();
});

guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        makeGuess();
    }
});

function makeGuess() {
    const guess = guessInput.value.trim();
    
    if (!guess) {
        return;
    }
    
    // Set a better placeholder after guessing
    if (currentGameMode === 'idioms') {
        guessInput.placeholder = currentLanguage === 'en' 
            ? 'Letter, word, or full idiom' 
            : 'Letra, palabra, o refrán completo';
    }
    
    socket.emit('makeGuess', { roomId: currentRoom, guess });
    guessInput.value = '';
}

function updateHistoryInfo(historyInfo, currentMode) {
    // Find or create the history display element
    let historyDisplay = document.querySelector('.history-info');
    
    if (!historyDisplay) {
        historyDisplay = document.createElement('div');
        historyDisplay.className = 'history-info';
        
        // Insert it after the room info
        const roomInfo = document.querySelector('.room-info');
        if (roomInfo && roomInfo.parentNode) {
            roomInfo.parentNode.insertBefore(historyDisplay, roomInfo.nextSibling);
        }
    }
    
    // Update the content based on current mode
    const wordsCount = historyInfo.words || 0;
    const idiomsCount = historyInfo.idioms || 0;
    
    if (currentMode === 'words') {
        historyDisplay.textContent = currentLanguage === 'en'
            ? `Words played: ${wordsCount}`
            : `Palabras jugadas: ${wordsCount}`;
    } else {
        historyDisplay.textContent = currentLanguage === 'en'
            ? `Idioms played: ${idiomsCount}`
            : `Refranes jugados: ${idiomsCount}`;
    }
}
// Request a hint
hintBtn.addEventListener('click', () => {
    socket.emit('requestHint', { roomId: currentRoom });
});

// Change language during the game
changeLanguageBtn.addEventListener('click', () => {
    if (!currentRoom || !isHost) return;
    
    const newLanguage = gameLanguageSelect.value;
    socket.emit('changeLanguage', { 
        roomId: currentRoom, 
        apiKey: apiKey, 
        language: newLanguage 
    });
    
    showMessage(
        newLanguage === 'en' 
            ? 'Changing language to English...' 
            : 'Cambiando idioma a Español...', 
        'system'
    );
});

// Leave the game
leaveGameBtn.addEventListener('click', () => {
    location.reload(); // Simple way to leave - just refresh the page
});

// Socket.IO Event Handlers
socket.on('roomCreated', ({ roomId }) => {
    currentRoom = roomId;
    displayRoomId.textContent = roomId;
    
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    
    gameLanguageSelect.value = createLanguageSelect.value;
    updateLanguage(currentLanguage);
    
    showMessage(
        currentLanguage === 'en'
            ? `Game room created! Share the room ID "${roomId}" with your friends.`
            : `¡Sala de juego creada! Comparte el ID de sala "${roomId}" con tus amigos.`,
        'success'
    );
});

// Handle successful room join
socket.on('joinedRoom', ({ roomId }) => {
    currentRoom = roomId;
    displayRoomId.textContent = roomId;
    
    // Switch from setup screen to game screen
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    
    showMessage(
        currentLanguage === 'en'
            ? `Successfully joined room "${roomId}"`
            : `Te uniste exitosamente a la sala "${roomId}"`,
        'success'
    );
});

socket.on('gameState', (gameState) => {
    if (!gameState) return;
    
    // Update game mode display
    if (gameState.gameMode) {
        updateGameModeDisplay(gameState.gameMode);
    }
    
    if (gameState.historyInfo) {
        updateHistoryInfo(gameState.historyInfo, gameState.gameMode);
    }
    // Update word display
    displayWord(gameState.maskedWord);
    
    // Update guessed letters
    updateGuessedLetters(gameState.guessedLetters, gameState.word);
    
    // Update guessed words
    updateGuessedWords(gameState.guessedWords, gameState.word);
    
    // Update hints
    updateHints(gameState.hints);
    
    // Update players
    updatePlayers(gameState.players);
    
    // Update game state with winning player info
    updateGameState(
        gameState.gameState, 
        gameState.word, 
        gameState.winningPlayer,
        gameState.lastRoundWinner
    );
    
    // Enable/disable controls based on game state
    toggleControls(gameState.gameState);
    
    // Update language in UI
    if (gameState.language) {
        gameLanguageSelect.value = gameState.language;
        updateLanguage(gameState.language);
    }
});

socket.on('playerJoined', ({ playerName, players }) => {
    updatePlayers(players);
    
    showMessage(
        currentLanguage === 'en'
            ? `${playerName} joined the game!`
            : `¡${playerName} se unió al juego!`,
        'system'
    );
});

socket.on('playerLeft', ({ playerName, players }) => {
    updatePlayers(players);
    
    showMessage(
        currentLanguage === 'en'
            ? `${playerName} left the game.`
            : `${playerName} abandonó el juego.`,
        'system'
    );
});

socket.on('message', ({ text }) => {
    showMessage(text, 'system');
});

socket.on('error', ({ message }) => {
    showMessage(message, 'error');
});

// Helper Functions
function displayWord(word) {
    wordContainer.innerHTML = '';
    
    // Define all characters that should be displayed differently
    const punctuationChars = ['.', ',', ';', ':', '!', '?'];
    const spaceChars = [' '];
    const specialChars = ['\'', '-', '(', ')', '"'];
    
    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        
        if (spaceChars.includes(char)) {
            // Space character
            const spaceElement = document.createElement('div');
            spaceElement.className = 'letter-space';
            wordContainer.appendChild(spaceElement);
        } else if (punctuationChars.includes(char)) {
            // Punctuation character - display outside the boxes
            const punctElement = document.createElement('div');
            punctElement.className = 'punctuation-char';
            punctElement.textContent = char;
            wordContainer.appendChild(punctElement);
        } else if (specialChars.includes(char)) {
            // Special characters like apostrophes or hyphens
            const specialCharElement = document.createElement('div');
            specialCharElement.className = 'letter-box special-char';
            specialCharElement.textContent = char;
            wordContainer.appendChild(specialCharElement);
        } else {
            // Regular letter
            const letterBox = document.createElement('div');
            letterBox.className = 'letter-box';
            letterBox.textContent = char === '_' ? '' : char;
            wordContainer.appendChild(letterBox);
        }
    }
}

function updateGuessedLetters(letters, word) {
    guessedLettersList.innerHTML = '';
    
    letters.forEach(letter => {
        const letterElement = document.createElement('div');
        letterElement.className = 'guessed-letter';
        letterElement.textContent = letter;
        
        // If the word is revealed, we can check if the letter is correct
        if (word) {
            if (word.includes(letter)) {
                letterElement.classList.add('correct');
            } else {
                letterElement.classList.add('incorrect');
            }
        }
        
        guessedLettersList.appendChild(letterElement);
    });
}

function updateGuessedWords(words, correctWord) {
    guessedWordsList.innerHTML = '';
    
    words.forEach(word => {
        const wordElement = document.createElement('li');
        
        // If the correct word is revealed, we can style accordingly
        if (correctWord) {
            if (word === correctWord) {
                wordElement.style.color = '#2ecc71';
                wordElement.innerHTML = `<strong>${word}</strong> ✓`;
            } else {
                wordElement.style.color = '#e74c3c';
                wordElement.innerHTML = `<s>${word}</s> ✗`;
            }
        } else {
            wordElement.textContent = word;
        }
        
        guessedWordsList.appendChild(wordElement);
    });
}

function updateHints(hints) {
    hintsList.innerHTML = '';
    
    hints.forEach((hint, index) => {
        const hintElement = document.createElement('li');
        hintElement.textContent = `${index + 1}. ${hint}`;
        hintsList.appendChild(hintElement);
    });
}

function updatePlayers(players) {
    playersList.innerHTML = '';
    
    players.forEach(player => {
        const playerElement = document.createElement('li');
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = player.name;
        
        const scoreContainer = document.createElement('div');
        scoreContainer.className = 'score-container';
        
        // Lives indicator
        const livesIndicator = document.createElement('div');
        livesIndicator.className = 'lives-indicator';
        
        const livesLabel = document.createElement('span');
        livesLabel.className = 'score-label';
        livesLabel.textContent = currentLanguage === 'en' ? 'Lives: ' : 'Vidas: ';
        livesIndicator.appendChild(livesLabel);
        
        const scoreIndicator = document.createElement('div');
        scoreIndicator.className = 'score-indicator';
        
        // Create visual life indicators
        for (let i = 0; i < Math.floor(player.score); i++) {
            const lifeElement = document.createElement('div');
            lifeElement.className = 'life';
            scoreIndicator.appendChild(lifeElement);
        }
        
        // Add half-life if needed
        if (player.score % 1 !== 0) {
            const halfLifeElement = document.createElement('div');
            halfLifeElement.className = 'life';
            halfLifeElement.style.opacity = '0.5';
            scoreIndicator.appendChild(halfLifeElement);
        }
        
        // Text representation of lives
        const livesText = document.createElement('span');
        livesText.textContent = ` (${player.score})`;
        scoreIndicator.appendChild(livesText);
        
        livesIndicator.appendChild(scoreIndicator);
        
        // Total points display
        const pointsDisplay = document.createElement('div');
        pointsDisplay.className = 'points-display';
        
        const pointsLabel = document.createElement('span');
        pointsLabel.className = 'score-label';
        pointsLabel.textContent = currentLanguage === 'en' ? 'Total Points: ' : 'Puntos Totales: ';
        pointsDisplay.appendChild(pointsLabel);
        
        const pointsValue = document.createElement('span');
        pointsValue.className = 'points-value';
        pointsValue.textContent = player.totalPoints;
        pointsDisplay.appendChild(pointsValue);
        
        // Add both indicators to score container
        scoreContainer.appendChild(livesIndicator);
        scoreContainer.appendChild(pointsDisplay);
        
        playerElement.appendChild(nameSpan);
        playerElement.appendChild(scoreContainer);
        
        playersList.appendChild(playerElement);
    });
}

function updateGameState(state, word, winningPlayer, lastRoundWinner) {
    // Remove any previous state classes
    gameScreen.classList.remove('game-waiting', 'game-playing', 'game-won', 'game-lost');
    
    // Add current state class
    gameScreen.classList.add(`game-${state}`);
    
    // Show switch mode button only to host when game is not in progress
    if (isHost && (state === 'waiting' || state === 'won' || state === 'lost')) {
        switchModeBtn.classList.remove('hidden');
    } else {
        switchModeBtn.classList.add('hidden');
    }
    
    // Update the game state text
    switch (state) {
        case 'waiting':
            gameStateDisplay.textContent = currentLanguage === 'en' 
                ? 'Waiting for players...' 
                : 'Esperando a los jugadores...';
            startGameBtn.classList.remove('hidden');
            playAgainBtn.classList.add('hidden');
            break;
        case 'playing':
            gameStateDisplay.textContent = currentLanguage === 'en' 
                ? 'Game in progress!' 
                : '¡Juego en progreso!';
            startGameBtn.classList.add('hidden');
            playAgainBtn.classList.add('hidden');
            
            // Show last round winner if available
            if (lastRoundWinner) {
                showMessage(
                    currentLanguage === 'en'
                        ? `The winner of the previous round was ${lastRoundWinner}`
                        : `El ganador de la ronda anterior fue ${lastRoundWinner}`,
                    'system'
                );
            }
            break;
        case 'won':
            let contentType = currentGameMode === 'idioms' 
                ? (currentLanguage === 'en' ? 'idiom' : 'refrán') 
                : (currentLanguage === 'en' ? 'word' : 'palabra');
                
            let winMessage = currentLanguage === 'en' 
                ? `You won! The ${contentType} was: ${word || '(unknown)'}`
                : `¡Ganaron! ${contentType === 'refrán' ? 'El' : 'La'} ${contentType} era: ${word || '(desconocida)'}`;
                
            // Add winner info if available
            if (winningPlayer) {
                winMessage += currentLanguage === 'en'
                    ? ` (Final guess by: ${winningPlayer})`
                    : ` (Adivinado por: ${winningPlayer})`;
            }
            
            gameStateDisplay.textContent = winMessage;
            startGameBtn.classList.add('hidden');
            playAgainBtn.classList.remove('hidden');
            
            // Add a message for the revealed word and winner
            showMessage(
                currentLanguage === 'en'
                    ? `The ${contentType} was: ${word || '(unknown)'}`
                    : `${contentType === 'refrán' ? 'El' : 'La'} ${contentType} era: ${word || '(desconocida)'}`,
                'success'
            );
            
            if (winningPlayer) {
                showMessage(
                    currentLanguage === 'en'
                        ? `${winningPlayer} made the winning guess!`
                        : `¡${winningPlayer} hizo la adivinanza ganadora!`,
                    'success'
                );
            }
            break;
        case 'lost':
            let lostContentType = currentGameMode === 'idioms' 
                ? (currentLanguage === 'en' ? 'idiom' : 'refrán') 
                : (currentLanguage === 'en' ? 'word' : 'palabra');
                
            gameStateDisplay.textContent = currentLanguage === 'en' 
                ? `Game over! The ${lostContentType} was: ${word || '(unknown)'}`
                : `¡Juego terminado! ${lostContentType === 'refrán' ? 'El' : 'La'} ${lostContentType} era: ${word || '(desconocida)'}`;
            startGameBtn.classList.add('hidden');
            playAgainBtn.classList.remove('hidden');
            
            // Add a message for the revealed word
            showMessage(
                currentLanguage === 'en'
                    ? `The ${lostContentType} was: ${word || '(unknown)'}`
                    : `${lostContentType === 'refrán' ? 'El' : 'La'} ${lostContentType} era: ${word || '(desconocida)'}`,
                'error'
            );
            
            // Add a message that points have been reset
            showMessage(
                currentLanguage === 'en'
                    ? `All players' points have been reset to 0`
                    : `Los puntos de todos los jugadores se han reiniciado a 0`,
                'error'
            );
            break;
    }
    
    // Also update the word display to show the full word on game over
    if ((state === 'won' || state === 'lost') && word) {
        displayWord(word);
    }
}

function toggleControls(gameState) {
    const isPlaying = gameState === 'playing';
    
    guessInput.disabled = !isPlaying;
    guessBtn.disabled = !isPlaying;
    hintBtn.disabled = !isPlaying;
    
    // Only show start/play again buttons to host
    if (!isHost) {
        startGameBtn.classList.add('hidden');
        playAgainBtn.classList.add('hidden');
        switchModeBtn.classList.add('hidden');
    }
    
    // Only allow language change for host
    changeLanguageBtn.disabled = !isHost;
}

function showMessage(text, type = 'system') {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.textContent = text;
    
    messagesList.appendChild(messageElement);
    messagesList.scrollTop = messagesList.scrollHeight;
    
    // If we're still in setup screen, show message there
    if (setupScreen.classList.contains('hidden') === false) {
        // Simple alert for setup screen messages
        if (type === 'error') {
            alert(text);
        }
    }
}

// Generate a random room ID on page load
generateRoomId();

// Initialize
updateLanguage('en');