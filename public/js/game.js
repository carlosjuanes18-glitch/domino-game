// Lógica del Cliente de Dominó Multijugador en Tiempo Real
(function() {
  const socket = io();

  // Estado del Cliente
  let mySeat = null;
  let myHand = [];
  let currentRoom = null;
  let selectedTileForChoice = null;
  let selectedAvatar = 'male_1';

  // Elementos del DOM
  const setupModal = document.getElementById('setupModal');
  const lobbyModal = document.getElementById('lobbyModal');
  const scoreboardModal = document.getElementById('scoreboardModal');
  const endChoiceModal = document.getElementById('endChoiceModal');
  const roundOverModal = document.getElementById('roundOverModal');
  const emojiDrawer = document.getElementById('emojiDrawer');

  const boardContainer = document.getElementById('boardContainer');
  const playerRack = document.getElementById('playerRack');
  const passBtn = document.getElementById('passBtn');
  const passCounterBadge = document.getElementById('passCounterBadge');
  const turnBanner = document.getElementById('turnBanner');
  const roomCodeHeader = document.getElementById('roomCodeHeader');
  const roundNumHeader = document.getElementById('roundNumHeader');
  const leftEndVal = document.getElementById('leftEndVal');
  const rightEndVal = document.getElementById('rightEndVal');
  const headerPlayerMode = document.getElementById('headerPlayerMode');

  // Inicializar Selector de Avatares en la pantalla de bienvenida
  function initAvatarSelector() {
    const avatarGrid = document.getElementById('avatarGrid');
    if (!avatarGrid) return;
    avatarGrid.innerHTML = '';

    Object.values(window.AVATARS).forEach(avatar => {
      const item = document.createElement('div');
      item.className = `avatar-option ${avatar.id === selectedAvatar ? 'selected' : ''}`;
      item.innerHTML = avatar.svg;
      item.title = avatar.name;
      item.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedAvatar = avatar.id;
        window.soundManager.playTileClick();
      });
      avatarGrid.appendChild(item);
    });
  }

  // Comprobar parámetros URL para unirse directo (?room=XXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const inputRoom = document.getElementById('inputRoomId');
    if (inputRoom) inputRoom.value = roomParam.toUpperCase();
  }

  initAvatarSelector();

  // Botón Unirse / Crear Sala
  document.getElementById('btnJoinGame').addEventListener('click', () => {
    window.soundManager.init();
    const nameInput = document.getElementById('inputPlayerName').value.trim() || 'Jugador';
    const roomInput = document.getElementById('inputRoomId').value.trim() || 'MESA-1';

    socket.emit('join_room', {
      roomId: roomInput,
      playerName: nameInput,
      avatar: selectedAvatar
    });
  });

  // Evento: Unido exitosamente a la sala
  socket.on('joined_successfully', (data) => {
    mySeat = data.playerSeat;
    setupModal.classList.add('hidden');
    lobbyModal.classList.remove('hidden');
  });

  // Configuración de Número de Jugadores (Solo Anfitrión)
  document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!currentRoom) return;
      if (currentRoom.hostId !== socket.id) {
        alert('Solo el anfitrión de la sala puede elegir la cantidad de jugadores.');
        return;
      }
      const count = parseInt(btn.getAttribute('data-count'));
      window.soundManager.playTileClick();
      socket.emit('set_player_count', { count });
    });
  });

  // Botón Añadir Bot (para completar los asientos)
  document.getElementById('btnAddBot').addEventListener('click', () => {
    window.soundManager.playTileClick();
    socket.emit('add_bot');
  });

  // Botón Comenzar Partida desde el Lobby
  document.getElementById('btnStartGame').addEventListener('click', () => {
    window.soundManager.playTileClick();
    socket.emit('start_game');
  });

  // Botón Copiar Enlace de Invitación
  document.getElementById('btnCopyInvite').addEventListener('click', () => {
    if (!currentRoom) return;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom.id}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      alert('¡Enlace de invitación copiado al portapapeles!');
    }).catch(() => {
      prompt('Copia este enlace para invitar a tus amigos:', inviteUrl);
    });
  });

  // Configuración de Aportación por Paso
  document.getElementById('penaltyInput').addEventListener('change', (e) => {
    socket.emit('set_penalty_value', { penaltyValue: e.target.value });
  });

  // Actualización Global de la Sala
  socket.on('room_update', (room) => {
    currentRoom = room;
    updateRoomUI(room);
  });

  function updateRoomUI(room) {
    const maxP = room.maxPlayers || 4;

    roomCodeHeader.textContent = room.id;
    roundNumHeader.textContent = room.round || 1;
    if (headerPlayerMode) headerPlayerMode.textContent = `${maxP}P`;

    // Actualizar extremos
    leftEndVal.textContent = room.leftEnd !== null ? room.leftEnd : '-';
    rightEndVal.textContent = room.rightEnd !== null ? room.rightEnd : '-';

    // Si estamos en la sala de espera (Lobby)
    if (room.status === 'waiting') {
      lobbyModal.classList.remove('hidden');
      updateLobbySeats(room);
    } else {
      lobbyModal.classList.add('hidden');
    }

    // Actualizar Pods de Jugadores alrededor de la mesa
    updatePlayerPods(room);

    // Actualizar el Tablero de Fichas
    window.dominoRenderer.renderBoard(room.board, room.leftEnd, room.rightEnd, boardContainer);

    // Obtener mis datos y mi mano
    const myPlayer = room.players.find(p => p.seat === mySeat);
    if (myPlayer && myPlayer.hand) {
      myHand = myPlayer.hand;
      renderPlayerHand(room);
    }

    // Actualizar Cuaderno de Puntuaciones
    updateScoreboardUI(room);

    // Indicador de Turno
    const activePlayer = room.players.find(p => p.seat === room.currentTurnSeat);
    if (activePlayer) {
      const isMyTurn = activePlayer.seat === mySeat;
      turnBanner.innerHTML = isMyTurn 
        ? `<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span> ¡ES TU TURNO DE JUGAR!`
        : `Turno de: <strong>${activePlayer.name}</strong> (${activePlayer.tileCount} fichas)`;
      
      turnBanner.style.borderColor = isMyTurn ? '#10b981' : 'rgba(254, 240, 138, 0.3)';
    }
  }

  // Actualizar los asientos en el Lobby
  function updateLobbySeats(room) {
    const seatsContainer = document.getElementById('lobbySeats');
    if (!seatsContainer) return;
    seatsContainer.innerHTML = '';

    const maxP = room.maxPlayers || 4;
    const isHost = (room.hostId === socket.id);

    // Actualizar badges del anfitrión y selector de cantidad de jugadores
    const hostStatusTag = document.getElementById('hostStatusTag');
    const nonHostNotice = document.getElementById('nonHostNotice');
    if (hostStatusTag) {
      if (isHost) {
        hostStatusTag.textContent = '👑 Eres el Anfitrión';
        hostStatusTag.className = 'text-[10px] bg-amber-500/20 text-amber-300 font-extrabold px-2 py-0.5 rounded border border-amber-500/40';
        if (nonHostNotice) nonHostNotice.classList.add('hidden');
      } else {
        const hostPlayer = room.players.find(p => p.socketId === room.hostId);
        hostStatusTag.textContent = hostPlayer ? `Anfitrión: ${hostPlayer.name}` : 'Invitado';
        hostStatusTag.className = 'text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded border border-slate-700';
        if (nonHostNotice) nonHostNotice.classList.remove('hidden');
      }
    }

    // Botones de cantidad de jugadores activa
    document.querySelectorAll('.player-count-btn').forEach(btn => {
      const cnt = parseInt(btn.getAttribute('data-count'));
      if (cnt === maxP) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      if (!isHost) {
        btn.classList.add('opacity-75');
      } else {
        btn.classList.remove('opacity-75');
      }
    });

    document.getElementById('lobbyRoomCode').textContent = room.id;
    document.getElementById('lobbyCount').textContent = `${room.players.length}/${maxP}`;
    const neededPlayersEl = document.getElementById('lobbyNeededPlayers');
    if (neededPlayersEl) neededPlayersEl.textContent = maxP;

    // Ajustar grid visual
    if (maxP === 3) {
      seatsContainer.className = 'grid grid-cols-3 gap-2 my-3';
    } else {
      seatsContainer.className = 'lobby-seats-grid';
    }

    for (let s = 0; s < maxP; s++) {
      const player = room.players.find(p => p.seat === s);
      const card = document.createElement('div');
      card.className = `lobby-seat-card ${player ? 'occupied' : ''}`;

      if (player) {
        const avatarObj = window.AVATARS[player.avatar] || window.AVATARS.male_1;
        card.innerHTML = `
          <div class="w-12 h-12 rounded-full overflow-hidden border border-emerald-400">
            ${avatarObj.svg}
          </div>
          <div class="text-xs font-bold text-slate-100 text-center">${player.name}</div>
          <div class="text-[10px] text-emerald-300">${player.isBot ? '🤖 Bot Inteligente' : (player.seat === mySeat ? '⭐ Tú' : '🟢 Conectado')}</div>
        `;
        if (player.isBot && isHost) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'text-[10px] text-red-400 hover:text-red-300 underline mt-1';
          removeBtn.textContent = 'Quitar bot';
          removeBtn.addEventListener('click', () => socket.emit('remove_bot', { seat: s }));
          card.appendChild(removeBtn);
        }
      } else {
        card.innerHTML = `
          <div class="w-10 h-10 rounded-full border border-dashed border-slate-500 flex items-center justify-center text-slate-400 text-lg">
            +
          </div>
          <div class="text-xs text-slate-400">Asiento ${s + 1}</div>
          <div class="text-[10px] text-slate-500">Esperando...</div>
        `;
      }
      seatsContainer.appendChild(card);
    }

    const startBtn = document.getElementById('btnStartGame');
    if (room.players.length === maxP) {
      startBtn.removeAttribute('disabled');
      startBtn.classList.remove('opacity-50');
      startBtn.innerHTML = `🚀 ¡Comenzar Partida (${maxP}/${maxP})!`;
    } else {
      startBtn.setAttribute('disabled', 'true');
      startBtn.classList.add('opacity-50');
      startBtn.innerHTML = `Faltan ${maxP - room.players.length} jugadores...`;
    }
  }

  // Actualizar Pods en la Mesa de Dominó adaptados a 2, 3 o 4 jugadores
  function updatePlayerPods(room) {
    const maxP = room.maxPlayers || 4;

    // Ocultar todos los pods primero
    ['south', 'west', 'north', 'east'].forEach(pos => {
      const podEl = document.getElementById(`pod_${pos}`);
      if (podEl) podEl.classList.add('hidden');
    });

    if (mySeat === null) return;

    // Mapeo dinámico según el total de jugadores:
    // - 2 Jugadores: South (Tú) y North (Rival directo)
    // - 3 Jugadores: South (Tú), West (Jugador 2), East (Jugador 3)
    // - 4 Jugadores: South (Tú), West (Jugador 2), North (Jugador 3), East (Jugador 4)
    const seatToPodMap = {};
    if (maxP === 2) {
      seatToPodMap[mySeat] = 'south';
      seatToPodMap[(mySeat + 1) % 2] = 'north';
    } else if (maxP === 3) {
      seatToPodMap[mySeat] = 'south';
      seatToPodMap[(mySeat + 1) % 3] = 'west';
      seatToPodMap[(mySeat + 2) % 3] = 'east';
    } else {
      seatToPodMap[mySeat] = 'south';
      seatToPodMap[(mySeat + 1) % 4] = 'west';
      seatToPodMap[(mySeat + 2) % 4] = 'north';
      seatToPodMap[(mySeat + 3) % 4] = 'east';
    }

    room.players.forEach(player => {
      const pos = seatToPodMap[player.seat];
      if (!pos) return;
      const podEl = document.getElementById(`pod_${pos}`);
      if (!podEl) return;

      podEl.classList.remove('hidden');
      const isCurrentTurn = room.currentTurnSeat === player.seat;
      if (isCurrentTurn) {
        podEl.classList.add('active-turn');
      } else {
        podEl.classList.remove('active-turn');
      }

      const avatarObj = window.AVATARS[player.avatar] || window.AVATARS.male_1;
      const avatarEl = podEl.querySelector('.pod-avatar');
      if (avatarEl) avatarEl.innerHTML = avatarObj.svg;

      const nameEl = podEl.querySelector('.pod-name');
      if (nameEl) nameEl.textContent = player.seat === mySeat ? `${player.name} (Tú)` : player.name;

      const tileBadge = podEl.querySelector('.pod-tile-count');
      if (tileBadge) tileBadge.textContent = player.tileCount;

      const passCounterEl = podEl.querySelector('.pod-pass-count');
      if (passCounterEl) {
        passCounterEl.innerHTML = `🚫 Pasos: <strong>${player.passesTotal || 0}</strong>`;
      }
    });
  }

  // Renderizar la Mano del Jugador con Fichas Clásicas Blancas
  function renderPlayerHand(room) {
    playerRack.innerHTML = '';

    const isMyTurn = room.status === 'playing' && room.currentTurnSeat === mySeat;
    let playableCount = 0;

    myHand.forEach(tile => {
      let isPlayable = false;

      if (isMyTurn) {
        if (room.leftEnd === null || room.rightEnd === null) {
          isPlayable = true; // Primer tiro
        } else {
          isPlayable = (
            tile.left === room.leftEnd || tile.right === room.leftEnd ||
            tile.left === room.rightEnd || tile.right === room.rightEnd
          );
        }
      }

      if (isPlayable) playableCount++;

      const tileHtml = window.dominoRenderer.renderTile(tile.left, tile.right, {
        isVertical: true,
        isDouble: tile.left === tile.right,
        isPlayable: isPlayable,
        id: `hand-${tile.left}-${tile.right}`
      });

      const wrapper = document.createElement('div');
      wrapper.innerHTML = tileHtml;
      const tileEl = wrapper.firstElementChild;

      if (isPlayable) {
        tileEl.addEventListener('click', () => onPlayerSelectTile(tile, room));
      }

      playerRack.appendChild(tileEl);
    });

    // Control del Botón de Paso
    const myPlayer = room.players.find(p => p.seat === mySeat);
    const passesCount = myPlayer ? myPlayer.passesTotal || 0 : 0;
    passCounterBadge.textContent = `${passesCount} pasos`;

    if (isMyTurn && playableCount === 0) {
      passBtn.classList.add('must-pass');
      passBtn.removeAttribute('disabled');
      passBtn.innerHTML = `⚠️ ¡NO LLEVAS! PASAR TURNO (${passesCount} acumulados)`;
    } else {
      passBtn.classList.remove('must-pass');
      passBtn.setAttribute('disabled', 'true');
      passBtn.innerHTML = `🚫 Pasar Turno (${passesCount} acumulados)`;
    }
  }

  // Manejador al hacer clic en una ficha válida
  function onPlayerSelectTile(tile, room) {
    window.soundManager.playTileClick();

    if (room.leftEnd === null) {
      socket.emit('play_tile', { tileId: `${tile.left}-${tile.right}`, side: 'root' });
      return;
    }

    const canLeft = (tile.left === room.leftEnd || tile.right === room.leftEnd);
    const canRight = (tile.left === room.rightEnd || tile.right === room.rightEnd);

    if (canLeft && canRight && room.leftEnd !== room.rightEnd) {
      selectedTileForChoice = tile;
      document.getElementById('endChoiceLeftVal').textContent = room.leftEnd;
      document.getElementById('endChoiceRightVal').textContent = room.rightEnd;
      endChoiceModal.classList.remove('hidden');
    } else if (canLeft) {
      socket.emit('play_tile', { tileId: `${tile.left}-${tile.right}`, side: 'left' });
    } else {
      socket.emit('play_tile', { tileId: `${tile.left}-${tile.right}`, side: 'right' });
    }
  }

  // Elección de Extremo en el Diálogo Modal
  document.getElementById('btnChooseLeft').addEventListener('click', () => {
    if (!selectedTileForChoice) return;
    socket.emit('play_tile', { tileId: `${selectedTileForChoice.left}-${selectedTileForChoice.right}`, side: 'left' });
    endChoiceModal.classList.add('hidden');
    selectedTileForChoice = null;
  });

  document.getElementById('btnChooseRight').addEventListener('click', () => {
    if (!selectedTileForChoice) return;
    socket.emit('play_tile', { tileId: `${selectedTileForChoice.left}-${selectedTileForChoice.right}`, side: 'right' });
    endChoiceModal.classList.add('hidden');
    selectedTileForChoice = null;
  });

  // Botón de Paso
  passBtn.addEventListener('click', () => {
    window.soundManager.playPassKnock();
    socket.emit('pass_turn');
  });

  // Notificaciones de jugadas recibidas
  socket.on('tile_played', (data) => {
    window.soundManager.playTileClick();
  });

  socket.on('player_passed', (data) => {
    window.soundManager.playPassKnock();
    triggerFloatingReaction(data.seat, '🚫 ¡PASO!');
  });

  // Final de Ronda / Dominó / Tranca
  socket.on('round_ended', (data) => {
    window.soundManager.playWinFanfare();
    showRoundOverModal(data);
  });

  function showRoundOverModal(data) {
    const outcome = data.outcome;
    const title = outcome.type === 'domino' ? '🏆 ¡DOMINÓ!' : '🔒 ¡JUEGO TRANCADO!';
    document.getElementById('roundOverTitle').textContent = title;
    document.getElementById('roundOverWinner').innerHTML = `
      Ganador de la ronda: <strong class="text-yellow-300">${outcome.winnerName}</strong>
      ${outcome.type === 'tranca' ? '<p class="text-xs text-slate-300 mt-1">Gana por tener la menor suma de puntos en mano.</p>' : ''}
    `;

    const summaryList = document.getElementById('roundOverSummary');
    summaryList.innerHTML = '';

    if (data.roundRecord && data.roundRecord.playerStats) {
      data.roundRecord.playerStats.forEach(stat => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center text-xs py-1 border-b border-slate-700/50';
        item.innerHTML = `
          <span class="font-bold text-slate-200">${stat.name}</span>
          <span class="text-slate-400">${stat.remainingTiles} fichas (${stat.remainingPips} pts) | <span class="text-red-400 font-bold">${stat.passesTotal} pasos</span></span>
        `;
        summaryList.appendChild(item);
      });
    }

    roundOverModal.classList.remove('hidden');
  }

  document.getElementById('btnNextRound').addEventListener('click', () => {
    window.soundManager.playTileClick();
    roundOverModal.classList.add('hidden');
    socket.emit('next_round');
  });

  // ==========================================
  // CUADERNO DE JUEGO / SCOREBOARD Y PENALIZACIONES
  // ==========================================
  function updateScoreboardUI(room) {
    const listEl = document.getElementById('scoreboardList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const penaltyVal = room.penaltyPerPass || 1;
    let totalPassesAll = 0;

    room.players.forEach(p => {
      totalPassesAll += (p.passesTotal || 0);
      const card = document.createElement('div');
      const isWinner = p.wins > 0;
      card.className = `player-score-card ${isWinner ? 'winner' : ''}`;

      const avatarObj = window.AVATARS[p.avatar] || window.AVATARS.male_1;
      const penaltyAmount = (p.passesTotal || 0) * penaltyVal;

      card.innerHTML = `
        <div class="score-player-header">
          <div class="w-6 h-6 rounded-full overflow-hidden">${avatarObj.svg}</div>
          <span class="text-slate-100">${p.name}</span>
          ${p.seat === mySeat ? '<span class="text-[9px] bg-emerald-600 text-white px-1 rounded">Tú</span>' : ''}
        </div>
        <div class="score-row-item">
          <span>Victorias:</span>
          <strong class="text-yellow-400 font-bold text-sm">${p.wins || 0} 🏆</strong>
        </div>
        <div class="score-row-item">
          <span>Puntos ganados:</span>
          <span class="font-semibold text-emerald-300">${p.points || 0} pts</span>
        </div>
        <div class="score-row-item">
          <span>Pasos acumulados:</span>
          <span class="score-pass-highlight">${p.passesTotal || 0} pasos</span>
        </div>
        <div class="score-row-item text-[11px] text-red-300">
          <span>Aportación/Castigo:</span>
          <strong class="text-red-400">$${penaltyAmount}</strong>
        </div>
      `;
      listEl.appendChild(card);
    });

    const penaltyBox = document.getElementById('penaltySummaryBox');
    if (penaltyBox) {
      const potTotal = totalPassesAll * penaltyVal;
      penaltyBox.innerHTML = `
        <div class="font-bold text-red-300 flex items-center justify-between">
          <span>💰 Pozo / Penalizaciones por Pasos:</span>
          <span class="text-yellow-300 font-black text-sm">$${potTotal} (${totalPassesAll} pasos totales)</span>
        </div>
        <div class="text-[11px] text-slate-300 mt-1">
          Regla: <strong>$${penaltyVal} por cada paso</strong> debido a falta de fichas.
        </div>
      `;
    }

    const historyContainer = document.getElementById('roundsHistoryTable');
    if (historyContainer) {
      if (room.history.length === 0) {
        historyContainer.innerHTML = `<div class="text-xs text-slate-400 text-center py-4">No hay rondas registradas todavía.</div>`;
      } else {
        let historyHtml = `
          <table class="w-full text-xs text-left text-slate-300">
            <thead class="text-[10px] uppercase bg-slate-800 text-slate-400">
              <tr>
                <th class="p-2">Ronda</th>
                <th class="p-2">Ganador</th>
                <th class="p-2">Tipo</th>
                <th class="p-2">Puntos</th>
              </tr>
            </thead>
            <tbody>
        `;
        room.history.forEach(h => {
          historyHtml += `
            <tr class="border-b border-slate-800">
              <td class="p-2 font-bold text-slate-100">Ronda ${h.round}</td>
              <td class="p-2 text-yellow-300 font-bold">${h.winnerName}</td>
              <td class="p-2">${h.type === 'domino' ? '🀫 Dominó' : '🔒 Tranca'}</td>
              <td class="p-2 text-emerald-300 font-bold">+${h.pointsAwarded} pts</td>
            </tr>
          `;
        });
        historyHtml += `</tbody></table>`;
        historyContainer.innerHTML = historyHtml;
      }
    }
  }

  // Botón Abrir / Cerrar Cuaderno de Juego
  document.getElementById('btnOpenScoreboard').addEventListener('click', () => {
    window.soundManager.playTileClick();
    scoreboardModal.classList.remove('hidden');
  });

  document.getElementById('btnCloseScoreboard').addEventListener('click', () => {
    scoreboardModal.classList.add('hidden');
  });

  // Botón Reiniciar Partida Completa
  document.getElementById('btnResetMatch').addEventListener('click', () => {
    if (confirm('¿Estás seguro de reiniciar todo el cuaderno y marcador de la partida?')) {
      socket.emit('reset_match');
      scoreboardModal.classList.add('hidden');
    }
  });

  // ==========================================
  // PANEL DE REACCIONES Y EMOJIS
  // ==========================================
  const emojiTriggerBtn = document.getElementById('emojiTriggerBtn');
  emojiTriggerBtn.addEventListener('click', () => {
    emojiDrawer.classList.toggle('hidden');
    window.soundManager.playTileClick();
  });

  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      socket.emit('send_reaction', { emoji });
      emojiDrawer.classList.add('hidden');
      window.soundManager.playPop();
    });
  });

  document.querySelectorAll('.quick-phrase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-text');
      socket.emit('send_reaction', { text });
      emojiDrawer.classList.add('hidden');
      window.soundManager.playPop();
    });
  });

  socket.on('reaction_received', (data) => {
    window.soundManager.playPop();
    triggerFloatingReaction(data.seat, data.emoji || data.text);
  });

  function triggerFloatingReaction(seat, content) {
    const maxP = (currentRoom && currentRoom.maxPlayers) ? currentRoom.maxPlayers : 4;
    let targetPos = 'south';

    if (mySeat !== null) {
      if (maxP === 2) {
        targetPos = (seat === mySeat) ? 'south' : 'north';
      } else if (maxP === 3) {
        if (seat === mySeat) targetPos = 'south';
        else if (seat === (mySeat + 1) % 3) targetPos = 'west';
        else targetPos = 'east';
      } else {
        if (seat === mySeat) targetPos = 'south';
        else if (seat === (mySeat + 1) % 4) targetPos = 'west';
        else if (seat === (mySeat + 2) % 4) targetPos = 'north';
        else targetPos = 'east';
      }
    }

    const pod = document.getElementById(`pod_${targetPos}`);
    if (!pod) return;

    const reactionEl = document.createElement('div');
    reactionEl.className = 'floating-reaction';
    reactionEl.textContent = content;

    const rect = pod.getBoundingClientRect();
    reactionEl.style.left = `${rect.left + rect.width / 2 - 20}px`;
    reactionEl.style.top = `${rect.top - 10}px`;

    document.body.appendChild(reactionEl);

    setTimeout(() => {
      if (reactionEl.parentNode) {
        reactionEl.parentNode.removeChild(reactionEl);
      }
    }, 1800);
  }

  // Alternar Modo Pantalla Completa / Vista Normal
  const appViewport = document.querySelector('.app-viewport');
  const btnToggleFullscreenView = document.getElementById('btnToggleFullscreenView');
  const btnFloatingViewToggle = document.getElementById('btnFloatingViewToggle');
  const fullscreenViewIcon = document.getElementById('fullscreenViewIcon');
  const pillIcon = document.getElementById('pillIcon');
  const pillText = document.getElementById('pillText');
  let isFullscreenView = false;

  function toggleFullscreenView() {
    isFullscreenView = !isFullscreenView;
    window.soundManager.playTileClick();

    if (isFullscreenView) {
      appViewport.classList.add('fullscreen-board-mode');
      if (fullscreenViewIcon) fullscreenViewIcon.textContent = '🗗';
      if (pillIcon) pillIcon.textContent = '🗗';
      if (pillText) pillText.textContent = 'Vista Normal';
    } else {
      appViewport.classList.remove('fullscreen-board-mode');
      if (fullscreenViewIcon) fullscreenViewIcon.textContent = '⛶';
      if (pillIcon) pillIcon.textContent = '⛶';
      if (pillText) pillText.textContent = 'Pantalla Completa';
    }

    // Re-ajustar el acomodo y escala de las fichas en la mesa de inmediato
    const container = document.getElementById('boardContainer');
    if (container && window.dominoRenderer) {
      setTimeout(() => window.dominoRenderer.autoFitBoard(container), 30);
      setTimeout(() => window.dominoRenderer.autoFitBoard(container), 150);
    }
  }

  if (btnToggleFullscreenView) {
    btnToggleFullscreenView.addEventListener('click', toggleFullscreenView);
  }
  if (btnFloatingViewToggle) {
    btnFloatingViewToggle.addEventListener('click', toggleFullscreenView);
  }

  // Sonido Mute Toggle
  document.getElementById('btnSoundToggle').addEventListener('click', () => {
    const isMuted = window.soundManager.toggleMute();
    document.getElementById('soundIcon').textContent = isMuted ? '🔇' : '🔊';
  });

  // Errores
  socket.on('error_message', (msg) => {
    alert(msg);
  });

})();
