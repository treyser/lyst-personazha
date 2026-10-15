// Де живуть листи. Раніше всі листи лежали в метаданих кімнати, а там на всі розширення разом лише 16 кБ.
// Тепер:
//  • свій лист кожен гравець тримає у своєму браузері;
//  • майстер (його фоновий скрипт) тримає копії всіх листів у своєму браузері;
//  • у кімнаті лишається тільки короткий покажчик: хто є, ім'я і Спритність (їх читає «Бій»).
// Листи ходять повідомленнями: змінив — розіслав; хтось зайшов — майстер просить усіх надіслати свої.
import OBR from "@owlbear-rodeo/sdk";

export const ID = "com.nikita.character-sheet";
export const KEY = `${ID}/sheets`;   // у кімнаті: { id: { name, stats: { dex }, lite: true } }
export const PUSH = `${ID}/push`;    // гравець → майстер: { id, data, at }
export const REQ = `${ID}/req`;      // майстер → усі: «надішліть свої листи»
export const GET = `${ID}/get`;      // гравець → майстер: «у мене порожньо, віддай мою копію»
export const GIVE = `${ID}/give`;    // майстер → власник: { id, data, at }
export const LIMIT = 15000;          // межа одного повідомлення Owlbear (16 кБ) із запасом

// Стабільний ідентифікатор власника листа: id гравця в Owlbear змінюється при кожному підключенні
export const MINE = (() => {
  try {
    let id = localStorage.getItem("sheet-owner");
    if (!id) {
      id = "u" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("sheet-owner", id);
    }
    return id;
  } catch { return "u-nostorage"; }
})();

// Ключі сховища — окремі для кожної кімнати (у різних кімнатах можуть бути різні герої)
let room = "";
export async function useRoom() { room = OBR.room.id || "room"; return room; }
export const mineKey = () => `lyst.mine.${room}`;
export const partyKey = () => `lyst.party.${room}`;

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// { data, at } — мій лист
export const getMine = () => read(mineKey(), null);
export function setMine(data, at = Date.now()) { write(mineKey(), { data, at }); return at; }

// { id: { data, at } } — копії листів у майстра
export const getParty = () => read(partyKey(), {});
export function keepCopy(id, data, at) {
  const party = getParty();
  if (party[id] && (party[id].at ?? 0) > at) return false;   // у нас новіша
  party[id] = { data, at };
  write(partyKey(), party);
  return true;
}
export function dropCopy(id) {
  const party = getParty();
  delete party[id];
  write(partyKey(), party);
}

export const bytes = (v) => new TextEncoder().encode(JSON.stringify(v ?? {})).length;

// Короткий запис для кімнати
export const brief = (data) => ({ name: String(data?.name ?? "").slice(0, 60), stats: { dex: Number(data?.stats?.dex ?? 10) }, lite: true });
export const isFull = (entry) => entry && !entry.lite;

// Оновити покажчик у кімнаті, лише якщо змінилось ім'я чи Спритність
export async function updateIndex(id, data) {
  const meta = await OBR.room.getMetadata();
  const index = { ...(meta[KEY] ?? {}) };
  const next = brief(data);
  const cur = index[id];
  if (cur && !isFull(cur) && cur.name === next.name && cur.stats?.dex === next.stats.dex) return;
  index[id] = next;
  await OBR.room.setMetadata({ [KEY]: index });
}

// Обмін листами між гравцями й майстром. Працює у фоні, а про всяк випадок і у відкритому листі
// (якщо Owlbear ще не підхопив фоновий скрипт) — повтор нічого не зіпсує.
let serving = false;
export async function serve() {
  if (serving) return;
  serving = true;
  await useRoom();
  const gm = async () => (await OBR.player.getRole()) === "GM";

  // --- усі: майстер просить листи — надсилаємо свій ---
  const pushMine = () => {
    const mine = getMine();
    if (!mine?.data || bytes(mine) > LIMIT) return;
    OBR.broadcast.sendMessage(PUSH, { id: MINE, data: mine.data, at: mine.at }, { destination: "REMOTE" }).catch(() => {});
  };
  OBR.broadcast.onMessage(REQ, () => pushMine());

  // --- власник: майстер віддав мою копію ---
  OBR.broadcast.onMessage(GIVE, (event) => {
    const d = event.data ?? {};
    if (d.id !== MINE || !d.data) return;
    const mine = getMine();
    if (!mine || (mine.at ?? 0) < (d.at ?? 0)) setMine(d.data, d.at ?? Date.now());
  });

  // --- майстер: зберігає копії, віддає їх, тримає покажчик у кімнаті ---
  OBR.broadcast.onMessage(PUSH, async (event) => {
    if (!(await gm())) return;
    const d = event.data ?? {};
    if (d.id && d.data) keepCopy(d.id, d.data, d.at ?? Date.now());
  });
  OBR.broadcast.onMessage(GET, async (event) => {
    if (!(await gm())) return;
    const id = event.data?.id;
    const copy = id ? getParty()[id] : null;
    if (copy) OBR.broadcast.sendMessage(GIVE, { id, data: copy.data, at: copy.at }, { destination: "REMOTE" }).catch(() => {});
  });

  await migrate(await gm());

  if (await gm()) {
    OBR.broadcast.sendMessage(REQ, {}, { destination: "REMOTE" }).catch(() => {});
    // хтось зайшов — попросимо листи ще раз
    let known = new Set((await OBR.party.getPlayers()).map((p) => p.id));
    OBR.party.onChange((players) => {
      const fresh = players.some((p) => !known.has(p.id));
      known = new Set(players.map((p) => p.id));
      if (fresh) setTimeout(() => OBR.broadcast.sendMessage(REQ, {}, { destination: "REMOTE" }).catch(() => {}), 2000);
    });
  } else {
    // гравець без свого листа в цьому браузері — просимо копію в майстра
    setTimeout(() => { if (!getMine()) OBR.broadcast.sendMessage(GET, { id: MINE }, { destination: "REMOTE" }).catch(() => {}); }, 3000);
  }
}

// Листи версії 0.2 лежали в кімнаті цілком. Кожен забирає свій, майстер — усі, а в кімнаті лишається покажчик.
async function migrate(isGM) {
  const index = (await OBR.room.getMetadata())[KEY] ?? {};
  const full = Object.entries(index).filter(([, v]) => isFull(v));
  if (!full.length) return;
  const old = Date.now() - 1000;   // старіше за будь-яку свіжу правку
  if (index[MINE] && isFull(index[MINE]) && !getMine()) setMine(index[MINE], old);
  if (!isGM) return;
  for (const [id, data] of full) keepCopy(id, data, old);
  // прибираємо з кімнати лише те, що точно лягло в цей браузер, — інакше лист можна втратити
  const party = getParty();
  if (full.some(([id]) => !party[id])) { console.error("Лист персонажа: не вдалося зберегти копії, лишаю листи в кімнаті"); return; }
  const next = { ...index };
  for (const [id, data] of full) next[id] = brief(data);
  await OBR.room.setMetadata({ [KEY]: next });
}
