// Renderizador de Fichas Clásicas de Dominó con Serpenteo Natural 2D Realista
class DominoRenderer {
  constructor() {
    this.U = 29; // Unidad base de cuadrícula (mitad de ficha = 29x29 px)
    this.dotPatterns = {
      0: [],
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8]
    };
  }

  // Genera el HTML de una mitad de ficha (3x3 grid de puntos negros)
  renderHalf(value, isVertical = false) {
    const dots = this.dotPatterns[value] || [];
    let dotsHtml = '';

    for (let pos = 0; pos < 9; pos++) {
      if (dots.includes(pos)) {
        dotsHtml += `<div class="domino-pip"></div>`;
      } else {
        dotsHtml += `<div class="domino-pip-empty"></div>`;
      }
    }

    return `<div class="domino-half ${isVertical ? 'half-v' : 'half-h'}">${dotsHtml}</div>`;
  }

  // Renderiza una ficha completa (Vertical u Horizontal)
  renderTile(leftVal, rightVal, options = {}) {
    const {
      isVertical = false,
      isDouble = leftVal === rightVal,
      isPlayable = false,
      extraClasses = '',
      id = `${leftVal}-${rightVal}`,
      widthPx = null,
      heightPx = null
    } = options;

    const playableClass = isPlayable ? 'playable-tile' : '';
    const orientationClass = isVertical ? 'domino-vertical' : 'domino-horizontal';
    const inlineStyle = (widthPx && heightPx) ? `style="width:${widthPx}px; height:${heightPx}px;"` : '';

    return `
      <div class="domino-tile ${orientationClass} ${playableClass} ${extraClasses}"
           ${inlineStyle}
           data-id="${id}"
           data-left="${leftVal}"
           data-right="${rightVal}">
        <div class="domino-face">
          ${this.renderHalf(leftVal, isVertical)}
          <div class="domino-divider">
            <div class="domino-spinner"></div>
          </div>
          ${this.renderHalf(rightVal, isVertical)}
        </div>
      </div>
    `;
  }

  // Algoritmo de Serpenteo 2D Natural (como en las mesas de dominó reales)
  // Las fichas se conectan extremo con extremo, doblan en esquinas a 90° y las dobles van perpendiculares
  computeSnakeLayout(board) {
    if (!board || board.length === 0) return { tiles: [], width: 0, height: 0 };
    const U = this.U;

    const rootIdx = board.findIndex(t => t.side === 'root');
    const safeRoot = rootIdx !== -1 ? rootIdx : Math.floor(board.length / 2);

    const placed = new Array(board.length);

    // Ficha inicial (Root)
    const root = board[safeRoot];
    const rootIsDouble = root.left === root.right;
    const rw = rootIsDouble ? U : 2 * U;
    const rh = rootIsDouble ? 2 * U : U;

    placed[safeRoot] = {
      x: 0,
      y: 0,
      w: rw,
      h: rh,
      isVertical: rootIsDouble,
      tile: root,
      isHead: safeRoot === 0,
      isTail: safeRoot === board.length - 1
    };

    // --- RAMA DERECHA (safeRoot + 1 hacia el final) ---
    // Crece hacia la derecha, y al alcanzar el límite dobla hacia ABAJO y luego hacia la IZQUIERDA
    let rConnX = rw;
    let rConnY = rh / 2;
    let rDir = 'RIGHT';
    let rCount = 0;

    for (let i = safeRoot + 1; i < board.length; i++) {
      const t = board[i];
      const isDouble = t.left === t.right;
      const isTail = (i === board.length - 1);
      rCount++;

      if (rDir === 'RIGHT') {
        if (rCount >= 4 && !isDouble) {
          // Doble hacia ABAJO (esquina)
          const w = U; const h = 2 * U;
          const x = rConnX - U;
          const y = rConnY + U / 2;
          placed[i] = { x, y, w, h, isVertical: true, tile: t, isTail, chipPos: 'bottom' };
          rConnX = x;
          rConnY = y + h;
          rDir = 'LEFT';
          rCount = 0;
        } else {
          const w = isDouble ? U : 2 * U;
          const h = isDouble ? 2 * U : U;
          const x = rConnX;
          const y = rConnY - h / 2;
          placed[i] = { x, y, w, h, isVertical: isDouble, tile: t, isTail, chipPos: 'right' };
          rConnX = x + w;
        }
      } else if (rDir === 'LEFT') {
        if (rCount >= 4 && !isDouble) {
          // Doble hacia ABAJO (esquina)
          const w = U; const h = 2 * U;
          const x = rConnX;
          const y = rConnY + U / 2;
          placed[i] = { x, y, w, h, isVertical: true, tile: t, isTail, chipPos: 'bottom' };
          rConnX = x + w;
          rConnY = y + h;
          rDir = 'RIGHT';
          rCount = 0;
        } else {
          const w = isDouble ? U : 2 * U;
          const h = isDouble ? 2 * U : U;
          const x = rConnX - w;
          const y = rConnY - h / 2;
          placed[i] = { x, y, w, h, isVertical: isDouble, tile: t, isTail, chipPos: 'left' };
          rConnX = x;
        }
      }
    }

    // --- RAMA IZQUIERDA (safeRoot - 1 hacia el principio) ---
    // Crece hacia la izquierda, y al alcanzar el límite dobla hacia ARRIBA y luego hacia la DERECHA
    let lConnX = 0;
    let lConnY = rh / 2;
    let lDir = 'LEFT';
    let lCount = 0;

    for (let i = safeRoot - 1; i >= 0; i--) {
      const t = board[i];
      const isDouble = t.left === t.right;
      const isHead = (i === 0);
      lCount++;

      if (lDir === 'LEFT') {
        if (lCount >= 4 && !isDouble) {
          // Dobla hacia ARRIBA (esquina)
          const w = U; const h = 2 * U;
          const x = lConnX;
          const y = lConnY - U / 2 - h;
          placed[i] = { x, y, w, h, isVertical: true, tile: t, isHead, chipPos: 'top' };
          lConnX = x + w;
          lConnY = y;
          lDir = 'RIGHT';
          lCount = 0;
        } else {
          const w = isDouble ? U : 2 * U;
          const h = isDouble ? 2 * U : U;
          const x = lConnX - w;
          const y = lConnY - h / 2;
          placed[i] = { x, y, w, h, isVertical: isDouble, tile: t, isHead, chipPos: 'left' };
          lConnX = x;
        }
      } else if (lDir === 'RIGHT') {
        if (lCount >= 4 && !isDouble) {
          // Dobla hacia ARRIBA (esquina)
          const w = U; const h = 2 * U;
          const x = lConnX - U;
          const y = lConnY - U / 2 - h;
          placed[i] = { x, y, w, h, isVertical: true, tile: t, isHead, chipPos: 'top' };
          lConnX = x;
          lConnY = y;
          lDir = 'LEFT';
          lCount = 0;
        } else {
          const w = isDouble ? U : 2 * U;
          const h = isDouble ? 2 * U : U;
          const x = lConnX;
          const y = lConnY - h / 2;
          placed[i] = { x, y, w, h, isVertical: isDouble, tile: t, isHead, chipPos: 'right' };
          lConnX = x + w;
        }
      }
    }

    // Normalizar coordenadas para centrar exactamente
    const minX = Math.min(...placed.map(p => p.x));
    const maxX = Math.max(...placed.map(p => p.x + p.w));
    const minY = Math.min(...placed.map(p => p.y));
    const maxY = Math.max(...placed.map(p => p.y + p.h));

    placed.forEach(p => {
      p.x -= minX;
      p.y -= minY;
    });

    const totalW = maxX - minX;
    const totalH = maxY - minY;

    return { placed, totalW, totalH };
  }

  // Auto-ajusta la escala para que la serpiente de fichas se vea completa sin cortarse
  autoFitBoard(containerEl) {
    if (!containerEl) return;
    const canvas = containerEl.querySelector('.board-snake-canvas');
    if (!canvas) return;

    canvas.style.transform = 'none';

    const pad = 24;
    const containerW = containerEl.clientWidth - pad;
    const containerH = containerEl.clientHeight - pad;
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;

    if (canvasW > 0 && canvasH > 0 && containerW > 0 && containerH > 0) {
      const scaleX = containerW / canvasW;
      const scaleY = containerH / canvasH;
      const fitScale = Math.min(1.15, Math.min(scaleX, scaleY));
      canvas.style.transform = `scale(${fitScale})`;
      canvas.style.transformOrigin = 'center center';
    }
  }

  // Renderiza el tablero con la cadena continua natural
  renderBoard(boardTiles, leftEnd, rightEnd, containerEl) {
    if (!containerEl) return;

    if (boardTiles.length === 0) {
      containerEl.innerHTML = `
        <div class="empty-board-msg flex flex-col items-center justify-center p-6 text-emerald-100/70">
          <div class="w-12 h-12 mb-3 rounded-full bg-emerald-800/40 border border-emerald-500/30 flex items-center justify-center text-xl">
            🀫
          </div>
          <p class="font-semibold text-sm">Mesa vacía</p>
          <p class="text-xs text-emerald-200/50 mt-1 text-center">Esperando el tiro de apertura...</p>
        </div>
      `;
      return;
    }

    const { placed, totalW, totalH } = this.computeSnakeLayout(boardTiles);

    let tilesHtml = '';

    placed.forEach((item, index) => {
      const tile = item.tile;
      const isHead = item.isHead;
      const isTail = item.isTail;

      // Generar ficha con posicionamiento exacto
      const tileMarkup = this.renderTile(tile.left, tile.right, {
        isVertical: item.isVertical,
        isDouble: tile.left === tile.right,
        widthPx: item.w,
        heightPx: item.h,
        id: `board-${index}-${tile.id}`
      });

      // Indicadores en los extremos de la cadena
      let chipMarkup = '';
      if (isHead) {
        chipMarkup = `<span class="end-chip chip-left">◀ ${leftEnd}</span>`;
      }
      if (isTail) {
        chipMarkup = `<span class="end-chip chip-right">${rightEnd} ▶</span>`;
      }

      tilesHtml += `
        <div class="board-snake-tile ${isHead ? 'board-head' : ''} ${isTail ? 'board-tail' : ''}"
             style="left:${item.x}px; top:${item.y}px; width:${item.w}px; height:${item.h}px;">
          ${chipMarkup}
          ${tileMarkup}
        </div>
      `;
    });

    containerEl.innerHTML = `
      <div class="board-snake-canvas" style="width:${totalW}px; height:${totalH}px;">
        ${tilesHtml}
      </div>
    `;

    this.autoFitBoard(containerEl);
    requestAnimationFrame(() => this.autoFitBoard(containerEl));
    setTimeout(() => this.autoFitBoard(containerEl), 30);
  }
}

window.dominoRenderer = new DominoRenderer();

window.addEventListener('resize', () => {
  const container = document.getElementById('boardContainer');
  if (container && window.dominoRenderer) {
    window.dominoRenderer.autoFitBoard(container);
  }
});
