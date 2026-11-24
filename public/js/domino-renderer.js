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

  // Algoritmo de Acomodo Serpentino Compacto en S (Zigzag Horizontal):
  // - Organiza las fichas en filas horizontales paralelas aprovechando todo el ancho.
  // - Dobles colocados transversalmente (verticales) cruzando la fila horizontal.
  // - Conector de esquina de 1 ficha vertical hacia abajo al llegar al límite de la fila.
  // - Serpentina fluida (Fila 1: Derecha -> Conector 90° Abajo -> Fila 2: Izquierda -> Conector 90° Abajo -> Fila 3: Derecha...).
  // - Ahorro máximo de espacio vertical y horizontal para que todo el juego quepa nítido y visible.
  computeSnakeLayout(board, containerEl) {
    if (!board || board.length === 0) return { placed: [], totalW: 0, totalH: 0 };
    const U = this.U || 30; // 30px por mitad de ficha (60x30px horizontal, 30x60px vertical)
    const pad = 24;
    const rowStep = 75; // 2.5 * U = 75px entre líneas base de filas (garantiza separación entre dobles)

    // Detectar ancho útil para definir fichas por fila (3 en celular para garantizar márgenes holgados, 5 en PC)
    const containerW = containerEl && containerEl.clientWidth > 0
      ? containerEl.clientWidth
      : (typeof window !== 'undefined' ? window.innerWidth : 400);
    const maxPerRow = containerW >= 600 ? 5 : 3;

    if (board.length === 1) {
      const t = board[0];
      const isD = (t.left === t.right) || t.isDouble;
      const w = isD ? U : 2 * U;
      const h = isD ? 2 * U : U;
      return {
        placed: [{
          index: 0,
          tile: t,
          isVertical: isD,
          reverseHalves: false,
          x: pad,
          y: pad,
          w: w,
          h: h,
          isHead: true,
          isTail: true,
          dir: 'RIGHT'
        }],
        totalW: w + pad * 2,
        totalH: h + pad * 2
      };
    }

    const placed = [];
    let dir = 'RIGHT';
    let tilesInRow = 0;
    let curX = 0;
    let rowIndex = 0;
    let prevWasDouble = false;

    for (let i = 0; i < board.length; i++) {
      const t = board[i];
      const isHead = (i === 0);
      const isTail = (i === board.length - 1);
      const isDouble = (t.left === t.right) || t.isDouble;
      const curY = rowIndex * rowStep;

      // Se gira congruentemente 90° hacia abajo cuando la fila alcanza maxPerRow y esta ficha no es doble (o máximo maxPerRow+1)
      const shouldTurn = (tilesInRow >= maxPerRow && !isDouble) || (tilesInRow > maxPerRow);

      if (shouldTurn) {
        const nextRowIndex = rowIndex + 1;
        const nextY = nextRowIndex * rowStep;

        if (dir === 'RIGHT') {
          let x, y, h;
          if (prevWasDouble) {
            // El previo fue un doble en vertical. El conector se ubica a su derecha
            x = curX;
            y = curY;
            h = nextY - y + U;
          } else {
            // El previo fue horizontal. El conector baja desde su mitad derecha
            x = curX - U;
            y = curY + U;
            h = nextY - y + U;
          }
          placed.push({
            index: i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x: x,
            y: y,
            w: U,
            h: h,
            isHead: isHead,
            isTail: isTail,
            dir: 'DOWN'
          });
          curX = x;
          dir = 'LEFT';
        } else {
          // dir === 'LEFT'
          let x, y, h;
          if (prevWasDouble) {
            // El previo fue un doble en vertical. Conector se ubica a su izquierda
            x = curX - U;
            y = curY;
            h = nextY - y + U;
          } else {
            // El previo fue horizontal. Conector baja desde su mitad izquierda
            x = curX;
            y = curY + U;
            h = nextY - y + U;
          }
          placed.push({
            index: i,
            tile: t,
            isVertical: true,
            reverseHalves: false,
            x: x,
            y: y,
            w: U,
            h: h,
            isHead: isHead,
            isTail: isTail,
            dir: 'DOWN'
          });
          curX = x + U;
          dir = 'RIGHT';
        }
        rowIndex = nextRowIndex;
        tilesInRow = 0;
        prevWasDouble = false;
      } else {
        tilesInRow++;
        const y = curY;
        if (dir === 'RIGHT') {
          if (isDouble) {
            // Doble transversal (vertical) centrado en la fila horizontal
            placed.push({
              index: i,
              tile: t,
              isVertical: true,
              reverseHalves: false,
              x: curX,
              y: y - U / 2,
              w: U,
              h: 2 * U,
              isHead: isHead,
              isTail: isTail,
              dir: 'RIGHT'
            });
            curX += U;
            prevWasDouble = true;
          } else {
            // Ficha horizontal normal hacia la derecha
            placed.push({
              index: i,
              tile: t,
              isVertical: false,
              reverseHalves: false,
              x: curX,
              y: y,
              w: 2 * U,
              h: U,
              isHead: isHead,
              isTail: isTail,
              dir: 'RIGHT'
            });
            curX += 2 * U;
            prevWasDouble = false;
          }
        } else {
          // dir === 'LEFT'
          if (isDouble) {
            // Doble transversal (vertical) centrado en la fila horizontal
            placed.push({
              index: i,
              tile: t,
              isVertical: true,
              reverseHalves: false,
              x: curX - U,
              y: y - U / 2,
              w: U,
              h: 2 * U,
              isHead: isHead,
              isTail: isTail,
              dir: 'LEFT'
            });
            curX -= U;
            prevWasDouble = true;
          } else {
            // Ficha horizontal normal hacia la izquierda
            placed.push({
              index: i,
              tile: t,
              isVertical: false,
              reverseHalves: true, // val1 (izquierda) = t.right, val2 (derecha) = t.left para coincidencia cara a cara
              x: curX - 2 * U,
              y: y,
              w: 2 * U,
              h: U,
              isHead: isHead,
              isTail: isTail,
              dir: 'LEFT'
            });
            curX -= 2 * U;
            prevWasDouble = false;
          }
        }
      }
    }

    // Normalizar coordenadas dentro del canvas con márgenes de seguridad
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

    const pad = 28;
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

    const { placed, totalW, totalH } = this.computeSnakeLayout(boardTiles, containerEl);

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

      // Indicadores en los extremos de la cadena (siempre 100% visibles y despegados de los números)
      let chipMarkup = '';
      if (isHead) {
        chipMarkup = `<span class="end-chip chip-left">◀ ${leftEnd}</span>`;
      }
      if (isTail) {
        if (item.dir === 'DOWN') {
          chipMarkup += `<span class="end-chip chip-bottom">${rightEnd} ▶</span>`;
        } else if (item.dir === 'LEFT') {
          chipMarkup += `<span class="end-chip chip-left">${rightEnd} ▶</span>`;
        } else {
          chipMarkup += `<span class="end-chip chip-right">${rightEnd} ▶</span>`;
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
