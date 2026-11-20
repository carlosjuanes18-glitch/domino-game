// Lógica del Cliente de Dominó Multijugador en Tiempo Real
(function () {
  // Identificador único persistente del dispositivo/navegador
  let myClientId = localStorage.getItem('domino_client_id');
  if (!myClientId) {
    myClientId = 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('domino_client_id', myClientId);
  }

  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 120000
  });

  // Mantener la conexión activa en celulares y evitar que se duerma
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('keep_alive');
    }
  }, 10000);

  // Auto-recuperar sesión y sincronizar mesa al reconectar o volver de otra app / desbloquear pantalla
  function syncSessionWithServer() {
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }
    const saved = sessionStorage.getItem('domino_active_session');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        socket.emit('join_room', { ...data, clientId: myClientId });
      } catch (e) { }
    }
    socket.emit('request_room_refresh');
  }

  socket.on('connect', () => {
    syncSessionWithServer();
  });

  socket.on('reconnect', () => {
    syncSessionWithServer();
    showToast('✅ Conexión recuperada con éxito.');
  });

  socket.on('disconnect', () => {
    showToast('⚠️ Conexión móvil inestable. Reconectando...');
  });

  // Cuando el celular se desbloquea, se enciende la pantalla o se vuelve a la pestaña
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncSessionWithServer();
    }
  });

  window.addEventListener('focus', () => {
    syncSessionWithServer();
  });

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
  const finalBalanceModal = document.getElementById('finalBalanceModal');
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

  // Botón Generar Otra Sala Aleatoria
  const btnRandomRoom = document.getElementById('btnRandomRoom');
  if (btnRandomRoom) {
    btnRandomRoom.addEventListener('click', () => {
      window.soundManager.playTileClick();
      const rand = Math.floor(Math.random() * 90) + 10;
      document.getElementById('inputRoomId').value = `MESA-${rand}`;
    });
  }

  // Botón Reiniciar Sala Manualmente
  const btnResetRoom = document.getElementById('btnResetRoom');
  if (btnResetRoom) {
    btnResetRoom.addEventListener('click', () => {
      const roomInput = document.getElementById('inputRoomId').value.trim() || 'MESA-1';
      if (confirm(`¿Deseas reiniciar ${roomInput} y dejarla libre para comenzar de cero?`)) {
        window.soundManager.playTileClick();
        const nameInput = document.getElementById('inputPlayerName').value.trim() || 'Jugador';
        socket.emit('join_room', {
          roomId: roomInput,
          playerName: nameInput,
          avatar: selectedAvatar,
          clientId: myClientId,
          forceReset: true
        });
      }
    });
  }

  // Botón Unirse / Crear Sala
  document.getElementById('btnJoinGame').addEventListener('click', () => {
    window.soundManager.init();
    const nameInput = document.getElementById('inputPlayerName').value.trim() || 'Jugador';
    const roomInput = document.getElementById('inputRoomId').value.trim() || 'MESA-1';

    // Guardar para que nunca se pierda si minimiza o cambia de app
    sessionStorage.setItem('domino_active_session', JSON.stringify({
      roomId: roomInput,
      playerName: nameInput,
      avatar: selectedAvatar,
      clientId: myClientId
    }));

    socket.emit('join_room', {
      roomId: roomInput,
      playerName: nameInput,
      avatar: selectedAvatar,
      clientId: myClientId
    });
  });

  // Botón Crear Mesa Nueva Limpia (Automática)
  const btnCreateCleanRoom = document.getElementById('btnCreateCleanRoom');
  if (btnCreateCleanRoom) {
    btnCreateCleanRoom.addEventListener('click', () => {
      window.soundManager.init();
      window.soundManager.playTileClick();
      const nameInput = document.getElementById('inputPlayerName').value.trim() || 'Jugador';
      const rand = Math.floor(Math.random() * 90) + 10;
      const cleanRoom = `MESA-${rand}`;
      const inputRoom = document.getElementById('inputRoomId');
      if (inputRoom) inputRoom.value = cleanRoom;

      sessionStorage.setItem('domino_active_session', JSON.stringify({
        roomId: cleanRoom,
        playerName: nameInput,
        avatar: selectedAvatar,
        clientId: myClientId
      }));

      socket.emit('join_room', {
        roomId: cleanRoom,
        playerName: nameInput,
        avatar: selectedAvatar,
        clientId: myClientId,
        forceReset: true
      });
    });
  }

  // Evento: Unido exitosamente a la sala
  socket.on('joined_successfully', (data) => {
    mySeat = data.playerSeat;
    setupModal.classList.add('hidden');
    setupModal.style.display = 'none';
    lobbyModal.classList.remove('hidden');
    lobbyModal.style.display = 'flex';
  });

  // Botón Reclamar Anfitrión
  const btnClaimHost = document.getElementById('btnClaimHost');
  if (btnClaimHost) {
    btnClaimHost.addEventListener('click', () => {
      window.soundManager.playTileClick();
      socket.emit('claim_host');
    });
  }

  // Botón Limpiar/Vaciar Sala desde el Lobby
  const btnResetLobby = document.getElementById('btnResetLobby');
  if (btnResetLobby) {
    btnResetLobby.addEventListener('click', () => {
      if (confirm('¿Deseas vaciar los asientos de la sala y quedar tú solo como anfitrión en la mesa?')) {
        window.soundManager.playTileClick();
        socket.emit('reset_lobby');
      }
    });
  }

  // Configuración de Número de Jugadores (Libre para configurar la mesa)
  document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!currentRoom) return;
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
    // Ocultar modal del lobby de inmediato para evitar que quede congelado en pantalla
    lobbyModal.classList.add('hidden');
    lobbyModal.style.display = 'none';
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

    // Si la sesión de juego finalizó, mostrar el Balance Final directamente
    if (room.status === 'session_finished' && room.finalBalance) {
      renderFinalBalance(room.finalBalance);
      return;
    }

    // Actualizar extremos
    leftEndVal.textContent = room.leftEnd !== null ? room.leftEnd : '-';
    rightEndVal.textContent = room.rightEnd !== null ? room.rightEnd : '-';

    // Si estamos en la sala de espera (Lobby)
    if (room.status === 'waiting') {
      lobbyModal.classList.remove('hidden');
      lobbyModal.style.display = 'flex';
      setupModal.classList.add('hidden');
      setupModal.style.display = 'none';
      updateLobbySeats(room);
    } else {
      lobbyModal.classList.add('hidden');
      lobbyModal.style.display = 'none';
      setupModal.classList.add('hidden');
      setupModal.style.display = 'none';
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
    if (room.status === 'round_end') {
      turnBanner.innerHTML = '🏁 ¡Ronda Finalizada! (¡Dominó / Tranca!)';
      turnBanner.style.borderColor = '#eab308';
      // Failsafe: Asegurar que el modal de fin de ronda esté visible
      roundOverModal.classList.remove('hidden');
      roundOverModal.style.display = 'flex';
    } else if (room.status === 'session_finished') {
      turnBanner.innerHTML = '🏆 ¡Sesión de Dominó Finalizada!';
      turnBanner.style.borderColor = '#10b981';
    } else {
      const activePlayer = room.players.find(p => p.seat === room.currentTurnSeat);
      if (activePlayer) {
        const isMyTurn = activePlayer.seat === mySeat;
        turnBanner.innerHTML = isMyTurn
          ? `<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span> ¡ES TU TURNO DE JUGAR!`
          : `Turno de: <strong>${activePlayer.name}</strong> (${activePlayer.tileCount} fichas)`;

        turnBanner.style.borderColor = isMyTurn ? '#10b981' : 'rgba(254, 240, 138, 0.3)';
      }
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
      const isCurrentTurn = (room.status === 'playing') && (room.currentTurnSeat === player.seat);
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

    if (myHand.length === 0) {
      playerRack.innerHTML = '<div class="text-xs text-yellow-300 font-extrabold py-3 text-center w-full">🏆 ¡Fichas agotadas! ¡Has hecho Dominó!</div>';
      passBtn.classList.remove('must-pass');
      passBtn.setAttribute('disabled', 'true');
      passBtn.innerHTML = '🏆 ¡Ronda Ganada!';
      return;
    }

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

  // Notificación tipo Toast no intrusiva (nunca saca al jugador de la partida)
  function showToast(message) {
    let toast = document.getElementById('gameToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gameToast';
      toast.style.cssText = `
        position: fixed;
        top: 65px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(15, 23, 42, 0.95);
        color: #fef08a;
        border: 1.5px solid #eab308;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7);
        padding: 9px 18px;
        border-radius: 9999px;
        font-size: 13px;
        font-weight: 800;
        z-index: 999999;
        pointer-events: none;
        opacity: 0;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        text-align: center;
        max-width: 90vw;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 2500);
  }

  // Manejador al hacer clic en una ficha válida
  function onPlayerSelectTile(tile, room) {
    if (!room || room.status !== 'playing' || room.currentTurnSeat !== mySeat) {
      showToast('⏳ Espera tu turno para tirar ficha.');
      return;
    }
    window.soundManager.playTileClick();

    if (room.leftEnd === null) {
      socket.emit('play_tile', {
        tileId: tile.id || `${tile.left}-${tile.right}`,
        side: 'root',
        left: tile.left,
        right: tile.right
      });
      return;
    }

    const canLeft = (tile.left === room.leftEnd || tile.right === room.leftEnd);
    const canRight = (tile.left === room.rightEnd || tile.right === room.rightEnd);

    if (canLeft && canRight && room.leftEnd !== room.rightEnd) {
      selectedTileForChoice = tile;
      document.getElementById('endChoiceLeftVal').textContent = room.leftEnd;
      document.getElementById('endChoiceRightVal').textContent = room.rightEnd;
      endChoiceModal.classList.remove('hidden');
      endChoiceModal.style.display = 'flex';
    } else if (canLeft) {
      socket.emit('play_tile', {
        tileId: tile.id || `${tile.left}-${tile.right}`,
        side: 'left',
        left: tile.left,
        right: tile.right
      });
    } else if (canRight) {
      socket.emit('play_tile', {
        tileId: tile.id || `${tile.left}-${tile.right}`,
        side: 'right',
        left: tile.left,
        right: tile.right
      });
    }
  }

  // Elección de Extremo en el Diálogo Modal con soporte de cancelación y toques móviles
  function closeEndChoiceModal() {
    endChoiceModal.classList.add('hidden');
    endChoiceModal.style.display = 'none';
    selectedTileForChoice = null;
  }

  function handleChoicePlay(side) {
    if (!selectedTileForChoice) return;
    const tile = selectedTileForChoice;
    socket.emit('play_tile', {
      tileId: tile.id || `${tile.left}-${tile.right}`,
      side: side,
      left: tile.left,
      right: tile.right
    });
    closeEndChoiceModal();
  }

  const btnChooseLeft = document.getElementById('btnChooseLeft');
  if (btnChooseLeft) {
    btnChooseLeft.addEventListener('click', () => handleChoicePlay('left'));
  }

  const btnChooseRight = document.getElementById('btnChooseRight');
  if (btnChooseRight) {
    btnChooseRight.addEventListener('click', () => handleChoicePlay('right'));
  }

  const btnCancelChoice = document.getElementById('btnCancelChoice');
  if (btnCancelChoice) {
    btnCancelChoice.addEventListener('click', closeEndChoiceModal);
  }

  const btnCloseEndChoice = document.getElementById('btnCloseEndChoice');
  if (btnCloseEndChoice) {
    btnCloseEndChoice.addEventListener('click', closeEndChoiceModal);
  }

  endChoiceModal.addEventListener('click', (e) => {
    if (e.target === endChoiceModal) {
      closeEndChoiceModal();
    }
  });

  // Botón de Paso
  passBtn.addEventListener('click', () => {
    if (!currentRoom || currentRoom.currentTurnSeat !== mySeat) {
      showToast('⏳ Espera tu turno para jugar o pasar.');
      return;
    }
    const myPlayer = currentRoom.players ? currentRoom.players.find(p => p.seat === mySeat) : null;
    const hand = (myPlayer && myPlayer.hand) ? myPlayer.hand : [];
    const canPlay = hand.some(t =>
      currentRoom.leftEnd === null ||
      t.left === currentRoom.leftEnd || t.right === currentRoom.leftEnd ||
      t.left === currentRoom.rightEnd || t.right === currentRoom.rightEnd
    );
    if (canPlay) {
      showToast('⚠️ Tienes fichas disponibles para jugar. En dominó no se puede pasar si tienes jugada.');
      return;
    }
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
    if (data.outcome && data.outcome.type === 'tranca') {
      window.soundManager.playSnareRollReveal();
    } else {
      window.soundManager.playWinFanfare();
    }
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
    roundOverModal.style.display = 'flex';
  }

  document.getElementById('btnNextRound').addEventListener('click', () => {
    window.soundManager.playTileClick();
    roundOverModal.classList.add('hidden');
    roundOverModal.style.display = 'none';
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
    });
  });

  document.querySelectorAll('.quick-phrase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-text');
      socket.emit('send_reaction', { text });
      emojiDrawer.classList.add('hidden');
    });
  });

  socket.on('reaction_received', (data) => {
    // Sonidos temáticos según el emoji o frase enviada
    if (data.emoji === '💣') {
      // Bomba clásica en forma de bola negra -> Efecto Bomba de Tiempo
      window.soundManager.playTimeBomb();
    } else if (data.emoji === 'DOMINO_PSYCHO' || (data.text && data.text.includes('Psicópata'))) {
      // Dominó Psicópata con cuchillo -> Tema de Psicosis
      window.soundManager.playPsychosis();
    } else if (data.emoji === '😂') {
      window.soundManager.playLaughter();
    } else if (data.emoji === '😱' || data.emoji === '💀') {
      window.soundManager.playScream();
    } else if (data.emoji === '😡' || data.emoji === '🤬') {
      window.soundManager.playAngry();
    } else if (data.text && data.text.includes('volar la papada')) {
      window.soundManager.playTimeBomb();
    } else if (data.emoji === '🤯' || (data.text && data.text.includes('volaste la papada'))) {
      window.soundManager.playFailureTrumpet();
    } else if (data.text === '¡No llevo!' || data.emoji === '🚫') {
      window.soundManager.playNo();
    } else {
      window.soundManager.playPop();
    }

    triggerFloatingReaction(data.seat, data.emoji || data.text);
  });

  function triggerFloatingReaction(seat, content) {
    if (!content) return;
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
    if (pod) {
      // Mostrar globito de reacción sobre el avatar del jugador que reaccionó
      const miniBubble = document.createElement('div');
      miniBubble.className = 'avatar-reaction-bubble';
      if (content === 'DOMINO_PSYCHO') {
        miniBubble.innerHTML = `<img src="/images/domino-psycho.svg" class="w-8 h-8 inline-block object-contain" alt="Dominó Psicópata">`;
      } else {
        miniBubble.textContent = content;
      }
      pod.appendChild(miniBubble);
      setTimeout(() => {
        if (miniBubble.parentNode) miniBubble.parentNode.removeChild(miniBubble);
      }, 3500);
    }

    // Detectar si es un emoji individual o una frase de texto
    const isSingleEmoji = (content.length <= 4 && !content.includes(' ')) || content === 'DOMINO_PSYCHO';

    if (isSingleEmoji) {
      // Caravana de 12 emojis que recorren lentamente toda la pantalla (de abajo hacia arriba, cubriendo todo el ancho)
      const count = 12;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          createSlowScreenEmoji(content, i, count);
        }, i * 230);
      }
    } else {
      // Frase de texto flotante destacada en el centro de la pantalla
      const badge = document.createElement('div');
      badge.className = 'floating-phrase-badge';
      badge.textContent = content;
      document.body.appendChild(badge);

      // Acompañar con emojis temáticos flotando lentamente por toda la pantalla
      let thematicIcons = ['💬', '🗣️', '💭'];
      if (content.includes('Psicópata')) {
        thematicIcons = ['DOMINO_PSYCHO', '🔪', '🩸', 'DOMINO_PSYCHO', '🔪', '🩸', 'DOMINO_PSYCHO', '🔪', '🩸', 'DOMINO_PSYCHO', '🔪', 'DOMINO_PSYCHO'];
      } else if (content.includes('volar la papada')) {
        thematicIcons = ['💣', '💥', '🔥', '💣', '💥', '🔥', '💣', '💥', '🔥', '💣', '💥', '🔥'];
      } else if (content.includes('volaste la papada')) {
        thematicIcons = ['🤯', '💥', '😵', '🤕', '🤯', '💥', '😵', '🤕', '🤯', '💥', '😵', '🤕'];
      } else if (content.includes('Dominó')) {
        thematicIcons = ['🀫', '🏆', '🎉', '👑', '🀫', '🏆', '🎉', '👑', '🀫', '🏆', '🎉', '👑'];
      } else if (content.includes('Tranca')) {
        thematicIcons = ['🔒', '⛔', '🔐', '🔒', '⛔', '🔐', '🔒', '⛔', '🔐', '🔒', '⛔', '🔐'];
      } else if (content.includes('No llevo') || content.includes('PASO')) {
        thematicIcons = ['🚫', '🛑', '✋', '🚫', '🛑', '✋', '🚫', '🛑', '✋', '🚫', '🛑', '✋'];
      } else if (content.includes('Abran paso')) {
        thematicIcons = ['⚡', '🚀', '💨', '⚡', '🚀', '💨', '⚡', '🚀', '💨', '⚡', '🚀', '💨'];
      }

      thematicIcons.forEach((em, idx) => {
        setTimeout(() => createSlowScreenEmoji(em, idx, thematicIcons.length), idx * 220);
      });

      setTimeout(() => {
        if (badge.parentNode) badge.parentNode.removeChild(badge);
      }, 4200);
    }
  }

  function createSlowScreenEmoji(emoji, index, total) {
    const el = document.createElement('div');
    el.className = 'slow-screen-emoji';
    if (emoji === 'DOMINO_PSYCHO') {
      el.innerHTML = `<img src="/images/domino-psycho.svg" class="slow-psycho-domino-img" alt="Dominó Psicópata">`;
    } else {
      el.textContent = emoji;
    }

    const screenW = window.innerWidth || document.documentElement.clientWidth || 360;
    // Dividir en 5 carriles que cubren de borde a borde toda la pantalla
    const numLanes = 5;
    const laneWidth = (screenW - 50) / numLanes;
    const laneIndex = (index % numLanes);
    const baseX = 20 + (laneIndex * laneWidth);
    const jitter = (Math.random() - 0.5) * (laneWidth * 0.65);
    const posX = Math.max(10, Math.min(screenW - 60, baseX + jitter));

    // Variaciones de tamaño para que se vean grandes, nítidos y vivos (2.7rem a 4.1rem)
    const size = 2.7 + Math.random() * 1.4;
    // Duración de viaje lento por toda la pantalla: 7.0 a 9.5 segundos
    const duration = 7.0 + Math.random() * 2.5;
    // Oscilación o deriva horizontal suave
    const driftX = (Math.random() - 0.5) * 60;
    const rot1 = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 8);
    const rot2 = -rot1 * (0.8 + Math.random() * 0.4);

    el.style.left = `${posX}px`;
    el.style.fontSize = `${size}rem`;
    el.style.setProperty('--drift-x', `${driftX}px`);
    el.style.setProperty('--rot-1', `${rot1}deg`);
    el.style.setProperty('--rot-2', `${rot2}deg`);
    el.style.setProperty('--anim-duration', `${duration}s`);
    el.style.animationDuration = `${duration}s`;

    document.body.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, (duration + 0.8) * 1000);
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

  // Opciones cuando una sala tiene partida en progreso
  socket.on('room_in_progress', ({ roomId, round, liveHumansCount, canTakeSeat, suggestedRoom }) => {
    const choice = confirm(
      `La sala ${roomId} tiene una partida activa en la Ronda ${round} con ${liveHumansCount} jugador(es).\n\n` +
      `¿Deseas entrar a una MESA NUEVA LIMPIA (${suggestedRoom}) para comenzar desde cero?\n\n` +
      `• Presiona "Aceptar" para entrar a ${suggestedRoom} limpia de inmediato.\n` +
      `• Presiona "Cancelar" para REINICIAR ${roomId} limpia desde el inicio.`
    );
    const targetRoom = choice ? suggestedRoom : roomId;
    const inputRoom = document.getElementById('inputRoomId');
    if (inputRoom) inputRoom.value = targetRoom;
    socket.emit('join_room', {
      roomId: targetRoom,
      playerName: document.getElementById('inputPlayerName').value.trim() || 'Jugador',
      avatar: selectedAvatar,
      clientId: myClientId,
      forceReset: !choice
    });
  });

  // Opciones cuando una sala está llena
  socket.on('room_full_options', ({ roomId, maxPlayers }) => {
    const rand = Math.floor(Math.random() * 90) + 10;
    const suggested = `MESA-${rand}`;
    const choice = confirm(
      `La sala ${roomId} está completa con ${maxPlayers} jugadores.\n\n` +
      `¿Deseas entrar a una mesa nueva libre (${suggested}) o reiniciar ${roomId}?\n\n` +
      `• Presiona "Aceptar" para entrar a la mesa nueva ${suggested}.\n` +
      `• Presiona "Cancelar" para forzar el reinicio de ${roomId}.`
    );
    const targetRoom = choice ? suggested : roomId;
    const inputRoom = document.getElementById('inputRoomId');
    if (inputRoom) inputRoom.value = targetRoom;
    socket.emit('join_room', {
      roomId: targetRoom,
      playerName: document.getElementById('inputPlayerName').value.trim() || 'Jugador',
      avatar: selectedAvatar,
      clientId: myClientId,
      forceReset: !choice
    });
  });

  // Errores de jugada o turno (Notificación flotante no intrusiva que nunca saca de la partida)
  socket.on('error_message', (msg) => {
    showToast(`⚠️ ${msg}`);
  });

  // ==========================================
  // ABANDONAR PARTIDA Y ACABAR DE JUGAR (BALANCE FINAL)
  // ==========================================
  let currentSessionBalance = null;

  function handleLeaveGameClick() {
    const ok = confirm(
      '¿Estás seguro de que deseas abandonar la partida?\n\n' +
      '• Se registrará como 1 juego perdido en tu historial.\n' +
      '• Si quedan 2 o más jugadores en la mesa, la partida continuará para ellos.'
    );
    if (ok) {
      window.soundManager.playPop();
      socket.emit('leave_game');
    }
  }

  function handleFinishSessionClick() {
    const ok = confirm(
      '¿Desean finalizar la sesión de dominó de todos los jugadores?\n\n' +
      '• Se generará el Balance Final Oficial.\n' +
      '• Desglose de diferencias de victorias (quién ganó más).\n' +
      '• Liquidación de dinero extra por pasos (quien pasó menos recibe de quien más pasó).\n' +
      '• Listo para imprimir o guardar en PDF.'
    );
    if (ok) {
      window.soundManager.playSnareRollReveal();
      // Ocultar modales previos inmediatamente
      if (roundOverModal) {
        roundOverModal.classList.add('hidden');
        roundOverModal.style.display = 'none';
      }
      if (scoreboardModal) {
        scoreboardModal.classList.add('hidden');
        scoreboardModal.style.display = 'none';
      }
      socket.emit('finish_session', { roomId: currentRoom ? currentRoom.id : undefined });
    }
  }

  // Vincular botones de Abandonar Partida
  const btnLeaveGame = document.getElementById('btnLeaveGame');
  if (btnLeaveGame) btnLeaveGame.addEventListener('click', handleLeaveGameClick);

  const btnScoreboardLeave = document.getElementById('btnScoreboardLeave');
  if (btnScoreboardLeave) btnScoreboardLeave.addEventListener('click', handleLeaveGameClick);

  // Vincular botones de Acabar de Jugar
  const btnFinishSession = document.getElementById('btnFinishSession');
  if (btnFinishSession) btnFinishSession.addEventListener('click', handleFinishSessionClick);

  const btnScoreboardFinish = document.getElementById('btnScoreboardFinish');
  if (btnScoreboardFinish) btnScoreboardFinish.addEventListener('click', handleFinishSessionClick);

  const btnRoundOverFinish = document.getElementById('btnRoundOverFinish');
  if (btnRoundOverFinish) btnRoundOverFinish.addEventListener('click', handleFinishSessionClick);

  // Botón para sincronizar o destrabar la mesa en cualquier momento
  const btnSyncRoomHeader = document.getElementById('btnSyncRoomHeader');
  if (btnSyncRoomHeader) {
    btnSyncRoomHeader.addEventListener('click', () => {
      window.soundManager.playTileClick();
      syncSessionWithServer();
      showToast('🔄 Sincronizando mesa con el servidor...');
    });
  }

  // Evento cuando un jugador abandona
  socket.on('player_surrendered', (data) => {
    window.soundManager.playPop();
    if (data.roundEnded) {
      alert(`🚪 ${data.playerName} abandonó la partida (juego perdido).\n\n🏆 ¡${data.winnerName} gana la ronda!`);
    } else {
      alert(`🚪 ${data.playerName} abandonó la partida (juego perdido).\n\nLa partida continúa con los ${data.remainingCount} jugadores restantes.`);
    }
  });

  // Confirmación al jugador que abandonó
  socket.on('leave_game_ack', (data) => {
    alert(`Has abandonado la partida. Se registró 1 juego perdido para ${data.playerName}. Total de derrotas acumuladas: ${data.losses}.`);
    lobbyModal.classList.add('hidden');
    scoreboardModal.classList.add('hidden');
    roundOverModal.classList.add('hidden');
    finalBalanceModal.classList.add('hidden');
    setupModal.classList.remove('hidden');
    currentRoom = null;
    mySeat = null;
  });

  // Renderizar y mostrar el Balance Final (Imágenes 1 y 2)
  function renderFinalBalance(balance) {
    if (!balance) return;
    currentSessionBalance = balance;

    // Abrir inmediatamente el modal y cerrar los demás
    try {
      if (roundOverModal) {
        roundOverModal.classList.add('hidden');
        roundOverModal.style.display = 'none';
      }
      if (scoreboardModal) {
        scoreboardModal.classList.add('hidden');
        scoreboardModal.style.display = 'none';
      }
      if (lobbyModal) {
        lobbyModal.classList.add('hidden');
        lobbyModal.style.display = 'none';
      }
      if (finalBalanceModal) {
        finalBalanceModal.classList.remove('hidden');
        finalBalanceModal.style.display = 'flex';
      }
    } catch (e) {
      console.warn(e);
    }

    // Encabezado
    const roomCodeEl = document.getElementById('fbRoomCode');
    if (roomCodeEl) roomCodeEl.textContent = balance.roomId || 'MESA-1';

    const dateEl = document.getElementById('fbDate');
    if (dateEl) {
      let displayDate = '';
      if (balance.finishedAtIso || balance.finishedAtMs) {
        displayDate = new Date(balance.finishedAtIso || balance.finishedAtMs).toLocaleString([], {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      } else {
        displayDate = balance.finishedAt || new Date().toLocaleString([], {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      }
      dateEl.textContent = displayDate;
    }

    const roundsEl = document.getElementById('fbTotalRounds');
    if (roundsEl) roundsEl.textContent = balance.totalRounds || 0;

    // Campeón y Diferencia Destacada (Imagen 2)
    const champEl = document.getElementById('fbChampionName');
    if (champEl) {
      champEl.textContent = balance.isDraw ? '¡Empate en Victorias!' : `🥇 ${balance.champion}`;
    }

    const highlightEl = document.getElementById('fbWinDiffHighlight');
    if (highlightEl) {
      if (balance.winDifferences && balance.winDifferences.length > 0) {
        highlightEl.textContent = balance.winDifferences[0].summaryText;
      } else {
        highlightEl.textContent = 'Sesión finalizada';
      }
    }

    // Gran Tarjeta de Liquidación y Pago en Pesos (Juegos $5 + Pasos $1)
    const paymentHeadlineEl = document.getElementById('fbPaymentHeadline');
    if (paymentHeadlineEl) {
      paymentHeadlineEl.textContent = balance.primaryPaymentHeadline || '---';
    }
    const paymentBreakdownEl = document.getElementById('fbPaymentBreakdownText');
    if (paymentBreakdownEl) {
      paymentBreakdownEl.textContent = balance.primaryPaymentBreakdown || '';
    }

    // 1. Tabla de Victorias ($5 c/u)
    const winTableEl = document.getElementById('fbWinTable');
    if (winTableEl && balance.rankedByWins) {
      let html = `
        <table class="balance-table">
          <thead>
            <tr>
              <th>Lugar</th>
              <th>Jugador</th>
              <th>Victorias</th>
              <th>Derrotas</th>
              <th>Puntos (Pips)</th>
            </tr>
          </thead>
          <tbody>
      `;
      balance.rankedByWins.forEach((p, idx) => {
        const medal = idx === 0 ? '🥇 1º' : (idx === 1 ? '🥈 2º' : (idx === 2 ? '🥉 3º' : `${idx + 1}º`));
        const isTop = idx === 0;
        html += `
          <tr class="${isTop ? 'champion-row' : ''}">
            <td><strong>${medal}</strong></td>
            <td><strong>${p.name}</strong> ${p.hasLeft ? '<span class="text-[9px] text-rose-400 font-bold">(Abandonó)</span>' : ''}</td>
            <td class="text-amber-300 font-black">${p.wins} juego(s)</td>
            <td class="text-slate-400 font-bold">${p.losses}</td>
            <td class="text-emerald-300 font-bold">${p.points} pts</td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
      winTableEl.innerHTML = html;
    }

    // Lista de Diferencias de Victorias ($5 c/u)
    const winDiffEl = document.getElementById('fbWinDifferencesList');
    if (winDiffEl) {
      if (balance.winDifferences && balance.winDifferences.length > 0) {
        winDiffEl.innerHTML = balance.winDifferences.map(d => `
          <div class="flex items-center gap-2 py-1 border-b border-slate-800 last:border-none">
            <span class="text-amber-400 font-bold">➔</span>
            <span><strong>${d.summaryText}</strong></span>
          </div>
        `).join('');
      } else {
        winDiffEl.innerHTML = '<div class="text-slate-400">Sin diferencias de juegos registradas.</div>';
      }
    }

    // 2. Tabla de Pasos y Penalizaciones ($1 c/u)
    const penaltyRateEl = document.getElementById('fbPenaltyRate');
    if (penaltyRateEl) penaltyRateEl.textContent = balance.penaltyPerPass || 1;

    const passTableEl = document.getElementById('fbPassTable');
    if (passTableEl && balance.rankedByPasses) {
      let html = `
        <table class="balance-table">
          <thead>
            <tr>
              <th>Posición</th>
              <th>Jugador</th>
              <th>Pasos Totales</th>
              <th>Aportación ($1 c/u)</th>
            </tr>
          </thead>
          <tbody>
      `;
      balance.rankedByPasses.forEach((p, idx) => {
        const penaltyCost = p.passesTotal * (balance.penaltyPerPass || 1);
        const tag = idx === 0 ? '⭐ Menos pasos' : `${idx + 1}º`;
        html += `
          <tr class="${idx === 0 ? 'champion-row' : ''}">
            <td>${tag}</td>
            <td><strong>${p.name}</strong></td>
            <td class="text-amber-300 font-bold">${p.passesTotal} paso(s)</td>
            <td class="text-rose-400 font-bold">$${penaltyCost}</td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
      passTableEl.innerHTML = html;
    }

    // Liquidación de Dinero Extra por Pasos ($1 c/u)
    const passSetEl = document.getElementById('fbPassSettlementsList');
    if (passSetEl) {
      if (balance.passSettlements && balance.passSettlements.length > 0) {
        passSetEl.innerHTML = balance.passSettlements.map(s => `
          <div class="flex items-center gap-2 py-1.5 border-b border-amber-800/40 last:border-none">
            <span class="text-emerald-400 font-bold text-base">💵</span>
            <span><strong>${s.summaryText}</strong></span>
          </div>
        `).join('');
      } else {
        passSetEl.innerHTML = '<div class="text-slate-400">No hubo diferencias de pasos entre los jugadores.</div>';
      }
    }

    // 3. Liquidación Total y Saldo Neto en Pesos (Juegos $5 + Pasos $1)
    const netTableEl = document.getElementById('fbNetTable');
    if (netTableEl && balance.netFinancialSummary) {
      let html = `
        <table class="balance-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Juegos</th>
              <th>Pasos</th>
              <th>Por Juegos ($5 c/u)</th>
              <th>Por Pasos ($1 c/u)</th>
              <th>Total Neto ($)</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
      `;
      balance.netFinancialSummary.forEach(p => {
        const winPart = (typeof p.winNet === 'number') ? p.winNet : 0;
        const passPart = (typeof p.passNet === 'number') ? p.passNet : (p.passNetBalance || 0);
        const total = (typeof p.grandTotal === 'number') ? p.grandTotal : (winPart + passPart);

        const winSign = winPart > 0 ? `+ $${winPart}` : (winPart < 0 ? `- $${Math.abs(winPart)}` : '$0');
        const passSign = passPart > 0 ? `+ $${passPart}` : (passPart < 0 ? `- $${Math.abs(passPart)}` : '$0');

        let statusTag = '';
        let totalColor = 'text-slate-300';
        if (total > 0) {
          totalColor = 'text-emerald-400';
          statusTag = `<span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-extrabold text-[10px] border border-emerald-500/40">🟢 COBRA</span>`;
        } else if (total < 0) {
          totalColor = 'text-rose-400';
          statusTag = `<span class="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-extrabold text-[10px] border border-rose-500/40">🔴 PAGA</span>`;
        } else {
          statusTag = `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">⚪ A MANO</span>`;
        }

        const totalDisplay = total > 0 ? `+ $${total} pesos` : (total < 0 ? `- $${Math.abs(total)} pesos` : '$0 pesos');

        html += `
          <tr>
            <td><strong>${p.name}</strong></td>
            <td class="text-amber-300 font-black">${p.wins}</td>
            <td class="text-slate-300">${p.passesTotal}</td>
            <td class="${winPart >= 0 ? 'text-amber-300' : 'text-rose-400'} font-bold">${winSign}</td>
            <td class="${passPart >= 0 ? 'text-emerald-300' : 'text-rose-400'} font-bold">${passSign}</td>
            <td class="${totalColor} font-black text-sm">${totalDisplay}</td>
            <td>${statusTag}</td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
      netTableEl.innerHTML = html;
    }

    // Lista de Pagos Directos en Pesos
    const finalPaymentsEl = document.getElementById('fbFinalPaymentsList');
    if (finalPaymentsEl) {
      if (balance.finalPayments && balance.finalPayments.length > 0) {
        finalPaymentsEl.innerHTML = balance.finalPayments.map(p => `
          <div class="flex flex-col gap-1 py-2 border-b border-cyan-800/40 last:border-none">
            <div class="flex items-center gap-2">
              <span class="text-amber-400 font-black text-base">💵</span>
              <span class="text-sm font-extrabold text-amber-200">${p.summaryText}</span>
            </div>
            ${p.breakdownText ? `<div class="text-[11px] text-slate-400 pl-6">${p.breakdownText}</div>` : ''}
          </div>
        `).join('');
      } else {
        finalPaymentsEl.innerHTML = '<div class="text-slate-400">Todos los jugadores quedaron a mano ($0 pesos).</div>';
      }
    }

    // 4. Planilla y Desglose Detallado Partida por Partida (En cada partida)
    const roundsBadgeEl = document.getElementById('fbRoundsCountBadge');
    if (roundsBadgeEl) {
      roundsBadgeEl.textContent = (balance.history ? balance.history.length : 0);
    }

    // Tabla Resumen Planilla de Rondas
    const summaryTableEl = document.getElementById('fbRoundsSummaryTable');
    if (summaryTableEl) {
      if (!balance.history || balance.history.length === 0) {
        summaryTableEl.innerHTML = '';
      } else {
        let sHtml = `
          <table class="balance-table w-full text-xs">
            <thead>
              <tr>
                <th>Partida</th>
                <th>Salida</th>
                <th>Cierre</th>
                <th>Ganador</th>
                <th>Puntos Ganados</th>
                <th>Pasos en Partida</th>
                <th>Fichas en Mano al Terminar</th>
              </tr>
            </thead>
            <tbody>
        `;
        balance.history.forEach((h, idx) => {
          const typeLabel = h.type === 'domino' ? '🀫 Dominó' : (h.type === 'tranca' ? '🔒 Tranca' : '🚪 Abandono');
          const passesStr = (h.playerStats || []).map(p => `<strong>${p.name}</strong>: ${p.passesRound || 0}`).join(' | ');
          const tilesStr = (h.playerStats || []).map(p => `<strong>${p.name}</strong>: ${p.remainingTiles === 0 ? '¡Dominó!' : `${p.remainingTiles} fichas (${p.remainingPips} pts)`}`).join(' | ');
          sHtml += `
            <tr>
              <td class="font-bold text-amber-300 text-center">Partida #${h.round || (idx + 1)}</td>
              <td class="text-slate-300 font-mono">${h.starter || '---'}</td>
              <td>${typeLabel}</td>
              <td class="text-yellow-400 font-extrabold">🏆 ${h.winnerName}</td>
              <td class="text-emerald-400 font-bold">+${h.pointsAwarded || 0} pts</td>
              <td class="text-amber-200 text-[11px]">${passesStr}</td>
              <td class="text-slate-200 text-[11px]">${tilesStr}</td>
            </tr>
          `;
        });
        sHtml += `</tbody></table>`;
        summaryTableEl.innerHTML = sHtml;
      }
    }

    const roundsDetailedEl = document.getElementById('fbRoundsDetailedList');
    if (roundsDetailedEl) {
      if (!balance.history || balance.history.length === 0) {
        roundsDetailedEl.innerHTML = `
          <div class="text-xs text-slate-400 italic p-3 text-center bg-slate-950/50 rounded-lg border border-slate-800">
            No se han registrado partidas completadas en esta sesión.
          </div>
        `;
      } else {
        let roundsHtml = '';
        balance.history.forEach((h, hIdx) => {
          const typeBadge = h.type === 'domino'
            ? '🀫 Ganada por Dominó'
            : (h.type === 'tranca' ? '🔒 Ganada por Tranca / Cierre' : '🚪 Ganada por Abandono');
          const typeColor = h.type === 'domino' ? 'text-emerald-300' : (h.type === 'tranca' ? 'text-amber-300' : 'text-rose-400');

          const roundTime = h.timestampMs
            ? new Date(h.timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
            : (h.timestamp || '');

          roundsHtml += `
            <div class="round-detail-card border border-slate-700/80 rounded-xl p-3 bg-slate-950/70 mb-3">
              <div class="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2 mb-2 gap-2 text-xs">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-extrabold border border-emerald-500/40">
                    Partida #${h.round || (hIdx + 1)}
                  </span>
                  <span class="text-slate-400">🕒 ${roundTime}</span>
                  <span class="font-bold ${typeColor}">${typeBadge}</span>
                </div>
                <div class="text-yellow-300 font-black">
                  🏆 Ganador: <span>${h.winnerName || 'Nadie'}</span> (+${h.pointsAwarded || 0} pts)
                </div>
              </div>

              <div class="overflow-x-auto">
                <table class="balance-table round-table-mini w-full text-xs">
                  <thead>
                    <tr>
                      <th>Jugador</th>
                      <th>Resultado</th>
                      <th>Pasos en Partida</th>
                      <th>Fichas en Mano</th>
                      <th>Puntos (Pips)</th>
                    </tr>
                  </thead>
                  <tbody>
          `;

          if (h.playerStats && h.playerStats.length > 0) {
            h.playerStats.forEach(ps => {
              const isWinner = ps.isWinner || (h.winnerName && ps.name === h.winnerName);
              const isSurrender = ps.isSurrender || (h.surrenderedBy && ps.name === h.surrenderedBy);

              let statusLabel = isWinner
                ? '<strong class="text-yellow-400">🏆 Ganó</strong>'
                : (isSurrender ? '<span class="text-rose-400 font-bold">🚪 Abandonó</span>' : '<span class="text-slate-400">Derrota</span>');

              let tilesDesc = '';
              if (ps.remainingTiles === 0) {
                tilesDesc = '<span class="text-emerald-400 font-bold">0 fichas (¡Dominó!)</span>';
              } else {
                const handDisplay = ps.handText || (ps.hand ? ps.hand.map(t => `[${t.left}|${t.right}]`).join(' ') : '');
                tilesDesc = `<span class="text-slate-200"><strong>${ps.remainingTiles} fichas</strong>: <span class="font-mono text-[11px] text-amber-200">${handDisplay}</span></span>`;
              }

              roundsHtml += `
                <tr class="${isWinner ? 'champion-row' : ''}">
                  <td><strong>${ps.name}</strong></td>
                  <td>${statusLabel}</td>
                  <td class="text-amber-300 font-bold">${ps.passesRound || 0} paso(s)</td>
                  <td>${tilesDesc}</td>
                  <td class="text-emerald-300 font-bold">${ps.remainingPips || 0} pts</td>
                </tr>
              `;
            });
          }

          roundsHtml += `
                  </tbody>
                </table>
              </div>
            </div>
          `;
        });
        roundsDetailedEl.innerHTML = roundsHtml;
      }
    }

    // Firmas de Conformidad
    const sigRowEl = document.getElementById('fbSignaturesRow');
    if (sigRowEl && balance.rankedByWins) {
      sigRowEl.innerHTML = balance.rankedByWins.map(p => `
        <div class="flex flex-col items-center">
          <div class="h-8"></div>
          <div class="signature-line w-36 text-center">${p.name}</div>
        </div>
      `).join('');
    }

    // Guardar en localStorage
    try {
      localStorage.setItem('domino_last_balance', JSON.stringify(balance));
      const hist = JSON.parse(localStorage.getItem('domino_balance_history') || '[]');
      hist.unshift(balance);
      localStorage.setItem('domino_balance_history', JSON.stringify(hist.slice(0, 10)));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage:', e);
    }

    // Mostrar modal
    scoreboardModal.classList.add('hidden');
    scoreboardModal.style.display = 'none';
    roundOverModal.classList.add('hidden');
    roundOverModal.style.display = 'none';
    finalBalanceModal.classList.remove('hidden');
    finalBalanceModal.style.display = 'flex';

    // Reproducir la canción de Queen - We Are The Champions al salir la pantalla de Balance
    window.soundManager.playChampions();
  }

  // Socket: Recibir el Balance Final
  socket.on('session_finished', (balanceData) => {
    window.soundManager.playSnareRollReveal();
    renderFinalBalance(balanceData);
  });

  // Socket: Sesión Reiniciada
  socket.on('session_restarted', () => {
    window.soundManager.stopChampions();
    finalBalanceModal.classList.add('hidden');
    finalBalanceModal.style.display = 'none';
    scoreboardModal.classList.add('hidden');
    roundOverModal.classList.add('hidden');
    lobbyModal.classList.remove('hidden');
    lobbyModal.style.display = 'flex';
    window.soundManager.playTileClick();
    // Limpiar visualmente el tablero de dominó y fichas de la mano
    if (boardContainer) boardContainer.innerHTML = '';
    const myHandContainer = document.getElementById('myHand');
    if (myHandContainer) myHandContainer.innerHTML = '';
  });

  // Botones dentro de #finalBalanceModal
  const btnCloseFinalBalance = document.getElementById('btnCloseFinalBalance');
  if (btnCloseFinalBalance) {
    btnCloseFinalBalance.addEventListener('click', () => {
      // Detener la canción de Champions inmediatamente al cerrar esta pantalla
      window.soundManager.stopChampions();
      finalBalanceModal.classList.add('hidden');
      finalBalanceModal.style.display = 'none';
    });
  }

  const btnPrintPDF = document.getElementById('btnPrintPDF');
  if (btnPrintPDF) {
    btnPrintPDF.addEventListener('click', () => {
      window.print();
    });
  }

  const btnCopyBalanceSummary = document.getElementById('btnCopyBalanceSummary');
  if (btnCopyBalanceSummary) {
    btnCopyBalanceSummary.addEventListener('click', () => {
      if (!currentSessionBalance) return;
      const b = currentSessionBalance;
      const displayDate = (b.finishedAtIso || b.finishedAtMs)
        ? new Date(b.finishedAtIso || b.finishedAtMs).toLocaleString([], {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
          })
        : (b.finishedAt || new Date().toLocaleString());

      let text = `🏆 *BALANCE FINAL DE DOMINÓ (BLOQUEO)* 🀫\n`;
      text += `📅 Mesa: ${b.roomId} | Fecha: ${displayDate} | Rondas: ${b.totalRounds}\n\n`;
      text += `👑 *Campeón de la Mesa:* ${b.champion}\n\n`;

      text += `💵 *TOTAL ACUMULADO A PAGAR EN PESOS:*\n`;
      if (b.primaryPaymentHeadline) {
        text += `👉 *${b.primaryPaymentHeadline}*\n`;
      }
      if (b.primaryPaymentBreakdown) {
        text += `   _${b.primaryPaymentBreakdown}_\n`;
      }
      text += `\n`;

      text += `📊 *Diferencias de Victorias (Juegos $5 c/u):*\n`;
      if (b.winDifferences && b.winDifferences.length > 0) {
        b.winDifferences.forEach(d => {
          text += `• ${d.summaryText}\n`;
        });
      }
      text += `\n💰 *Liquidación por Pasos ($1 c/u):*\n`;
      if (b.passSettlements && b.passSettlements.length > 0) {
        b.passSettlements.forEach(s => {
          text += `• ${s.summaryText}\n`;
        });
      }
      text += `\n⚖️ *Liquidación Total y Saldo Neto en Pesos:*\n`;
      b.netFinancialSummary.forEach(p => {
        const winPart = (typeof p.winNet === 'number') ? p.winNet : 0;
        const passPart = (typeof p.passNet === 'number') ? p.passNet : (p.passNetBalance || 0);
        const total = (typeof p.grandTotal === 'number') ? p.grandTotal : (winPart + passPart);
        const status = total > 0 ? `🟢 COBRA $${total} pesos` : (total < 0 ? `🔴 PAGA $${Math.abs(total)} pesos` : `⚪ A MANO ($0 pesos)`);
        text += `• *${p.name}*: ${p.wins} victorias ($${winPart >= 0 ? '+' : ''}${winPart}) | ${p.passesTotal} pasos ($${passPart >= 0 ? '+' : ''}${passPart}) ➔ *${status}*\n`;
      });

      if (b.history && b.history.length > 0) {
        text += `\n🗂️ *Historial Partida por Partida:*\n`;
        b.history.forEach(h => {
          const typeName = h.type === 'domino' ? 'Dominó' : (h.type === 'tranca' ? 'Tranca' : 'Abandono');
          text += `\n• *Partida #${h.round} (${typeName})* - Ganó: ${h.winnerName} (+${h.pointsAwarded} pts)\n`;
          if (h.playerStats) {
            h.playerStats.forEach(ps => {
              const res = ps.isWinner || (h.winnerName === ps.name) ? '🏆 Ganó' : (ps.isSurrender ? '🚪 Abandonó' : 'Derrota');
              text += `   - ${ps.name} (${res}): ${ps.passesRound} pasos | ${ps.remainingTiles} fichas restantes (${ps.remainingPips} pts) ${ps.handText ? ps.handText : ''}\n`;
            });
          }
        });
      }

      text += `\n✨ *Creado por Von Carloo MC* - Veracruz, México 🇲🇽\n`;

      navigator.clipboard.writeText(text).then(() => {
        alert('¡Resumen de Balance copiado al portapapeles!\n\nPuedes pegarlo directamente en WhatsApp.');
      }).catch(() => {
        alert('Selecciona y copia el texto del resumen en pantalla.');
      });
    });
  }

  const btnSaveBalanceLocal = document.getElementById('btnSaveBalanceLocal');
  if (btnSaveBalanceLocal) {
    btnSaveBalanceLocal.addEventListener('click', () => {
      alert('✅ Balance guardado correctamente en tu navegador.\n\nPuedes volver a consultarlo o imprimirlo en PDF cuando quieras.');
    });
  }

  const btnRestartAfterBalance = document.getElementById('btnRestartAfterBalance');
  if (btnRestartAfterBalance) {
    btnRestartAfterBalance.addEventListener('click', () => {
      if (confirm('¿Desean iniciar una nueva partida y reiniciar el marcador a 0?')) {
        window.soundManager.stopChampions();
        socket.emit('restart_session');
      }
    });
  }

  // Si se cierra el modal con Escape o click en backdrop
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && finalBalanceModal && !finalBalanceModal.classList.contains('hidden')) {
      window.soundManager.stopChampions();
      finalBalanceModal.classList.add('hidden');
      finalBalanceModal.style.display = 'none';
    }
  });

})();
