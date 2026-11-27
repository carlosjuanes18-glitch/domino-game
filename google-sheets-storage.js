// google-sheets-storage.js - Módulo de persistencia de Amistades en Google Sheets
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const HEADER_ROW = ['player_id', 'friend_id', 'created_at', 'player_name', 'friend_name'];

let cachedSheetId = null;

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_SPREADSHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;

  // Manejar saltos de línea escapados en variables de entorno de Render
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: SCOPES
  });

  return google.sheets({ version: 'v4', auth });
}

async function getFirstSheetId(sheets, spreadsheetId) {
  if (cachedSheetId !== null) return cachedSheetId;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (meta.data.sheets && meta.data.sheets.length > 0) {
      cachedSheetId = meta.data.sheets[0].properties.sheetId || 0;
      return cachedSheetId;
    }
  } catch (err) {
    console.warn('[Google Sheets] No se pudo obtener sheetId, usando 0 por defecto:', err.message);
  }
  cachedSheetId = 0;
  return 0;
}

// Asegurar que la fila de encabezados exista en la hoja
async function ensureHeaders() {
  if (!isConfigured()) return false;
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A1:E1'
    });

    if (!res.data.values || res.data.values.length === 0 || !res.data.values[0][0]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'A1:E1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADER_ROW] }
      });
      console.log('[Google Sheets] Encabezados inicializados correctamente en la hoja.');
    }
    return true;
  } catch (err) {
    console.error('[Google Sheets] Error al verificar encabezados:', err.message);
    return false;
  }
}

// Cargar todas las amistades registradas en la hoja
async function loadFriendships() {
  if (!isConfigured()) return [];
  try {
    await ensureHeaders();
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:E'
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) return [];

    const friendships = [];
    rows.forEach(r => {
      const u1 = r[0] ? String(r[0]).trim() : '';
      const u2 = r[1] ? String(r[1]).trim() : '';
      if (u1 && u2 && u1 !== u2) {
        let ts = Date.now();
        if (r[2]) {
          const parsed = Date.parse(r[2]);
          if (!isNaN(parsed)) ts = parsed;
        }
        friendships.push({
          user1: u1,
          user2: u2,
          createdAt: ts,
          name1: r[3] || '',
          name2: r[4] || ''
        });
      }
    });

    return friendships;
  } catch (err) {
    console.error('[Google Sheets] Error al cargar amistades:', err.message);
    return [];
  }
}

// Agregar una amistad en Google Sheets (evitando duplicados)
async function addFriendship(idA, idB, nameA, nameB) {
  if (!isConfigured() || !idA || !idB || idA === idB) return { ok: false };
  try {
    await ensureHeaders();
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // Verificar si ya existe en la hoja para evitar duplicados
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:B'
    });

    const rows = res.data.values || [];
    const alreadyExists = rows.some(r => {
      const u1 = r[0] ? String(r[0]).trim() : '';
      const u2 = r[1] ? String(r[1]).trim() : '';
      return (u1 === idA && u2 === idB) || (u1 === idB && u2 === idA);
    });

    if (alreadyExists) {
      return { ok: true, alreadyExisted: true };
    }

    const newRow = [
      idA,
      idB,
      new Date().toISOString(),
      nameA || '',
      nameB || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A2:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] }
    });

    console.log(`[Google Sheets] Amistad registrada: ${idA} <-> ${idB}`);
    return { ok: true, created: true };
  } catch (err) {
    console.error('[Google Sheets] Error al registrar amistad:', err.message);
    return { ok: false, error: err.message };
  }
}

// Eliminar una amistad de Google Sheets
async function removeFriendship(idA, idB) {
  if (!isConfigured() || !idA || !idB) return { ok: false };
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:B'
    });

    const rows = res.data.values;
    if (!rows || rows.length <= 1) return { ok: false, error: 'Hoja vacía' };

    // Buscar las filas coincidentes (desde el final hacia el inicio para eliminar correctamente)
    const matchingIndices = [];
    for (let i = 1; i < rows.length; i++) {
      const u1 = rows[i][0] ? String(rows[i][0]).trim() : '';
      const u2 = rows[i][1] ? String(rows[i][1]).trim() : '';
      if ((u1 === idA && u2 === idB) || (u1 === idB && u2 === idA)) {
        matchingIndices.push(i);
      }
    }

    if (matchingIndices.length === 0) {
      return { ok: false, error: 'Amistad no encontrada en la hoja' };
    }

    const sheetId = await getFirstSheetId(sheets, spreadsheetId);

    // Eliminar filas de abajo hacia arriba para no alterar los índices
    const requests = matchingIndices.reverse().map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex,
          endIndex: rowIndex + 1
        }
      }
    }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });

    console.log(`[Google Sheets] Amistad eliminada de la hoja: ${idA} <-> ${idB}`);
    return { ok: true, removed: true };
  } catch (err) {
    console.error('[Google Sheets] Error al eliminar amistad:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  isConfigured,
  ensureHeaders,
  loadFriendships,
  addFriendship,
  removeFriendship
};
