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

  // Algoritmo de Serpenteo Continuo Real de Dominó:
  // Garantiza matemáticamente que el extremo saliente de la ficha 'i' toca exactamente
  // el extremo entrante coincidente de la ficha 'i+1' (ej. 3 con 3, 6 con 6).
  computeSnakeLayout(board) {
    if (!board || board.length === 0) return { placed: [], totalW: 0, totalH: 0 };
    const U = this.U;
    const placed = [];

    let dir = 'RIGHT';
    let curX = 0;
    let curY = 0;
    let tilesInRow = 0;
    const maxTilesPerRow = 4; // 4 fichas por fila antes de doblar en ángulo recto

    for (let i = 0; i < board.length; i++) {
      const t = board[i];
      const isDouble = t.left === t.right;
      tilesInRow++;

      if (dir === 'RIGHT') {
        if (tilesInRow > maxTilesPerRow && !isDouble && i < board.length - 1) {
          // Doblar hacia ABAJO (esquina natural): Half A arriba, Half B abajo
          const x = curX - U;
          const y = curY + U;
          placed.push({
            index: i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U,
            h: 2 * U,
            isHead: i === 0,
            isTail: i === board.length - 1
          });
          curX = x;
          curY = y + U;
          dir = 'LEFT';
          tilesInRow = 0;
        } else if (isDouble) {
          // Doble colocado de forma transversal (perpendicular)
          const x = curX;
          const y = curY - U / 2;
          placed.push({
            index: i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U,
            h: 2 * U,
            isHead: i === 0,
            isTail: i === board.length - 1
          });
          curX = x + U;
        } else {
          // Ficha horizontal normal hacia la derecha: t.left a la izq, t.right a la der
          const x = curX;
          const y = curY;
          placed.push({
            index: i,
            tile: t,
            isVertical: false,
            reverseHalves: false,
            x, y,
            w: 2 * U,
            h: U,
            isHead: i === 0,
            isTail: i === board.length - 1
          });
          curX = x + 2 * U;
        }
      } else if (dir === 'LEFT') {
        if (tilesInRow > maxTilesPerRow && !isDouble && i < board.length - 1) {
          // Doblar hacia ABAJO (esquina natural): Half A arriba, Half B abajo
          const x = curX;
          const y = curY + U;
          placed.push({
            index: i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U,
            h: 2 * U,
            isHead: i === 0,
            isTail: i === board.length - 1
          });
          curX = x + U;
          curY = y + U;
          dir = 'RIGHT';
          tilesInRow = 0;
        } else if (isDouble) {
          const x = curX - U;
          const y = curY - U / 2;
          placed.push({
            index: i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x, y,
            w: U,
            h: 2 * U,
            isHead: i === 0,
            isTail: i === board.length - 1
          });
          curX = x;
        } else {
          // Ficha horizontal hacia la izquierda: t.left a la der (conectando al previo), t.right a la izq (nuevo extremo)
          const x = curX - 2 * U;
          const y = curY;
          placed.push({
            index: i,
            tile: t,
            isVertical: false,
            reverseHalves: true,
            x, y,
            w: 2 * U,
            h: U,
            isHead: i === 0,
            isTail: i === board.length - 1
          });
          curX = x;
        }
      }
    }

    // Normalizar coordenadas para que minX=0, minY=0
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

  // Auto-ajusta la escala para que toda la mesa quepa al 100% en la pantalla
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
      const fitScale = Math.min(1.1, Math.min(scaleX, scaleY));
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
