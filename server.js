const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 20000,
  pingTimeout: 300000, // 5 minutos de tolerancia para que no se desconecte en celulares
  connectionStateRecovery: {
    maxDisconnectionDuration: 10 * 60 * 1000 // 10 minutos de recuperación de sesión
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Generar todas las 28 fichas del dominó tradicional doble-6
function generateDominoSet() {
  const tiles = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      tiles.push({ left: i, right: j, id: `${i}-${j}` });
    }
  }
  return tiles;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Almacén de salas activas
const rooms = new Map();

function createInitialRoom(roomId, hostSocketId) {
  return {
    id: roomId,
    hostId: hostSocketId,
    status: 'waiting', // 'waiting', 'playing', 'round_end'
    maxPlayers: 4, // 2, 3 o 4 jugadores elegidos por el anfitrión
    round: 0,
    penaltyPerPass: 1, // Valor de aportación / penalización por cada paso (monedas/puntos)
    players: [], // { socketId, id, name, avatar, seat, isBot, ready, hand: [], passesTotal: 0, passesRound: 0, wins: 0, points: 0 }
    board: [], // Fichas jugadas en la mesa
    leftEnd: null,
    rightEnd: null,
    currentTurnSeat: 0,
    consecutivePasses: 0,
    starterSeat: 0,
    history: [], // Historial de partidas del cuaderno
    log: []
  };
}

function getSafeRoomData(room, requesterSocketId) {
  return {
    id: room.id,
    hostId: room.hostId,
    status: room.status,
    maxPlayers: room.maxPlayers || 4,
    round: room.round,
    penaltyPerPass: room.penaltyPerPass,
    board: room.board,
    leftEnd: room.leftEnd,
    rightEnd: room.rightEnd,
    currentTurnSeat: room.currentTurnSeat,
    consecutivePasses: room.consecutivePasses,
    history: room.history,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      seat: p.seat,
      isBot: p.isBot,
      ready: p.ready,
      tileCount: p.hand ? p.hand.length : 0,
      passesTotal: p.passesTotal || 0,
      passesRound: p.passesRound || 0,
      wins: p.wins || 0,
      points: p.points || 0,
      // Solo enviamos la mano si es el jugador solicitante
      hand: (p.socketId === requesterSocketId) ? p.hand : undefined
    }))
  };
}

function broadcastRoom(room) {
  room.players.forEach(p => {
    if (!p.isBot && p.socketId) {
      io.to(p.socketId).emit('room_update', getSafeRoomData(room, p.socketId));
    }
  });
}

function startRound(room) {
  room.round += 1;
  room.status = 'playing';
  room.board = [];
  room.leftEnd = null;
  room.rightEnd = null;
  room.consecutivePasses = 0;

  // Barajar y repartir 7 fichas a cada participante activo (modalidad Bloqueo sin pozo)
  const deck = shuffle(generateDominoSet());
  room.players.forEach((p, idx) => {
    p.hand = deck.slice(idx * 7, (idx + 1) * 7);
    p.passesRound = 0;
  });

  // Determinar quién inicia:
  // En ronda 1: Quien tenga el doble más alto en mano (preferente [6-6])
  // En rondas siguientes: El ganador de la ronda anterior
  let startingSeat = 0;
  if (room.round === 1) {
    let highestDouble = -1;
    room.players.forEach(p => {
      p.hand.forEach(t => {
        if (t.left === t.right && t.left > highestDouble) {
          highestDouble = t.left;
          startingSeat = p.seat;
        }
      });
    });

    // Si nadie tuviese dobles, se toma la ficha con mayor suma de puntos
    if (highestDouble === -1) {
      let maxPips = -1;
      room.players.forEach(p => {
        p.hand.forEach(t => {
          const sum = t.left + t.right;
          if (sum > maxPips) {
            maxPips = sum;
            startingSeat = p.seat;
          }
        });
      });
    }
  } else {
    startingSeat = (room.starterSeat !== undefined) ? room.starterSeat : 0;
  }

  room.currentTurnSeat = startingSeat;
  room.starterSeat = startingSeat;

  broadcastRoom(room);
  checkBotTurn(room);
}

function getPlayableTiles(hand, leftEnd, rightEnd) {
  if (leftEnd === null || rightEnd === null) return [...hand]; // Primera jugada
  return hand.filter(t =>
    t.left === leftEnd || t.right === leftEnd ||
    t.left === rightEnd || t.right === rightEnd
  );
}

function checkBotTurn(room) {
  if (room.status !== 'playing') return;
  const currentP = room.players.find(p => p.seat === room.currentTurnSeat);
  if (!currentP || !currentP.isBot) return;

  const delay = Math.floor(Math.random() * 600) + 700;
  setTimeout(() => {
    if (room.status !== 'playing') return;
    const playable = getPlayableTiles(currentP.hand, room.leftEnd, room.rightEnd);

    if (playable.length > 0) {
      playable.sort((a, b) => {
        const aIsDouble = a.left === a.right ? 10 : 0;
        const bIsDouble = b.left === b.right ? 10 : 0;
        return (b.left + b.right + bIsDouble) - (a.left + a.right + aIsDouble);
      });
      const tileToPlay = playable[0];

      let side = 'right';
      if (room.leftEnd === null) {
        side = 'root';
      } else {
        const canLeft = (tileToPlay.left === room.leftEnd || tileToPlay.right === room.leftEnd);
        const canRight = (tileToPlay.left === room.rightEnd || tileToPlay.right === room.rightEnd);
        if (canLeft && canRight) {
          side = Math.random() > 0.5 ? 'left' : 'right';
        } else if (canLeft) {
          side = 'left';
        } else {
          side = 'right';
        }
      }

      handlePlayTile(room, currentP, tileToPlay.id, side);
    } else {
      handlePassTurn(room, currentP);
    }
  }, delay);
}

function handlePlayTile(room, player, tileId, side) {
  const tileIndex = player.hand.findIndex(t => t.id === tileId);
  if (tileIndex === -1) return false;
  const tile = player.hand[tileIndex];

  let placedTile = null;

  if (room.board.length === 0) {
    placedTile = {
      id: tile.id,
      left: tile.left,
      right: tile.right,
      playedBy: player.name,
      seat: player.seat,
      isDouble: tile.left === tile.right,
      side: 'root'
    };
    room.leftEnd = tile.left;
    room.rightEnd = tile.right;
    room.board.push(placedTile);
  } else {
    if (side === 'left') {
      let orientedLeft, orientedRight;
      if (tile.right === room.leftEnd) {
        orientedLeft = tile.left;
        orientedRight = tile.right;
      } else if (tile.left === room.leftEnd) {
        orientedLeft = tile.right;
        orientedRight = tile.left;
      } else {
        return false;
      }
      placedTile = {
        id: tile.id,
        left: orientedLeft,
        right: orientedRight,
        playedBy: player.name,
        seat: player.seat,
        isDouble: tile.left === tile.right,
        side: 'left'
      };
      room.leftEnd = orientedLeft;
      room.board.unshift(placedTile);
    } else {
      let orientedLeft, orientedRight;
      if (tile.left === room.rightEnd) {
        orientedLeft = tile.left;
        orientedRight = tile.right;
      } else if (tile.right === room.rightEnd) {
        orientedLeft = tile.right;
        orientedRight = tile.left;
      } else {
        return false;
      }
      placedTile = {
        id: tile.id,
        left: orientedLeft,
        right: orientedRight,
        playedBy: player.name,
        seat: player.seat,
        isDouble: tile.left === tile.right,
        side: 'right'
      };
      room.rightEnd = orientedRight;
      room.board.push(placedTile);
    }
  }

  // Quitar la ficha de la mano del jugador
  player.hand.splice(tileIndex, 1);
  room.consecutivePasses = 0;

  io.to(room.id).emit('tile_played', {
    seat: player.seat,
    playerName: player.name,
    tile: placedTile,
    remainingTiles: player.hand.length,
    leftEnd: room.leftEnd,
    rightEnd: room.rightEnd
  });

  // Verificar si el jugador hizo ¡DOMINÓ!
  if (player.hand.length === 0) {
    handleRoundEnd(room, {
      type: 'domino',
      winnerSeat: player.seat,
      winnerName: player.name
    });
    return true;
  }

  // Siguiente turno rotativo según la cantidad de jugadores configurada
  const maxP = room.maxPlayers || 4;
  room.currentTurnSeat = (room.currentTurnSeat + 1) % maxP;
  broadcastRoom(room);
  checkBotTurn(room);
  return true;
}

function handlePassTurn(room, player) {
  player.passesTotal = (player.passesTotal || 0) + 1;
  player.passesRound = (player.passesRound || 0) + 1;
  room.consecutivePasses += 1;

  io.to(room.id).emit('player_passed', {
    seat: player.seat,
    playerName: player.name,
    passesTotal: player.passesTotal,
    consecutivePasses: room.consecutivePasses
  });

  // Si todos los jugadores activos pasan consecutivamente, el juego está TRANCA / BLOQUEADO
  const maxP = room.maxPlayers || 4;
  if (room.consecutivePasses >= maxP) {
    handleTranca(room);
    return;
  }

  // Siguiente turno
  room.currentTurnSeat = (room.currentTurnSeat + 1) % maxP;
  broadcastRoom(room);
  checkBotTurn(room);
}

function handleTranca(room) {
  let minPoints = 9999;
  let winnerSeat = 0;
  let handPoints = [];

  room.players.forEach(p => {
    const sum = p.hand.reduce((acc, t) => acc + t.left + t.right, 0);
    handPoints.push({ seat: p.seat, name: p.name, points: sum });
    if (sum < minPoints) {
      minPoints = sum;
      winnerSeat = p.seat;
    }
  });

  const winner = room.players.find(p => p.seat === winnerSeat);

  handleRoundEnd(room, {
    type: 'tranca',
    winnerSeat: winner ? winner.seat : 0,
    winnerName: winner ? winner.name : 'Jugador',
    handPoints
  });
}

function handleRoundEnd(room, outcome) {
  room.status = 'round_end';
  const winner = room.players.find(p => p.seat === outcome.winnerSeat);
  if (winner) {
    winner.wins = (winner.wins || 0) + 1;
    room.starterSeat = winner.seat;
  }

  let totalRemainingPips = 0;
  const playerStatsRound = room.players.map(p => {
    const pips = p.hand.reduce((acc, t) => acc + t.left + t.right, 0);
    totalRemainingPips += pips;
    return {
      seat: p.seat,
      name: p.name,
      remainingPips: pips,
      remainingTiles: p.hand.length,
      passesRound: p.passesRound || 0,
      passesTotal: p.passesTotal || 0,
      hand: p.hand
    };
  });

  if (winner) {
    winner.points = (winner.points || 0) + totalRemainingPips;
  }

  const roundRecord = {
    round: room.round,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: outcome.type,
    winnerSeat: outcome.winnerSeat,
    winnerName: outcome.winnerName,
    pointsAwarded: totalRemainingPips,
    playerStats: playerStatsRound
  };
  room.history.push(roundRecord);

  io.to(room.id).emit('round_ended', {
    outcome,
    roundRecord,
    roomData: getSafeRoomData(room, null)
  });

  broadcastRoom(room);
}

// Configuración de WebSockets
io.on('connection', (socket) => {
  let currentRoomId = null;

  socket.on('join_room', ({ roomId, playerName, avatar, clientId, forceReset }) => {
    const formattedRoomId = (roomId || 'MESA-1').toUpperCase().trim();
    let room = rooms.get(formattedRoomId);

    // Si el usuario forzó el reinicio de la sala o no existe
    if (forceReset || !room) {
      room = createInitialRoom(formattedRoomId, socket.id);
      rooms.set(formattedRoomId, room);
    }

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    const cleanName = (playerName || 'Jugador').trim();
    const effectiveClientId = clientId || socket.id;

    // En sala de espera, purgar jugadores desconectados que ya no tengan socket activo
    if (room.status === 'waiting') {
      room.players = room.players.filter(p => p.socketId === socket.id || (p.socketId && io.sockets.sockets.has(p.socketId)));
      if (room.players.length === 0 || !room.players.some(p => p.socketId === room.hostId && io.sockets.sockets.has(p.socketId))) {
        room.hostId = socket.id;
      }
    }

    // 1. Verificar si hay un jugador con el mismo clientId, socketId o el mismo nombre
    let matchPlayer = room.players.find(p => 
      (p.clientId && p.clientId === effectiveClientId) || 
      p.socketId === socket.id ||
      p.name.toLowerCase() === cleanName.toLowerCase() ||
      p.name.toLowerCase() === `${cleanName.toLowerCase()} (auto)`
    );

    if (matchPlayer) {
      // Si había un socket previo zombie diferente, desconectarlo
      if (matchPlayer.socketId && matchPlayer.socketId !== socket.id) {
        const oldSock = io.sockets.sockets.get(matchPlayer.socketId);
        if (oldSock) oldSock.disconnect(true);
      }
      matchPlayer.socketId = socket.id;
      matchPlayer.clientId = effectiveClientId;
      matchPlayer.name = cleanName;
      matchPlayer.avatar = avatar || matchPlayer.avatar;
      matchPlayer.isBot = false;
      matchPlayer.isDisconnected = false;
      matchPlayer.lastSeen = Date.now();
      // Si era el anfitrión o el anfitrión no está vivo, este jugador es el anfitrión
      if (room.hostId === matchPlayer.socketId || !room.players.some(p => p.socketId === room.hostId && io.sockets.sockets.has(p.socketId))) {
        room.hostId = socket.id;
      }
    } else {
      if (room.status === 'waiting') {
        // En SALA DE ESPERA:
        // Si hay algún bot, se reemplaza por el humano
        const botSeat = room.players.find(p => p.isBot);
        if (botSeat) {
          botSeat.socketId = socket.id;
          botSeat.clientId = effectiveClientId;
          botSeat.name = cleanName;
          botSeat.avatar = avatar || 'male_1';
          botSeat.isBot = false;
          botSeat.isDisconnected = false;
          botSeat.lastSeen = Date.now();
        } else if (room.players.length < 4) {
          // Si hay espacio (hasta 4 jugadores), añadir al jugador
          const takenSeats = room.players.map(p => p.seat);
          let freeSeat = 0;
          for (let s = 0; s < 4; s++) {
            if (!takenSeats.includes(s)) {
              freeSeat = s;
              break;
            }
          }
          const newPlayer = {
            socketId: socket.id,
            clientId: effectiveClientId,
            id: socket.id,
            name: cleanName,
            avatar: avatar || 'male_1',
            seat: freeSeat,
            isBot: false,
            ready: false,
            hand: [],
            passesTotal: 0,
            passesRound: 0,
            wins: 0,
            points: 0,
            lastSeen: Date.now()
          };
          room.players.push(newPlayer);
          if (room.players.length > (room.maxPlayers || 2)) {
            room.maxPlayers = room.players.length;
          }
        } else {
          // Literalmente hay 4 humanos en sala de espera
          socket.emit('room_full_options', { roomId: formattedRoomId, maxPlayers: 4 });
          return;
        }
      } else {
        // En PARTIDA ACTIVA ('playing'):
        const replaceableSeat = room.players.find(p => p.isBot || !io.sockets.sockets.has(p.socketId));
        if (replaceableSeat) {
          replaceableSeat.socketId = socket.id;
          replaceableSeat.clientId = effectiveClientId;
          replaceableSeat.name = cleanName;
          replaceableSeat.avatar = avatar || 'male_1';
          replaceableSeat.isBot = false;
          replaceableSeat.isDisconnected = false;
          replaceableSeat.lastSeen = Date.now();
          if (!room.players.some(p => p.socketId === room.hostId && !p.isBot)) {
            room.hostId = socket.id;
          }
        } else {
          socket.emit('room_full_options', { roomId: formattedRoomId, maxPlayers: room.maxPlayers || 2 });
          return;
        }
      }
    }

    // Reasignar asientos correlativos si estamos en espera
    if (room.status === 'waiting') {
      room.players.forEach((p, idx) => p.seat = idx);
    }

    currentRoomId = formattedRoomId;
    socket.join(formattedRoomId);

    socket.emit('joined_successfully', {
      roomId: formattedRoomId,
      playerSeat: room.players.find(p => p.socketId === socket.id)?.seat
    });

    broadcastRoom(room);
  });

  // Reclamar Anfitrión manualmente
  socket.on('claim_host', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.hostId = socket.id;
    broadcastRoom(room);
  });

  // Limpiar mesa de espera (dejar solo al llamante como anfitrión único)
  socket.on('reset_lobby', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const me = room.players.find(p => p.socketId === socket.id);
    room.players = [{
      socketId: socket.id,
      clientId: me ? me.clientId : socket.id,
      id: socket.id,
      name: me ? me.name : 'Jugador',
      avatar: me ? me.avatar : 'male_1',
      seat: 0,
      isBot: false,
      ready: false,
      hand: [],
      passesTotal: 0,
      passesRound: 0,
      wins: 0,
      points: 0,
      lastSeen: Date.now()
    }];
    room.hostId = socket.id;
    room.status = 'waiting';
    broadcastRoom(room);
  });

  // El Anfitrión elige el número de jugadores (2, 3 o 4)
  socket.on('set_player_count', ({ count }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'waiting') return;

    if (room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión de la sala puede elegir la cantidad de jugadores.');
      return;
    }

    const num = parseInt(count);
    if (![2, 3, 4].includes(num)) return;

    room.maxPlayers = num;

    // Si hay más jugadores/bots de los configurados, remover bots sobrantes
    while (room.players.length > room.maxPlayers) {
      const botIndex = room.players.findLastIndex(p => p.isBot);
      if (botIndex !== -1) {
        room.players.splice(botIndex, 1);
      } else {
        room.players.pop();
      }
    }

    // Reasignar asientos consecutivamente
    room.players.forEach((p, idx) => {
      p.seat = idx;
    });

    broadcastRoom(room);
  });

  // Agregar Bot para completar los asientos
  socket.on('add_bot', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    const maxP = room ? (room.maxPlayers || 4) : 4;
    if (!room || room.players.length >= maxP || room.status !== 'waiting') return;

    const botNames = ['Mateo Bot', 'Sofía Bot', 'Carlos Bot', 'Valentina Bot', 'Lucas Bot', 'Camila Bot'];
    const botAvatars = ['male_2', 'female_2', 'male_3', 'female_3', 'male_4', 'female_4'];

    const takenSeats = room.players.map(p => p.seat);
    let freeSeat = 0;
    for (let s = 0; s < maxP; s++) {
      if (!takenSeats.includes(s)) {
        freeSeat = s;
        break;
      }
    }

    const availableNames = botNames.filter(n => !room.players.some(p => p.name === n));
    const botName = availableNames[0] || `Bot ${freeSeat + 1}`;
    const botAvatar = botAvatars[freeSeat % botAvatars.length];

    room.players.push({
      socketId: `bot_${Date.now()}_${freeSeat}`,
      id: `bot_${freeSeat}`,
      name: botName,
      avatar: botAvatar,
      seat: freeSeat,
      isBot: true,
      ready: true,
      hand: [],
      passesTotal: 0,
      passesRound: 0,
      wins: 0,
      points: 0
    });

    broadcastRoom(room);
  });

  // Eliminar bot
  socket.on('remove_bot', ({ seat }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'waiting') return;

    room.players = room.players.filter(p => !(p.seat === seat && p.isBot));
    // Reasignar asientos
    room.players.forEach((p, idx) => p.seat = idx);
    broadcastRoom(room);
  });

  // Iniciar partida
  socket.on('start_game', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status === 'playing') return;

    const maxP = room.maxPlayers || 4;
    if (room.players.length !== maxP) {
      socket.emit('error_message', `Se requieren exactamente ${maxP} jugadores para iniciar.`);
      return;
    }

    startRound(room);
  });

  // Siguiente ronda
  socket.on('next_round', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'round_end') return;

    startRound(room);
  });

  // Jugar ficha
  socket.on('play_tile', ({ tileId, side }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.seat !== room.currentTurnSeat) {
      socket.emit('error_message', 'No es tu turno.');
      return;
    }

    const success = handlePlayTile(room, player, tileId, side);
    if (!success) {
      socket.emit('error_message', 'Jugada no válida para ese extremo.');
    }
  });

  // Pasar turno
  socket.on('pass_turn', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.seat !== room.currentTurnSeat) {
      socket.emit('error_message', 'No es tu turno.');
      return;
    }

    const playable = getPlayableTiles(player.hand, room.leftEnd, room.rightEnd);
    if (playable.length > 0) {
      socket.emit('error_message', 'Tienes fichas disponibles para jugar. En dominó no se puede pasar si tienes jugada.');
      return;
    }

    handlePassTurn(room, player);
  });

  // Configurar valor de penalización / aportación por paso
  socket.on('set_penalty_value', ({ penaltyValue }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const num = Math.max(0, parseInt(penaltyValue) || 1);
    room.penaltyPerPass = num;
    broadcastRoom(room);
  });

  // Reacción con emojis o frases rápidas
  socket.on('send_reaction', ({ emoji, text }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      io.to(room.id).emit('reaction_received', {
        seat: player.seat,
        name: player.name,
        emoji,
        text
      });
    }
  });

  // Reiniciar partida completa
  socket.on('reset_match', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.round = 0;
    room.status = 'waiting';
    room.board = [];
    room.leftEnd = null;
    room.rightEnd = null;
    room.consecutivePasses = 0;
    room.history = [];
    room.players.forEach(p => {
      p.hand = [];
      p.passesTotal = 0;
      p.passesRound = 0;
      p.wins = 0;
      p.points = 0;
      p.ready = p.isBot ? true : false;
    });

    broadcastRoom(room);
  });

  socket.on('keep_alive', () => {
    // Mantener la conexión activa en segundo plano
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.isDisconnected = true;
      player.disconnectedAt = Date.now();
    }

    if (room.status === 'waiting') {
      // En la sala de espera, NO expulsar de inmediato al jugador ni borrar la sala.
      // Se da tiempo de espera ilimitado/prolongado (hasta 30 minutos) para que puedan invitar amigos por WhatsApp
      if (!room.cleanupTimer) {
        room.cleanupTimer = setTimeout(() => {
          const hasActiveHuman = room.players.some(p => !p.isBot && !p.isDisconnected);
          if (!hasActiveHuman) {
            rooms.delete(currentRoomId);
          }
        }, 30 * 60 * 1000); // 30 minutos de espera
      }
      broadcastRoom(room);
    } else {
      if (player) {
        player.isBot = true;
        player.name = `${player.name} (Auto)`;

        const hasHuman = room.players.some(p => !p.isBot);
        if (!hasHuman) {
          rooms.delete(currentRoomId);
          return;
        }

        broadcastRoom(room);
        checkBotTurn(room);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor de Dominó activo en http://localhost:${PORT}`);
});
