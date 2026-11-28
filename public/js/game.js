// Lógica del Cliente de Dominó Multijugador en Tiempo Real
(function () {
  // Identificador único persistente del dispositivo/navegador
  let myClientId = localStorage.getItem('domino_client_id');
  if (!myClientId) {
    myClientId = 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('domino_client_id', myClientId);
  }

  // Identidad persistente del jugador para Amigos, Invitaciones y Sesión
  let myPlayerId = localStorage.getItem('domino_player_id');
  if (!myPlayerId) {
    myPlayerId = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('domino_player_id', myPlayerId);
  }

  let myPlayerToken = localStorage.getItem('domino_player_token');
  if (!myPlayerToken) {
    myPlayerToken = 'tok_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('domino_player_token', myPlayerToken);
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

  // ========================================================
  // PERSISTENCIA DE SESIÓN ACTIVA (Para volver tras cerrar ventana/accidente)
  // ========================================================
  function saveActiveSession(sessionData) {
    if (!sessionData || !sessionData.roomId) return;
    // Solo persistir la sesión para auto-reanudación si la partida está actualmente en juego ('playing')
    // No persistir si la sala está en espera ('waiting') o si ya concluyó la partida ('session_finished')
    const currentStatus = sessionData.status || (currentRoom ? currentRoom.status : null);
    if (currentStatus !== 'playing') {
      clearActiveSession();
      return;
    }

    const pName = sessionData.playerName || document.getElementById('inputPlayerName')?.value?.trim() || localStorage.getItem('domino_player_name') || 'Jugador';
    const pAv = sessionData.avatar || (typeof selectedAvatar !== 'undefined' && selectedAvatar) || localStorage.getItem('domino_selected_avatar') || 'avatar_1';
    const dataToSave = {
      roomId: sessionData.roomId,
      playerName: pName,
      avatar: pAv,
      clientId: myClientId,
      playerId: myPlayerId,
      playerToken: myPlayerToken,
      status: 'playing',
      savedAt: Date.now()
    };
    try {
      const serialized = JSON.stringify(dataToSave);
      localStorage.setItem('domino_active_session', serialized);
      sessionStorage.setItem('domino_active_session', serialized);
    } catch (e) {
      console.warn('Error guardando active session:', e);
    }
  }

  function getActiveSession() {
    try {
      const raw = localStorage.getItem('domino_active_session') || sessionStorage.getItem('domino_active_session');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem('domino_active_session');
      sessionStorage.removeItem('domino_active_session');
    } catch (e) { }
  }

  // Si hay una sesión activa de juego en curso, preparar la vista de inmediato para reconexión instantánea
  const initialSavedSession = getActiveSession();
  if (initialSavedSession && initialSavedSession.status === 'playing') {
    const sModal = document.getElementById('setupModal');
    if (sModal) {
      sModal.classList.add('hidden');
      sModal.style.display = 'none';
    }
  }

  let sessionRecoveryTimeout = null;
  let isAttemptingRecovery = false;

  // Auto-recuperar sesión y sincronizar mesa al reconectar o volver de otra app / desbloquear pantalla / reabrir ventana
  function syncSessionWithServer() {
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }
    const pName = document.getElementById('inputPlayerName')?.value?.trim() || localStorage.getItem('domino_player_name') || 'Jugador';
    const pAvatar = (typeof selectedAvatar !== 'undefined' && selectedAvatar) ? selectedAvatar : (localStorage.getItem('domino_selected_avatar') || 'avatar_1');

    socket.emit('auth_profile', {
      playerId: myPlayerId,
      playerToken: myPlayerToken,
      playerName: pName,
      avatar: pAvatar
    });

    const saved = getActiveSession();
    if (saved && saved.roomId && saved.status === 'playing') {
      try {
        isAttemptingRecovery = true;
        const sModal = document.getElementById('setupModal');
        if (sModal) {
          sModal.classList.add('hidden');
          sModal.style.display = 'none';
        }
        const lModal = document.getElementById('lobbyModal');
        if (lModal) {
          lModal.classList.add('hidden');
          lModal.style.display = 'none';
        }
        socket.emit('join_room', {
          ...saved,
          clientId: myClientId,
          playerId: myPlayerId,
          playerToken: myPlayerToken
        });
      } catch (e) { }
    }
    socket.emit('request_room_refresh');
  }

  socket.on('connect', () => {
    const banner = document.getElementById('reconnectBanner');
    if (banner) banner.classList.add('hidden');
    syncSessionWithServer();
  });

  socket.on('reconnect', () => {
    const banner = document.getElementById('reconnectBanner');
    if (banner) banner.classList.add('hidden');
    syncSessionWithServer();
    showToast('✅ Conexión recuperada con éxito.');
  });

  socket.on('disconnect', () => {
    const banner = document.getElementById('reconnectBanner');
    if (banner) banner.classList.remove('hidden');
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
  let selectedAvatar = 'avatar_1';

  // Elementos del DOM
  const setupModal = document.getElementById('setupModal');
  const lobbyModal = document.getElementById('lobbyModal');
  const scoreboardModal = document.getElementById('scoreboardModal');
  const liveBalanceModal = document.getElementById('liveBalanceModal');
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

  // Helper para poblar rejilla de avatares reutilizable
  function populateAvatarGrid(containerEl, currentSelectedId, onSelectCallback) {
    if (!containerEl || !window.AVATARS) return;
    containerEl.innerHTML = '';
    Object.values(window.AVATARS).forEach(avatar => {
      const item = document.createElement('div');
      item.className = `avatar-option ${avatar.id === currentSelectedId ? 'selected' : ''}`;
      item.innerHTML = avatar.svg;
      item.title = avatar.name;
      item.addEventListener('click', () => {
        containerEl.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        window.soundManager.playTileClick();
        if (onSelectCallback) onSelectCallback(avatar.id);
      });
      containerEl.appendChild(item);
    });
  }

  // Actualizar la tarjeta de perfil en la pantalla inicial y los datos locales
  function updateProfileCardUI() {
    const savedName = localStorage.getItem('domino_player_name') || 'Jugador';
    let savedAvatar = localStorage.getItem('domino_selected_avatar') || selectedAvatar || 'avatar_1';
    if (savedAvatar.startsWith('male_') || savedAvatar.startsWith('female_')) {
      savedAvatar = window.AVATARS[savedAvatar]?.id || 'avatar_1';
      localStorage.setItem('domino_selected_avatar', savedAvatar);
    }
    selectedAvatar = savedAvatar;

    const setupAvatar = document.getElementById('setupProfileAvatar');
    const setupName = document.getElementById('setupProfileName');
    const inputPlayerName = document.getElementById('inputPlayerName');

    if (setupAvatar && window.AVATARS[savedAvatar]) {
      setupAvatar.innerHTML = window.AVATARS[savedAvatar].svg;
    }
    if (setupName) {
      setupName.textContent = savedName;
    }
    if (inputPlayerName) {
      inputPlayerName.value = savedName;
    }
  }

  // Modal de Registro Inicial (Obligatorio la primera vez que se abre el juego)
  function checkFirstTimeRegistration() {
    const savedName = localStorage.getItem('domino_player_name');
    const isRegistered = localStorage.getItem('domino_registered') === 'true' && savedName;
    const regModal = document.getElementById('firstTimeRegisterModal');

    if (!isRegistered) {
      if (regModal) {
        regModal.classList.remove('hidden');
        regModal.style.display = 'flex';
      }

      const regInput = document.getElementById('regNickInput');
      const regPreviewName = document.getElementById('regNickPreview');
      const regPreviewAvatar = document.getElementById('regAvatarPreview');
      const regGrid = document.getElementById('regAvatarGrid');
      const regErr = document.getElementById('regNickError');

      let tempRegAvatar = selectedAvatar || 'avatar_1';
      if (regPreviewAvatar && window.AVATARS[tempRegAvatar]) {
        regPreviewAvatar.innerHTML = window.AVATARS[tempRegAvatar].svg;
      }
      if (regPreviewName) {
        regPreviewName.textContent = 'Jugador';
      }

      populateAvatarGrid(regGrid, tempRegAvatar, (newId) => {
        tempRegAvatar = newId;
        selectedAvatar = newId;
        if (regPreviewAvatar && window.AVATARS[newId]) {
          regPreviewAvatar.innerHTML = window.AVATARS[newId].svg;
        }
      });

      if (regInput) {
        regInput.value = '';
        setTimeout(() => regInput.focus(), 200);
        regInput.oninput = () => {
          const val = regInput.value.trim();
          if (regPreviewName) regPreviewName.textContent = val || 'Jugador';
          if (regErr && val.length >= 2) regErr.classList.add('hidden');
        };
      }

      const btnConfirm = document.getElementById('btnConfirmRegister');
      if (btnConfirm) {
        btnConfirm.onclick = () => {
          const val = regInput ? regInput.value.trim() : '';
          const err = document.getElementById('regNickError');
          if (!val || val.length < 2) {
            if (err) err.classList.remove('hidden');
            if (regInput) regInput.focus();
            return;
          }
          if (err) err.classList.add('hidden');
          window.soundManager.init();
          window.soundManager.playTileClick();

          localStorage.setItem('domino_player_name', val);
          localStorage.setItem('domino_selected_avatar', tempRegAvatar);
          localStorage.setItem('domino_registered', 'true');
          selectedAvatar = tempRegAvatar;

          const pNameInput = document.getElementById('inputPlayerName');
          if (pNameInput) pNameInput.value = val;

          regModal.classList.add('hidden');
          regModal.style.display = 'none';

          updateProfileCardUI();
          syncSessionWithServer();
          showToast(`🎉 ¡Bienvenido, ${val}! Tu perfil ha quedado registrado permanentemente.`);
        };
      }
    } else {
      let savedAv = localStorage.getItem('domino_selected_avatar') || 'avatar_1';
      if (savedAv.startsWith('male_') || savedAv.startsWith('female_')) {
        savedAv = window.AVATARS[savedAv]?.id || 'avatar_1';
        localStorage.setItem('domino_selected_avatar', savedAv);
      }
      selectedAvatar = savedAv;
      const pNameInput = document.getElementById('inputPlayerName');
      if (pNameInput) pNameInput.value = savedName;
      updateProfileCardUI();
    }
  }

  // Modal para Cambiar Nick y Avatar Posteriormente
  function openEditProfileModal() {
    const editModal = document.getElementById('editProfileModal');
    if (!editModal) return;

    window.soundManager.playTileClick();
    editModal.classList.remove('hidden');
    editModal.style.display = 'flex';

    const currentName = localStorage.getItem('domino_player_name') || 'Jugador';
    let tempEditAvatar = localStorage.getItem('domino_selected_avatar') || selectedAvatar || 'avatar_1';
    if (tempEditAvatar.startsWith('male_') || tempEditAvatar.startsWith('female_')) {
      tempEditAvatar = window.AVATARS[tempEditAvatar]?.id || 'avatar_1';
    }

    const editInput = document.getElementById('editNickInput');
    const editPreviewName = document.getElementById('editNickPreview');
    const editPreviewAvatar = document.getElementById('editAvatarPreview');
    const editGrid = document.getElementById('editAvatarGrid');
    const editErr = document.getElementById('editNickError');

    if (editErr) editErr.classList.add('hidden');
    if (editInput) {
      editInput.value = currentName;
      setTimeout(() => editInput.focus(), 150);
      editInput.oninput = () => {
        const val = editInput.value.trim();
        if (editPreviewName) editPreviewName.textContent = val || 'Jugador';
        if (editErr && val.length >= 2) editErr.classList.add('hidden');
      };
    }
    if (editPreviewName) editPreviewName.textContent = currentName;
    if (editPreviewAvatar && window.AVATARS[tempEditAvatar]) {
      editPreviewAvatar.innerHTML = window.AVATARS[tempEditAvatar].svg;
    }

    populateAvatarGrid(editGrid, tempEditAvatar, (newId) => {
      tempEditAvatar = newId;
      if (editPreviewAvatar && window.AVATARS[newId]) {
        editPreviewAvatar.innerHTML = window.AVATARS[newId].svg;
      }
    });

    const btnSave = document.getElementById('btnSaveEditProfile');
    if (btnSave) {
      btnSave.onclick = () => {
        const newName = editInput ? editInput.value.trim() : '';
        if (!newName || newName.length < 2) {
          if (editErr) editErr.classList.remove('hidden');
          if (editInput) editInput.focus();
          return;
        }
        if (editErr) editErr.classList.add('hidden');
        window.soundManager.playTileClick();

        localStorage.setItem('domino_player_name', newName);
        localStorage.setItem('domino_selected_avatar', tempEditAvatar);
        localStorage.setItem('domino_registered', 'true');
        selectedAvatar = tempEditAvatar;

        updateProfileCardUI();

        // Actualizar sesión activa persistente si existe
        const saved = getActiveSession();
        if (saved) {
          saved.playerName = newName;
          saved.avatar = selectedAvatar;
          saveActiveSession(saved);
        }

        // Notificar en tiempo real al servidor
        socket.emit('update_profile', {
          playerId: myPlayerId,
          playerName: newName,
          avatar: selectedAvatar
        });
        socket.emit('auth_profile', {
          playerId: myPlayerId,
          playerToken: myPlayerToken,
          playerName: newName,
          avatar: selectedAvatar
        });

        editModal.classList.add('hidden');
        editModal.style.display = 'none';

        showToast(`✅ Perfil actualizado: ${newName}`);
      };
    }

    const btnCancel = document.getElementById('btnCancelEditProfile');
    if (btnCancel) {
      btnCancel.onclick = () => {
        window.soundManager.playTileClick();
        editModal.classList.add('hidden');
        editModal.style.display = 'none';
      };
    }
    const btnCloseX = document.getElementById('btnCloseEditProfileX');
    if (btnCloseX) {
      btnCloseX.onclick = () => {
        window.soundManager.playTileClick();
        editModal.classList.add('hidden');
        editModal.style.display = 'none';
      };
    }
  }

  // Comprobar parámetros URL para unirse directo (?room=XXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  const inputRoom = document.getElementById('inputRoomId');
  if (roomParam) {
    if (inputRoom) inputRoom.value = roomParam.toUpperCase();
  } else if (inputRoom && (!inputRoom.value || inputRoom.value === 'MESA-1')) {
    const rand = Math.floor(Math.random() * 900) + 100;
    inputRoom.value = `MESA-${rand}`;
  }

  // Inicializar verificación de registro y tarjeta de perfil
  checkFirstTimeRegistration();

  // Si el usuario tenía una partida activa EN JUEGO guardada (cierre accidental de ventana, desconexión o corte),
  // recuperarla automáticamente al tocar el icono del juego directamente a la mesa
  const savedActive = getActiveSession();
  if (savedActive && savedActive.roomId && savedActive.status === 'playing' && !roomParam) {
    if (setupModal) {
      setupModal.classList.add('hidden');
      setupModal.style.display = 'none';
    }
    const banner = document.getElementById('reconnectBanner');
    if (banner) {
      banner.textContent = `🔄 Recuperando tu partida en curso en ${savedActive.roomId}...`;
      banner.classList.remove('hidden');
    }
    isAttemptingRecovery = true;
    syncSessionWithServer();

    // Timeout de seguridad por si la sala ya no existe o terminó
    sessionRecoveryTimeout = setTimeout(() => {
      if (!currentRoom || currentRoom.status === 'session_finished') {
        const b = document.getElementById('reconnectBanner');
        if (b) b.classList.add('hidden');
        if (setupModal) {
          setupModal.classList.remove('hidden');
          setupModal.style.display = 'flex';
          showToast('ℹ️ La partida anterior ya concluyó o no está disponible.');
          clearActiveSession();
        }
      }
    }, 7000);
  }

  // Prevenir cierres accidentales durante partidas activas y asegurar guardado
  window.addEventListener('beforeunload', (e) => {
    if (currentRoom && currentRoom.status === 'playing') {
      saveActiveSession({ roomId: currentRoom.id });
    }
  });

  const btnOpenEditProfile = document.getElementById('btnOpenEditProfile');
  if (btnOpenEditProfile) {
    btnOpenEditProfile.addEventListener('click', openEditProfileModal);
  }
  const btnEditProfileFromLobby = document.getElementById('btnEditProfileFromLobby');
  if (btnEditProfileFromLobby) {
    btnEditProfileFromLobby.addEventListener('click', openEditProfileModal);
  }

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
          playerId: myPlayerId,
          playerToken: myPlayerToken,
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
    const gameRateInput = parseInt(document.getElementById('setupGameRateInput')?.value) || 5;
    const penaltyInput = parseInt(document.getElementById('setupPenaltyInput')?.value) || 1;

    localStorage.setItem('domino_player_name', nameInput);
    localStorage.setItem('domino_selected_avatar', selectedAvatar);

    socket.emit('join_room', {
      roomId: roomInput,
      playerName: nameInput,
      avatar: selectedAvatar,
      clientId: myClientId,
      playerId: myPlayerId,
      playerToken: myPlayerToken,
      gameRate: gameRateInput,
      penaltyValue: penaltyInput
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
      const gameRateInput = parseInt(document.getElementById('setupGameRateInput')?.value) || 5;
      const penaltyInput = parseInt(document.getElementById('setupPenaltyInput')?.value) || 1;

      localStorage.setItem('domino_player_name', nameInput);
      localStorage.setItem('domino_selected_avatar', selectedAvatar);

      socket.emit('join_room', {
        roomId: cleanRoom,
        playerName: nameInput,
        avatar: selectedAvatar,
        clientId: myClientId,
        playerId: myPlayerId,
        playerToken: myPlayerToken,
        forceReset: true,
        gameRate: gameRateInput,
        penaltyValue: penaltyInput
      });
    });
  }

  // Evento: Unido exitosamente a la sala
  socket.on('joined_successfully', (data) => {
    mySeat = data.playerSeat;
    if (sessionRecoveryTimeout) {
      clearTimeout(sessionRecoveryTimeout);
      sessionRecoveryTimeout = null;
    }
    setupModal.classList.add('hidden');
    setupModal.style.display = 'none';

    const saved = getActiveSession();
    if (saved && saved.status === 'playing') {
      // Reingresando a partida activa por reconexión / apertura de acceso directo
      lobbyModal.classList.add('hidden');
      lobbyModal.style.display = 'none';
    } else if (currentRoom && currentRoom.status === 'playing') {
      saveActiveSession({ roomId: data.roomId, status: 'playing' });
      lobbyModal.classList.add('hidden');
      lobbyModal.style.display = 'none';
    } else {
      lobbyModal.classList.remove('hidden');
      lobbyModal.style.display = 'flex';
    }
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

  // Botón: Regresar a la pantalla de inicio desde la Sala de Espera
  const btnLobbyReturnHome = document.getElementById('btnLobbyReturnHome');
  if (btnLobbyReturnHome) {
    btnLobbyReturnHome.addEventListener('click', () => {
      window.soundManager.playTileClick();
      const ok = confirm(
        '¿Estás seguro de que deseas regresar a la pantalla de inicio?\n\n' +
        '• Se liberará tu asiento en esta sala de espera.\n' +
        '• Podrás crear una nueva mesa o invitar a tus amigos desde el inicio.'
      );
      if (ok) {
        clearActiveSession();
        socket.emit('leave_game');
        lobbyModal.classList.add('hidden');
        lobbyModal.style.display = 'none';
        setupModal.classList.remove('hidden');
        setupModal.style.display = 'flex';
        currentRoom = null;
        mySeat = null;
        myHand = [];
        const rand = Math.floor(Math.random() * 90) + 10;
        const inputRoom = document.getElementById('inputRoomId');
        if (inputRoom) inputRoom.value = `MESA-${rand}`;
        updateProfileCardUI();
        showToast('🏠 Has regresado a la pantalla de inicio.');
      }
    });
  }

  // Botón: Salir y cerrar la aplicación desde la Sala de Espera
  const btnLobbyExitApp = document.getElementById('btnLobbyExitApp');
  if (btnLobbyExitApp) {
    btnLobbyExitApp.addEventListener('click', () => {
      window.soundManager.playTileClick();
      const ok = confirm('¿Estás seguro de que deseas salir y cerrar la aplicación?');
      if (ok) {
        clearActiveSession();
        socket.emit('leave_game');
        window.soundManager.stopBgm(true);
        window.soundManager.stopTimeBomb();
        window.soundManager.stopChampions();

        try {
          window.close();
        } catch (e) { }

        lobbyModal.classList.add('hidden');
        lobbyModal.style.display = 'none';
        setupModal.classList.add('hidden');
        setupModal.style.display = 'none';

        document.body.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#022c22;color:#a7f3d0;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px;">
            <div style="font-size:52px;margin-bottom:12px;">👋</div>
            <h1 style="font-size:24px;font-weight:900;color:#fcd34d;margin-bottom:8px;">Has salido de la partida</h1>
            <p style="font-size:15px;color:#cbd5e1;max-width:320px;line-height:1.4;">Ya puedes cerrar esta ventana o salir de la aplicación.</p>
            <button onclick="window.location.href='/'" style="margin-top:24px;padding:12px 24px;background:#059669;color:white;border:none;border-radius:14px;font-size:15px;font-weight:bold;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.4);">
              🏠 Volver a Abrir el Juego
            </button>
          </div>
        `;
      }
    });
  }

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

  // Configuración de Pago por Partida y por Pase en Lobby (Solo Anfitrión)
  const lobbyGameRateEl = document.getElementById('lobbyGameRateInput');
  if (lobbyGameRateEl) {
    const handleGameRateChange = (e) => {
      if (!currentRoom || currentRoom.hostId !== socket.id) return;
      socket.emit('set_game_rate', { gameRate: e.target.value });
    };
    lobbyGameRateEl.addEventListener('change', handleGameRateChange);
    lobbyGameRateEl.addEventListener('input', handleGameRateChange);
  }

  const penaltyInputEl = document.getElementById('penaltyInput');
  if (penaltyInputEl) {
    const handlePenaltyChange = (e) => {
      if (!currentRoom || currentRoom.hostId !== socket.id) return;
      socket.emit('set_penalty_value', { penaltyValue: e.target.value });
    };
    penaltyInputEl.addEventListener('change', handlePenaltyChange);
    penaltyInputEl.addEventListener('input', handlePenaltyChange);
  }

  // Actualización Global de la Sala
  socket.on('room_update', (room) => {
    currentRoom = room;

    if (sessionRecoveryTimeout) {
      clearTimeout(sessionRecoveryTimeout);
      sessionRecoveryTimeout = null;
    }

    if (room && room.id && room.status === 'playing') {
      saveActiveSession({ roomId: room.id, status: 'playing' });
    } else {
      clearActiveSession();
    }

    const banner = document.getElementById('reconnectBanner');
    if (banner) banner.classList.add('hidden');

    // Determinar mySeat de inmediato si aún no está asignado o varió
    if (mySeat === null || !room.players.some(p => p.seat === mySeat)) {
      const me = room.players.find(p => p.hand !== undefined) ||
                 room.players.find(p => (myPlayerId && p.playerId === myPlayerId) || (myClientId && p.clientId === myClientId));
      if (me) {
        mySeat = me.seat;
      }
    }

    if (isAttemptingRecovery) {
      isAttemptingRecovery = false;
      showToast(`🎮 ¡Partida en ${room.id} recuperada! Continúa tu juego.`);
    }

    updateRoomUI(room);
  });

  function updateRoomUI(room) {
    const maxP = room.maxPlayers || 2;

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

    // Música de Fondo: Mario Overworld al inicio, y cambia a Underground cuando todos tengan 3 fichas
    if (room.status === 'playing') {
      const activePlayers = room.players ? room.players.filter(p => !p.hasLeft) : [];
      const allHaveThreeOrLess = activePlayers.length >= 2 && activePlayers.every(p => p.tileCount <= 3);
      if (allHaveThreeOrLess) {
        window.soundManager.hasSwitchedToUnderground = true;
      }

      if (window.soundManager.hasSwitchedToUnderground) {
        window.soundManager.setBgmTrack('underground');
      } else {
        window.soundManager.setBgmTrack('overworld');
      }
      window.soundManager.startBgm();
    } else {
      window.soundManager.hasSwitchedToUnderground = false;
      window.soundManager.stopBgm(true);
    }

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

    const maxP = room.maxPlayers || 2;
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

    // Sincronizar ajustes de pago por partida y por pase en el Lobby (EXCLUSIVO DEL ANFITRIÓN)
    const lobbyGameRateInput = document.getElementById('lobbyGameRateInput');
    const penaltyInput = document.getElementById('penaltyInput');
    const lobbyBetHostBadge = document.getElementById('lobbyBetHostBadge');
    const lobbyBetNotice = document.getElementById('lobbyBetNotice');
    const lobbyGameRateLockIcon = document.getElementById('lobbyGameRateLockIcon');
    const lobbyPenaltyLockIcon = document.getElementById('lobbyPenaltyLockIcon');

    if (lobbyGameRateInput) {
      if (document.activeElement !== lobbyGameRateInput) {
        lobbyGameRateInput.value = (typeof room.gameRate === 'number') ? room.gameRate : 5;
      }
      lobbyGameRateInput.disabled = !isHost;
      lobbyGameRateInput.readOnly = !isHost;
      if (!isHost) {
        lobbyGameRateInput.classList.add('opacity-60', 'cursor-not-allowed', 'bg-slate-900');
        lobbyGameRateInput.classList.remove('bg-slate-950');
      } else {
        lobbyGameRateInput.classList.remove('opacity-60', 'cursor-not-allowed', 'bg-slate-900');
        lobbyGameRateInput.classList.add('bg-slate-950');
      }
    }

    if (penaltyInput) {
      if (document.activeElement !== penaltyInput) {
        penaltyInput.value = (typeof room.penaltyPerPass === 'number') ? room.penaltyPerPass : 1;
      }
      penaltyInput.disabled = !isHost;
      penaltyInput.readOnly = !isHost;
      if (!isHost) {
        penaltyInput.classList.add('opacity-60', 'cursor-not-allowed', 'bg-slate-900');
        penaltyInput.classList.remove('bg-slate-950');
      } else {
        penaltyInput.classList.remove('opacity-60', 'cursor-not-allowed', 'bg-slate-900');
        penaltyInput.classList.add('bg-slate-950');
      }
    }

    if (lobbyGameRateLockIcon) {
      if (!isHost) {
        lobbyGameRateLockIcon.classList.remove('hidden');
      } else {
        lobbyGameRateLockIcon.classList.add('hidden');
      }
    }

    if (lobbyPenaltyLockIcon) {
      if (!isHost) {
        lobbyPenaltyLockIcon.classList.remove('hidden');
      } else {
        lobbyPenaltyLockIcon.classList.add('hidden');
      }
    }

    if (lobbyBetHostBadge) {
      lobbyBetHostBadge.textContent = isHost ? '👑 Eres el Anfitrión (Editable)' : '🔒 Definido por el Anfitrión';
      lobbyBetHostBadge.className = isHost
        ? 'text-[9px] bg-amber-500/25 text-amber-300 font-extrabold px-1.5 py-0.5 rounded border border-amber-500/40 shadow-sm'
        : 'text-[9px] bg-rose-950/80 text-rose-300 font-extrabold px-1.5 py-0.5 rounded border border-rose-500/50 shadow-sm';
    }

    if (lobbyBetNotice) {
      if (isHost) {
        lobbyBetNotice.innerHTML = '👑 <strong>Tú eres el Anfitrión:</strong> Define cuánto cuesta la partida y los pases.';
        lobbyBetNotice.className = 'text-[9px] text-amber-300 font-medium mt-1.5 text-center';
      } else {
        lobbyBetNotice.innerHTML = '🔒 <strong>Valores fijados por el Anfitrión:</strong> Puedes ver las tarifas pero solo el anfitrión puede modificarlas.';
        lobbyBetNotice.className = 'text-[9px] text-rose-300 font-semibold mt-1.5 text-center bg-rose-950/40 py-1 px-2 rounded border border-rose-500/30';
      }
    }

    // Botones de cantidad de jugadores activa (Solo editable por el anfitrión)
    document.querySelectorAll('.player-count-btn').forEach(btn => {
      const cnt = parseInt(btn.getAttribute('data-count'));
      if (cnt === maxP) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.disabled = !isHost;
      if (!isHost) {
        btn.classList.add('opacity-60', 'cursor-not-allowed');
      } else {
        btn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
    });

    document.getElementById('lobbyRoomCode').textContent = room.id;
    document.getElementById('lobbyCount').textContent = `${room.players.length}/${maxP}`;
    const neededPlayersEl = document.getElementById('lobbyNeededPlayers');
    if (neededPlayersEl) neededPlayersEl.textContent = maxP;

    // Ajustar grid visual
    if (maxP === 3) {
      seatsContainer.className = 'grid grid-cols-3 gap-1.5 my-1.5';
    } else {
      seatsContainer.className = 'lobby-seats-grid';
    }

    for (let s = 0; s < maxP; s++) {
      const player = room.players.find(p => p.seat === s);
      const card = document.createElement('div');
      card.className = `lobby-seat-card ${player ? 'occupied' : ''}`;

      if (player) {
        const avatarObj = window.AVATARS[player.avatar] || window.AVATARS.avatar_1;
        card.innerHTML = `
          <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border border-emerald-400 flex-shrink-0">
            ${avatarObj.svg}
          </div>
          <div class="text-[11px] sm:text-xs font-bold text-slate-100 text-center leading-tight truncate max-w-[85px]">${player.name}</div>
          <div class="text-[9px] text-emerald-300 leading-none">${player.isBot ? '🤖 Bot' : (player.seat === mySeat ? '⭐ Tú' : '🟢 Conectado')}</div>
        `;
        if (player.isBot && isHost) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'text-[9.5px] text-red-400 hover:text-red-300 underline mt-0.5';
          removeBtn.textContent = 'Quitar bot';
          removeBtn.addEventListener('click', () => socket.emit('remove_bot', { seat: s }));
          card.appendChild(removeBtn);
        }
      } else {
        card.innerHTML = `
          <div class="w-8 h-8 rounded-full border border-dashed border-slate-500 flex items-center justify-center text-slate-400 text-sm">
            +
          </div>
          <div class="text-[10.5px] text-slate-400 leading-tight">Asiento ${s + 1}</div>
          <div class="text-[8.5px] text-slate-500 leading-none">Esperando...</div>
        `;
      }
      seatsContainer.appendChild(card);
    }

    const startBtn = document.getElementById('btnStartGame');
    const addBotBtn = document.getElementById('btnAddBot');

    if (isHost) {
      if (room.players.length === maxP) {
        startBtn.removeAttribute('disabled');
        startBtn.classList.remove('opacity-50', 'opacity-60', 'cursor-not-allowed');
        startBtn.innerHTML = `🚀 ¡Comenzar Partida (${maxP}/${maxP})!`;
      } else {
        startBtn.setAttribute('disabled', 'true');
        startBtn.classList.add('opacity-50');
        startBtn.classList.remove('cursor-not-allowed');
        startBtn.innerHTML = `Faltan ${maxP - room.players.length} jugadores...`;
      }
      if (addBotBtn) {
        if (room.players.length >= maxP) {
          addBotBtn.setAttribute('disabled', 'true');
          addBotBtn.classList.add('opacity-50');
        } else {
          addBotBtn.removeAttribute('disabled');
          addBotBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }
    } else {
      startBtn.setAttribute('disabled', 'true');
      startBtn.classList.add('opacity-60', 'cursor-not-allowed');
      if (room.players.length === maxP) {
        startBtn.innerHTML = `⏳ Esperando que el Anfitrión comience (${maxP}/${maxP})`;
      } else {
        startBtn.innerHTML = `Faltan ${maxP - room.players.length} jugadores...`;
      }
      if (addBotBtn) {
        addBotBtn.setAttribute('disabled', 'true');
        addBotBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }
  }

  // Calcular el balance neto en vivo de un jugador:
  // Diferencia de victorias * gameRate + diferencia de pases * penaltyPerPass
  function getPlayerLiveNetBalance(player, room) {
    if (!room || !room.players || room.players.length === 0) return 0;
    const gameRate = (typeof room.gameRate === 'number') ? room.gameRate : 5;
    const penaltyPerPass = (typeof room.penaltyPerPass === 'number') ? room.penaltyPerPass : 1;
    const myWins = player.wins || 0;
    const myPasses = player.passesTotal || 0;

    let winNet = 0;
    let passNet = 0;

    room.players.forEach(other => {
      if (other.seat !== player.seat) {
        const otherWins = other.wins || 0;
        const otherPasses = other.passesTotal || 0;
        winNet += (myWins - otherWins) * gameRate;
        passNet += (otherPasses - myPasses) * penaltyPerPass;
      }
    });

    return winNet + passNet;
  }

  // Actualizar Pods en la Mesa de Dominó adaptados a 2, 3 o 4 jugadores
  function updatePlayerPods(room) {
    const maxP = room.maxPlayers || 2;

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

      // Badge en vivo en la parte de arriba del jugador (debes:$xx / ganas:$xx)
      // REGLA ESTRICTA: Únicamente debe salirle al jugador lo que debe o lo que gana en su propia pantalla.
      // NO debe salir la información de lo que debe o gana el otro jugador.
      const moneyBadge = podEl.querySelector('.pod-money-badge');
      if (moneyBadge) {
        if (player.seat === mySeat) {
          // ÚNICAMENTE mostrar para el propio jugador en su pod
          moneyBadge.classList.remove('hidden');
          moneyBadge.style.display = 'inline-flex';
          const net = getPlayerLiveNetBalance(player, room);
          if (net > 0) {
            moneyBadge.className = 'pod-money-badge winning';
            moneyBadge.textContent = `ganas:$${net}`;
          } else if (net < 0) {
            moneyBadge.className = 'pod-money-badge losing';
            moneyBadge.textContent = `debes:$${Math.abs(net)}`;
          } else {
            moneyBadge.className = 'pod-money-badge neutral';
            moneyBadge.textContent = `ganas:$0`;
          }
        } else {
          // Ocultar completamente para que no salga la información de lo que debe o gana el otro jugador
          moneyBadge.classList.add('hidden');
          moneyBadge.style.display = 'none';
        }
      }

      const avatarObj = window.AVATARS[player.avatar] || window.AVATARS.avatar_1;
      const avatarEl = podEl.querySelector('.pod-avatar');
      if (avatarEl) avatarEl.innerHTML = avatarObj.svg;

      const nameEl = podEl.querySelector('.pod-name');
      if (nameEl) nameEl.textContent = player.seat === mySeat ? `${player.name} (Tú)` : player.name;

      const tileBadge = podEl.querySelector('.pod-tile-count');
      if (tileBadge) tileBadge.textContent = player.tileCount;

      const passCounterEl = podEl.querySelector('.pod-pass-count');
      if (passCounterEl) {
        passCounterEl.innerHTML = `🚫 Pases: <strong>${player.passesTotal || 0}</strong>`;
      }
    });

    // Actualizar indicador en el botón de la barra superior para el propio jugador
    const myPlayer = room.players.find(p => p.seat === mySeat);
    const headerLiveBadge = document.getElementById('headerLiveBalanceBadge');
    if (headerLiveBadge && myPlayer) {
      const myNet = getPlayerLiveNetBalance(myPlayer, room);
      if (myNet > 0) {
        headerLiveBadge.textContent = `ganas:$${myNet}`;
        headerLiveBadge.className = 'beacon-money !text-emerald-300 !border-emerald-400';
      } else if (myNet < 0) {
        headerLiveBadge.textContent = `debes:$${Math.abs(myNet)}`;
        headerLiveBadge.className = 'beacon-money !text-rose-300 !border-rose-400';
      } else {
        headerLiveBadge.textContent = `ganas:$0`;
        headerLiveBadge.className = 'beacon-money !text-slate-300 !border-slate-500';
      }
    }
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
          const l = Number(room.leftEnd);
          const r = Number(room.rightEnd);
          isPlayable = (
            Number(tile.left) === l || Number(tile.right) === l ||
            Number(tile.left) === r || Number(tile.right) === r
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
    const actionId = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    window.soundManager.playTileClick();

    if (room.leftEnd === null) {
      socket.emit('play_tile', {
        tileId: tile.id || `${tile.left}-${tile.right}`,
        side: 'root',
        left: tile.left,
        right: tile.right,
        actionId,
        playerId: myPlayerId,
        clientId: myClientId
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
        right: tile.right,
        actionId,
        playerId: myPlayerId,
        clientId: myClientId
      });
    } else if (canRight) {
      socket.emit('play_tile', {
        tileId: tile.id || `${tile.left}-${tile.right}`,
        side: 'right',
        left: tile.left,
        right: tile.right,
        actionId,
        playerId: myPlayerId,
        clientId: myClientId
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
    const actionId = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    socket.emit('play_tile', {
      tileId: tile.id || `${tile.left}-${tile.right}`,
      side: side,
      left: tile.left,
      right: tile.right,
      actionId,
      playerId: myPlayerId,
      clientId: myClientId
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
    const hand = (myHand && myHand.length > 0) ? myHand : ((currentRoom.players && currentRoom.players.find(p => p.seat === mySeat))?.hand || []);
    const leftEnd = (currentRoom.leftEnd !== undefined && currentRoom.leftEnd !== null) ? Number(currentRoom.leftEnd) : null;
    const rightEnd = (currentRoom.rightEnd !== undefined && currentRoom.rightEnd !== null) ? Number(currentRoom.rightEnd) : null;

    let canPlay = false;
    if (leftEnd === null || rightEnd === null) {
      canPlay = hand.length > 0;
    } else {
      canPlay = hand.some(t =>
        Number(t.left) === leftEnd || Number(t.right) === leftEnd ||
        Number(t.left) === rightEnd || Number(t.right) === rightEnd
      );
    }

    if (canPlay) {
      showToast('⚠️ Tienes fichas disponibles para jugar. En dominó no se puede pasar si tienes jugada.');
      return;
    }

    // Feedback inmediato y bloqueo temporal para prevenir spam/desincronización
    passBtn.setAttribute('disabled', 'true');
    passBtn.classList.remove('must-pass');
    passBtn.innerHTML = '⏳ Pasando turno...';

    // El sonido Mario Pipe Pass sonará de forma confirmada cuando el servidor emita 'player_passed'
    socket.emit('pass_turn', {
      roomId: currentRoom.id,
      seat: mySeat,
      clientId: myClientId,
      playerId: myPlayerId
    });
  });

  // Notificaciones de jugadas recibidas
  socket.on('tile_played', (data) => {
    if (data.isBombEnds) {
      // Ambos extremos con números iguales: parar todos los sonidos y sonar únicamente la bomba de tiempo
      window.soundManager.playTimeBombExclusive();
      triggerBombScreenEffect(data.seat, data.bombNumber);
      if (data.forcedPass) {
        triggerForcedPassScreenEffect(data.seat, data.playerName, data.forcedPlayerName, data.forcedPlayerSeat);
      }
    } else if (data.forcedPass) {
      // ¡Al poner la ficha hizo pasar al siguiente jugador! Sonido Super Mario Bros PowerUp
      window.soundManager.playMarioPowerUp();
      triggerForcedPassScreenEffect(data.seat, data.playerName, data.forcedPlayerName, data.forcedPlayerSeat);
    } else {
      window.soundManager.playTileClick();
    }
  });

  socket.on('player_passed', (data) => {
    window.soundManager.playMarioPass();
    triggerFloatingReaction(data.seat, '🚫 ¡PASO!');
  });

  // Final de Ronda / Dominó / Tranca
  socket.on('round_ended', (data) => {
    window.soundManager.stopTimeBomb();
    window.soundManager.stopBgm(true);
    const outcome = data.outcome || {};

    if (outcome.type === 'domino') {
      // Un jugador puso la última ficha y ganó ("¡Dominó!"): Castle Clear de Super Mario Bros
      window.soundManager.playMarioCastleClear();
    } else if (outcome.type === 'tranca') {
      // Tranca (juego cerrado): comprobar si quien cerró ganó o perdió por puntos
      const closedAndWon = (outcome.closedBySeat !== null && outcome.closedBySeat !== undefined && outcome.closedBySeat === outcome.winnerSeat);
      const closedAndLost = (outcome.closedBySeat !== null && outcome.closedBySeat !== undefined && outcome.closedBySeat !== outcome.winnerSeat);

      if (closedAndWon) {
        // Al cerrar y ganar por puntos: You Win Perfect + emojis de dinero y carita de triunfo
        window.soundManager.playYouWin();
        triggerTrancaWinMoneyAnimation(outcome.winnerSeat, outcome.winnerName);
      } else if (closedAndLost) {
        // Al cerrar y perder por puntos: Failure trumpet + emojis de cara tonta/triste perdedora
        window.soundManager.playFailureTrumpet();
        triggerTrancaLoserClownAnimation(outcome.closedBySeat, outcome.closedByName);
      } else {
        window.soundManager.playGameOver();
      }
    } else {
      // Otras situaciones (abandono o derrota)
      if (outcome.winnerSeat !== mySeat) {
        window.soundManager.playGameOver();
      } else {
        window.soundManager.playMarioCastleClear();
      }
    }
    showRoundOverModal(data);
  });

  function showRoundOverModal(data) {
    const outcome = data.outcome || {};
    const title = outcome.type === 'domino' ? '🏆 ¡DOMINÓ!' : '🔒 ¡JUEGO TRANCADO!';
    document.getElementById('roundOverTitle').textContent = title;

    let trancaSubtext = '<p class="text-xs text-slate-300 mt-1">Gana por tener la menor suma de puntos en mano.</p>';
    if (outcome.type === 'tranca' && outcome.closedByName) {
      const closedAndLost = (outcome.closedBySeat !== outcome.winnerSeat);
      trancaSubtext = closedAndLost
        ? `<p class="text-xs text-rose-300 font-bold mt-1">💀 <strong>${outcome.closedByName}</strong> tiró la ficha que cerró el juego y le provocó perder (Game Over).</p>`
        : `<p class="text-xs text-emerald-300 font-bold mt-1">🔒 <strong>${outcome.closedByName}</strong> tiró la ficha que cerró el juego ¡y ganó en el conteo de puntos!</p>`;
    }

    document.getElementById('roundOverWinner').innerHTML = `
      Ganador de la ronda: <strong class="text-yellow-300">${outcome.winnerName || 'Empate'}</strong>
      ${outcome.type === 'tranca' ? trancaSubtext : ''}
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

      const avatarObj = window.AVATARS[p.avatar] || window.AVATARS.avatar_1;
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
  // DETECTOR INTELIGENTE DE GÉNERO POR NOMBRE
  // Regla: Si es femenino claro -> mujer ("la ganadora").
  // Si es masculino, unisex o nombre raro -> hombre ("el ganador").
  // ==========================================
  function getGenderForName(name) {
    if (!name || typeof name !== 'string') return 'male';
    let clean = name.replace(/\(.*?\)/g, '').trim().toLowerCase();
    clean = clean.split(/\s+/)[0];
    clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (!clean) return 'male';

    // Nombres femeninos explícitos que no terminan en 'a'
    const femaleNamesNoA = new Set([
      'carmen', 'isabel', 'raquel', 'pilar', 'mercedes', 'beatriz', 'ester', 'esther',
      'ines', 'belen', 'mar', 'rocio', 'rosario', 'consuelo', 'montserrat', 'miriam',
      'ruth', 'judith', 'guadalupe', 'lourdes', 'sol', 'luz', 'paz', 'socorro', 'amparo',
      'nieves', 'asuncion', 'concepcion', 'dolores', 'soledad', 'remedios', 'meritxell',
      'karen', 'sharon', 'ingrid', 'astrid', 'edith', 'nuria', 'iris', 'ivon', 'ivonne',
      'ade', 'moni', 'vero', 'paty', 'patti', 'gaby', 'gabi', 'lupita', 'mari', 'mary',
      'susy', 'susi', 'vicky', 'ceci', 'betty', 'katy', 'lucy', 'naty', 'nati', 'lily', 'lili'
    ]);

    if (femaleNamesNoA.has(clean)) return 'female';

    // Nombres masculinos explícitos que terminan en 'a'
    const maleNamesWithA = new Set([
      'luca', 'lucas', 'borja', 'gorka', 'josua', 'joshua', 'elias', 'isaias', 'matias',
      'tobias', 'bautista', 'dakota', 'andrea', 'ezra', 'noah', 'akira', 'mustafa', 'issa',
      'sasha'
    ]);

    if (maleNamesWithA.has(clean)) return 'male';

    // Terminación clásica femenina en español (-a)
    if (clean.endsWith('a') && clean.length >= 3) {
      return 'female';
    }

    // Regla del usuario: si es unisex, desconocido o raro -> 'male'
    return 'male';
  }

  // ==========================================
  // CORTE DE BALANCE EN VIVO (BOTÓN ROJO PARPADEANTE)
  // ==========================================
  const btnLiveBalanceCheck = document.getElementById('btnLiveBalanceCheck');
  const btnCloseLiveBalance = document.getElementById('btnCloseLiveBalance');
  const btnDismissLiveBalance = document.getElementById('btnDismissLiveBalance');

  function getClientComputedLiveBalance() {
    if (!currentRoom || !currentRoom.players) return null;
    const gameRate = (currentRoom && typeof currentRoom.gameRate === 'number') ? currentRoom.gameRate : 5;
    const penaltyPerPass = (currentRoom && typeof currentRoom.penaltyPerPass === 'number') ? currentRoom.penaltyPerPass : 1;
    const players = currentRoom.players.map(p => ({
      name: p.name,
      wins: p.wins || 0,
      passesTotal: p.passesTotal || 0,
      points: p.points || 0
    }));

    const netFinancialSummary = players.map(p => {
      let winNet = 0;
      players.forEach(other => {
        if (other.name !== p.name) winNet += (p.wins - other.wins) * gameRate;
      });
      let passNet = 0;
      players.forEach(other => {
        if (other.name !== p.name) passNet += (other.passesTotal - p.passesTotal) * penaltyPerPass;
      });
      return {
        name: p.name,
        wins: p.wins,
        passesTotal: p.passesTotal,
        points: p.points,
        winNet,
        passNet,
        grandTotal: winNet + passNet
      };
    });

    netFinancialSummary.sort((a, b) => b.grandTotal - a.grandTotal);

    return {
      totalRounds: currentRoom.round || 1,
      gameRate,
      penaltyPerPass,
      netFinancialSummary
    };
  }

  function renderLiveBalance(data) {
    if (!data || !data.netFinancialSummary || data.netFinancialSummary.length === 0) return;
    const summary = [...data.netFinancialSummary].sort((a, b) => b.grandTotal - a.grandTotal);
    const roundNumberEl = document.getElementById('lbRoundNumber');
    if (roundNumberEl) roundNumberEl.textContent = data.totalRounds || (currentRoom ? currentRoom.round : 1);

    const headlineEl = document.getElementById('lbHeadlineText');
    const badgeEl = document.getElementById('lbTotalMoneyBadge');
    const paymentEl = document.getElementById('lbPaymentPreviewText');
    const winMoneyEl = document.getElementById('lbWinMoneyText');
    const winDetailsEl = document.getElementById('lbWinDetailsText');
    const passMoneyEl = document.getElementById('lbPassMoneyText');
    const passDetailsEl = document.getElementById('lbPassDetailsText');
    const tableContainer = document.getElementById('lbPlayersTableContainer');

    const gameRate = data.gameRate || 5;
    const penaltyPerPass = data.penaltyPerPass || 1;

    if (summary.length === 2) {
      const pA = summary[0]; // Mayor o empatado
      const pB = summary[1]; // Menor o empatado

      if (pA.grandTotal > pB.grandTotal) {
        const totalWon = pA.grandTotal;
        const winsDiff = pA.wins - pB.wins;
        const winMoney = winsDiff * gameRate;
        const passDiff = pB.passesTotal - pA.passesTotal;
        const passMoney = passDiff * penaltyPerPass;

        const winnerGender = getGenderForName(pA.name);
        const winnerArticle = winnerGender === 'female' ? 'la ganadora' : 'el ganador';
        if (headlineEl) {
          headlineEl.innerHTML = `Si en este momento dejáramos de jugar, ${winnerArticle} sería <span class="text-yellow-300 font-black underline underline-offset-4 decoration-yellow-400">${pA.name}</span>.`;
        }
        if (badgeEl) {
          badgeEl.textContent = `💰 Va ganando un total de $${totalWon} pesos`;
        }
        if (paymentEl) {
          paymentEl.innerHTML = `👉 <span class="text-rose-300 font-extrabold">${pB.name}</span> le tendría que pagar <span class="text-emerald-300 font-black">$${totalWon} pesos</span> a <span class="text-yellow-300 font-extrabold">${pA.name}</span>`;
        }

        if (winMoneyEl) winMoneyEl.textContent = `${winMoney >= 0 ? '+' : ''}$${winMoney} pesos`;
        if (winDetailsEl) winDetailsEl.textContent = `(${winsDiff} juego(s) de ventaja a $${gameRate} c/u: ${pA.wins} de ${pA.name} vs ${pB.wins} de ${pB.name})`;

        if (passMoneyEl) passMoneyEl.textContent = `${passMoney >= 0 ? '+' : ''}$${passMoney} pesos`;
        if (passDetailsEl) passDetailsEl.textContent = `(${passDiff} pase(s) de diferencia a $${penaltyPerPass} c/u: ${pB.passesTotal} de ${pB.name} vs ${pA.passesTotal} de ${pA.name})`;
      } else {
        // Empate total
        if (headlineEl) {
          headlineEl.innerHTML = `Si en este momento dejáramos de jugar, habría un <span class="text-yellow-300 font-black">EMPATE TOTAL ($0 pesos)</span>.`;
        }
        if (badgeEl) {
          badgeEl.textContent = `⚪ Ambos jugadores van a mano ($0 pesos)`;
        }
        if (paymentEl) {
          paymentEl.textContent = `Nadie le debe dinero a nadie en este momento. ¡La partida está totalmente empatada!`;
        }

        if (winMoneyEl) winMoneyEl.textContent = `$0 pesos`;
        if (winDetailsEl) winDetailsEl.textContent = `(Mismo número de victorias: ${pA.wins} vs ${pB.wins})`;

        if (passMoneyEl) passMoneyEl.textContent = `$0 pesos`;
        if (passDetailsEl) passDetailsEl.textContent = `(Mismo número de pases: ${pA.passesTotal} vs ${pB.passesTotal})`;
      }
    } else {
      // 3 o 4 jugadores
      const leader = summary[0];
      if (leader.grandTotal > 0) {
        const leaderGender = getGenderForName(leader.name);
        const leaderArticle = leaderGender === 'female' ? 'la ganadora' : 'el ganador';
        if (headlineEl) {
          headlineEl.innerHTML = `Si en este momento dejáramos de jugar, ${leaderArticle} sería <span class="text-yellow-300 font-black underline underline-offset-4 decoration-yellow-400">${leader.name}</span>.`;
        }
        if (badgeEl) {
          badgeEl.textContent = `💰 Lleva acumulados +$${leader.grandTotal} pesos a su favor`;
        }
        if (paymentEl) {
          paymentEl.textContent = data.primaryPaymentHeadline || `Líder con ${leader.wins} victorias y ${leader.passesTotal} pases.`;
        }
      } else {
        if (headlineEl) {
          headlineEl.textContent = `Si en este momento dejáramos de jugar, todos los jugadores estarían empatados ($0 pesos).`;
        }
        if (badgeEl) {
          badgeEl.textContent = `⚪ Marcador a mano ($0 pesos)`;
        }
        if (paymentEl) {
          paymentEl.textContent = `Sin deudas pendientes en este momento.`;
        }
      }

      if (winMoneyEl) winMoneyEl.textContent = `$${leader.winNet >= 0 ? '+' : ''}${leader.winNet} pesos`;
      if (winDetailsEl) winDetailsEl.textContent = `(Balance neto por victorias para ${leader.name})`;

      if (passMoneyEl) passMoneyEl.textContent = `$${leader.passNet >= 0 ? '+' : ''}${leader.passNet} pesos`;
      if (passDetailsEl) passDetailsEl.textContent = `(Balance neto por pases para ${leader.name})`;
    }

    // Tabla rápida de saldos en vivo
    if (tableContainer) {
      let tbl = `
        <table class="balance-table w-full text-xs">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Juegos</th>
              <th>Pases</th>
              <th>Juegos ($${gameRate})</th>
              <th>Pases ($${penaltyPerPass})</th>
              <th>Total Neto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
      `;
      summary.forEach(p => {
        const isLead = p.grandTotal > 0;
        const isDebt = p.grandTotal < 0;
        const color = isLead ? 'text-emerald-400 font-black' : (isDebt ? 'text-rose-400 font-black' : 'text-slate-300 font-bold');
        const sign = isLead ? `+ $${p.grandTotal}` : (isDebt ? `- $${Math.abs(p.grandTotal)}` : '$0');
        const tag = isLead
          ? '<span class="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-extrabold text-[9px] border border-emerald-500/40">🟢 COBRA</span>'
          : (isDebt ? '<span class="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 font-extrabold text-[9px] border border-rose-500/40">🔴 PAGA</span>' : '<span class="text-[9px] text-slate-400 font-bold">⚪ A MANO</span>');

        tbl += `
          <tr class="${isLead ? 'champion-row' : ''}">
            <td><strong>${p.name}</strong></td>
            <td class="text-amber-300 font-bold">${p.wins}</td>
            <td class="text-slate-300">${p.passesTotal}</td>
            <td class="${p.winNet >= 0 ? 'text-amber-300' : 'text-rose-400'} font-bold">${p.winNet >= 0 ? '+' : ''}$${p.winNet}</td>
            <td class="${p.passNet >= 0 ? 'text-emerald-300' : 'text-rose-400'} font-bold">${p.passNet >= 0 ? '+' : ''}$${p.passNet}</td>
            <td class="${color} text-sm">${sign}</td>
            <td>${tag}</td>
          </tr>
        `;
      });
      tbl += `</tbody></table>`;
      tableContainer.innerHTML = tbl;
    }

    if (liveBalanceModal) {
      liveBalanceModal.classList.remove('hidden');
      liveBalanceModal.style.display = 'flex';
    }
  }

  if (btnLiveBalanceCheck) {
    btnLiveBalanceCheck.addEventListener('click', () => {
      window.soundManager.playTileClick();
      // Cálculo inmediato con datos locales
      const localSnap = getClientComputedLiveBalance();
      if (localSnap) renderLiveBalance(localSnap);
      // Solicitud en vivo al servidor para sincronización perfecta
      socket.emit('get_live_balance', { roomId: currentRoom ? currentRoom.id : undefined });
    });
  }

  socket.on('live_balance_snapshot', (snapshot) => {
    renderLiveBalance(snapshot);
  });

  if (btnCloseLiveBalance) {
    btnCloseLiveBalance.addEventListener('click', () => {
      if (liveBalanceModal) {
        liveBalanceModal.classList.add('hidden');
        liveBalanceModal.style.display = 'none';
      }
    });
  }

  if (btnDismissLiveBalance) {
    btnDismissLiveBalance.addEventListener('click', () => {
      if (liveBalanceModal) {
        liveBalanceModal.classList.add('hidden');
        liveBalanceModal.style.display = 'none';
      }
    });
  }

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
      // Dominó Psicópata con cuchillo -> Tema de Psicosis mejorado
      window.soundManager.playPsychosis();
      triggerPsychoChaseAnimation();
    } else if (data.emoji === '😂') {
      window.soundManager.playLaughter();
    } else if (data.emoji === '😱' || data.emoji === '💀') {
      window.soundManager.playScream();
    } else if (data.emoji === '😡' || data.emoji === '🤬') {
      window.soundManager.playAngry();
    } else if (data.emoji === '💣' || (data.text && (data.text.includes('volar la papada') || data.text.includes('BOMBA')))) {
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
    const maxP = (currentRoom && currentRoom.maxPlayers) ? currentRoom.maxPlayers : 2;
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
    const isSingleEmoji = (content.length <= 4 && !content.includes(' ')) || content === 'DOMINO_PSYCHO' || content === 'DOMINO_SCARED';

    if (isSingleEmoji) {
      if (content === 'DOMINO_PSYCHO' || content === 'DOMINO_SCARED') {
        triggerPsychoChaseAnimation();
        const psychoThematic = ['DOMINO_SCARED', 'DOMINO_PSYCHO', '🔪', '🩸', '😱', 'DOMINO_SCARED', 'DOMINO_PSYCHO', '🔪', '🩸', '💦', '🏃‍♂️', '💨'];
        psychoThematic.forEach((em, idx) => {
          setTimeout(() => createSlowScreenEmoji(em, idx, psychoThematic.length), idx * 210);
        });
        return;
      }

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
        triggerPsychoChaseAnimation();
        thematicIcons = ['DOMINO_SCARED', 'DOMINO_PSYCHO', '🔪', '🩸', '😱', 'DOMINO_SCARED', 'DOMINO_PSYCHO', '🔪', '🩸', '💦', '🏃‍♂️', '💨'];
      } else if (content.includes('volar la papada') || content.includes('BOMBA') || content.includes('PUNTAS') || content.includes('💣')) {
        thematicIcons = ['💣', '💥', '🔥', '💣', '💥', '🔥', '💣', '💥', '🔥', '💣', '💥', '🔥'];
      } else if (content.includes('PASAR A') || content.includes('🍄') || content.includes('PowerUp')) {
        thematicIcons = ['🍄', '⭐', '✨', '🍄', '⭐', '✨', '🍄', '⭐', '✨', '🍄', '⭐', '✨'];
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

  // Animación cómica de persecución Psicosis: Ficha psicópata persiguiendo a ficha aterrada
  function triggerPsychoChaseAnimation() {
    const existing = document.querySelector('.psycho-chase-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'psycho-chase-overlay';
    overlay.innerHTML = `
      <div class="psycho-chase-convoy">
        <!-- Ficha de dominó aterrada corriendo desesperadamente -->
        <div class="scared-runner">
          <div class="chase-shout scared-shout">¡AUXILIOOO! 😱💦</div>
          <img src="/images/domino-scared.svg" class="chase-domino-scared-img" alt="Dominó Aterrado">
          <div class="dust-cloud">💨💨</div>
        </div>

        <!-- Ficha de dominó psicópata con cara de loca persiguiendo con cuchillo ensangrentado -->
        <div class="psycho-hunter">
          <div class="chase-shout psycho-shout">¡TE VOY A PICAR! 🔪🩸</div>
          <img src="/images/domino-psycho.svg" class="chase-domino-psycho-img" alt="Dominó Psicópata">
          <div class="blood-drips">🩸🩸</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 4800);
  }

  // Activa la animación en pantalla cuando una ficha colocada hace pasar al siguiente jugador
  function triggerForcedPassScreenEffect(seat, playerName, forcedPlayerName, forcedPlayerSeat) {
    const targetName = forcedPlayerName || 'Rival';
    const label = `🍄 ¡HIZO PASAR A ${targetName.toUpperCase()}! 🍄`;
    triggerFloatingReaction(seat, label);

    // Globito en el jugador obligado a pasar
    if (forcedPlayerSeat !== null && forcedPlayerSeat !== undefined) {
      setTimeout(() => {
        triggerFloatingReaction(forcedPlayerSeat, '🚫 ¡NO LLEVO!');
      }, 700);
    }

    const burst = document.createElement('div');
    burst.className = 'powerup-central-burst';
    burst.innerHTML = `
      <div class="powerup-icon">🍄</div>
      <div class="powerup-badge">¡HIZO PASAR A ${targetName}!</div>
    `;
    document.body.appendChild(burst);

    setTimeout(() => {
      if (burst.parentNode) burst.parentNode.removeChild(burst);
    }, 3200);
  }

  // Activa la animación en pantalla y bomba cuando los extremos quedan con números iguales
  function triggerBombScreenEffect(seat, bombNumber) {
    const label = (bombNumber !== null && bombNumber !== undefined)
      ? `💣 ¡BOMBA! PUNTAS A ${bombNumber} 💣`
      : '💣 ¡BOMBA! PUNTAS IGUALES 💣';
    triggerFloatingReaction(seat, label);

    const burst = document.createElement('div');
    burst.className = 'bomb-central-burst';
    burst.innerHTML = `
      <div class="bomb-icon">💣</div>
      <div class="bomb-badge">¡BOMBA! ${bombNumber !== null && bombNumber !== undefined ? `Puntas a ${bombNumber}` : 'Puntas Iguales'}</div>
    `;
    document.body.appendChild(burst);

    setTimeout(() => {
      if (burst.parentNode) burst.parentNode.removeChild(burst);
    }, 3200);
  }

  // Animación cuando alguien tira y gana por puntos al cerrarse el juego (Tranca ganada con dinero y triunfo)
  function triggerTrancaWinMoneyAnimation(winnerSeat, winnerName) {
    const targetName = winnerName || 'Ganador';
    triggerFloatingReaction(winnerSeat, '🤑 ¡GANÓ POR PUNTOS! 💰');

    const burst = document.createElement('div');
    burst.className = 'powerup-central-burst';
    burst.style.borderColor = 'rgba(234, 179, 8, 0.85)';
    burst.style.background = 'radial-gradient(circle, rgba(234, 179, 8, 0.35) 0%, rgba(2, 44, 34, 0.95) 75%)';
    burst.innerHTML = `
      <div class="powerup-icon">🤑</div>
      <div class="powerup-badge" style="background: linear-gradient(135deg, #eab308, #ca8a04); color: #0f172a; font-weight: 900;">
        💰 ¡${targetName.toUpperCase()} GANÓ POR PUNTOS EN LA TRANCA! 😎
      </div>
    `;
    document.body.appendChild(burst);

    setTimeout(() => {
      if (burst.parentNode) burst.parentNode.removeChild(burst);
    }, 3600);

    // Lluvia de emojis de dinero y triunfo cruzando lentamente la pantalla
    const moneyEmojis = ['💸', '💰', '💵', '🤑', '💎', '😎', '🏆', '🤑', '💸', '💰'];
    moneyEmojis.forEach((emoji, idx) => {
      setTimeout(() => {
        createSlowScreenEmoji(emoji, idx, moneyEmojis.length);
      }, idx * 260);
    });
  }

  // Animación cuando alguien tira y su jugada cierra el juego pero le hace perder (Tranca perdida con trompeta y cara triste)
  function triggerTrancaLoserClownAnimation(loserSeat, loserName) {
    const targetName = loserName || 'Jugador';
    triggerFloatingReaction(loserSeat, '🤡 ¡CERRÓ Y PERDIÓ! 😭');

    const burst = document.createElement('div');
    burst.className = 'bomb-central-burst';
    burst.style.borderColor = 'rgba(239, 68, 68, 0.85)';
    burst.style.background = 'radial-gradient(circle, rgba(239, 68, 68, 0.35) 0%, rgba(30, 10, 10, 0.95) 75%)';
    burst.innerHTML = `
      <div class="bomb-icon">🤡</div>
      <div class="bomb-badge" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: #ffffff; font-weight: 900;">
        😭 ¡${targetName.toUpperCase()} CERRÓ EL JUEGO Y PERDIÓ! 🥴
      </div>
    `;
    document.body.appendChild(burst);

    setTimeout(() => {
      if (burst.parentNode) burst.parentNode.removeChild(burst);
    }, 3600);

    // Emojis de cara tonta y triste perdedora cruzando lentamente la pantalla
    const loserEmojis = ['🤡', '🥴', '🥺', '😭', '🤦‍♂️', '🤡', '🥴', '🥺', '😭', '🤡'];
    loserEmojis.forEach((emoji, idx) => {
      setTimeout(() => {
        createSlowScreenEmoji(emoji, idx, loserEmojis.length);
      }, idx * 260);
    });
  }

  function createSlowScreenEmoji(emoji, index, total) {
    const el = document.createElement('div');
    el.className = 'slow-screen-emoji';
    if (emoji === 'DOMINO_PSYCHO') {
      el.innerHTML = `<img src="/images/domino-psycho.svg" class="slow-psycho-domino-img" alt="Dominó Psicópata">`;
    } else if (emoji === 'DOMINO_SCARED') {
      el.innerHTML = `<img src="/images/domino-scared.svg" class="slow-scared-domino-img" alt="Dominó Aterrado">`;
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
    if (sessionRecoveryTimeout) {
      clearTimeout(sessionRecoveryTimeout);
      sessionRecoveryTimeout = null;
      isAttemptingRecovery = false;
      clearActiveSession();
      if (setupModal) {
        setupModal.classList.remove('hidden');
        setupModal.style.display = 'flex';
      }
      const banner = document.getElementById('reconnectBanner');
      if (banner) banner.classList.add('hidden');
    }
    if (currentRoom) {
      updateUI(currentRoom);
      socket.emit('request_room_refresh');
    }
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
    // Solo mostrar aviso de abandono si la partida estaba efectivamente en juego
    if (data.wasPlaying) {
      if (!finalBalanceModal || finalBalanceModal.classList.contains('hidden') || finalBalanceModal.style.display === 'none') {
        alert(`Has abandonado la partida. Se registró 1 juego perdido para ${data.playerName}. Total de derrotas acumuladas: ${data.losses}.`);
      }
    }
    clearActiveSession();
    lobbyModal.classList.add('hidden');
    lobbyModal.style.display = 'none';
    scoreboardModal.classList.add('hidden');
    roundOverModal.classList.add('hidden');
    finalBalanceModal.classList.add('hidden');
    finalBalanceModal.style.display = 'none';
    setupModal.classList.remove('hidden');
    setupModal.style.display = 'flex';
    currentRoom = null;
    mySeat = null;
    myHand = [];
    if (boardContainer) boardContainer.innerHTML = '';
    const myHandContainer = document.getElementById('myHand');
    if (myHandContainer) myHandContainer.innerHTML = '';
    updateProfileCardUI();
  });

  // Salir de la partida / mesa al cerrar la ventana de Balance Final y regresar al menú principal
  function exitGameToMainMenu() {
    window.soundManager.stopTimeBomb();
    window.soundManager.stopChampions();
    window.soundManager.stopBgm(true);

    clearActiveSession();
    socket.emit('leave_game');

    currentRoom = null;
    mySeat = null;
    myHand = [];

    // Ocultar modal de Balance Final y todos los modales de juego
    if (finalBalanceModal) {
      finalBalanceModal.classList.add('hidden');
      finalBalanceModal.style.display = 'none';
    }
    if (roundOverModal) {
      roundOverModal.classList.add('hidden');
      roundOverModal.style.display = 'none';
    }
    if (scoreboardModal) {
      scoreboardModal.classList.add('hidden');
      scoreboardModal.style.display = 'none';
    }
    if (liveBalanceModal) {
      liveBalanceModal.classList.add('hidden');
      liveBalanceModal.style.display = 'none';
    }
    if (lobbyModal) {
      lobbyModal.classList.add('hidden');
      lobbyModal.style.display = 'none';
    }

    // Limpiar tablero y fichas
    if (boardContainer) boardContainer.innerHTML = '';
    const myHandContainer = document.getElementById('myHand');
    if (myHandContainer) myHandContainer.innerHTML = '';

    // Limpiar parámetro ?room de la URL
    if (window.history.pushState) {
      window.history.pushState({}, document.title, window.location.pathname);
    }

    // Mostrar pantalla de inicio / perfil
    if (setupModal) {
      setupModal.classList.remove('hidden');
      setupModal.style.display = 'flex';
      updateProfileCardUI();
    }

    showToast('🚪 Has salido del juego');
  }

  // Renderizar y mostrar el Balance Final (Imágenes 1 y 2)
  function renderFinalBalance(balance) {
    if (!balance) return;
    currentSessionBalance = balance;

    // Detener de inmediato toda música de fondo y reproducir exclusivamente Queen - We Are The Champions
    window.soundManager.stopBgm(true);
    window.soundManager.playChampions();

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
    const champTitleEl = document.getElementById('fbChampionTitle');
    if (champTitleEl) {
      if (balance.isDraw) {
        champTitleEl.textContent = '👑 EMPATE EN PARTIDAS';
      } else {
        const champGender = getGenderForName(balance.champion);
        champTitleEl.textContent = champGender === 'female' ? '👑 Ganadora de Más Partidas' : '👑 Ganador de Más Partidas';
      }
    }

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

    // 2. Tabla de Pases y Penalizaciones ($1 c/u)
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
              <th>Pases Totales</th>
              <th>Aportación ($${balance.penaltyPerPass || 1} c/u)</th>
            </tr>
          </thead>
          <tbody>
      `;
      balance.rankedByPasses.forEach((p, idx) => {
        const penaltyCost = p.passesTotal * (balance.penaltyPerPass || 1);
        const tag = idx === 0 ? '⭐ Menos pases' : `${idx + 1}º`;
        html += `
          <tr class="${idx === 0 ? 'champion-row' : ''}">
            <td>${tag}</td>
            <td><strong>${p.name}</strong></td>
            <td class="text-amber-300 font-bold">${p.passesTotal} pase(s)</td>
            <td class="text-rose-400 font-bold">$${penaltyCost}</td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
      passTableEl.innerHTML = html;
    }

    // Liquidación de Dinero Extra por Pases ($1 c/u)
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
        passSetEl.innerHTML = '<div class="text-slate-400">No hubo diferencias de pases entre los jugadores.</div>';
      }
    }

    // 3. Liquidación Total y Saldo Neto en Pesos (Juegos $5 + Pases $1)
    const netTableEl = document.getElementById('fbNetTable');
    if (netTableEl && balance.netFinancialSummary) {
      let html = `
        <table class="balance-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Juegos</th>
              <th>Pases</th>
              <th>Por Juegos ($${balance.gameRate || 5} c/u)</th>
              <th>Por Pases ($${balance.penaltyPerPass || 1} c/u)</th>
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
    window.soundManager.stopBgm(true);
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
      // Detener Champions y salir del juego al menú principal
      exitGameToMainMenu();
    });
  }

  const btnExitGameFromBalance = document.getElementById('btnExitGameFromBalance');
  if (btnExitGameFromBalance) {
    btnExitGameFromBalance.addEventListener('click', () => {
      // Detener Champions y salir del juego al menú principal
      exitGameToMainMenu();
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

  // Si se cierra el modal con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (finalBalanceModal && !finalBalanceModal.classList.contains('hidden') && finalBalanceModal.style.display !== 'none') {
        exitGameToMainMenu();
      }
      if (liveBalanceModal && !liveBalanceModal.classList.contains('hidden')) {
        liveBalanceModal.classList.add('hidden');
        liveBalanceModal.style.display = 'none';
      }
    }
  });

  // ==========================================
  // SISTEMA DE AMIGOS, INVITACIONES, PUSH Y RECONEXIÓN
  // ==========================================
  let myFriends = [];
  let pendingRequests = [];
  let pendingInvitations = [];
  let activePartnerGraceInterval = null;
  let deferredPrompt = null;

  // Registrar Service Worker para PWA y Web Push
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        if ('pushManager' in reg) {
          reg.pushManager.getSubscription().then((sub) => {
            const pushStatusText = document.getElementById('pushStatusText');
            const pushIcon = document.getElementById('pushIcon');
            if (sub && pushStatusText) {
              pushStatusText.textContent = 'Avisos de partidas activados';
              if (pushIcon) pushIcon.textContent = '✅';
            }
          });
        }
      }).catch(err => {
        console.warn('Error registrando Service Worker:', err);
      });
    });
  }

  // Control de estado del botón de instalación del Lobby (Habilitar / Inhabilitar según esté instalado)
  const btnLobbyInstallApp = document.getElementById('btnLobbyInstallApp');

  function setLobbyInstallButtonState(isInstalled) {
    if (!btnLobbyInstallApp) return;
    if (isInstalled) {
      btnLobbyInstallApp.disabled = true;
      btnLobbyInstallApp.innerHTML = '<span>✅ Acceso Directo Ya Instalado</span>';
      btnLobbyInstallApp.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
      btnLobbyInstallApp.classList.remove('active:scale-95');
    } else {
      btnLobbyInstallApp.disabled = false;
      btnLobbyInstallApp.innerHTML = '<span>📲 Instalar / Actualizar Acceso Directo</span>';
      btnLobbyInstallApp.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
      btnLobbyInstallApp.classList.add('active:scale-95');
    }
  }

  async function checkPwaInstalledStatus() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
      setLobbyInstallButtonState(true);
      return;
    }

    if ('getInstalledRelatedApps' in navigator) {
      try {
        const related = await navigator.getInstalledRelatedApps();
        if (related && related.length > 0) {
          setLobbyInstallButtonState(true);
          return;
        } else {
          setLobbyInstallButtonState(false);
          return;
        }
      } catch (e) {
        // Fallback
      }
    }
  }

  // Capturar evento PWA para instalación en pantalla de inicio
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setLobbyInstallButtonState(false);
    const btnInstallPwa = document.getElementById('btnInstallPwa');
    if (btnInstallPwa) {
      btnInstallPwa.classList.remove('hidden');
    }
  });

  // Cuando se termina de instalar la aplicación / crear el acceso directo
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setLobbyInstallButtonState(true);
    showToast('✅ ¡Acceso directo creado correctamente!');
    const btnInstallPwa = document.getElementById('btnInstallPwa');
    if (btnInstallPwa) {
      btnInstallPwa.classList.add('hidden');
    }
  });

  // Si cambia el modo de visualización entre standalone y navegador
  try {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    if (standaloneMedia && standaloneMedia.addEventListener) {
      standaloneMedia.addEventListener('change', (e) => {
        setLobbyInstallButtonState(e.matches);
      });
    }
  } catch (err) {}

  // Verificar estado inicial al cargar
  checkPwaInstalledStatus();

  const btnInstallPwa = document.getElementById('btnInstallPwa');
  if (btnInstallPwa) {
    btnInstallPwa.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('📲 ¡Instalando aplicación de Dominó!');
          setLobbyInstallButtonState(true);
        }
        deferredPrompt = null;
        btnInstallPwa.classList.add('hidden');
      }
    });
  }

  // Botón visible de instalación / actualización en la pantalla de inicio
  if (btnLobbyInstallApp) {
    btnLobbyInstallApp.addEventListener('click', async () => {
      if (btnLobbyInstallApp.disabled) return;
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('📲 ¡Instalando aplicación de Dominó con el nuevo icono!');
          setLobbyInstallButtonState(true);
        }
        deferredPrompt = null;
        return;
      }
      
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (isStandalone) {
        setLobbyInstallButtonState(true);
        alert('ℹ️ Ya estás dentro del juego.\n\nPara que tu teléfono tome el nuevo icono neón en la pantalla:\n1. Sal de aquí y ve a la pantalla de tu celular donde están tus apps.\n2. Mantén presionado el icono anterior de Dominó y dale "Desinstalar" o "Eliminar".\n3. Abre la app de Google Chrome y entra a:\nhttps://domino-game-6fw2.onrender.com\n4. Toca los 3 puntos (⋮) arriba a la derecha y elige "Instalar aplicación".');
      } else {
        alert('ℹ️ Para instalar el acceso directo con el nuevo icono:\n1. Si ya tienes un icono viejo en tu pantalla de inicio, desinstálalo primero.\n2. En Google Chrome, toca los 3 puntos verticales (⋮) arriba a la derecha.\n3. Selecciona "Instalar aplicación" o "Agregar a la pantalla principal".');
      }
    });
  }

  // Elementos de la interfaz de Amigos
  const friendsModal = document.getElementById('friendsModal');
  const btnOpenFriends = document.getElementById('btnOpenFriends');
  const btnCloseFriends = document.getElementById('btnCloseFriends');
  const friendsPendingBadge = document.getElementById('friendsPendingBadge');
  const requestsTabBadge = document.getElementById('requestsTabBadge');
  const myFriendsCount = document.getElementById('myFriendsCount');

  const tabBtnMyFriends = document.getElementById('tabBtnMyFriends');
  const tabBtnRequests = document.getElementById('tabBtnRequests');
  const tabBtnShareLink = document.getElementById('tabBtnShareLink');
  const tabContentMyFriends = document.getElementById('tabContentMyFriends');
  const tabContentRequests = document.getElementById('tabContentRequests');
  const tabContentShareLink = document.getElementById('tabContentShareLink');

  const myFriendsList = document.getElementById('myFriendsList');
  const emptyFriendsNotice = document.getElementById('emptyFriendsNotice');
  const incomingRequestsList = document.getElementById('incomingRequestsList');
  const emptyRequestsNotice = document.getElementById('emptyRequestsNotice');

  const myFriendLinkInput = document.getElementById('myFriendLinkInput');
  const btnCopyFriendLink = document.getElementById('btnCopyFriendLink');
  const btnShareFriendWhatsApp = document.getElementById('btnShareFriendWhatsApp');
  const btnGoToShareFromEmpty = document.getElementById('btnGoToShareFromEmpty');
  const btnTogglePushNotifications = document.getElementById('btnTogglePushNotifications');

  // Enlace personal de amistad
  const myFriendLink = `${window.location.origin}/?friend=${myPlayerId}`;
  if (myFriendLinkInput) {
    myFriendLinkInput.value = myFriendLink;
  }

  // Abrir y cerrar Panel de Amigos
  if (btnOpenFriends) {
    btnOpenFriends.addEventListener('click', () => {
      window.soundManager.playTileClick();
      if (friendsModal) {
        friendsModal.classList.remove('hidden');
        friendsModal.style.display = 'flex';
      }
      switchFriendsTab('myFriends');
      syncSessionWithServer();
    });
  }

  if (btnCloseFriends) {
    btnCloseFriends.addEventListener('click', () => {
      window.soundManager.playTileClick();
      if (friendsModal) {
        friendsModal.classList.add('hidden');
        friendsModal.style.display = 'none';
      }
    });
  }

  if (btnGoToShareFromEmpty) {
    btnGoToShareFromEmpty.addEventListener('click', () => {
      switchFriendsTab('shareLink');
    });
  }

  function switchFriendsTab(tabName) {
    if (!tabBtnMyFriends || !tabBtnRequests || !tabBtnShareLink) return;
    tabBtnMyFriends.classList.remove('active');
    tabBtnRequests.classList.remove('active');
    tabBtnShareLink.classList.remove('active');

    tabContentMyFriends?.classList.add('hidden');
    tabContentRequests?.classList.add('hidden');
    tabContentShareLink?.classList.add('hidden');

    if (tabName === 'myFriends') {
      tabBtnMyFriends.classList.add('active');
      tabContentMyFriends?.classList.remove('hidden');
    } else if (tabName === 'requests') {
      tabBtnRequests.classList.add('active');
      tabContentRequests?.classList.remove('hidden');
    } else if (tabName === 'shareLink') {
      tabBtnShareLink.classList.add('active');
      tabContentShareLink?.classList.remove('hidden');
    }
  }

  if (tabBtnMyFriends) tabBtnMyFriends.addEventListener('click', () => switchFriendsTab('myFriends'));
  if (tabBtnRequests) tabBtnRequests.addEventListener('click', () => switchFriendsTab('requests'));
  if (tabBtnShareLink) tabBtnShareLink.addEventListener('click', () => switchFriendsTab('shareLink'));

  // Copiar Enlace de Amistad
  if (btnCopyFriendLink) {
    btnCopyFriendLink.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(myFriendLink).then(() => {
          showToast('📋 ¡Enlace de amistad copiado!');
        }).catch(() => {
          copyFallback(myFriendLink);
        });
      } else {
        copyFallback(myFriendLink);
      }
    });
  }

  function copyFallback(text) {
    if (myFriendLinkInput) {
      myFriendLinkInput.select();
      document.execCommand('copy');
      showToast('📋 ¡Enlace de amistad copiado!');
    }
  }

  // Compartir Enlace por WhatsApp
  if (btnShareFriendWhatsApp) {
    btnShareFriendWhatsApp.addEventListener('click', () => {
      const msg = `¡Hola! Agrégame como amigo en Dominó Clásico para que juguemos juntos cuando quieras:\n${myFriendLink}`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }

  // Activar avisos de partidas (Web Push)
  if (btnTogglePushNotifications) {
    btnTogglePushNotifications.addEventListener('click', async () => {
      window.soundManager.playTileClick();
      await setupWebPush();
    });
  }

  async function setupWebPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Tu navegador no admite Web Push. Puedes agregar el juego como aplicación a tu pantalla de inicio.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('⚠️ Permiso de notificaciones no concedido.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const resp = await fetch('/api/vapid-key');
      const { publicKey } = await resp.json();
      if (!publicKey) throw new Error('No se pudo obtener la clave VAPID');

      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myPlayerId, subscription })
      });

      const pushStatusText = document.getElementById('pushStatusText');
      const pushIcon = document.getElementById('pushIcon');
      if (pushStatusText) pushStatusText.textContent = 'Avisos de partidas activados';
      if (pushIcon) pushIcon.textContent = '✅';
      showToast('🔔 ¡Avisos activados! Te avisaremos cuando te inviten.');
    } catch (err) {
      console.error('Error configurando Web Push:', err);
      showToast('Error activando avisos: ' + (err.message || 'desconocido'));
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Sincronización recibida de amigos y solicitudes
  socket.on('sync_friends', (data) => {
    myFriends = data.friends || [];
    pendingRequests = data.pendingRequests || [];
    pendingInvitations = data.pendingInvitations || [];

    renderFriendsList(myFriends);
    renderRequestsList(pendingRequests);
    updateFriendsBadges();

    // Si hay invitaciones de partida pendientes
    if (pendingInvitations.length > 0) {
      showGameInviteModal(pendingInvitations[0]);
    }
  });

  socket.on('friends_updated', () => {
    syncSessionWithServer();
  });

  socket.on('remove_friend_result', (result) => {
    if (result && result.ok) {
      showToast('🗑️ Amigo eliminado correctamente.');
      syncSessionWithServer();
    } else {
      showToast('⚠️ No se pudo eliminar: ' + (result?.error || 'Error'));
    }
  });

  socket.on('friend_request_received', (data) => {
    showToast(`👥 ¡Nueva solicitud de amistad de ${data.from?.name || 'un jugador'}!`);
    window.soundManager.playPop();
    syncSessionWithServer();
  });

  socket.on('friend_request_result', (result) => {
    if (result.ok) {
      if (result.autoAccepted) {
        showToast('🤝 ¡Ahora son amigos mutuamente!');
      } else {
        showToast('📨 Solicitud de amistad enviada.');
      }
    } else {
      showToast('⚠️ ' + (result.error || 'No se pudo enviar la solicitud'));
    }
  });

  socket.on('respond_friend_request_result', (result) => {
    if (result.ok) {
      if (result.action === 'accepted') {
        showToast('✅ ¡Solicitud aceptada! Ahora son amigos.');
      } else {
        showToast('Solicitud rechazada.');
      }
    }
    syncSessionWithServer();
  });

  function updateFriendsBadges() {
    const count = pendingRequests.length;
    if (friendsPendingBadge) {
      if (count > 0) {
        friendsPendingBadge.textContent = count;
        friendsPendingBadge.classList.remove('hidden');
      } else {
        friendsPendingBadge.classList.add('hidden');
      }
    }
    if (requestsTabBadge) {
      if (count > 0) {
        requestsTabBadge.textContent = count;
        requestsTabBadge.classList.remove('hidden');
      } else {
        requestsTabBadge.classList.add('hidden');
      }
    }
    if (myFriendsCount) {
      myFriendsCount.textContent = myFriends.length;
    }
  }

  // Conjunto de amigos seleccionados para invitar en bloque (de 1 a 3 amigos)
  const selectedFriendIds = new Set();

  function updateInviteSelectedUI() {
    const count = selectedFriendIds.size;
    const countEl = document.getElementById('selectedFriendsCount');
    const hintEl = document.getElementById('selectedFriendsHint');
    const btnInvite = document.getElementById('btnInviteSelectedFriends');
    const btnText = document.getElementById('btnInviteSelectedText');

    if (countEl) countEl.textContent = count;
    if (hintEl) {
      if (count === 0) hintEl.textContent = 'Marca de 1 a 3 amigos';
      else if (count < 3) hintEl.textContent = `Puedes elegir ${3 - count} más`;
      else hintEl.textContent = '¡Máximo de 3 amigos alcanzado!';
    }

    if (btnInvite && btnText) {
      if (count > 0) {
        btnInvite.disabled = false;
        btnInvite.classList.remove('opacity-50', 'cursor-not-allowed');
        btnInvite.classList.add('!bg-emerald-600', 'hover:!bg-emerald-500', 'shadow-[0_0_15px_rgba(16,185,129,0.5)]');
        btnText.textContent = `Invitar a la Partida (${count} ${count === 1 ? 'amigo' : 'amigos'})`;
      } else {
        btnInvite.disabled = true;
        btnInvite.classList.add('opacity-50', 'cursor-not-allowed');
        btnInvite.classList.remove('!bg-emerald-600', 'hover:!bg-emerald-500', 'shadow-[0_0_15px_rgba(16,185,129,0.5)]');
        btnText.textContent = 'Invitar a la Partida (Selecciona 1 a 3 amigos)';
      }
    }
  }

  function renderFriendsList(friends) {
    if (!myFriendsList) return;
    myFriendsList.innerHTML = '';

    // Limpiar IDs de amigos seleccionados que ya no existan en la lista
    if (friends && friends.length > 0) {
      const validIds = new Set(friends.map(f => f.id));
      selectedFriendIds.forEach(id => {
        if (!validIds.has(id)) selectedFriendIds.delete(id);
      });
    } else {
      selectedFriendIds.clear();
    }

    updateInviteSelectedUI();

    if (!friends || friends.length === 0) {
      emptyFriendsNotice?.classList.remove('hidden');
      return;
    }
    emptyFriendsNotice?.classList.add('hidden');

    friends.forEach(f => {
      const isSelected = selectedFriendIds.has(f.id);
      const card = document.createElement('div');
      card.className = `friend-card ${isSelected ? 'selected' : ''} cursor-pointer`;
      const avSvg = window.AVATARS[f.avatar]?.svg || '👤';

      let statusHtml = '<span class="text-[9.5px] text-slate-400 flex items-center gap-1"><span class="friend-status-dot offline"></span> Desconectado</span>';
      if (f.activeRoomId) {
        statusHtml = `<span class="text-[9.5px] text-amber-300 font-bold flex items-center gap-1"><span class="friend-status-dot playing"></span> En mesa ${f.activeRoomId}</span>`;
      } else if (f.isOnline) {
        statusHtml = '<span class="text-[9.5px] text-emerald-400 font-bold flex items-center gap-1"><span class="friend-status-dot online"></span> En línea</span>';
      }

      card.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-10 h-10 rounded-full bg-slate-800 border border-emerald-500/40 overflow-hidden flex items-center justify-center shrink-0">
            ${avSvg}
          </div>
          <div class="min-w-0">
            <div class="text-xs font-black text-white truncate max-w-[130px] sm:max-w-[170px]">${f.name}</div>
            ${statusHtml}
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="btn-remove-friend !py-1 !px-2 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-300 hover:text-white rounded-lg text-[10.5px] font-bold transition-all active:scale-95 flex items-center gap-1 shadow-sm" title="Eliminar amigo" data-id="${f.id}" data-name="${f.name}">
            🗑️
          </button>
          <div class="friend-select-box ${isSelected ? 'checked' : ''}" data-id="${f.id}" title="${isSelected ? 'Deseleccionar' : 'Seleccionar para invitar'}">
            ${isSelected ? '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>' : ''}
          </div>
        </div>
      `;

      card.addEventListener('click', (e) => {
        // Evitar toggle si se hizo click en el botón de eliminar
        if (e.target.closest('.btn-remove-friend')) return;

        window.soundManager.playTileClick();
        if (selectedFriendIds.has(f.id)) {
          selectedFriendIds.delete(f.id);
        } else {
          if (selectedFriendIds.size >= 3) {
            showToast('⚠️ Solo puedes seleccionar de 1 a 3 amigos para invitar a la mesa.');
            return;
          }
          selectedFriendIds.add(f.id);
        }
        renderFriendsList(myFriends);
      });

      card.querySelector('.btn-remove-friend').addEventListener('click', (e) => {
        e.stopPropagation();
        const conf = confirm(`¿Estás seguro que deseas eliminar de amigos a ${f.name}?`);
        if (conf) {
          selectedFriendIds.delete(f.id);
          socket.emit('remove_friend', {
            playerId: myPlayerId,
            friendId: f.id
          });
        }
      });

      myFriendsList.appendChild(card);
    });
  }

  // Listener para el botón inferior de invitar amigos seleccionados
  const btnInviteSelected = document.getElementById('btnInviteSelectedFriends');
  if (btnInviteSelected) {
    btnInviteSelected.addEventListener('click', () => {
      if (selectedFriendIds.size === 0) {
        showToast('⚠️ Marca la casilla de al menos 1 amigo para invitar.');
        return;
      }
      if (selectedFriendIds.size > 3) {
        showToast('⚠️ Solo puedes seleccionar de 1 a 3 amigos.');
        return;
      }
      window.soundManager.playTileClick();

      // Número deseado de jugadores según los amigos invitados:
      // 1 amigo -> mesa de 2 jugadores
      // 2 amigos -> mesa de 3 jugadores
      // 3 amigos -> mesa de 4 jugadores
      const selectedCount = selectedFriendIds.size;
      const desiredPlayers = Math.min(4, Math.max(2, selectedCount + 1));

      let targetRoom = '';
      if (currentRoom && currentRoom.id && currentRoom.status === 'waiting') {
        // Ya estamos en una sala de espera, usamos esta misma sala
        targetRoom = currentRoom.id;
        socket.emit('set_player_count', { count: desiredPlayers });
      } else {
        // Crear una sala NUEVA limpia y exclusiva para jugar con los amigos
        const rand = Math.floor(Math.random() * 900) + 100;
        targetRoom = `MESA-${rand}`;
        const inputRoom = document.getElementById('inputRoomId');
        if (inputRoom) inputRoom.value = targetRoom;

        const nameInput = document.getElementById('inputPlayerName')?.value?.trim() || localStorage.getItem('domino_player_name') || 'Jugador';
        socket.emit('join_room', {
          roomId: targetRoom,
          playerName: nameInput,
          avatar: selectedAvatar,
          clientId: myClientId,
          playerId: myPlayerId,
          playerToken: myPlayerToken,
          forceReset: true, // ¡Garantiza mesa limpia donde tú eres el anfitrión!
          maxPlayers: desiredPlayers
        });
      }

      // Enviar invitaciones a los amigos seleccionados
      const selectedNames = [];
      selectedFriendIds.forEach(friendId => {
        const friendObj = myFriends.find(f => f.id === friendId);
        if (friendObj) selectedNames.push(friendObj.name);

        socket.emit('send_game_invite', {
          fromId: myPlayerId,
          toId: friendId,
          roomId: targetRoom
        });
      });

      // Cerrar la ventana de amigos
      if (friendsModal) {
        friendsModal.classList.add('hidden');
        friendsModal.style.display = 'none';
      }

      // Ocultar menú principal
      if (setupModal) {
        setupModal.classList.add('hidden');
        setupModal.style.display = 'none';
      }

      // Si ya estábamos en el lobby de esta sala, actualizar visualmente
      if (currentRoom && currentRoom.id === targetRoom && currentRoom.status === 'waiting') {
        if (lobbyModal) {
          lobbyModal.classList.remove('hidden');
          lobbyModal.style.display = 'flex';
        }
      }

      showToast(`🚀 Creando ${targetRoom} con ${desiredPlayers} jugadores e invitando a ${selectedNames.join(', ')}...`);
      selectedFriendIds.clear();
      renderFriendsList(myFriends);
    });
  }

  function renderRequestsList(requests) {
    if (!incomingRequestsList) return;
    incomingRequestsList.innerHTML = '';

    if (!requests || requests.length === 0) {
      emptyRequestsNotice?.classList.remove('hidden');
      return;
    }
    emptyRequestsNotice?.classList.add('hidden');

    requests.forEach(r => {
      const item = document.createElement('div');
      item.className = 'bg-slate-900 border border-emerald-500/40 rounded-xl p-2.5 flex items-center justify-between';
      const avSvg = window.AVATARS[r.fromAvatar]?.svg || '👤';

      item.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="w-9 h-9 rounded-full bg-slate-800 border border-amber-400/60 overflow-hidden flex items-center justify-center">
            ${avSvg}
          </div>
          <div>
            <div class="text-xs font-black text-white">${r.fromName}</div>
            <div class="text-[9.5px] text-slate-400">Quiere ser tu amigo</div>
          </div>
        </div>
        <div class="flex gap-1.5">
          <button type="button" class="btn-accept-req primary-btn !py-1 !px-2.5 !text-xs font-bold" data-id="${r.id}">
            ✅ Aceptar
          </button>
          <button type="button" class="btn-reject-req secondary-btn !py-1 !px-2 !text-xs font-bold !text-rose-300" data-id="${r.id}">
            ❌
          </button>
        </div>
      `;

      item.querySelector('.btn-accept-req').addEventListener('click', () => {
        socket.emit('respond_friend_request', {
          requestId: r.id,
          recipientId: myPlayerId,
          action: 'accept'
        });
      });

      item.querySelector('.btn-reject-req').addEventListener('click', () => {
        socket.emit('respond_friend_request', {
          requestId: r.id,
          recipientId: myPlayerId,
          action: 'reject'
        });
      });

      incomingRequestsList.appendChild(item);
    });
  }

  // Invitar a un amigo a jugar
  function inviteFriendToPlay(friendId, friendName) {
    let targetRoom = 'MESA-1';
    if (currentRoom && currentRoom.id) {
      targetRoom = currentRoom.id;
    } else {
      const rand = Math.floor(Math.random() * 90) + 10;
      targetRoom = `MESA-${rand}`;
      const inputRoom = document.getElementById('inputRoomId');
      if (inputRoom) inputRoom.value = targetRoom;

      const nameInput = document.getElementById('inputPlayerName')?.value?.trim() || 'Jugador';
      socket.emit('join_room', {
        roomId: targetRoom,
        playerName: nameInput,
        avatar: selectedAvatar,
        clientId: myClientId,
        playerId: myPlayerId,
        playerToken: myPlayerToken,
        forceReset: false
      });
    }

    socket.emit('send_game_invite', {
      fromId: myPlayerId,
      toId: friendId,
      roomId: targetRoom
    });

    showToast(`🚀 Invitando a ${friendName} a la mesa ${targetRoom}...`);
  }

  socket.on('game_invite_result', (res) => {
    if (res.ok) {
      showToast(res.alreadySent ? 'Invitación ya enviada recientemente.' : '🎮 Invitación enviada con éxito.');
    } else {
      showToast('⚠️ ' + (res.error || 'No se pudo enviar la invitación'));
    }
  });

  socket.on('game_invitation_received', (data) => {
    showGameInviteModal(data);
  });

  socket.on('game_invite_response', (data) => {
    if (data.action === 'accept') {
      showToast(`🎉 ¡${data.playerName} aceptó tu invitación y se está uniendo!`);
    } else {
      showToast(`ℹ️ ${data.playerName} no pudo aceptar en este momento.`);
    }
  });

  // Modal de Invitación a Jugar
  const gameInviteModal = document.getElementById('gameInviteModal');
  const gameInviteSenderName = document.getElementById('gameInviteSenderName');
  const gameInviteSenderAvatar = document.getElementById('gameInviteSenderAvatar');
  const gameInviteSenderTitle = document.getElementById('gameInviteSenderTitle');
  const gameInviteRoomCode = document.getElementById('gameInviteRoomCode');
  const btnAcceptGameInvite = document.getElementById('btnAcceptGameInvite');
  const btnRejectGameInvite = document.getElementById('btnRejectGameInvite');
  let currentActiveInvite = null;

  function showGameInviteModal(invData) {
    if (!gameInviteModal) return;
    currentActiveInvite = invData;

    if (gameInviteSenderName) gameInviteSenderName.textContent = invData.fromName || 'Un amigo';
    if (gameInviteSenderTitle) gameInviteSenderTitle.textContent = invData.fromName || 'Amigo';
    if (gameInviteRoomCode) gameInviteRoomCode.textContent = invData.roomId || 'MESA-1';

    if (gameInviteSenderAvatar) {
      gameInviteSenderAvatar.innerHTML = window.AVATARS[invData.fromAvatar]?.svg || '👤';
    }

    window.soundManager.playPop();
    gameInviteModal.classList.remove('hidden');
    gameInviteModal.style.display = 'flex';
  }

  if (btnAcceptGameInvite) {
    btnAcceptGameInvite.addEventListener('click', () => {
      window.soundManager.playTileClick();
      if (!currentActiveInvite) return;
      const targetRoom = currentActiveInvite.roomId;
      const inviteId = currentActiveInvite.invitation?.id || currentActiveInvite.id;

      socket.emit('respond_game_invite', {
        inviteId: inviteId,
        playerId: myPlayerId,
        action: 'accept'
      });

      gameInviteModal.classList.add('hidden');
      gameInviteModal.style.display = 'none';

      const nameInput = document.getElementById('inputPlayerName')?.value?.trim() || 'Jugador';
      socket.emit('join_room', {
        roomId: targetRoom,
        playerName: nameInput,
        avatar: selectedAvatar,
        clientId: myClientId,
        playerId: myPlayerId,
        playerToken: myPlayerToken,
        forceReset: false
      });
    });
  }

  if (btnRejectGameInvite) {
    btnRejectGameInvite.addEventListener('click', () => {
      window.soundManager.playTileClick();
      if (currentActiveInvite) {
        const inviteId = currentActiveInvite.invitation?.id || currentActiveInvite.id;
        socket.emit('respond_game_invite', {
          inviteId: inviteId,
          playerId: myPlayerId,
          action: 'reject'
        });
      }
      gameInviteModal.classList.add('hidden');
      gameInviteModal.style.display = 'none';
    });
  }

  // Tarjeta de Visitante que abrió enlace de amistad (/?friend=...)
  const friendInviteCardModal = document.getElementById('friendInviteCardModal');
  const targetFriendName = document.getElementById('targetFriendName');
  const targetFriendDisplayName = document.getElementById('targetFriendDisplayName');
  const targetFriendAvatarWrapper = document.getElementById('targetFriendAvatarWrapper');
  const inputVisitorName = document.getElementById('inputVisitorName');
  const btnSendFriendRequestFromCard = document.getElementById('btnSendFriendRequestFromCard');
  const btnDismissFriendCard = document.getElementById('btnDismissFriendCard');

  const friendParam = urlParams.get('friend');
  if (friendParam && friendParam !== myPlayerId) {
    fetch(`/api/user/${friendParam}`).then(r => r.json()).then(targetUser => {
      if (targetUser && targetUser.id) {
        if (targetFriendName) targetFriendName.textContent = targetUser.name;
        if (targetFriendDisplayName) targetFriendDisplayName.textContent = targetUser.name;
        if (targetFriendAvatarWrapper) {
          targetFriendAvatarWrapper.innerHTML = window.AVATARS[targetUser.avatar]?.svg || '👤';
        }
        if (inputVisitorName) {
          inputVisitorName.value = localStorage.getItem('domino_player_name') || '';
        }
        if (friendInviteCardModal) {
          friendInviteCardModal.classList.remove('hidden');
          friendInviteCardModal.style.display = 'flex';
        }
      }
    }).catch(e => console.warn('Error cargando amigo de URL:', e));
  }

  if (btnSendFriendRequestFromCard) {
    btnSendFriendRequestFromCard.addEventListener('click', () => {
      const vName = inputVisitorName?.value?.trim() || 'Jugador';
      localStorage.setItem('domino_player_name', vName);
      if (document.getElementById('inputPlayerName')) {
        document.getElementById('inputPlayerName').value = vName;
      }

      socket.emit('auth_profile', {
        playerId: myPlayerId,
        playerToken: myPlayerToken,
        playerName: vName,
        avatar: selectedAvatar
      });

      socket.emit('send_friend_request', {
        fromId: myPlayerId,
        toId: friendParam
      });

      if (friendInviteCardModal) {
        friendInviteCardModal.classList.add('hidden');
        friendInviteCardModal.style.display = 'none';
      }
      showToast('🤝 ¡Solicitud de amistad enviada!');
      history.replaceState(null, '', window.location.pathname);
    });
  }

  if (btnDismissFriendCard) {
    btnDismissFriendCard.addEventListener('click', () => {
      if (friendInviteCardModal) {
        friendInviteCardModal.classList.add('hidden');
        friendInviteCardModal.style.display = 'none';
      }
      history.replaceState(null, '', window.location.pathname);
    });
  }

  // Manejo de Desconexión de Compañero con Periodo de Gracia
  const partnerDisconnectBanner = document.getElementById('partnerDisconnectBanner');
  const partnerGraceTimerText = document.getElementById('partnerGraceTimerText');
  const graceExpiredModal = document.getElementById('graceExpiredModal');
  const graceExpiredPlayerName = document.getElementById('graceExpiredPlayerName');
  const btnLeaveTableAfterGrace = document.getElementById('btnLeaveTableAfterGrace');
  const btnDismissGraceModal = document.getElementById('btnDismissGraceModal');

  socket.on('player_disconnected', (data) => {
    if (data.seat !== mySeat && partnerDisconnectBanner) {
      partnerDisconnectBanner.classList.remove('hidden');
      let remaining = data.graceSeconds || 60;
      if (partnerGraceTimerText) partnerGraceTimerText.textContent = remaining;

      if (activePartnerGraceInterval) clearInterval(activePartnerGraceInterval);
      activePartnerGraceInterval = setInterval(() => {
        remaining -= 1;
        if (partnerGraceTimerText) partnerGraceTimerText.textContent = Math.max(0, remaining);
        if (remaining <= 0) {
          clearInterval(activePartnerGraceInterval);
        }
      }, 1000);
    }
  });

  socket.on('player_reconnected', (data) => {
    if (partnerDisconnectBanner) {
      partnerDisconnectBanner.classList.add('hidden');
    }
    if (graceExpiredModal) {
      graceExpiredModal.classList.add('hidden');
      graceExpiredModal.style.display = 'none';
    }
    if (activePartnerGraceInterval) {
      clearInterval(activePartnerGraceInterval);
      activePartnerGraceInterval = null;
    }
    showToast(`🎮 ${data.playerName} se ha reconectado a la mesa.`);
  });

  socket.on('reconnect_grace_expired', (data) => {
    if (partnerDisconnectBanner) {
      partnerDisconnectBanner.classList.add('hidden');
    }
    if (activePartnerGraceInterval) {
      clearInterval(activePartnerGraceInterval);
      activePartnerGraceInterval = null;
    }
    if (graceExpiredPlayerName) graceExpiredPlayerName.textContent = data.playerName || 'Rival';
    if (graceExpiredModal) {
      graceExpiredModal.classList.remove('hidden');
      graceExpiredModal.style.display = 'flex';
    }
  });

  if (btnLeaveTableAfterGrace) {
    btnLeaveTableAfterGrace.addEventListener('click', () => {
      if (graceExpiredModal) {
        graceExpiredModal.classList.add('hidden');
        graceExpiredModal.style.display = 'none';
      }
      clearActiveSession();
      window.location.reload();
    });
  }

  if (btnDismissGraceModal) {
    btnDismissGraceModal.addEventListener('click', () => {
      if (graceExpiredModal) {
        graceExpiredModal.classList.add('hidden');
        graceExpiredModal.style.display = 'none';
      }
    });
  }

  // Desbloqueo de audio y arranque de música de fondo en la primera interacción
  document.addEventListener('click', () => {
    window.soundManager.init();
    if (currentRoom && currentRoom.status === 'playing') {
      window.soundManager.startBgm();
    }
  });

  // Auto-cierre suave de la pantalla Splash de Bienvenida (Conejo Matrix)
  setTimeout(() => {
    const splash = document.getElementById('appSplashScreen');
    if (splash && !splash.classList.contains('splash-hidden')) {
      splash.classList.add('splash-hidden');
    }
  }, 2000);

})();
