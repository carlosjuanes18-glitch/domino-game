// Renderizador de Fichas Clásicas de Dominó y Tablero en Tiempo Real
class DominoRenderer {
  constructor() {
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

  // Auto-ajusta el tamaño y escala para que TODAS las fichas quepan al 100% en la pantalla
  autoFitBoard(containerEl) {
    if (!containerEl) return;
    const flow = containerEl.querySelector('.board-chain-flow');
    if (!flow) return;

    // Resetear transformación previa para medir dimensiones reales
    flow.style.transform = 'none';

    // Obtener dimensiones del contenedor
    const pad = 12;
    const containerW = containerEl.clientWidth - pad;
    const containerH = containerEl.clientHeight - pad;
    const flowW = flow.scrollWidth;
    const flowH = flow.scrollHeight;

    if (flowW > 0 && flowH > 0 && containerW > 0 && containerH > 0) {
      const scaleX = containerW / flowW;
      const scaleY = containerH / flowH;
      // Escalar hacia abajo si excede el contenedor; mantener máximo 1.0 para nitidez
      const fitScale = Math.min(1.0, Math.min(scaleX, scaleY));
      flow.style.transform = `scale(${fitScale})`;
      flow.style.transformOrigin = 'center center';
    }
  }

  // Renderiza el tablero de dominó organizado en serpentina/filas adaptables
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

    let tilesHtml = '';

    boardTiles.forEach((tile, index) => {
      const isFirst = index === 0;
      const isLast = index === boardTiles.length - 1;
      const isDouble = tile.left === tile.right;
      const isVertical = isDouble;

      tilesHtml += `
        <div class="board-tile-wrapper ${isFirst ? 'board-head' : ''} ${isLast ? 'board-tail' : ''}">
          ${isFirst ? `<span class="end-chip chip-left">◀ ${leftEnd}</span>` : ''}
          ${this.renderTile(tile.left, tile.right, {
            isVertical: isVertical,
            isDouble: isDouble,
            id: `board-${index}-${tile.id}`
          })}
          ${isLast ? `<span class="end-chip chip-right">${rightEnd} ▶</span>` : ''}
        </div>
      `;
    });

    containerEl.innerHTML = `
      <div class="board-chain-flow">
        ${tilesHtml}
      </div>
    `;

    // Ajustar escala y acomodo inmediatamente y con un ligero delay tras pintar el DOM
    this.autoFitBoard(containerEl);
    requestAnimationFrame(() => this.autoFitBoard(containerEl));
    setTimeout(() => this.autoFitBoard(containerEl), 40);
  }
}

window.dominoRenderer = new DominoRenderer();

// Re-ajustar automáticamente si la pantalla cambia de tamaño o se rota el teléfono
window.addEventListener('resize', () => {
  const container = document.getElementById('boardContainer');
  if (container && window.dominoRenderer) {
    window.dominoRenderer.autoFitBoard(container);
  }
});
