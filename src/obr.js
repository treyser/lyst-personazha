import OBR from "@owlbear-rodeo/sdk";
import * as sheet from "./sheet.js";

// Метадані кімнати живуть стільки ж, скільки кімната.
// Метадані гравця вмирають при перезавантаженні сторінки, тому вони не годяться.
const KEY = "com.nikita.character-sheet/sheets";

const $ = (id) => document.getElementById(id);
const sync = $("sync");
const gmBox = $("gm-box");
const gmPick = $("gm-pick");
const gmNote = $("gm-note");
const gmDel = $("gm-del");

// Стабільний ідентифікатор власника листа. id гравця змінюється при кожному
// підключенні, тому тримаємо свій у localStorage браузера.
const MINE = (() => {
  let id = localStorage.getItem("sheet-owner");
  if (!id) {
    id = "u" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("sheet-owner", id);
  }
  return id;
})();

let viewing = "";      // чий лист відкрито; "" — свій
let applying = false;  // щоб зміни ззовні не тригерили зворотний запис
let timer = null;
let isGM = false;

if (!OBR.isAvailable) {
  sync.textContent = "Відкрито поза Owlbear — зміни лише в цій вкладці";
} else {
  OBR.onReady(init);
}

async function init() {
  sync.textContent = "Підключено";

  isGM = (await OBR.player.getRole()) === "GM";
  if (isGM) gmBox.hidden = false;

  const meta = await OBR.room.getMetadata();
  handleSheets(meta[KEY]);

  OBR.room.onMetadataChange((m) => handleSheets(m[KEY]));

  document.addEventListener("input", scheduleSave, true);
  document.addEventListener("click", scheduleSave, true);

  if (isGM) {
    gmPick.addEventListener("change", async () => {
      viewing = gmPick.value;
      const m = await OBR.room.getMetadata();
      const sheets = m[KEY] ?? {};
      if (!viewing) {
        show(sheets[MINE] ?? {}, "");
      } else {
        show(sheets[viewing], sheets[viewing]?.name?.trim() || "гравець");
      }
      gmDel.hidden = !viewing;
    });

    gmDel.addEventListener("click", deleteSheet);
  }
}

// Приходить весь набір листів кімнати
function handleSheets(sheets) {
  sheets = sheets ?? {};

  if (isGM) fillPartyList(sheets);

  if (applying) return;

  const id = viewing || MINE;
  const data = sheets[id];
  if (!data) return;

  applying = true;
  sheet.applyData(data);
  applying = false;
}

function scheduleSave() {
  if (applying || viewing) return;
  clearTimeout(timer);
  timer = setTimeout(save, 600);
}

async function save() {
  try {
    // читаємо свіжий набір, щоб не затерти листи інших гравців
    const meta = await OBR.room.getMetadata();
    const sheets = { ...(meta[KEY] ?? {}) };
    sheets[MINE] = sheet.collect();
    await OBR.room.setMetadata({ [KEY]: sheets });
    sync.textContent = "Збережено " + new Date().toLocaleTimeString("uk");
  } catch (err) {
    sync.textContent = "Не вдалося зберегти — можливо, лист завеликий";
    console.error(err);
  }
}

// --- Режим Майстра ---

function fillPartyList(sheets) {
  const ids = Object.keys(sheets).filter((id) => id !== MINE);
  const keep = gmPick.value;
  gmPick.innerHTML = '<option value="">Мій лист</option>';
  for (const id of ids) {
    gmPick.appendChild(new Option(sheets[id].name?.trim() || "Без імені", id));
  }
  gmPick.value = keep;
}

// Прибрати лист гравця, який більше не в кімнаті
async function deleteSheet() {
  if (!viewing) return;
  const m = await OBR.room.getMetadata();
  const sheets = { ...(m[KEY] ?? {}) };
  const label = sheets[viewing]?.name?.trim() || "без імені";
  if (!confirm(`Видалити лист «${label}»? Скасувати буде неможливо.`)) return;

  delete sheets[viewing];
  await OBR.room.setMetadata({ [KEY]: sheets });

  viewing = "";
  gmPick.value = "";
  gmDel.hidden = true;
  const fresh = await OBR.room.getMetadata();
  show((fresh[KEY] ?? {})[MINE] ?? {}, "");
  gmNote.textContent = `Лист «${label}» видалено`;
}

function show(data, owner) {
  applying = true;
  sheet.applyData(data ?? {});
  applying = false;
  // блокування знімаємо останнім, після перемальовування форми
  setReadonly(Boolean(owner));
  sync.textContent = owner
    ? "Чужий лист — редагування вимкнено"
    : "Твій лист";
  if (isGM) gmNote.textContent = owner ? `Лист «${owner}»` : "";
}

function setReadonly(on) {
  document.querySelectorAll("input, select, textarea, button").forEach((el) => {
    // вкладки і друк мають лишатися доступними навіть у чужому листі
    if (el.closest("#gm-box") || el.closest(".tabs")) return;
    if (el.id === "print") return;
    el.disabled = on;
  });
}

