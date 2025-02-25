const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state for each room
const games = {};

// Function to get a word/idiom and hints using OpenRouter AI
async function getContentAndHints(apiKey, language, gameMode, contentHistory = []) {
  try {
    let prompt;
    
    // Include history in the prompt to avoid repetition
    const historyText = contentHistory.length > 0 
      ? `Previously used ${gameMode} that you should NOT use again: ${contentHistory.join(", ")}.` 
      : "";
    
    if (gameMode === 'idioms') {
      // Prompt for idioms/proverbs
      prompt = language === 'es' 
        ? `Genera un refrán o dicho popular en español para un juego de adivinanzas. ${historyText} Proporciona el refrán y 3 pistas diferentes, ordenadas de menos específica a más específica. Responde en formato JSON: {"idiom": "refrán completo", "hints": ["pista1", "pista2", "pista3"]}`
        : `Generate a popular idiom or proverb in English for a guessing game. ${historyText} Provide the idiom and 3 different hints, ordered from least specific to most specific. Answer in JSON format: {"idiom": "complete idiom", "hints": ["hint1", "hint2", "hint3"]}`;
    } else {
      // Default prompt for words
      prompt = language === 'es' 
        ? `Genera una palabra aleatoria en español (sustantivo común) para un juego de adivinanzas. ${historyText} Proporciona la palabra y 3 pistas diferentes sobre la palabra, ordenadas de menos específica a más específica. Responde en formato JSON: {"word": "palabra", "hints": ["pista1", "pista2", "pista3"]}`
        : `Generate a random word in English (common noun) for a guessing game. ${historyText} Provide the word and 3 different hints about the word, ordered from least specific to most specific. Answer in JSON format: {"word": "word", "hints": ["hint1", "hint2", "hint3"]}`;
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000', // Change in production
          'X-Title': 'Word Guessing Game'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Normalize the response based on game mode
      if (gameMode === 'idioms') {
        console.log('Parsed idiom:', parsed.idiom);
        return {
          content: parsed.idiom ? parsed.idiom.toLowerCase() : parsed.word?.toLowerCase(),
          hints: parsed.hints || []
        };
      } else {
        console.log('Parsed word:', parsed.word);
        return {
          content: parsed.word ? parsed.word.toLowerCase() : parsed.idiom?.toLowerCase(),
          hints: parsed.hints || []
        };
      }
    } else {
      throw new Error('Failed to parse AI response');
    }
  } catch (error) {
    console.error(`Error getting ${gameMode} from OpenRouter:`, error);
    
    // Fallback content if AI fails
    if (gameMode === 'idioms') {
      const fallbackIdioms = language === 'es' 
        ? [{ content: 'a caballo regalado no le mires el diente', hints: ['Trata sobre un regalo', 'Se refiere a la gratitud', 'No deberías criticar algo que te regalan'] }]
        : [{ content: 'don\'t look a gift horse in the mouth', hints: ['It\'s about receiving something', 'Related to gratitude', 'You shouldn\'t criticize something given for free'] }];
      return fallbackIdioms[0];
    } else {
      const fallbackWords = language === 'es' 
        ? [{ content: 'computadora', hints: ['Es un objeto', 'Se usa para trabajar', 'Tiene teclado y pantalla'] }]
        : [{ content: 'computer', hints: ['It is an object', 'Used for work', 'Has keyboard and screen'] }];
      return fallbackWords[0];
    }
  }
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
});

  // Create new game room
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
  
    // Create new game room
    socket.on('createRoom', async ({ roomId, playerName, apiKey, language, initialLives, gameMode }) => {
      try {
        // Default to 'words' if gameMode is not provided
        const mode = gameMode || 'words';
        
        const { content, hints } = await getContentAndHints(apiKey, language, mode, []);
        
        games[roomId] = {
          content: content.toLowerCase(),
          hints,
          language,
          gameMode: mode,
          players: [{ 
            id: socket.id, 
            name: playerName || 'Host', 
            score: initialLives,
            totalPoints: 0 // Total points across games
          }],
          guessedLetters: [],
          guessedWords: [],
          hintsRevealed: 0,
          initialLives: initialLives,
          gameState: 'waiting', // waiting, playing, won, lost
          apiKey, // Store the API key for play again functionality
          winningPlayer: null, // Track who made the winning guess
          lastRoundWinner: null, // Track who won the last round
          contentHistory: {  // Track content history to avoid repetition
            words: [],
            idioms: []
          }
        };
        
        // Add the first content to history
        games[roomId].contentHistory[mode].push(content.toLowerCase());
        
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        socket.emit('gameState', getPublicGameState(roomId));
        
        console.log(`Room created: ${roomId} with ${mode}: "${content}"`);
      } catch (error) {
        console.error('Error creating room:', error);
        socket.emit('error', { message: 'Failed to create room' });
      }
    });
  

  // Join existing game room
  socket.on('joinRoom', ({ roomId, playerName }) => {
    if (!games[roomId]) {
      socket.emit('error', { message: 'Game room does not exist' });
      return;
    }
    
    socket.join(roomId);
    games[roomId].players.push({ 
      id: socket.id, 
      name: playerName, 
      score: games[roomId].initialLives,
      totalPoints: 0 // Add totalPoints property for new player
    });
    
    // Send a specific joined event to the player who joined
    socket.emit('joinedRoom', { roomId });
    
    // Then send the game state
    socket.emit('gameState', getPublicGameState(roomId));
    
    // Notify all players about the new player
    io.to(roomId).emit('playerJoined', { 
      playerName, 
      players: games[roomId].players 
    });
    
    console.log(`Player ${playerName} joined room: ${roomId}`);
  });

  // Start the game
  socket.on('startGame', ({ roomId }) => {
    if (!games[roomId]) return;
    
    games[roomId].gameState = 'playing';
    games[roomId].winningPlayer = null; // Reset winning player when starting a new game
    io.to(roomId).emit('gameState', getPublicGameState(roomId));
  });

  // Make a guess (letter or word/phrase)
  socket.on('makeGuess', ({ roomId, guess }) => {
    if (!games[roomId] || games[roomId].gameState !== 'playing') return;
    
    const game = games[roomId];
    guess = guess.toLowerCase();
    
    // Find the player who made the guess
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;
    
    // Check if the guess is a single letter or a word/phrase
    if (guess.length === 1) {
      // Letter guess
      if (game.guessedLetters.includes(guess)) {
        socket.emit('message', { text: 'Letter already guessed' });
        return;
      }
      
      game.guessedLetters.push(guess);
      
      if (!game.content.includes(guess)) {
        // Incorrect letter guess - everyone loses a point
        decreaseScores(roomId);
      }
      
      // Check if the content is fully guessed through letters
      // Exclude punctuation from the check
      const nonGuessableChars = [' ', '\'', '-', '.', ',', ';', ':', '!', '?', '(', ')', '"'];
      const contentLetters = new Set(
        game.content.split('')
          .filter(l => !nonGuessableChars.includes(l))
      );
      
      const guessedAllLetters = Array.from(contentLetters)
        .every(letter => game.guessedLetters.includes(letter));
      
      if (guessedAllLetters) {
        // Content is fully guessed - game won
        game.gameState = 'won';
        game.winningPlayer = player; // Record who made the winning guess
        
        // Award points based on remaining lives
        awardPoints(roomId);
      }
      
    } else {
      // Word/phrase guess
      if (game.guessedWords.includes(guess)) {
        socket.emit('message', { 
          text: game.gameMode === 'idioms' ? 'Word/phrase already guessed' : 'Phrase already guessed' 
        });
        return;
      }
      
      game.guessedWords.push(guess);
      
      if (guess !== game.content) {
        // For idioms, check if it's a word within the idiom
        if (game.gameMode === 'idioms' && isWordInIdiom(game.content, guess)) {
          // Correctly guessed a word within the idiom - don't penalize
          socket.emit('message', { 
            text: 'You correctly guessed a word in the idiom!'
          });
        } else {
          // Incorrect word/phrase guess - everyone loses a point
          decreaseScores(roomId);
        }
      } else {
        // Correct word/phrase guess - game won
        game.gameState = 'won';
        game.winningPlayer = player; // Record who made the winning guess
        
        // Award points based on remaining lives
        awardPoints(roomId);
      }
    }
    
    // Check if the revealed words combined with guessed letters have revealed the entire content
    if (game.gameMode === 'idioms' && game.gameState !== 'won' && game.gameState !== 'lost') {
      // Get the masked content
      const maskedContent = getPublicGameState(roomId).maskedWord;
      
      // If there are no more underscores, the game is won
      if (!maskedContent.includes('_')) {
        game.gameState = 'won';
        game.winningPlayer = player;
        awardPoints(roomId);
      }
    }
    
    // Send updated game state to all players
    io.to(roomId).emit('gameState', getPublicGameState(roomId));
  });

  // Request a hint
  socket.on('requestHint', ({ roomId }) => {
    if (!games[roomId] || games[roomId].gameState !== 'playing') return;
    
    const game = games[roomId];
    if (game.hintsRevealed < game.hints.length) {
      // Reveal the next hint
      game.hintsRevealed++;
      // Everyone loses half a point for requesting a hint
      game.players.forEach(player => {
        player.score = Math.max(0, player.score - 0.5);
      });
      
      io.to(roomId).emit('gameState', getPublicGameState(roomId));
      io.to(roomId).emit('message', { 
        text: `Hint ${game.hintsRevealed}: ${game.hints[game.hintsRevealed - 1]}` 
      });
    } else {
      socket.emit('message', { text: 'No more hints available' });
    }
  });

  // Change language and get a new word/idiom
  socket.on('changeLanguage', async ({ roomId, apiKey, language }) => {
    if (!games[roomId]) return;
    
    try {
      const game = games[roomId];
      // Get content history for the current game mode
      const contentHistory = game.contentHistory[game.gameMode] || [];
      
      const { content, hints } = await getContentAndHints(apiKey, language, game.gameMode, contentHistory);
      
      // Add new content to history
      game.contentHistory[game.gameMode].push(content.toLowerCase());
      
      games[roomId] = {
        ...game,
        content: content.toLowerCase(),
        hints,
        language,
        guessedLetters: [],
        guessedWords: [],
        hintsRevealed: 0,
        gameState: 'playing',
        winningPlayer: null
      };
      
      // Reset player scores but maintain total points
      games[roomId].players.forEach(player => {
        player.score = games[roomId].initialLives;
      });
      
      io.to(roomId).emit('gameState', getPublicGameState(roomId));
      io.to(roomId).emit('message', { 
        text: language === 'es' ? 'Idioma cambiado a Español' : 'Language changed to English' 
      });
    } catch (error) {
      console.error('Error changing language:', error);
      socket.emit('error', { message: 'Failed to change language' });
    }
  });

  // Switch game mode
  socket.on('switchGameMode', async ({ roomId }) => {
    if (!games[roomId]) return;
    
    try {
      const game = games[roomId];
      // Toggle between 'words' and 'idioms'
      const newMode = game.gameMode === 'words' ? 'idioms' : 'words';
      
      // Get content history for the new game mode
      const contentHistory = game.contentHistory[newMode] || [];
      
      const { content, hints } = await getContentAndHints(game.apiKey, game.language, newMode, contentHistory);
      
      // Add new content to history
      if (!game.contentHistory[newMode]) {
        game.contentHistory[newMode] = [];
      }
      game.contentHistory[newMode].push(content.toLowerCase());
      
      games[roomId] = {
        ...game,
        content: content.toLowerCase(),
        hints,
        gameMode: newMode,
        guessedLetters: [],
        guessedWords: [],
        hintsRevealed: 0,
        gameState: 'playing',
        winningPlayer: null
      };
      
      // Reset player scores but maintain total points
      games[roomId].players.forEach(player => {
        player.score = games[roomId].initialLives;
      });
      
      io.to(roomId).emit('gameState', getPublicGameState(roomId));
      io.to(roomId).emit('message', { 
        text: game.language === 'es' 
          ? `Modo de juego cambiado a ${newMode === 'words' ? 'Palabras' : 'Refranes & Dichos'}`
          : `Game mode switched to ${newMode === 'words' ? 'Words' : 'Idioms & Proverbs'}`
      });
    } catch (error) {
      console.error('Error switching game mode:', error);
      socket.emit('error', { message: 'Failed to switch game mode' });
    }
  });

  // Play again with the same players
  socket.on('playAgain', async ({ roomId }) => {
    if (!games[roomId]) return;
    
    try {
      const game = games[roomId];
      
      // Get content history for the current game mode
      const contentHistory = game.contentHistory[game.gameMode] || [];
      
      const { content, hints } = await getContentAndHints(game.apiKey, game.language, game.gameMode, contentHistory);
      
      // Add new content to history
      game.contentHistory[game.gameMode].push(content.toLowerCase());
      
      // Store the previous winning player before resetting
      const previousWinner = game.winningPlayer;
      
      // Reset the game but keep the same players with their total points
      games[roomId] = {
        ...game,
        content: content.toLowerCase(),
        hints,
        guessedLetters: [],
        guessedWords: [],
        hintsRevealed: 0,
        gameState: 'playing',
        winningPlayer: null,
        lastRoundWinner: previousWinner
      };
      
      // Reset player score (lives) but keep total points
      games[roomId].players.forEach(player => {
        player.score = games[roomId].initialLives;
      });
      
      io.to(roomId).emit('gameState', getPublicGameState(roomId));
      
      const winnerName = previousWinner ? previousWinner.name : null;
      if (winnerName) {
        io.to(roomId).emit('message', { 
          text: game.language === 'es' 
            ? `¡Nuevo juego comenzado! El ganador de la ronda anterior fue ${winnerName}` 
            : `New game started! The winner of the previous round was ${winnerName}` 
        });
      } else {
        io.to(roomId).emit('message', { 
          text: game.language === 'es' 
            ? '¡Nuevo juego comenzado!' 
            : 'New game started!' 
        });
      }
    } catch (error) {
      console.error('Error starting new game:', error);
      socket.emit('error', { message: 'Failed to start new game' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove player from all games they were in
    Object.keys(games).forEach(roomId => {
      const game = games[roomId];
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const playerName = game.players[playerIndex].name;
        game.players.splice(playerIndex, 1);
        
        // If no players left, remove the game
        if (game.players.length === 0) {
          delete games[roomId];
          console.log(`Room ${roomId} deleted - no players left`);
        } else {
          io.to(roomId).emit('playerLeft', { 
            playerName, 
            players: game.players 
          });
        }
      }
    });
  });
});

// Helper function to get public game state (without the content)
function getPublicGameState(roomId) {
    const game = games[roomId];
    if (!game) return null;
    
    // Create a masked content with guessed letters revealed
    let maskedContent = '';
    
    // Define all punctuation and symbols that should be automatically revealed
    const nonGuessableChars = [' ', '\'', '-', '.', ',', ';', ':', '!', '?', '(', ')', '"'];

    const historyInfo = {
        words: game.contentHistory.words ? game.contentHistory.words.length : 0,
        idioms: game.contentHistory.idioms ? game.contentHistory.idioms.length : 0
      };
    for (const letter of game.content) {
      if (game.guessedLetters.includes(letter) || nonGuessableChars.includes(letter)) {
        maskedContent += letter;
      } else {
        // Check if this letter is part of a guessed word
        if (game.gameMode === 'idioms' && game.guessedWords.some(word => 
            game.content.includes(word) && 
            word.length > 1 && 
            isPartOfGuessedWord(game.content, word, game.content.indexOf(letter))
        )) {
          maskedContent += letter;
        } else {
          maskedContent += '_';
        }
      }
    }
    
    // Ensure we always reveal the content in "won" or "lost" states
    const isGameOver = game.gameState === 'won' || game.gameState === 'lost';
    
  return {
    players: game.players,
    guessedLetters: game.guessedLetters,
    guessedWords: game.guessedWords,
    maskedWord: isGameOver ? game.content : maskedContent, // Using maskedWord for compatibility
    hints: game.hints.slice(0, game.hintsRevealed),
    totalHints: game.hints.length,
    gameState: game.gameState,
    language: game.language,
    gameMode: game.gameMode,
    word: isGameOver ? game.content : null, // Using word for compatibility
    winningPlayer: game.winningPlayer ? game.winningPlayer.name : null,
    lastRoundWinner: game.lastRoundWinner ? game.lastRoundWinner.name : null,
    historyInfo // Add history info for display
  };
}

// Helper function to check if a position is part of a guessed word
function isPartOfGuessedWord(fullContent, guessedWord, position) {
    // Find all occurrences of guessedWord in fullContent
    const wordPositions = [];
    let pos = fullContent.indexOf(guessedWord);
    
    while (pos !== -1) {
      // Make sure we're matching whole words by checking boundaries
      const prevChar = pos > 0 ? fullContent[pos - 1] : ' ';
      const nextChar = pos + guessedWord.length < fullContent.length ? 
      fullContent[pos + guessedWord.length] : ' ';
      
      // Check if the word is standalone or separated by spaces/punctuation
      const nonAlphaNumeric = [' ', '.', ',', ';', ':', '!', '?', '(', ')', '"', '\'', '-'];
      
      if (nonAlphaNumeric.includes(prevChar) && nonAlphaNumeric.includes(nextChar)) {
        for (let i = 0; i < guessedWord.length; i++) {
          wordPositions.push(pos + i);
        }
      }
      
      pos = fullContent.indexOf(guessedWord, pos + 1);
    }
    
    return wordPositions.includes(position);
  }
  
// Helper function to decrease all player scores and check for game loss
function decreaseScores(roomId) {
  const game = games[roomId];
  
  game.players.forEach(player => {
    player.score = Math.max(0, player.score - 1);
  });
  
  // Check if all players have 0 score
  if (game.players.every(player => player.score === 0)) {
    game.gameState = 'lost';
    
    // Reset total points for all players when they lose
    game.players.forEach(player => {
      player.totalPoints = 0;
    });
  }
}

// Helper function to award points based on remaining lives when players win
function awardPoints(roomId) {
  const game = games[roomId];
  
  // Only award points when the game is won
  if (game.gameState !== 'won') return;
  
  // Award points equal to remaining lives to each player
  game.players.forEach(player => {
    player.totalPoints += Math.floor(player.score);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function isWordInIdiom(idiom, word) {
    // Look for whole words, not partial matches
    const nonAlphaNumeric = [' ', '.', ',', ';', ':', '!', '?', '(', ')', '"', '\'', '-'];
    
    let pos = idiom.indexOf(word);
    
    while (pos !== -1) {
      // Check if the word is standalone or separated by punctuation/spaces
      const prevChar = pos > 0 ? idiom[pos - 1] : ' ';
      const nextChar = pos + word.length < idiom.length ? idiom[pos + word.length] : ' ';
      
      if (nonAlphaNumeric.includes(prevChar) && nonAlphaNumeric.includes(nextChar)) {
        return true;
      }
      
      pos = idiom.indexOf(word, pos + 1);
    }
    
    return false;
}