import OBR from "@owlbear-rodeo/sdk";
import * as sheet from "./sheet.js";
import { KEY, PUSH, LIMIT, MINE, useRoom, serve, getMine, setMine, getParty, dropCopy, mineKey, partyKey, updateIndex, bytes } from "./store.js";

// Свій лист зберігається в цьому браузері й розсилається майстрові; у кімнаті — лише ім'я і Спритність.
// Подробиці — у store.js.

const $ = (id) => document.getElementById(id);
const sync = $("sync");
const gmBox = $("gm-box");
const gmPick = $("gm-pick");
const gmNote = $("gm-note");
const gmDel = $("gm-del");

let viewing = "";      // чий лист відкрито; "" — свій
let applying = false;  // щоб показ чужих змін не запускав зворотний запис
let timer = null;
let isGM = false;
let index = {};        // покажчик листів з кімнати

if (!OBR.isAvailable) {
  sync.textContent = "Відкрито поза Owlbear — зміни лише в цій вкладці";
} else {
  OBR.onReady(init);
}

async function init() {
  await useRoom();
  sync.textContent = "Підключено";
  isGM = (await OBR.player.getRole()) === "GM";
  if (isGM) gmBox.hidden = false;
  serve().catch((err) => console.error("Лист персонажа:", err));

  index = (await OBR.room.getMetadata())[KEY] ?? {};
  // старий формат (весь лист у кімнаті) ще не перенесено — візьмемо свій звідти
  const mine = getMine() ?? (index[MINE] && !index[MINE].lite ? { data: index[MINE] } : null);
  show(mine?.data ?? {}, "");
  if (!getMine() && !index[MINE]) sync.textContent = "Новий лист — заповнюй, усе збережеться само";
  if (isGM) fillPartyList();

  OBR.room.onMetadataChange((m) => { index = m[KEY] ?? {}; if (isGM) fillPartyList(); });

  // Фоновий скрипт міг отримати лист (свій — від майстра, чужий — від гравця): показати свіже
  window.addEventListener("storage", (e) => {
    if (e.key === mineKey() && !viewing && !typing()) show(getMine()?.data ?? {}, "");
    if (e.key === partyKey() && isGM) {
      fillPartyList();
      if (viewing) show(getParty()[viewing]?.data ?? {}, nameOf(viewing));
    }
  });

  document.addEventListener("input", scheduleSave, true);
  document.addEventListener("click", scheduleSave, true);
  document.addEventListener("sheet-changed", scheduleSave);

  // портрет із виділеного на мапі токена
  $("pic-token").hidden = false;
  $("pic-token").addEventListener("click", pickToken);

  if (isGM) {
    gmPick.addEventListener("change", () => {
      clearTimeout(timer);   // відкладене збереження свого листа вже не актуальне
      viewing = gmPick.value;
      if (!viewing) show(getMine()?.data ?? {}, "");
      else {
        const copy = getParty()[viewing];
        show(copy?.data ?? {}, nameOf(viewing));
        if (!copy) gmNote.textContent = "Копії цього листа в цьому браузері ще немає — вона прийде, щойно гравець зайде в кімнату";
      }
      gmDel.hidden = !viewing;
    });
    gmDel.addEventListener("click", deleteSheet);
  }
}

// чи людина саме щось друкує — тоді не перемальовуємо форму в неї під руками
const typing = () => document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && Date.now() - lastInput < 3000;
let lastInput = 0;

const nameOf = (id) => (getParty()[id]?.data?.name || index[id]?.name || "").trim() || "Без імені";

function scheduleSave() {
  lastInput = Date.now();
  if (applying || viewing) return;
  clearTimeout(timer);
  timer = setTimeout(save, 600);
}

async function save() {
  if (viewing || applying) return;   // відкрито чужий лист — свій не чіпаємо
  try {
    const data = sheet.collect();
    const at = setMine(data);
    if (bytes(data) > LIMIT) {
      sync.textContent = "Збережено лише в цьому браузері: лист завеликий, щоб надіслати майстрові";
    } else {
      await OBR.broadcast.sendMessage(PUSH, { id: MINE, data, at }, { destination: "REMOTE" });
      sync.textContent = "Збережено " + new Date().toLocaleTimeString("uk");
    }
    await updateIndex(MINE, data);
  } catch (err) {
    sync.textContent = "Не вдалося зберегти";
    console.error(err);
  }
}

async function pickToken() {
  const note = $("pic-note");
  try {
    const ids = (await OBR.player.getSelection()) ?? [];
    if (!ids.length) { note.textContent = "Спершу виділи свій токен на мапі"; return; }
    const items = await OBR.scene.items.getItems(ids);
    const url = items.find((i) => i.image?.url)?.image.url;
    if (!url) { note.textContent = "У виділеного немає картинки"; return; }
    note.textContent = "";
    sheet.setPortrait(url);
  } catch (err) {
    note.textContent = "Не вдалося взяти токен — відкрий сцену";
    console.error(err);
  }
}

// --- Режим Майстра ---

function fillPartyList() {
  const party = getParty();
  const ids = [...new Set([...Object.keys(index), ...Object.keys(party)])].filter((id) => id !== MINE);
  const keep = gmPick.value;
  gmPick.innerHTML = '<option value="">Мій лист</option>';
  for (const id of ids) gmPick.appendChild(new Option(nameOf(id) + (party[id] ? "" : " (копії ще немає)"), id));
  gmPick.value = ids.includes(keep) ? keep : "";
}

// Прибрати лист гравця, який більше не грає
async function deleteSheet() {
  if (!viewing) return;
  const label = nameOf(viewing);
  if (!confirm(`Видалити лист «${label}»? Скасувати буде неможливо.`)) return;
  dropCopy(viewing);
  const m = await OBR.room.getMetadata();
  const next = { ...(m[KEY] ?? {}) };
  delete next[viewing];
  await OBR.room.setMetadata({ [KEY]: next });
  viewing = "";
  gmPick.value = "";
  gmDel.hidden = true;
  show(getMine()?.data ?? {}, "");
  fillPartyList();
  gmNote.textContent = `Лист «${label}» видалено`;
}

function show(data, owner) {
  applying = true;
  sheet.applyData(data ?? {});
  applying = false;
  setReadonly(Boolean(owner));
  sync.textContent = owner ? "Чужий лист — редагування вимкнено" : "Твій лист";
  if (isGM) gmNote.textContent = owner ? `Лист «${owner}»` : "";
}

function setReadonly(on) {
  document.querySelectorAll("input, select, textarea, button").forEach((el) => {
    // вкладки і друк мають лишатися доступними навіть у чужому листі
    if (el.closest("#gm-box") || el.closest(".tabs")) return;
    if (el.id === "print") return;
    el.disabled = on;
  });
  $("pic-tools").hidden = on;
  $("pic-url").hidden = true;
}
