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

// Desactivar caché agresivo en navegadores móviles para garantizar siempre la versión más reciente
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0
}));

// Funciones para obtener fecha y hora en la zona horaria local de México (Veracruz / CDMX)
function getMexicoDateTime() {
  return new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function getMexicoTime() {
  return new Date().toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

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
    gameRate: 5, // Valor de cada partida ganada (pesos)
    penaltyPerPass: 1, // Valor de aportación / penalización por cada paso (monedas/puntos)
    players: [], // { socketId, id, name, avatar, seat, isBot, ready, hand: [], passesTotal: 0, passesRound: 0, wins: 0, losses: 0, hasLeft: false, points: 0 }
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
    gameRate: (typeof room.gameRate === 'number') ? room.gameRate : 5,
    penaltyPerPass: (typeof room.penaltyPerPass === 'number') ? room.penaltyPerPass : 1,
    board: room.board,
    leftEnd: room.leftEnd,
    rightEnd: room.rightEnd,
    currentTurnSeat: room.currentTurnSeat,
    consecutivePasses: room.consecutivePasses,
    history: room.history,
    finalBalance: room.finalBalance || null,
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
      losses: p.losses || 0,
      hasLeft: p.hasLeft || false,
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
  const activePlayers = room.players.filter(p => !p.hasLeft);
  if (activePlayers.length < 2) {
    room.status = 'waiting';
    broadcastRoom(room);
    return;
  }

  room.round += 1;
  room.status = 'playing';
  room.board = [];
  room.leftEnd = null;
  room.rightEnd = null;
  room.consecutivePasses = 0;

  // Limpiar manos previas
  room.players.forEach(p => { p.hand = []; p.passesRound = 0; });

  // Barajar y repartir 7 fichas a cada participante activo (modalidad Bloqueo sin pozo)
  const deck = shuffle(generateDominoSet());
  activePlayers.forEach((p, idx) => {
    p.hand = deck.slice(idx * 7, (idx + 1) * 7);
    p.passesRound = 0;
  });

  // Determinar quién inicia:
  // En ronda 1: Quien tenga el doble más alto en mano (preferente [6-6])
  // En rondas siguientes: El ganador de la ronda anterior
  let startingSeat = activePlayers[0].seat;
  if (room.round === 1) {
    let highestDouble = -1;
    activePlayers.forEach(p => {
      (p.hand || []).forEach(t => {
        if (t.left === t.right && t.left > highestDouble) {
          highestDouble = t.left;
          startingSeat = p.seat;
        }
      });
    });

    // Si nadie tuviese dobles, se toma la ficha con mayor suma de puntos
    if (highestDouble === -1) {
      let maxPips = -1;
      activePlayers.forEach(p => {
        (p.hand || []).forEach(t => {
          const sum = t.left + t.right;
          if (sum > maxPips) {
            maxPips = sum;
            startingSeat = p.seat;
          }
        });
      });
    }
  } else {
    if (room.starterSeat !== undefined && activePlayers.some(p => p.seat === room.starterSeat)) {
      startingSeat = room.starterSeat;
    } else {
      startingSeat = activePlayers[0].seat;
    }
  }

  room.currentTurnSeat = startingSeat;
  room.starterSeat = startingSeat;

  broadcastRoom(room);
  checkBotTurn(room);
}

function getPlayableTiles(hand, leftEnd, rightEnd) {
  if (leftEnd === null || rightEnd === null) return [...hand]; // Primera jugada
  const lEnd = Number(leftEnd);
  const rEnd = Number(rightEnd);
  return (hand || []).filter(t =>
    Number(t.left) === lEnd || Number(t.right) === lEnd ||
    Number(t.left) === rEnd || Number(t.right) === rEnd
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

function handlePlayTile(room, player, tileId, side, fallbackLeft, fallbackRight) {
  let tileIndex = player.hand.findIndex(t => t.id === tileId);
  if (tileIndex === -1 && tileId) {
    const parts = String(tileId).split('-');
    if (parts.length === 2) {
      const l = parseInt(parts[0]);
      const r = parseInt(parts[1]);
      tileIndex = player.hand.findIndex(t =>
        (t.left === l && t.right === r) || (t.left === r && t.right === l)
      );
    }
  }
  if (tileIndex === -1 && fallbackLeft !== undefined && fallbackRight !== undefined) {
    tileIndex = player.hand.findIndex(t =>
      (t.left === fallbackLeft && t.right === fallbackRight) ||
      (t.left === fallbackRight && t.right === fallbackLeft)
    );
  }
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
    // Failsafe de seguridad: si el cliente pidió un extremo pero solo cabe en el otro, acomodar sin rechazar
    const fitsLeft = (tile.right === room.leftEnd || tile.left === room.leftEnd);
    const fitsRight = (tile.left === room.rightEnd || tile.right === room.rightEnd);

    if (side === 'left' && !fitsLeft && fitsRight) {
      side = 'right';
    } else if (side === 'right' && !fitsRight && fitsLeft) {
      side = 'left';
    }

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
  room.lastTilePlayedBy = {
    seat: player.seat,
    name: player.name
  };

  // Determinar quién será el siguiente jugador activo
  const activePlayers = room.players.filter(p => !p.hasLeft);
  const sorted = [...activePlayers].sort((a, b) => a.seat - b.seat);
  const currentIdx = sorted.findIndex(p => p.seat === player.seat);
  const nextPlayer = (currentIdx !== -1)
    ? sorted[(currentIdx + 1) % sorted.length]
    : sorted[0];

  // Verificar si la jugada deja al siguiente jugador sin fichas para tirar (lo hace pasar)
  const nextCanPlay = nextPlayer && nextPlayer.hand && nextPlayer.hand.some(t =>
    t.left === room.leftEnd || t.right === room.leftEnd ||
    t.left === room.rightEnd || t.right === room.rightEnd
  );
  const forcedNextPlayerToPass = (
    player.hand.length > 0 &&
    nextPlayer &&
    nextPlayer.seat !== player.seat &&
    !nextCanPlay
  );

  // Detectar si los extremos quedan con números iguales (Bomba de puntas iguales)
  // Requiere que haya al menos 2 fichas en el tablero y que el jugador no haya ganado la partida
  const isBombEnds = (player.hand.length > 0 && room.board.length >= 2 && room.leftEnd !== null && room.rightEnd !== null && room.leftEnd === room.rightEnd);

  io.to(room.id).emit('tile_played', {
    seat: player.seat,
    playerName: player.name,
    tile: placedTile,
    remainingTiles: player.hand.length,
    leftEnd: room.leftEnd,
    rightEnd: room.rightEnd,
    isBombEnds: isBombEnds,
    bombNumber: isBombEnds ? room.leftEnd : null,
    forcedPass: forcedNextPlayerToPass,
    forcedPlayerName: forcedNextPlayerToPass ? nextPlayer.name : null,
    forcedPlayerSeat: forcedNextPlayerToPass ? nextPlayer.seat : null
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

  // Siguiente turno rotativo entre jugadores activos
  advanceTurnToNextActive(room);
  return true;
}

function advanceTurnToNextActive(room) {
  const activePlayers = room.players.filter(p => !p.hasLeft);
  if (activePlayers.length < 2) {
    const soleWinner = activePlayers[0];
    if (soleWinner) {
      handleRoundEnd(room, {
        type: 'surrender',
        winnerSeat: soleWinner.seat,
        winnerName: soleWinner.name,
        surrenderedBy: 'Abandono del rival'
      });
    }
    return;
  }

  // Ordenar por número de asiento y avanzar cíclicamente al siguiente jugador activo
  const sorted = [...activePlayers].sort((a, b) => a.seat - b.seat);
  const currentIdx = sorted.findIndex(p => p.seat === room.currentTurnSeat);
  const nextPlayer = (currentIdx !== -1)
    ? sorted[(currentIdx + 1) % sorted.length]
    : sorted[0];

  room.currentTurnSeat = nextPlayer.seat;

  broadcastRoom(room);
  checkBotTurn(room);
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
  const activePlayers = room.players.filter(p => !p.hasLeft);
  if (room.consecutivePasses >= activePlayers.length) {
    handleTranca(room);
    return;
  }

  // Siguiente turno
  advanceTurnToNextActive(room);
}

function handleTranca(room) {
  let minPoints = 9999;
  let winnerSeat = 0;
  let handPoints = [];

  const activePlayers = room.players.filter(p => !p.hasLeft);
  activePlayers.forEach(p => {
    const sum = (p.hand || []).reduce((acc, t) => acc + t.left + t.right, 0);
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
    closedBySeat: room.lastTilePlayedBy ? room.lastTilePlayedBy.seat : null,
    closedByName: room.lastTilePlayedBy ? room.lastTilePlayedBy.name : null,
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

  // Sumar derrota a los jugadores activos que no ganaron
  room.players.forEach(p => {
    if (winner && p.seat !== winner.seat && !p.hasLeft) {
      p.losses = (p.losses || 0) + 1;
    }
  });

  let totalRemainingPips = 0;
  const playerStatsRound = room.players.map(p => {
    const pips = (p.hand || []).reduce((acc, t) => acc + t.left + t.right, 0);
    totalRemainingPips += pips;
    const handTiles = (p.hand || []).map(t => ({ left: t.left, right: t.right }));
    const handText = handTiles.length > 0 ? handTiles.map(t => `[${t.left}|${t.right}]`).join(' ') : '0 fichas (¡Dominó!)';
    return {
      seat: p.seat,
      name: p.name,
      remainingPips: pips,
      remainingTiles: handTiles.length,
      passesRound: p.passesRound || 0,
      passesTotal: p.passesTotal || 0,
      hand: handTiles,
      handText: handText,
      isWinner: winner ? p.seat === winner.seat : false,
      isSurrender: outcome.surrenderedBy === p.name
    };
  });

  if (winner) {
    winner.points = (winner.points || 0) + totalRemainingPips;
  }

  const firstTile = room.board.length > 0 ? room.board[0] : null;
  const starterPlayer = room.players.find(p => p.seat === room.starterSeat);
  const starterDesc = firstTile
    ? `${firstTile.playedBy} [${firstTile.left}|${firstTile.right}]`
    : (starterPlayer ? starterPlayer.name : '---');

  const roundRecord = {
    round: room.round,
    timestamp: getMexicoTime(),
    timestampMs: Date.now(),
    type: outcome.type,
    winnerSeat: outcome.winnerSeat,
    winnerName: outcome.winnerName || 'Empate',
    surrenderedBy: outcome.surrenderedBy,
    starter: starterDesc,
    totalTilesPlayed: room.board.length,
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

function calculateSessionBalance(room) {
  const gameRate = (typeof room.gameRate === 'number' && !isNaN(room.gameRate) && room.gameRate >= 0) ? room.gameRate : 5;
  const penaltyPerPass = (typeof room.penaltyPerPass === 'number' && !isNaN(room.penaltyPerPass) && room.penaltyPerPass >= 0) ? room.penaltyPerPass : 1;
  const players = room.players.map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    seat: p.seat,
    isBot: p.isBot,
    wins: p.wins || 0,
    losses: p.losses || 0,
    passesTotal: p.passesTotal || 0,
    points: p.points || 0,
    hasLeft: p.hasLeft || false
  }));

  // 1. Balance de Victorias (Ordenados de mayor a menor victorias)
  const rankedByWins = [...players].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.passesTotal !== b.passesTotal) return a.passesTotal - b.passesTotal;
    return b.points - a.points;
  });

  const champion = rankedByWins[0];
  const isDraw = rankedByWins.length > 1 && rankedByWins[0].wins === rankedByWins[1].wins && rankedByWins[0].wins > 0;

  // Diferencias de juegos ganados
  const winDifferences = [];
  for (let i = 0; i < rankedByWins.length; i++) {
    for (let j = i + 1; j < rankedByWins.length; j++) {
      const pA = rankedByWins[i];
      const pB = rankedByWins[j];
      const diff = pA.wins - pB.wins;
      const money = diff * gameRate;
      winDifferences.push({
        leader: pA.name,
        follower: pB.name,
        leaderWins: pA.wins,
        followerWins: pB.wins,
        diffWins: diff,
        amount: money,
        summaryText: diff > 0
          ? `${pA.name} superó a ${pB.name} por ${diff} juego(s) (${pA.wins} vs ${pB.wins}) ➔ $${money} pesos por victorias ($${gameRate} c/u)`
          : `${pA.name} y ${pB.name} empataron con ${pA.wins} victoria(s) ($0 pesos)`
      });
    }
  }

  // 2. Balance de Pasos y Dinero Extra (cada pase de diferencia vale $1 peso)
  const rankedByPasses = [...players].sort((a, b) => a.passesTotal - b.passesTotal);
  const minPassPlayer = rankedByPasses[0];
  const maxPassPlayer = rankedByPasses[rankedByPasses.length - 1];

  const passSettlements = [];
  if (players.length >= 2) {
    if (players.length === 2) {
      const p1 = rankedByPasses[0];
      const p2 = rankedByPasses[1];
      const diff = p2.passesTotal - p1.passesTotal;
      const extraMoney = diff * penaltyPerPass;
      passSettlements.push({
        receiver: p1.name,
        payer: p2.name,
        receiverPasses: p1.passesTotal,
        payerPasses: p2.passesTotal,
        diffPasses: diff,
        amount: extraMoney,
        summaryText: diff > 0
          ? `${p1.name} recibe $${extraMoney} pesos de ${p2.name} (diferencia de ${diff} pase(s) menos a $${penaltyPerPass} c/u)`
          : `Ambos jugadores pasaron la misma cantidad de veces (${p1.passesTotal} pases)`
      });
    } else {
      for (let i = 1; i < rankedByPasses.length; i++) {
        const pMore = rankedByPasses[i];
        const diff = pMore.passesTotal - minPassPlayer.passesTotal;
        const amount = diff * penaltyPerPass;
        passSettlements.push({
          receiver: minPassPlayer.name,
          payer: pMore.name,
          receiverPasses: minPassPlayer.passesTotal,
          payerPasses: pMore.passesTotal,
          diffPasses: diff,
          amount: amount,
          summaryText: diff > 0
            ? `${minPassPlayer.name} recibe $${amount} pesos de ${pMore.name} (${pMore.passesTotal} vs ${minPassPlayer.passesTotal} pases, dif: ${diff} a $${penaltyPerPass} c/u)`
            : `${minPassPlayer.name} y ${pMore.name} empataron en pases (${minPassPlayer.passesTotal})`
        });
      }
    }
  }

  // 3. Resumen financiero total consolidado (Juegos $5 pesos + Pases $1 peso)
  const netFinancialSummary = players.map(p => {
    let winNet = 0;
    players.forEach(other => {
      if (other.name !== p.name) {
        winNet += (p.wins - other.wins) * gameRate;
      }
    });

    let passNet = 0;
    players.forEach(other => {
      if (other.name !== p.name) {
        passNet += (other.passesTotal - p.passesTotal) * penaltyPerPass;
      }
    });

    const grandTotal = winNet + passNet;

    return {
      name: p.name,
      avatar: p.avatar,
      wins: p.wins,
      losses: p.losses,
      passesTotal: p.passesTotal,
      points: p.points,
      winNet,
      passNet,
      grandTotal
    };
  });

  // 4. Instrucción Directa y Definitiva de Pago en Pesos:
  // "que diga la persona que tiene que pagarle la cantidad que se acumuló a la otra persona en pesos"
  const finalPayments = [];
  let primaryPaymentHeadline = '';
  let primaryPaymentBreakdown = '';

  if (players.length === 2) {
    const pA = netFinancialSummary[0];
    const pB = netFinancialSummary[1];
    if (pA.grandTotal > pB.grandTotal) {
      // pB le paga a pA
      const totalAmount = pA.grandTotal;
      const winPart = (pA.wins - pB.wins) * gameRate;
      const passPart = (pB.passesTotal - pA.passesTotal) * penaltyPerPass;
      primaryPaymentHeadline = `${pB.name} debe pagarle $${totalAmount} pesos a ${pA.name}`;
      primaryPaymentBreakdown = `Desglose: $${winPart} pesos por ${pA.wins - pB.wins} juego(s) ganados de ventaja ($${gameRate} c/u) + $${passPart} pesos por ${pB.passesTotal - pA.passesTotal} pase(s) de diferencia ($${penaltyPerPass} c/u)`;
      finalPayments.push({
        payer: pB.name,
        receiver: pA.name,
        amount: totalAmount,
        winPart,
        passPart,
        summaryText: primaryPaymentHeadline,
        breakdownText: primaryPaymentBreakdown
      });
    } else if (pB.grandTotal > pA.grandTotal) {
      // pA le paga a pB
      const totalAmount = pB.grandTotal;
      const winPart = (pB.wins - pA.wins) * gameRate;
      const passPart = (pA.passesTotal - pB.passesTotal) * penaltyPerPass;
      primaryPaymentHeadline = `${pA.name} debe pagarle $${totalAmount} pesos a ${pB.name}`;
      primaryPaymentBreakdown = `Desglose: $${winPart} pesos por ${pB.wins - pA.wins} juego(s) ganados de ventaja ($${gameRate} c/u) + $${passPart} pesos por ${pA.passesTotal - pB.passesTotal} pase(s) de diferencia ($${penaltyPerPass} c/u)`;
      finalPayments.push({
        payer: pA.name,
        receiver: pB.name,
        amount: totalAmount,
        winPart,
        passPart,
        summaryText: primaryPaymentHeadline,
        breakdownText: primaryPaymentBreakdown
      });
    } else {
      primaryPaymentHeadline = `Ambos jugadores quedaron a mano ($0 pesos). ¡Empate total!`;
      primaryPaymentBreakdown = `(Juegos: ${pA.wins} vs ${pB.wins} | Pases: ${pA.passesTotal} vs ${pB.passesTotal})`;
      finalPayments.push({
        payer: 'Nadie',
        receiver: 'Nadie',
        amount: 0,
        summaryText: primaryPaymentHeadline,
        breakdownText: primaryPaymentBreakdown
      });
    }
  } else {
    // Para 3 o 4 jugadores
    const debtors = netFinancialSummary.filter(p => p.grandTotal < 0).map(p => ({ ...p, owe: Math.abs(p.grandTotal) }));
    const creditors = netFinancialSummary.filter(p => p.grandTotal > 0).map(p => ({ ...p, claim: p.grandTotal }));

    let cIdx = 0;
    debtors.forEach(d => {
      while (d.owe > 0 && cIdx < creditors.length) {
        const c = creditors[cIdx];
        const pay = Math.min(d.owe, c.claim);
        if (pay > 0) {
          finalPayments.push({
            payer: d.name,
            receiver: c.name,
            amount: pay,
            summaryText: `${d.name} debe pagarle $${pay} pesos a ${c.name}`
          });
          d.owe -= pay;
          c.claim -= pay;
        }
        if (c.claim === 0) cIdx++;
      }
    });

    if (finalPayments.length > 0) {
      primaryPaymentHeadline = finalPayments.map(fp => fp.summaryText).join(' • ');
      primaryPaymentBreakdown = `(Valores de liquidación: Cada juego vale $${gameRate} pesos | Cada pase vale $${penaltyPerPass} peso)`;
    } else {
      primaryPaymentHeadline = 'Todos los jugadores terminaron a mano ($0 pesos).';
      primaryPaymentBreakdown = '';
    }
  }

  return {
    roomId: room.id,
    finishedAt: getMexicoDateTime(),
    finishedAtIso: new Date().toISOString(),
    finishedAtMs: Date.now(),
    totalRounds: room.round,
    gameRate,
    penaltyPerPass,
    champion: champion ? champion.name : 'Nadie',
    isDraw,
    rankedByWins,
    rankedByPasses,
    winDifferences,
    passSettlements,
    netFinancialSummary,
    finalPayments,
    primaryPaymentHeadline,
    primaryPaymentBreakdown,
    history: (room.history && room.history.length > 0)
      ? room.history
      : (room.round > 0 ? [{
        round: room.round,
        timestamp: getMexicoTime(),
        timestampMs: Date.now(),
        type: 'domino',
        winnerName: champion ? champion.name : 'Ganador',
        winnerSeat: champion ? champion.seat : 0,
        starter: champion ? `${champion.name} [6|6]` : '---',
        totalTilesPlayed: room.board ? room.board.length : 14,
        pointsAwarded: champion ? champion.points : 0,
        playerStats: room.players.map(p => ({
          name: p.name,
          seat: p.seat,
          isWinner: champion && p.name === champion.name,
          passesRound: p.passesRound || p.passesTotal || 0,
          passesTotal: p.passesTotal || 0,
          remainingTiles: (champion && p.name === champion.name) ? 0 : (p.hand ? p.hand.length : 2),
          remainingPips: (champion && p.name === champion.name) ? 0 : (champion ? champion.points : 10),
          handText: (champion && p.name === champion.name) ? '0 fichas (¡Dominó!)' : (p.hand && p.hand.length > 0 ? p.hand.map(t => `[${t.left}|${t.right}]`).join(' ') : 'Fichas contadas en mesa'),
          isSurrender: false
        }))
      }] : [])
  };
}

// Configuración de WebSockets
io.on('connection', (socket) => {
  let currentRoomId = null;

  socket.on('join_room', ({ roomId, playerName, avatar, clientId, forceReset, takeSeat, gameRate, penaltyValue }) => {
    const formattedRoomId = (roomId || 'MESA-1').toUpperCase().trim();
    let room = rooms.get(formattedRoomId);

    // Identificar humanos vivos actualmente conectados por WebSocket
    const liveHumans = room ? room.players.filter(p => !p.isBot && p.socketId && io.sockets.sockets.has(p.socketId)) : [];

    // Si el usuario forzó el reinicio de la sala, o la sala no existe, o no tiene humanos vivos conectados:
    // Reiniciar la sala completamente limpia en sala de espera con 0 fichas
    if (forceReset || !room || liveHumans.length === 0) {
      room = createInitialRoom(formattedRoomId, socket.id);
      if (gameRate !== undefined && !isNaN(parseInt(gameRate))) {
        room.gameRate = Math.max(0, parseInt(gameRate));
      }
      if (penaltyValue !== undefined && !isNaN(parseInt(penaltyValue))) {
        room.penaltyPerPass = Math.max(0, parseInt(penaltyValue));
      }
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

    // 1. Verificar si hay un jugador con el mismo clientId, socketId o el mismo nombre (Reconexión legítima)
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
        // Si el jugador es nuevo y NO pidió expresamente unirse a la partida en curso
        if (!takeSeat) {
          const hasReplaceable = room.players.some(p => p.isBot || !io.sockets.sockets.has(p.socketId));
          socket.emit('room_in_progress', {
            roomId: formattedRoomId,
            round: room.round,
            liveHumansCount: liveHumans.length,
            canTakeSeat: hasReplaceable,
            suggestedRoom: `MESA-${Math.floor(Math.random() * 90) + 10}`
          });
          return;
        }

        // Si pidió tomar asiento en la partida en curso:
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

  // Configurar el número de jugadores (2, 3 o 4)
  socket.on('set_player_count', ({ count }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'waiting') return;

    // Solo el anfitrión puede cambiar el número de jugadores
    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión puede configurar la mesa.');
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

    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión puede agregar bots.');
      return;
    }

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

    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión puede remover bots.');
      return;
    }

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

    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión puede iniciar la partida.');
      return;
    }

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

  // Sincronizar mesa a petición del cliente (para recuperarse de bloqueos)
  socket.on('request_room_refresh', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    socket.emit('room_update', getSafeRoomData(room, socket.id));
  });

  // Jugar ficha
  socket.on('play_tile', ({ tileId, side, left, right }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.seat !== room.currentTurnSeat) {
      socket.emit('error_message', 'No es tu turno.');
      return;
    }

    const success = handlePlayTile(room, player, tileId, side, left, right);
    if (!success) {
      socket.emit('error_message', 'Jugada no válida para ese extremo.');
    }
  });

  // Pasar turno
  socket.on('pass_turn', (data) => {
    let rId = (data && data.roomId) ? String(data.roomId).toUpperCase().trim() : currentRoomId;
    let room = rId ? rooms.get(rId) : null;
    if (!room) {
      for (const r of rooms.values()) {
        if (r.players && r.players.some(p => p.socketId === socket.id || (data && data.clientId && p.clientId === data.clientId))) {
          room = r;
          rId = r.id;
          break;
        }
      }
    }
    if (!room || room.status !== 'playing') {
      if (room) socket.emit('room_update', getSafeRoomData(room, socket.id));
      return;
    }
    currentRoomId = room.id;
    socket.join(room.id);

    let player = room.players.find(p => p.socketId === socket.id);
    if (!player && data && data.clientId) {
      player = room.players.find(p => p.clientId === data.clientId);
    }
    if (!player && data && data.seat !== undefined) {
      player = room.players.find(p => p.seat === Number(data.seat));
    }

    if (!player) {
      socket.emit('error_message', 'No se encontró tu jugador en la mesa.');
      socket.emit('room_update', getSafeRoomData(room, socket.id));
      return;
    }

    if (player.socketId !== socket.id) {
      player.socketId = socket.id;
    }

    if (player.seat !== room.currentTurnSeat) {
      socket.emit('error_message', `No es tu turno. Le toca tirar al Asiento ${room.currentTurnSeat + 1}.`);
      socket.emit('room_update', getSafeRoomData(room, socket.id));
      return;
    }

    const playable = getPlayableTiles(player.hand, room.leftEnd, room.rightEnd);
    if (playable.length > 0) {
      socket.emit('error_message', 'Tienes fichas disponibles para jugar. En dominó no se puede pasar si tienes jugada.');
      socket.emit('room_update', getSafeRoomData(room, socket.id));
      return;
    }

    handlePassTurn(room, player);
  });

  // Configurar valor de penalización / aportación por paso (EXCLUSIVO DEL ANFITRIÓN)
  socket.on('set_penalty_value', ({ penaltyValue }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Solo el anfitrión tiene permiso de definir el costo por pase
    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión de la sala puede modificar el costo por pase.');
      return;
    }

    const num = Math.max(0, parseInt(penaltyValue) || 0);
    room.penaltyPerPass = num;
    broadcastRoom(room);
  });

  // Configurar valor de pago por partida (EXCLUSIVO DEL ANFITRIÓN)
  socket.on('set_game_rate', ({ gameRate }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Solo el anfitrión tiene permiso de definir el costo por partida
    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión de la sala puede modificar el costo por partida.');
      return;
    }

    const num = Math.max(0, parseInt(gameRate) || 0);
    room.gameRate = num;
    broadcastRoom(room);
  });

  // Configurar ambos valores de una vez (Partida y Pases - EXCLUSIVO DEL ANFITRIÓN)
  socket.on('set_bet_settings', ({ gameRate, penaltyValue }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Solo el anfitrión tiene permiso de definir las apuestas
    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', 'Solo el anfitrión de la sala puede modificar las apuestas.');
      return;
    }

    if (gameRate !== undefined && !isNaN(parseInt(gameRate))) {
      room.gameRate = Math.max(0, parseInt(gameRate));
    }
    if (penaltyValue !== undefined && !isNaN(parseInt(penaltyValue))) {
      room.penaltyPerPass = Math.max(0, parseInt(penaltyValue));
    }
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
      p.losses = 0;
      p.hasLeft = false;
      p.points = 0;
      p.ready = p.isBot ? true : false;
    });

    broadcastRoom(room);
  });

  // Abandonar partida en cualquier momento (se toma como juego perdido)
  socket.on('leave_game', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.losses = (player.losses || 0) + 1;
    player.hasLeft = true;

    if (room.status === 'playing') {
      const activePlayers = room.players.filter(p => !p.hasLeft);
      if (activePlayers.length < 2) {
        // Solo queda 1 jugador activo: gana por abandono del rival
        const soleWinner = activePlayers[0];
        if (soleWinner) {
          handleRoundEnd(room, {
            type: 'surrender',
            winnerSeat: soleWinner.seat,
            winnerName: soleWinner.name,
            surrenderedBy: player.name
          });
        }
        io.to(room.id).emit('player_surrendered', {
          playerName: player.name,
          roundEnded: true,
          winnerName: soleWinner ? soleWinner.name : ''
        });
      } else {
        // Siguen al menos 2 personas: el juego continúa para ellas
        player.hand = [];
        io.to(room.id).emit('player_surrendered', {
          playerName: player.name,
          roundEnded: false,
          remainingCount: activePlayers.length
        });

        // Si era el turno del que abandonó, pasar el turno
        if (room.currentTurnSeat === player.seat) {
          advanceTurnToNextActive(room);
        } else {
          broadcastRoom(room);
        }
      }
    } else if (room.status === 'waiting') {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      room.players.forEach((p, idx) => p.seat = idx);
      broadcastRoom(room);
    } else {
      broadcastRoom(room);
    }

    socket.emit('leave_game_ack', {
      playerName: player.name,
      losses: player.losses
    });
  });

  // Solicitar corte de balance en vivo provisional (sin finalizar la sesión)
  socket.on('get_live_balance', (data) => {
    const rId = (data && data.roomId) || currentRoomId;
    if (!rId) return;
    const room = rooms.get(rId);
    if (!room) return;

    const liveSnapshot = calculateSessionBalance(room);
    socket.emit('live_balance_snapshot', liveSnapshot);
  });

  // Acabar de jugar todos los jugadores: genera el Balance Final
  socket.on('finish_session', (data) => {
    const rId = (data && data.roomId) || currentRoomId;
    if (!rId) return;
    const room = rooms.get(rId);
    if (!room) return;

    const balanceData = calculateSessionBalance(room);
    room.status = 'session_finished';
    room.finalBalance = balanceData;

    // Emitir directamente al socket solicitante
    socket.emit('session_finished', balanceData);

    // Emitir a todos los jugadores conectados de la sala
    room.players.forEach(p => {
      if (!p.isBot && p.socketId) {
        io.to(p.socketId).emit('session_finished', balanceData);
      }
    });

    // Emitir por canal de sala y actualización general
    io.to(room.id).emit('session_finished', balanceData);
    broadcastRoom(room);
  });

  // Reiniciar sesión para jugar de nuevo
  socket.on('restart_session', () => {
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
    room.finalBalance = null;
    room.players.forEach(p => {
      p.hand = [];
      p.passesTotal = 0;
      p.passesRound = 0;
      p.wins = 0;
      p.losses = 0;
      p.hasLeft = false;
      p.points = 0;
      p.ready = p.isBot ? true : false;
    });

    io.to(room.id).emit('session_restarted');
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
