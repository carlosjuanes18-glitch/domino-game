// Renderizador de Fichas Clásicas de Dominó y Tablero en Tiempo Real
class DominoRenderer {
  constructor() {
    // Patrones estándar de puntos (3x3 grid: 0..8)
    // 0 1 2
    // 3 4 5
    // 6 7 8
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
      id = `${leftVal}-${rightVal}`
    } = options;

    const playableClass = isPlayable ? 'playable-tile' : '';
    const orientationClass = isVertical ? 'domino-vertical' : 'domino-horizontal';

    return `
      <div class="domino-tile ${orientationClass} ${playableClass} ${extraClasses}"
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

  // Renderiza el tablero de juego adaptado para pantalla de celular (Cadena de dominó)
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

    // Renderizar la cadena de fichas en la mesa
    // En móviles, se organiza como una serpentina o flujo continuo adaptable
    let tilesHtml = '';
    
    boardTiles.forEach((tile, index) => {
      const isFirst = index === 0;
      const isLast = index === boardTiles.length - 1;
      const isDouble = tile.left === tile.right;

      // Las fichas dobles se posicionan verticalmente como en el juego clásico
      const isVertical = isDouble;

      tilesHtml += `
        <div class="board-tile-wrapper ${isFirst ? 'board-head' : ''} ${isLast ? 'board-tail' : ''}">
          ${this.renderTile(tile.left, tile.right, {
            isVertical: isVertical,
            isDouble: isDouble,
            id: `board-${index}-${tile.id}`
          })}
        </div>
      `;
    });

    containerEl.innerHTML = `
      <div class="board-chain-flow">
        ${tilesHtml}
      </div>
    `;

    // Hacer scroll automático para centrar el último tiro o mantener los extremos a la vista
    setTimeout(() => {
      containerEl.scrollLeft = containerEl.scrollWidth / 2 - containerEl.clientWidth / 2;
    }, 50);
  }
}

window.dominoRenderer = new DominoRenderer();

