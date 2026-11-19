// Renderizador de Fichas Clásicas de Dominó con Serpenteo Continuo y Lógica Real de Conexión
class DominoRenderer {
  constructor() {
    this.U = 30; // Tamaño unitario de mitad de ficha (30x30 px)
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
      heightPx = null,
      reverseHalves = false
    } = options;

    // Si reverseHalves es true (por avanzar hacia la izquierda), invertimos visualmente las mitades
    // para que el número conectado coincida exactamente cara a cara
    const val1 = reverseHalves ? rightVal : leftVal;
    const val2 = reverseHalves ? leftVal : rightVal;

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
          ${this.renderHalf(val1, isVertical)}
          <div class="domino-divider">
            <div class="domino-spinner"></div>
          </div>
          ${this.renderHalf(val2, isVertical)}
        </div>
      </div>
    `;
  }

  // Algoritmo de Acomodo Real de Dominó idéntico a las mesas tradicionales:
  // - La ficha inicial (doble o ficha de apertura) se sitúa en el centro de la mesa.
  // - La rama derecha avanza hacia la derecha y se dobla hacia abajo.
  // - La rama izquierda avanza hacia la izquierda y se dobla hacia arriba.
  // - Los dobles se colocan cruzados (perpendiculares a la línea de avance).
  // - Cada ficha conecta cara con cara con su número idéntico (ej: 6 con 6, 3 con 3).
  // - Cero colisiones ni encimamientos entre filas.
  computeSnakeLayout(board) {
    if (!board || board.length === 0) return { placed: [], totalW: 0, totalH: 0 };
    const U = this.U; // 30 px por mitad de ficha

    const rootIndex = board.findIndex(t => t.side === 'root') !== -1 
      ? board.findIndex(t => t.side === 'root') 
      : 0;

    const rootTile = board[rootIndex];
    const leftBranch = board.slice(0, rootIndex).reverse();
    const rightBranch = board.slice(rootIndex + 1);

    const placed = [];

    // 1. Ficha Central / Inicial (Root)
    let leftAttachX = 0, leftAttachY = 0;
    let rightAttachX = 0, rightAttachY = 0;

    if (rootTile.isDouble) {
      // Doble colocado transversalmente (vertical en el centro)
      placed.push({
        index: rootIndex,
        tile: rootTile,
        isVertical: true,
        reverseHalves: false,
        x: 0, y: 0,
        w: U, h: 2 * U,
        isHead: rootIndex === 0 && leftBranch.length === 0,
        isTail: rootIndex === board.length - 1 && rightBranch.length === 0,
        dir: 'CENTER'
      });
      leftAttachX = 0; leftAttachY = U / 2;
      rightAttachX = U; rightAttachY = U / 2;
    } else {
      // Ficha horizontal normal en el centro
      placed.push({
        index: rootIndex,
        tile: rootTile,
        isVertical: false,
        reverseHalves: false,
        x: 0, y: 0,
        w: 2 * U, h: U,
        isHead: rootIndex === 0 && leftBranch.length === 0,
        isTail: rootIndex === board.length - 1 && rightBranch.length === 0,
        dir: 'CENTER'
      });
      leftAttachX = 0; leftAttachY = 0;
      rightAttachX = 2 * U; rightAttachY = 0;
    }

    // 2. Rama DERECHA (avanza hacia la derecha, luego abajo, luego izquierda)
    let curX = rightAttachX;
    let curY = rightAttachY;
    let dir = 'RIGHT';
    let tilesInRun = 0;
    const maxRightRun = 3;

    for (let i = 0; i < rightBranch.length; i++) {
      const t = rightBranch[i];
      const isLast = (i === rightBranch.length - 1);
      tilesInRun++;

      if (dir === 'RIGHT') {
        if (tilesInRun > maxRightRun && !t.isDouble && !isLast) {
          // Doblar hacia ABAJO: ficha vertical tocando la cara derecha de la previa
          const x = curX - U;
          const y = curY + U;
          placed.push({
            index: rootIndex + 1 + i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: false,
            isTail: isLast,
            dir: 'DOWN'
          });
          curX = x;
          curY = y + 2 * U;
          dir = 'LEFT';
          tilesInRun = 0;
        } else if (t.isDouble) {
          // Doble vertical perpendicular
          const x = curX;
          const y = curY - U / 2;
          placed.push({
            index: rootIndex + 1 + i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: false,
            isTail: isLast,
            dir: 'RIGHT'
          });
          curX = x + U;
        } else {
          // Horizontal normal hacia la derecha
          const x = curX;
          const y = curY;
          placed.push({
            index: rootIndex + 1 + i,
            tile: t,
            isVertical: false,
            reverseHalves: false,
            x, y,
            w: 2 * U, h: U,
            isHead: false,
            isTail: isLast,
            dir: 'RIGHT'
          });
          curX = x + 2 * U;
        }
      } else if (dir === 'LEFT') {
        if (tilesInRun > maxRightRun + 2 && !t.isDouble && !isLast) {
          // Doblar hacia ABAJO nuevamente
          const x = curX;
          const y = curY + U;
          placed.push({
            index: rootIndex + 1 + i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: false,
            isTail: isLast,
            dir: 'DOWN'
          });
          curX = x + U;
          curY = y + 2 * U;
          dir = 'RIGHT';
          tilesInRun = 0;
        } else if (t.isDouble) {
          const x = curX - U;
          const y = curY - U / 2;
          placed.push({
            index: rootIndex + 1 + i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: false,
            isTail: isLast,
            dir: 'LEFT'
          });
          curX = x;
        } else {
          const x = curX - 2 * U;
          const y = curY;
          placed.push({
            index: rootIndex + 1 + i,
            tile: t,
            isVertical: false,
            reverseHalves: true,
            x, y,
            w: 2 * U, h: U,
            isHead: false,
            isTail: isLast,
            dir: 'LEFT'
          });
          curX = x;
        }
      }
    }

    // 3. Rama IZQUIERDA (avanza hacia la izquierda, luego arriba, luego derecha)
    curX = leftAttachX;
    curY = leftAttachY;
    dir = 'LEFT';
    tilesInRun = 0;
    const maxLeftRun = 3;

    for (let i = 0; i < leftBranch.length; i++) {
      const t = leftBranch[i];
      const origIndex = rootIndex - 1 - i;
      const isLast = (i === leftBranch.length - 1);
      tilesInRun++;

      if (dir === 'LEFT') {
        if (tilesInRun > maxLeftRun && !t.isDouble && !isLast) {
          // Doblar hacia ARRIBA: ficha vertical sobre la última mitad
          const x = curX;
          const y = curY - 2 * U;
          placed.push({
            index: origIndex,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: isLast,
            isTail: false,
            dir: 'UP'
          });
          curX = x + U;
          curY = y;
          dir = 'RIGHT';
          tilesInRun = 0;
        } else if (t.isDouble) {
          const x = curX - U;
          const y = curY - U / 2;
          placed.push({
            index: origIndex,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: isLast,
            isTail: false,
            dir: 'LEFT'
          });
          curX = x;
        } else {
          // Horizontal hacia la izquierda: t.left a la izq (nuevo extremo), t.right a la der (conecta al previo)
          const x = curX - 2 * U;
          const y = curY;
          placed.push({
            index: origIndex,
            tile: t,
            isVertical: false,
            reverseHalves: false,
            x, y,
            w: 2 * U, h: U,
            isHead: isLast,
            isTail: false,
            dir: 'LEFT'
          });
          curX = x;
        }
      } else if (dir === 'RIGHT') {
        if (tilesInRun > maxLeftRun + 2 && !t.isDouble && !isLast) {
          // Doblar hacia ARRIBA nuevamente
          const x = curX - U;
          const y = curY - 2 * U;
          placed.push({
            index: origIndex,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: isLast,
            isTail: false,
            dir: 'UP'
          });
          curX = x;
          curY = y;
          dir = 'LEFT';
          tilesInRun = 0;
        } else if (t.isDouble) {
          const x = curX;
          const y = curY - U / 2;
          placed.push({
            index: origIndex,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U, h: 2 * U,
            isHead: isLast,
            isTail: false,
            dir: 'RIGHT'
          });
          curX = x + U;
        } else {
          // Horizontal hacia la derecha (nivel superior de la rama izquierda)
          const x = curX;
          const y = curY;
          placed.push({
            index: origIndex,
            tile: t,
            isVertical: false,
            reverseHalves: true,
            x, y,
            w: 2 * U, h: U,
            isHead: isLast,
            isTail: false,
            dir: 'RIGHT'
          });
          curX = x + 2 * U;
        }
      }
    }

    // Margen de seguridad para que ningún chip o sombra quede fuera del borde
    const pad = 16;
    const minX = Math.min(...placed.map(p => p.x));
    const maxX = Math.max(...placed.map(p => p.x + p.w));
    const minY = Math.min(...placed.map(p => p.y));
    const maxY = Math.max(...placed.map(p => p.y + p.h));

    placed.forEach(p => {
      p.x = p.x - minX + pad;
      p.y = p.y - minY + pad;
    });

    const totalW = (maxX - minX) + (pad * 2);
    const totalH = (maxY - minY) + (pad * 2);

    return { placed, totalW, totalH };
  }

  // Auto-ajusta la escala para que toda la mesa quepa al 100% en la pantalla sin desbordar
  autoFitBoard(containerEl) {
    if (!containerEl) return;
    const canvas = containerEl.querySelector('.board-snake-canvas');
    if (!canvas) return;

    canvas.style.transform = 'none';

    const pad = 16;
    const containerW = containerEl.clientWidth - pad;
    const containerH = containerEl.clientHeight - pad;
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;

    if (canvasW > 0 && canvasH > 0 && containerW > 0 && containerH > 0) {
      const scaleX = containerW / canvasW;
      const scaleY = containerH / canvasH;
      // Escala dinámica (ej: 0.9, 0.7, 0.5) para que todo el dominó quepa visible
      const fitScale = Math.min(1.0, Math.min(scaleX, scaleY));
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

      const tileMarkup = this.renderTile(tile.left, tile.right, {
        isVertical: item.isVertical,
        isDouble: tile.left === tile.right,
        reverseHalves: item.reverseHalves,
        widthPx: item.w,
        heightPx: item.h,
        id: `board-${index}-${tile.id}`
      });

      // Indicadores en los extremos de la cadena
      let chipMarkup = '';
      if (isHead) {
        if (item.dir === 'UP') {
          chipMarkup = `<span class="end-chip chip-top">◀ ${leftEnd}</span>`;
        } else if (item.dir === 'RIGHT') {
          chipMarkup = `<span class="end-chip chip-right">◀ ${leftEnd}</span>`;
        } else {
          chipMarkup = `<span class="end-chip chip-left">◀ ${leftEnd}</span>`;
        }
      }
      if (isTail) {
        if (item.dir === 'DOWN') {
          chipMarkup = `<span class="end-chip chip-bottom">${rightEnd} ▶</span>`;
        } else if (item.dir === 'LEFT') {
          chipMarkup = `<span class="end-chip chip-left">${rightEnd} ▶</span>`;
        } else {
          chipMarkup = `<span class="end-chip chip-right">${rightEnd} ▶</span>`;
        }
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
    setTimeout(() => this.autoFitBoard(containerEl), 150);

    if (!this._resizeObserver && window.ResizeObserver && containerEl) {
      this._resizeObserver = new ResizeObserver(() => {
        this.autoFitBoard(containerEl);
      });
      this._resizeObserver.observe(containerEl);
    }
  }
}

window.dominoRenderer = new DominoRenderer();

window.addEventListener('resize', () => {
  const container = document.getElementById('boardContainer');
  if (container && window.dominoRenderer) {
    window.dominoRenderer.autoFitBoard(container);
  }
});
