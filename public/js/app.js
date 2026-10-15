const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const METRICS = [
  ["waist", "Талия"],
  ["hips", "Бёдра"],
  ["chest", "Грудь"],
  ["leg", "Нога"]
];
const INSTRUCTIONS = [
  ["Защита входа", "После входа задайте PIN из 4 цифр. Face ID или отпечаток включается в профиле: это биометрия телефона или Windows Hello."],
  ["Главная", "В календаре виден план на выбранный день. Шаги вносятся вручную: сайт не получает Apple Health и Google Fit напрямую."],
  ["Замеры", "Талия, бёдра, грудь и нога. Вес можно указать по желанию, ежедневно взвешиваться не нужно."],
  ["Обучение", "Открытый курс нажимается сразу. Закрытый открывает тарифы."],
  ["Оплата", "Скопируйте реквизиты, сделайте перевод и нажмите «Отправить чек». Заявка уйдёт администратору, доступ откроется после проверки по вашей почте."],
  ["Плеер", "Скорость меняется кнопками под уроком. Аудио-практику можно слушать со свёрнутым приложением."],
  ["Как приложение", "На iPhone: Поделиться → На экран «Домой». На Android и компьютере: «Добавить на экран» или значок установки в Chrome."]
];

const state = {
  route: "boot",
  stack: [],
  user: null,
  access: [],
  requests: [],
  billing: null,
  tariffs: [],
  catalog: [],
  local: null,
  selectedDate: "",
  weekStart: "",
  metric: "waist",
  courseId: "intimate",
  sectionId: "",
  itemId: "",
  tariffId: "kama-6m",
  sheet: null,
  pinInput: "",
  pinStage: "create",
  pinDraft: "",
  pinError: "",
  fails: 0,
  lockUntil: 0,
  afterPin: "home",
  routeBeforeLock: "",
  speed: 1,
  receipt: "",
  gender: "f",
  gameText: "",
  gameKind: "",
  adminAuthed: false,
  admin: null,
  busy: false,
  confirm: null
};

let unlocked = false;
let pendingRelock = false;
let toastTimer = 0;
let timerHandle = 0;
let mountedLesson = "";
const timer = { running: false, index: 0, left: 0 };
const media = { audio: new Audio(), lessonId: "", title: "", playing: false };
media.audio.preload = "none";
media.audio.loop = true;

const view = () => document.getElementById("view");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function isoDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function shift(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function mondayOf(iso) {
  const date = new Date(`${iso}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return isoDate(date);
}

function formatRu(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function money(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value || 0)} ₸`;
}

function num(value) {
  return new Intl.NumberFormat("ru-RU").format(value || 0);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2400);
}

function svg(name) {
  const paths = {
    home: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
    diary: '<path d="M7 4h8.5L19 7.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M15 4v4h4M8 12h8M8 16h6"/>',
    learn: '<path d="M3 6.5 12 3l9 3.5-9 3.5L3 6.5z"/><path d="M7 9.2V14c0 1.4 2.2 3 5 3s5-1.6 5-3V9.2"/>',
    chat: '<path d="M6 16.5 4 20l4.2-1.4A8.5 8.5 0 1 0 6 16.5z"/>',
    user: '<circle cx="12" cy="8" r="3.2"/><path d="M5 19.2c1.4-2.6 3.8-3.7 7-3.7s5.6 1.1 7 3.7"/>',
    chevron: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13"/>',
    repeat: '<path d="M4 12a8 8 0 0 1 13.5-5.8L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.5 5.8L4 16"/><path d="M4 20v-4h4"/>',
    book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 5.5A2.5 2.5 0 0 1 7.5 8H20"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5 21 8v8l-5-2.5z"/>',
    lotus: '<path d="M12 20c4-3 5-6.5 5-9-2 .2-3.4 1.4-4 2.6C12.4 12.4 11 11.2 9 11c0 2.5 1 6 3 9z"/><path d="M12 20c-4-3-5-6.5-5-9 2 .2 3.4 1.4 4 2.6"/><path d="M8 20h8"/>',
    salad: '<path d="M4 13h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M8 13c0-4 2-7 4-8 2 1 4 4 4 8"/>',
    bowl: '<path d="M4 11h16l-1.2 2.2A7 7 0 0 1 5.2 13.2z"/><path d="M8 11c.4-3 2-5 4-5s3.6 2 4 5M8 18h8"/>',
    headphones: '<path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v5a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2zM20 13v5a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2z"/>',
    flame: '<path d="M12 3s5 4.2 5 8.2A5 5 0 0 1 7 11.2C7 8.5 9.2 6.8 10 6c0 2 1.2 2.8 2 2.8C12 6.8 12 3 12 3z"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 15V5h10"/>',
    shield: '<path d="M12 3 5 6v6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6z"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

function applyPayload(data) {
  state.user = data.user;
  state.access = data.access || [];
  state.requests = data.requests || [];
  state.billing = data.billing;
  state.tariffs = data.tariffs || [];
  state.catalog = data.catalog || [];
  if (!state.tariffId && state.tariffs[0]) state.tariffId = state.tariffs[0].id;
  loadLocal();
}

function dataKey() {
  return `gfit_data_${state.user?.email || "guest"}`;
}

function loadLocal() {
  const raw = localStorage.getItem(dataKey());
  if (raw) {
    state.local = JSON.parse(raw);
    return;
  }
  const demo = state.user?.email === "zharbusinovag@gmail.com";
  const today = isoDate(new Date());
  state.local = {
    steps: demo ? { [today]: 6840, "2026-10-14": 8120 } : {},
    stepGoal: 8000,
    measures: demo ? [{ id: uid(), date: "2026-10-11", waist: 68, hips: 98, chest: 86, leg: 56, weight: "" }] : [],
    diary: demo ? [
      { id: uid(), date: "2026-10-14", title: "Тренировка: Мышцы тазового дна", count: 3, lessonId: "w2", courseId: "intimate" },
      { id: uid(), date: "2026-10-11", title: "Тренировка: Мышцы тазового дна", count: 3, lessonId: "w2", courseId: "intimate" }
    ] : []
  };
  saveLocal();
}

function saveLocal() {
  localStorage.setItem(dataKey(), JSON.stringify(state.local));
}

function pinStorageKey() {
  return `gfit_pin_${state.user?.email || ""}`;
}

function pinRecord() {
  const raw = localStorage.getItem(pinStorageKey());
  return raw ? JSON.parse(raw) : null;
}

async function digest(salt, pin) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buffer)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function savePin(pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((item) => item.toString(16).padStart(2, "0")).join("");
  const hash = await digest(salt, pin);
  const previous = pinRecord() || {};
  localStorage.setItem(pinStorageKey(), JSON.stringify({ salt, hash, credId: previous.credId || "" }));
}

async function verifyPin(pin) {
  const record = pinRecord();
  if (!record) return false;
  return (await digest(record.salt, pin)) === record.hash;
}

function bytesToB64(buffer) {
  let binary = "";
  new Uint8Array(buffer).forEach((item) => { binary += String.fromCharCode(item); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64ToBytes(value) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function createBiometric() {
  if (!window.PublicKeyCredential) throw new Error("Это устройство не поддерживает Face ID");
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "G-FIT", id: location.hostname },
      user: {
        id: new TextEncoder().encode(state.user.email),
        name: state.user.email,
        displayName: state.user.name || "G-FIT"
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none"
    }
  });
  const record = pinRecord() || {};
  record.credId = bytesToB64(credential.rawId);
  localStorage.setItem(pinStorageKey(), JSON.stringify(record));
}

async function useBiometric() {
  const record = pinRecord();
  if (!record?.credId) {
    toast("Сначала включите Face ID в профиле");
    return;
  }
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: b64ToBytes(record.credId) }],
      userVerification: "required",
      timeout: 60000
    }
  });
  if (credential) unlockApp();
}

function hasAccess(courseId) {
  const today = isoDate(new Date());
  return state.access.some((record) => record.status === "active" && (!record.to || record.to >= today) && (record.courseId === courseId || record.courseId === "both"));
}

function direction() {
  if (hasAccess("kamasutra") && !hasAccess("intimate")) return "Камасутра-фитнес";
  return "Интимная гимнастика";
}

function levelLabel() {
  return state.user?.level === "novice" ? "Новичок" : "Профи";
}

function avatarHtml(user, large = false) {
  const person = user || state.user || { name: "?" };
  const inner = person.avatar ? `<img alt="" src="${person.avatar}" />` : esc((person.name || "?").slice(0, 1).toUpperCase());
  return `<div class="${large ? "avatar-lg" : "avatar"}">${inner}</div>`;
}

function planFor(iso) {
  const day = new Date(`${iso}T12:00:00`).getDay();
  return {
    1: "Тренировка: мышцы тазового дна",
    2: "Дыхание и прогулка",
    3: "Тренировка: быстрые пульсации",
    4: "Отдых и замеры по желанию",
    5: "Тренировка: связка с ягодицами",
    6: "Аудио-практика или отдых",
    0: "Восстановление"
  }[day];
}

function diaryOn(iso) {
  return (state.local?.diary || []).filter((item) => item.date === iso);
}

function go(route, patch = {}) {
  const previous = state.route;
  Object.assign(state, patch);
  state.sheet = null;
  if (previous !== route) state.stack.push(previous);
  state.route = route;
  render();
}

function back() {
  const blocked = new Set(["lock", "login", "register", "set-pin", "age", "boot", "loading"]);
  let next = "home";
  while (state.stack.length) {
    const route = state.stack.pop();
    if (!blocked.has(route)) {
      next = route;
      break;
    }
  }
  state.route = next;
  state.sheet = null;
  render();
}

function tab(route) {
  pauseTimer();
  state.stack = [];
  state.route = route;
  state.sheet = null;
  render();
}

function openTariffs(courseId) {
  const tariff = state.tariffs.find((item) => item.courseId === courseId) || state.tariffs.find((item) => item.courseId === "both") || state.tariffs[0];
  go("tariffs", { tariffId: tariff?.id || "" });
}

function openCourse(courseId) {
  const course = state.catalog.find((item) => item.id === courseId);
  if (!course || course.locked) {
    openTariffs(courseId);
    return;
  }
  go("course", { courseId });
}

function currentLocation() {
  const course = state.catalog.find((item) => item.id === state.courseId);
  const section = course?.sections?.find((item) => item.id === state.sectionId);
  const item = section?.items?.find((entry) => entry.id === state.itemId);
  return { course, section, item };
}

function findLesson(id) {
  for (const course of state.catalog) {
    for (const section of course.sections || []) {
      for (const item of section.items || []) {
        if (item.id === id) return { course, section, item };
      }
    }
  }
  return null;
}

function adultBirth(birth) {
  if (!birth) return true;
  const born = new Date(`${birth}T12:00:00`);
  if (Number.isNaN(born.getTime())) return true;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  return age >= 18;
}

function chromeHidden() {
  return ["boot", "loading", "age", "login", "register", "lock", "set-pin", "admin", "blocked"].includes(state.route);
}

function speedsHtml() {
  return `<div class="speeds">${SPEEDS.map((speed) => `<button type="button" data-action="speed" data-speed="${speed}" class="${state.speed === speed ? "on" : ""}">${speed}×</button>`).join("")}</div>`;
}

function backBtn() {
  return `<button class="back" type="button" data-action="back">${svg("chevron")} Назад</button>`;
}

function whoBlock(mode) {
  const extra = mode === "level" ? `<div class="who-level">Уровень: ${levelLabel()}</div>` : `<div class="who-mail">${esc(state.user.email)}</div>`;
  return `<div class="who">${avatarHtml()}<div><div class="who-name">${esc(state.user.name)}</div>${extra}</div></div>`;
}

function ageScreen() {
  return `<section class="age"><p class="logo">G-FIT</p><p class="tag">Интимный фитнес</p><p>Материалы о теле, близости и практиках для пар предназначены только для людей старше 18 лет.</p><div class="age-actions"><button class="btn-solid" type="button" data-action="age-yes">Мне есть 18</button><button class="btn-soft" type="button" data-action="age-no">Мне нет 18</button></div></section>`;
}

function blockedScreen() {
  return `<section class="age"><p class="logo">G-FIT</p><p>Раздел доступен только совершеннолетним. Если дата рождения указана по ошибке, её можно поправить после входа с другого профиля взрослого.</p></section>`;
}

function authScreen(mode) {
  const register = mode === "register";
  return `<section>
    <div class="auth-hero"><p class="logo">G-FIT</p><p class="tag">Интимная гимнастика и практики для двоих</p></div>
    <form class="auth-card" data-action="${register ? "register" : "login"}">
      <h1>${register ? "Регистрация" : "Вход"}</h1>
      ${register ? `<label class="field"><span>Имя</span><input id="r-name" required placeholder="Ваше имя" /></label>` : ""}
      <label class="field"><span>Электронная почта</span><input id="${register ? "r-email" : "email"}" type="email" required placeholder="you@mail.com" /></label>
      ${register ? `<label class="field"><span>Телефон</span><input id="r-phone" placeholder="+7" /></label>` : ""}
      <label class="field"><span>Пароль</span><input id="${register ? "r-password" : "password"}" type="password" required minlength="6" /></label>
      <button class="btn-solid" type="submit">${register ? "Создать аккаунт" : "Войти"}</button>
      ${register ? "" : `<button class="btn-ghost" style="margin-top:8px" type="button" data-action="demo">Войти как Гульназ</button>`}
      <button class="link-btn" style="color:var(--wine)" type="button" data-action="${register ? "show-login" : "show-register"}">${register ? "У меня уже есть вход" : "Создать аккаунт"}</button>
      <button class="footer-note" style="background:none;border:0;width:100%" type="button" data-action="show-admin">Вход для администратора</button>
    </form>
  </section>`;
}

function pinScreen() {
  const create = state.route === "set-pin";
  const titles = {
    old: ["Текущий PIN", "Введите действующий код"],
    create: ["Задайте PIN", "4 цифры защищают курсы на этом устройстве"],
    confirm: ["Повторите PIN", "Коды должны совпасть"],
    enter: [`Здравствуйте, ${esc(state.user?.name || "")}`, "Введите PIN, чтобы открыть G-FIT"]
  };
  const stage = create ? state.pinStage : "enter";
  const [title, hint] = titles[stage] || titles.enter;
  const bio = !create && pinRecord()?.credId;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", bio ? "bio" : "", "0", "del"];
  return `<section class="pin">
    <p class="logo">G-FIT</p>
    <h1 id="pin-title" style="font-size:26px">${title}</h1>
    <p id="pin-hint" class="tag">${hint}</p>
    <div id="dots" class="dots">${[0, 1, 2, 3].map((index) => `<i class="dot ${index < state.pinInput.length ? "fill" : ""}"></i>`).join("")}</div>
    <p id="pin-error" class="pin-error">${esc(state.pinError)}</p>
    <div class="keys">
      ${keys.map((key) => {
        if (!key) return `<span></span>`;
        if (key === "bio") return `<button class="key ghost" type="button" data-action="bio">Face ID</button>`;
        if (key === "del") return `<button class="key ghost" type="button" data-action="pin" data-key="del">⌫</button>`;
        return `<button class="key" type="button" data-action="pin" data-key="${key}">${key}</button>`;
      }).join("")}
    </div>
    ${create ? "" : `<button class="link-btn" type="button" data-action="forgot">Забыли PIN?</button>`}
  </section>`;
}

function installCard() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (standalone || sessionStorage.getItem("gfit_hide_install")) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const text = ios
    ? "На iPhone: кнопка «Поделиться», затем «На экран Домой» — G-FIT откроется как приложение."
    : "Сохраните G-FIT на рабочий стол или экран телефона и открывайте без браузерных вкладок.";
  return `<div class="install"><b>Открывать как приложение</b><p class="small muted">${text}</p><div class="btn-row"><button class="btn-solid" type="button" data-action="install">Добавить</button><button class="btn-ghost" type="button" data-action="hide-install">Скрыть</button></div></div>`;
}

function homeScreen() {
  const today = isoDate(new Date());
  const days = Array.from({ length: 7 }, (_, index) => shift(state.weekStart, index));
  const steps = state.local.steps[state.selectedDate] || 0;
  const done = diaryOn(state.selectedDate);
  const label = new Date(`${state.weekStart}T12:00:00`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const month = label.charAt(0).toUpperCase() + label.slice(1);
  const latest = [...state.local.measures].sort((a, b) => b.date.localeCompare(a.date))[0];
  const metricValue = latest?.[state.metric];
  const lastDiary = state.local.diary[0];
  return `<section class="screen">
    <div class="who">${avatarHtml()}<div><div class="who-level">${esc(direction())}</div><div class="who-name">${levelLabel()}</div></div></div>
    <div class="hello">Привет, ${esc(state.user.name)}!</div>
    ${installCard()}
    <div class="card">
      <div class="cal-top"><button class="icon-btn" type="button" data-action="week" data-dir="-1">‹</button><b>${month}</b><button class="icon-btn" type="button" data-action="week" data-dir="1">›</button></div>
      <div class="days">${days.map((iso) => {
        const date = new Date(`${iso}T12:00:00`);
        const marks = diaryOn(iso).length || state.local.measures.some((item) => item.date === iso);
        return `<button class="day ${iso === state.selectedDate ? "on" : ""} ${iso === today ? "today" : ""} ${marks ? "has" : ""}" type="button" data-action="pick-day" data-date="${iso}"><i>${date.getDate()}</i>${["вс", "пн", "вт", "ср", "чт", "пт", "сб"][date.getDay()]}<div class="mark"></div></button>`;
      }).join("")}</div>
    </div>
    <div class="row" style="margin-top:16px"><h2 style="margin:0">${state.selectedDate === today ? "Сегодня" : formatRu(state.selectedDate)}</h2><button class="tiny" type="button" data-action="tab" data-tab="diary">История</button></div>
    <p class="small">${done.length ? `Выполнено: ${esc(done.map((item) => item.title).join(", "))}` : esc(planFor(state.selectedDate))}</p>
    <div class="steps">
      <div class="steps-top"><span>Шагомер</span><span>${num(state.local.stepGoal)} цель</span></div>
      <div class="step-num">${num(steps)}</div>
      <div>шагов за день</div>
      <div class="btn-row" style="margin-top:14px"><button class="btn-soft" type="button" data-action="sheet" data-sheet="steps">Внести шаги</button><button class="btn-soft" type="button" data-action="sheet" data-sheet="sync">Синхронизация</button></div>
    </div>
    <h2>Мои замеры</h2>
    <div class="card">
      <p class="small muted center">${latest ? `Последняя запись ${formatRu(latest.date)}` : "Запишите замеры, чтобы начать отслеживать прогресс"}</p>
      <div class="metrics">${METRICS.map(([key, name]) => `<button class="metric ${state.metric === key ? "on" : ""}" type="button" data-action="metric" data-metric="${key}">${name}</button>`).join("")}</div>
      <div class="big-metric">${metricValue ? `${metricValue} см` : "—"}</div>
      <div class="btn-row"><button class="btn-ghost" type="button" data-action="tab" data-tab="measures">Перейти к замерам</button><button class="plus" type="button" data-action="sheet" data-sheet="measure" aria-label="Внести замеры">${svg("plus")}</button></div>
    </div>
    <h2>Дневник тренировок</h2>
    <div class="card">
      ${lastDiary ? `<div class="small muted">Последние тренировки</div><b>${esc(lastDiary.title)}</b><div class="small muted">⏱ ${lastDiary.count} упр. · ${formatRu(lastDiary.date)}</div>` : `<p class="small muted">Пока пусто. Отметьте тренировку в разделе обучения или добавьте запись вручную.</p>`}
      <button class="btn-ghost" style="margin-top:12px" type="button" data-action="tab" data-tab="diary">Перейти в дневник</button>
    </div>
    <h2>Инструкция по приложению</h2>
    <button class="btn-ghost" type="button" data-action="go" data-route="help">Просмотреть</button>
  </section>`;
}

function measuresScreen() {
  const list = [...state.local.measures].sort((a, b) => a.date.localeCompare(b.date));
  const values = list.map((item) => Number(item[state.metric]) || 0).filter(Boolean);
  const max = Math.max(...values, 1);
  return `<section class="screen">${backBtn()}${whoBlock("mail")}<h1>Мои замеры</h1>
    <div class="metrics">${METRICS.map(([key, name]) => `<button class="metric ${state.metric === key ? "on" : ""}" type="button" data-action="metric" data-metric="${key}">${name}</button>`).join("")}</div>
    <div class="card">${values.length ? `<div class="bars">${values.map((value) => `<span style="height:${Math.max(8, (value / max) * 100)}%"></span>`).join("")}</div>` : `<p class="muted center">История появится после первой записи</p>`}</div>
    ${list.slice().reverse().map((item) => `<div class="card"><b>${formatRu(item.date)}</b><div class="small">Талия ${item.waist || "—"} · Бёдра ${item.hips || "—"} · Грудь ${item.chest || "—"} · Нога ${item.leg || "—"}${item.weight ? ` · Вес ${item.weight} кг` : ""}</div></div>`).join("")}
    <button class="btn-solid" style="margin-top:16px" type="button" data-action="sheet" data-sheet="measure">+ Внести данные</button>
  </section>`;
}

function diaryScreen() {
  const today = isoDate(new Date());
  const start = mondayOf(today);
  const groups = [
    ["На этой неделе", state.local.diary.filter((item) => item.date >= start).sort((a, b) => b.date.localeCompare(a.date))],
    ["Ранее", state.local.diary.filter((item) => item.date < start).sort((a, b) => b.date.localeCompare(a.date))]
  ];
  return `<section class="screen pad-fab">${backBtn()}${whoBlock("mail")}<h1>Дневник тренировок</h1>
    ${groups.map(([title, items]) => items.length ? `<h2>${title}</h2>${items.map((item) => `<article class="diary-item"><b>${esc(item.title)}</b><div class="small muted">⏱ ${item.count || 1} ${item.count === 1 ? "упражнение" : "упражнения"}</div><div class="small muted">${formatRu(item.date)}</div><div class="tools"><button class="tiny" type="button" data-action="repeat" data-id="${item.id}">Повторить ${svg("repeat")}</button><button class="tiny danger" type="button" data-action="ask-delete" data-id="${item.id}" aria-label="Удалить">${svg("trash")}</button></div></article>`).join("")}` : "").join("") || `<p class="muted">Записей пока нет.</p>`}
  </section>`;
}

function learnScreen() {
  return `<section class="screen">${backBtn()}<div class="who">${avatarHtml()}<div><div class="who-level">Уровень:</div><div class="who-name">${levelLabel()}</div></div></div><h1>Обучение</h1>
    ${state.catalog.map((course) => `<button class="banner ${course.locked ? "locked" : ""}" type="button" data-action="course" data-id="${course.id}"><span class="badge">${course.locked ? "Закрыт" : course.badge}</span><strong>${esc(course.title)}</strong><span class="small muted">${esc(course.subtitle)}</span><div style="margin-top:10px">${course.locked ? `${svg("lock")} Купить` : "Открыть курс"}</div></button>`).join("")}
  </section>`;
}

function courseScreen() {
  const course = state.catalog.find((item) => item.id === state.courseId);
  if (!course || course.locked) return tariffsScreen();
  const tileOrder = ["intro", "lectures", "recipes", "workouts", "nutrition"];
  const sections = [...course.sections].sort((a, b) => {
    const left = tileOrder.indexOf(a.id);
    const right = tileOrder.indexOf(b.id);
    if (left === -1 || right === -1) return 0;
    return left - right;
  });
  return `<section class="screen">${backBtn()}<div class="who">${avatarHtml()}<div><div class="who-level">Уровень:</div><div class="who-name">${levelLabel()}</div></div></div><h1>${esc(course.title)}</h1>
    <div class="tiles">${sections.map((section) => `<button class="tile" type="button" data-action="section" data-id="${section.id}">${svg(section.icon || "book")}<div>${esc(section.title)}</div></button>`).join("")}</div>
  </section>`;
}

function sectionScreen() {
  const { course, section } = currentLocation();
  if (!course || course.locked || !section) return tariffsScreen();
  if (section.kind === "games") return gamesScreen(section);
  return `<section class="screen">${backBtn()}${whoBlock("level")}<h1>${esc(section.title)}</h1>
    ${(section.items || []).map((item) => `<button class="lesson-row" type="button" data-action="lesson" data-id="${item.id}"><b>${esc(item.title)}</b><div class="small muted">${item.level ? esc(item.level) + " · " : ""}${item.minutes || item.time || ""} мин</div></button>`).join("")}
  </section>`;
}

function gamesScreen(section) {
  return `<section class="screen">${backBtn()}${whoBlock("level")}<h1>Игры</h1><p class="small muted">Идеи для вечера, вопросы и случайная поза из курса. Всё можно пропустить.</p>
    <div class="btn-row" style="margin-top:12px"><button class="btn-solid" type="button" data-action="roll" data-kind="dates">Свидание</button><button class="btn-ghost" type="button" data-action="roll" data-kind="dares">Фант</button></div>
    <div class="btn-row" style="margin-top:8px"><button class="btn-ghost" type="button" data-action="roll" data-kind="questions">Вопрос</button><button class="btn-ghost" type="button" data-action="roll-pose">Случайная поза</button></div>
    ${state.gameText ? `<div class="game-result" style="margin-top:14px">${esc(state.gameText)}</div>` : ""}
  </section>`;
}

function lessonScreen() {
  const { course, item } = currentLocation();
  if (!course || course.locked || !item) return tariffsScreen();
  const paragraphs = (item.paragraphs || []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
  let body = "";
  if (item.type === "video") {
    body += `<div class="stage"><video id="lesson-video" controls playsinline controlsList="nodownload" disablepictureinpicture src="${esc(item.src)}"></video><div class="wm">${esc(state.user.email)}</div></div>${speedsHtml()}`;
  }
  if (item.type === "audio") {
    body += `<div class="card player-panel"><b>Аудио-практика</b><p class="small muted">Можно выключить экран — звук продолжится.</p><button class="btn-solid" id="audio-btn" type="button" data-action="audio-toggle">Слушать</button>${speedsHtml()}<div class="small" id="audio-time">0:00</div></div>`;
  }
  if (item.steps) {
    const step = item.steps[timer.index] || item.steps[0];
    body += `<div class="card"><div class="timer-num" id="timer-num">${formatClock(timer.left || step.sec)}</div><b id="step-name">${esc(step.name)}</b><p class="small" id="step-text">${esc(step.text)}</p>${item.type === "video" || item.type === "audio" ? "" : speedsHtml()}<div class="btn-row"><button class="btn-solid" type="button" data-action="timer-toggle" id="timer-btn">${timer.running ? "Пауза" : "Старт"}</button><button class="btn-ghost" type="button" data-action="ambient">${media.playing && media.lessonId === item.id ? "Фон включён" : "Фоновый звук"}</button></div></div>`;
  }
  if (item.type === "recipe") {
    body += `<div class="card recipe"><div class="small muted">${esc(item.time || "")}</div><b>Состав</b><ul>${(item.ingredients || []).map((line) => `<li>${esc(line)}</li>`).join("")}</ul><b>Как готовить</b><ol>${(item.steps || []).map((line) => `<li>${esc(line)}</li>`).join("")}</ol></div>`;
  }
  if (item.type === "pose") {
    body += `<div class="card"><span class="pill">${esc(item.level)}</span><p>${esc(item.summary)}</p><ul>${(item.tips || []).map((tip) => `<li>${esc(tip)}</li>`).join("")}</ul><div class="wm" style="position:static;color:var(--muted)">Материал G-FIT · ${esc(state.user.email)}</div></div>`;
  }
  if (paragraphs) body += `<div class="card prose">${paragraphs}<p class="small muted">Материал G-FIT · ${esc(state.user.email)}. Это обучение, не медицинское назначение.</p></div>`;
  if (item.intro && item.type !== "audio") body = `<p class="small">${esc(item.intro)}</p>` + body;
  const canLog = ["timer", "video", "audio"].includes(item.type);
  return `<section class="screen">${backBtn()}${whoBlock("level")}<h1>${esc(item.title)}</h1>${body}${canLog ? `<button class="btn-solid" style="margin-top:12px" type="button" data-action="complete">Завершить и записать</button>` : ""}</section>`;
}

function helpScreen() {
  return `<section class="screen">${backBtn()}<h1>Инструкция</h1>${INSTRUCTIONS.map(([title, text]) => `<div class="card"><b>${title}</b><p class="small">${text}</p></div>`).join("")}</section>`;
}

function chatScreen() {
  return `<section class="screen">${backBtn()}${whoBlock("mail")}<h1>Общение и поддержка</h1>
    <div class="card"><p>Твоё безопасное пространство для общения и вопросов. Задавай любые вопросы, делись успехами и получай поддержку на каждом шаге ❤️</p>
    <button class="btn-solid" type="button" data-action="support">🎧 Поддержка</button>
    <p class="small muted">Откроется WhatsApp администратора.</p></div>
  </section>`;
}

function profileScreen() {
  return `<section class="screen">${backBtn()}${whoBlock("mail")}
    <div class="small muted" style="margin-top:12px">Уровень</div>
    <div class="seg"><button type="button" class="${state.user.level === "novice" ? "on" : ""}" data-action="level" data-level="novice">Новичок</button><button type="button" class="${state.user.level !== "novice" ? "on" : ""}" data-action="level" data-level="profi">Профи</button></div>
    <div class="menu">
      <button class="menu-item card" type="button" data-action="go" data-route="personal">${svg("user")} Личные данные <span>›</span></button>
      <button class="menu-item card" type="button" data-action="go" data-route="subs">${svg("card")} Мои подписки / Покупки <span>›</span></button>
      <button class="menu-item card" type="button" data-action="go" data-route="security">${svg("shield")} Безопасность и PIN-код <span>›</span></button>
    </div>
    <button class="btn-ghost" style="margin-top:18px" type="button" data-action="logout">Выйти</button>
  </section>`;
}

function personalScreen() {
  const user = state.user;
  return `<section class="screen">${backBtn()}${whoBlock("mail")}<h1>Личные данные</h1>
    <div class="center">${avatarHtml(user, true)}<button class="upload" type="button" data-action="pick-avatar">Загрузить фото</button><input id="avatar-file" type="file" accept="image/*" hidden /></div>
    <div class="grid-2">
      <label class="field"><span>Ваше имя</span><input id="p-name" value="${esc(user.name)}" /></label>
      <label class="field"><span>Дата рождения</span><input id="p-birth" type="date" value="${esc(user.birth)}" /></label>
    </div>
    <div class="grid-2">
      <div class="field"><span>Пол</span><div class="choice seg"><button type="button" class="${state.gender === "m" ? "on" : ""}" data-action="gender" data-gender="m">М</button><button type="button" class="${state.gender !== "m" ? "on" : ""}" data-action="gender" data-gender="f">Ж</button></div></div>
      <label class="field"><span>Номер телефона</span><input id="p-phone" value="${esc(user.phone)}" /></label>
    </div>
    <label class="field"><span>Электронная почта</span><input id="p-email" type="email" value="${esc(user.email)}" /></label>
    <button class="btn-solid" type="button" data-action="save-profile">Сохранить</button>
  </section>`;
}

function rangeText(record) {
  const format = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  return `${format(record.from)} — ${format(record.to)}`;
}

function subsScreen() {
  const today = isoDate(new Date());
  const active = state.access.filter((record) => record.status === "active");
  return `<section class="screen">${backBtn()}${whoBlock("mail")}<h1>Все покупки</h1>
    ${active.length ? active.map((record) => {
      const alive = !record.to || record.to >= today;
      const title = record.courseId === "both" ? "Оба курса" : record.courseId === "kamasutra" ? "Камасутра & Отношения" : "Интимный фитнес";
      return `<article class="purchase"><div class="row"><b>${title}</b><span class="${alive ? "badge-ok" : "badge-no"}">${alive ? "✓ Активна" : "Истекла"}</span></div><div class="small muted" style="margin-top:8px">${rangeText(record)}</div></article>`;
    }).join("") : `<div class="card muted">Пока нет открытых курсов.</div>`}
    ${state.requests.slice(0, 4).map((request) => `<div class="card"><div class="row"><b>${esc(request.tariffTitle)}</b><span class="${request.status === "pending" ? "badge-wait" : request.status === "approved" ? "badge-ok" : "badge-no"}">${request.status === "pending" ? "⏳ Ожидает проверки" : request.status === "approved" ? "✓ Доступ открыт" : "Отклонено"}</span></div><div class="small muted">${money(request.amount)} · ${esc(request.email)}</div></div>`).join("")}
    <button class="btn-solid" style="margin-top:14px" type="button" data-action="go" data-route="tariffs">Продлить доступ</button>
  </section>`;
}

function securityScreen() {
  const bio = pinRecord()?.credId;
  return `<section class="screen">${backBtn()}${whoBlock("mail")}<h1>Безопасность</h1>
    <div class="card"><b>PIN-код</b><p class="small">Код хранится только на этом устройстве. После сворачивания G-FIT снова просит PIN, а в списке приложений экран скрывается.</p><button class="btn-ghost" type="button" data-action="change-pin">Сменить PIN</button></div>
    <div class="card"><b>Face ID / отпечаток</b><p class="small">${bio ? "Биометрия включена." : "Можно включить, если телефон или компьютер её поддерживает."}</p><button class="btn-solid" type="button" data-action="enable-bio">${bio ? "Подключить заново" : "Включить Face ID"}</button></div>
    <div class="card"><b>Защита экрана</b><p class="small">Печать, долгое нажатие и кнопка Print Screen блокируются. На видео стоит ваша почта. Полностью запретить системный снимок экрана, как в магазине приложений, браузер не может — это ограничение телефона, не дыра в курсе.</p></div>
  </section>`;
}

function tariffsScreen() {
  const selected = state.tariffs.find((item) => item.id === state.tariffId) || state.tariffs[0];
  return `<section class="screen">${backBtn()}${whoBlock("mail")}<h1>Тарифы</h1><p class="small muted">Закрытый курс открывается после проверки перевода по вашей почте.</p>
    ${(state.tariffs || []).map((tariff) => `<button class="banner ${tariff.id === selected?.id ? "" : "locked"}" style="${tariff.id === selected?.id ? "outline:2px solid var(--wine)" : ""}" type="button" data-action="pick-tariff" data-id="${tariff.id}"><span class="badge">${esc(tariff.period)}</span><strong>${esc(tariff.title)}</strong><div>${money(tariff.price)}</div><div class="small muted">${esc(tariff.text)}</div></button>`).join("")}
    <button class="btn-solid" style="margin-top:16px" type="button" data-action="sheet" data-sheet="pay">Перейти к оплате</button>
    <p class="footer-note">Доступ открывается вручную после проверки.</p>
  </section>`;
}

function adminScreen() {
  if (!state.adminAuthed) {
    return `<section class="screen"><button class="back" type="button" data-action="show-login">${svg("chevron")} К входу</button><h1>Админ-панель</h1><p class="small muted">Подтверждение оплаты по почте пользователя.</p><label class="field"><span>Пароль</span><input id="admin-pass" type="password" /></label><button class="btn-solid" type="button" data-action="admin-login">Войти</button></section>`;
  }
  const data = state.admin || { requests: [], settings: {}, access: [] };
  const settings = data.settings || {};
  const statusText = { pending: "⏳ Ожидает проверки", approved: "✅ Доступ открыт", rejected: "Отклонено" };
  return `<section class="screen"><div class="row"><h1 style="margin:0">Заявки</h1><button class="tiny" type="button" data-action="admin-out">Выйти</button></div>
    ${(data.requests || []).length ? data.requests.map((request) => `<article class="admin-card"><div class="row"><b>${esc(request.name)}</b><span class="${request.status === "pending" ? "badge-wait" : request.status === "approved" ? "badge-ok" : "badge-no"}">${statusText[request.status] || request.status}</span></div><div class="small">${esc(request.email)}</div><div class="small">${esc(request.tariffTitle)} · ${money(request.amount)}</div><div class="small muted">${new Date(request.createdAt).toLocaleString("ru-RU")}</div>${request.note ? `<p class="small">${esc(request.note)}</p>` : ""}${request.receipt ? `<img alt="Чек" src="${request.receipt}" />` : ""}<div class="btn-row" style="margin-top:8px"><button class="btn-solid" type="button" data-action="approve" data-id="${request.id}">Открыть доступ</button><button class="btn-ghost" type="button" data-action="reject" data-id="${request.id}">Отклонить</button></div></article>`).join("") : `<div class="card muted">Заявок пока нет.</div>`}
    <h2>Выдать доступ по почте</h2>
    <label class="field"><span>E-mail пользователя</span><input id="grant-email" type="email" placeholder="user@mail.com" /></label>
    <label class="field"><span>Курс</span><select id="grant-course"><option value="intimate">Интимный фитнес</option><option value="kamasutra">Камасутра</option><option value="both">Оба курса</option></select></label>
    <button class="btn-ghost" type="button" data-action="grant">Открыть доступ</button>
    <h2>Реквизиты</h2>
    <p class="small muted">Сейчас стоят примеры. Замените на свои перед боевой оплатой.</p>
    ${[["holder", "Получатель"], ["bank", "Банк"], ["kaspi", "Kaspi / телефон"], ["card", "Номер карты"], ["iin", "ИИН"], ["whatsapp", "WhatsApp администратора, только цифры"]].map(([key, label]) => `<label class="field"><span>${label}</span><input id="set-${key}" value="${esc(settings[key] || "")}" /></label>`).join("")}
    <label class="field"><span>Новый пароль админа, если нужно сменить</span><input id="set-adminPassword" type="password" placeholder="не менять" /></label>
    <button class="btn-solid" type="button" data-action="save-settings">Сохранить реквизиты</button>
  </section>`;
}

function screenHtml() {
  if (state.user && state.user.birth && !adultBirth(state.user.birth) && !["personal", "login"].includes(state.route)) return blockedScreen();
  const screens = {
    age: ageScreen,
    blocked: blockedScreen,
    login: () => authScreen("login"),
    register: () => authScreen("register"),
    lock: pinScreen,
    "set-pin": pinScreen,
    home: homeScreen,
    measures: measuresScreen,
    diary: diaryScreen,
    learn: learnScreen,
    course: courseScreen,
    section: sectionScreen,
    lesson: lessonScreen,
    help: helpScreen,
    chat: chatScreen,
    profile: profileScreen,
    personal: personalScreen,
    subs: subsScreen,
    security: securityScreen,
    tariffs: tariffsScreen,
    admin: adminScreen,
    loading: () => `<section class="age"><p class="logo">G-FIT</p><p>Открываем…</p></section>`
  };
  return (screens[state.route] || homeScreen)();
}

function sheetHtml() {
  if (state.sheet === "steps") {
    const steps = state.local.steps[state.selectedDate] || "";
    return `<div class="backdrop" data-action="close-sheet"><form class="sheet" data-action="save-steps"><div class="grab"></div><h2>Шаги за ${formatRu(state.selectedDate)}</h2><label class="field"><span>Количество</span><input id="step-count" type="number" min="0" max="200000" value="${steps}" /></label><label class="field"><span>Цель на день</span><input id="step-goal" type="number" min="0" value="${state.local.stepGoal}" /></label><button class="btn-solid" type="submit">Сохранить</button></form></div>`;
  }
  if (state.sheet === "sync") {
    return `<div class="backdrop" data-action="close-sheet"><div class="sheet"><div class="grab"></div><h2>Apple Health и Google Fit</h2><p class="small">Браузер не может сам забрать шаги из «Здоровья» или Google Fit: у сайтов нет такого разрешения. Откройте шагомер на телефоне и впишите число за день — G-FIT его сохранит, и вы сможете поправить его позже.</p><button class="btn-solid" type="button" data-action="sheet" data-sheet="steps">Внести шаги вручную</button></div></div>`;
  }
  if (state.sheet === "measure") {
    return `<div class="backdrop" data-action="close-sheet"><form class="sheet" data-action="save-measure"><div class="grab"></div><h2>Внести замеры</h2><label class="field"><span>Дата</span><input id="m-date" type="date" value="${state.selectedDate}" /></label><div class="grid-2"><label class="field"><span>Талия, см</span><input id="m-waist" type="number" step="0.1" /></label><label class="field"><span>Бёдра, см</span><input id="m-hips" type="number" step="0.1" /></label><label class="field"><span>Грудь, см</span><input id="m-chest" type="number" step="0.1" /></label><label class="field"><span>Нога, см</span><input id="m-leg" type="number" step="0.1" /></label></div><label class="field"><span>Вес, кг — по желанию</span><input id="m-weight" type="number" step="0.1" placeholder="можно не заполнять" /></label><button class="btn-solid" type="submit">Сохранить</button></form></div>`;
  }
  if (state.sheet === "diary") {
    return `<div class="backdrop" data-action="close-sheet"><form class="sheet" data-action="save-diary"><div class="grab"></div><h2>Новая запись</h2><label class="field"><span>Название</span><input id="d-title" placeholder="Тренировка или заметка" required /></label><label class="field"><span>Сколько упражнений</span><input id="d-count" type="number" min="1" value="1" /></label><label class="field"><span>Дата</span><input id="d-date" type="date" value="${isoDate(new Date())}" /></label><button class="btn-solid" type="submit">Добавить</button></form></div>`;
  }
  if (state.sheet === "pay") {
    const tariff = state.tariffs.find((item) => item.id === state.tariffId) || state.tariffs[0];
    const bill = state.billing || {};
    const rows = [["Получатель", bill.holder], ["Банк", bill.bank], ["Kaspi", bill.kaspi], ["Карта", bill.card], ["ИИН", bill.iin]];
    return `<div class="backdrop" data-action="close-sheet"><div class="sheet"><div class="grab"></div><h2>${esc(tariff?.title || "Тариф")}</h2><p><b>Итого: ${money(tariff?.price)}</b> · ${esc(tariff?.period || "")}</p>${rows.map(([label, value]) => `<div class="copy-row"><div><div class="small muted">${label}</div><b>${esc(value || "—")}</b></div><button class="tiny" type="button" data-action="copy" data-text="${esc(value || "")}">${svg("copy")} Скопировать</button></div>`).join("")}<label class="field" style="margin-top:12px"><span>Комментарий</span><input id="pay-note" placeholder="Например, время перевода" /></label><label class="field"><span>Фото чека</span><input id="receipt" type="file" accept="image/*" /></label><button class="btn-solid" type="button" data-action="send-pay">Отправить чек</button><p class="footer-note">Заявка сохранится со статусом «Ожидает проверки», чек и ваши данные уйдут администратору. Следом откроется WhatsApp.</p></div></div>`;
  }
  if (state.sheet === "forgot") {
    return `<div class="backdrop" data-action="close-sheet"><form class="sheet" data-action="reset-pin"><div class="grab"></div><h2>Новый PIN</h2><p class="small">Введите пароль аккаунта, затем задайте код заново.</p><label class="field"><span>Пароль</span><input id="forgot-pass" type="password" required /></label><button class="btn-solid" type="submit">Продолжить</button></form></div>`;
  }
  if (state.sheet === "confirm") {
    return `<div class="backdrop"><div class="sheet"><div class="grab"></div><h2>Удалить запись?</h2><div class="btn-row"><button class="btn-ghost" type="button" data-action="close-sheet">Оставить</button><button class="btn-solid" type="button" data-action="confirm-delete">Удалить</button></div></div></div>`;
  }
  return "";
}

function tabsHtml() {
  const items = [["home", "Главная", "home"], ["diary", "Дневник", "diary"], ["learn", "Обучение", "learn"], ["chat", "Общение", "chat"], ["profile", "Профиль", "user"]];
  const current = { measures: "home", help: "home", course: "learn", section: "learn", lesson: "learn", tariffs: "learn", personal: "profile", subs: "profile", security: "profile" }[state.route] || state.route;
  return items.map(([id, label, icon]) => `<button class="tab ${current === id ? "on" : ""}" type="button" data-action="tab" data-tab="${id}"><span class="bubble">${svg(icon)}</span>${label}</button>`).join("");
}

function paintModal() {
  document.getElementById("modal").innerHTML = sheetHtml();
}

function paintMini() {
  const node = document.getElementById("mini");
  const show = media.playing && !(state.route === "lesson" && state.itemId === media.lessonId) && !chromeHidden();
  node.innerHTML = show ? `<div class="mini-bar"><b>${esc(media.title || "Практика")}</b><button class="tiny" type="button" data-action="audio-toggle">${media.audio.paused ? "Слушать" : "Пауза"}</button><button class="tiny danger" type="button" data-action="audio-stop">Закрыть</button></div>` : "";
  document.getElementById("app").classList.toggle("has-mini", show);
}

function paintFab() {
  document.getElementById("fab-slot").innerHTML = state.route === "diary" && !chromeHidden() ? `<button class="fab" type="button" data-action="sheet" data-sheet="diary" aria-label="Добавить запись">${svg("plus")}</button>` : "";
}

function paintChrome() {
  const hide = chromeHidden();
  document.getElementById("dock").hidden = hide;
  document.getElementById("chat").hidden = hide;
  if (!hide) document.getElementById("tabbar").innerHTML = tabsHtml();
  paintFab();
  paintMini();
  paintModal();
}

function render() {
  syncLesson();
  view().innerHTML = screenHtml();
  paintChrome();
  prepareMedia();
}

function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function pauseTimer() {
  timer.running = false;
  clearInterval(timerHandle);
  timerHandle = 0;
}

function prepareTimer(reset) {
  const { item } = currentLocation();
  if (!item?.steps) return;
  if (reset || timer.left <= 0) {
    timer.index = 0;
    timer.left = item.steps[0].sec;
    timer.running = false;
  }
}

function syncLesson() {
  const id = state.route === "lesson" ? state.itemId : "";
  if (id !== mountedLesson) {
    pauseTimer();
    mountedLesson = id;
    timer.left = 0;
    timer.index = 0;
    prepareTimer(true);
  }
}

function paintTimer() {
  const { item } = currentLocation();
  if (!item?.steps) return;
  const step = item.steps[timer.index];
  const numNode = document.getElementById("timer-num");
  if (!numNode || !step) return;
  numNode.textContent = formatClock(timer.left);
  const name = document.getElementById("step-name");
  const text = document.getElementById("step-text");
  if (name) name.textContent = step.name;
  if (text) text.textContent = step.text;
  const button = document.getElementById("timer-btn");
  if (button) button.textContent = timer.running ? "Пауза" : "Старт";
}

function tick() {
  const { item } = currentLocation();
  if (!item?.steps) return pauseTimer();
  timer.left -= 0.2 * state.speed;
  if (timer.left <= 0) {
    if (timer.index < item.steps.length - 1) {
      timer.index += 1;
      timer.left = item.steps[timer.index].sec;
    } else {
      timer.left = 0;
      pauseTimer();
      toast("Практика завершена");
    }
  }
  paintTimer();
}

function prepareMedia() {
  const { item } = currentLocation();
  const video = document.getElementById("lesson-video");
  if (video) {
    video.playbackRate = state.speed;
    video.onerror = () => toast("Видео ещё не загружено на сервер");
  }
  if (item?.type === "audio" && media.lessonId !== item.id) {
    media.audio.src = item.src;
    media.audio.loop = true;
    media.lessonId = item.id;
    media.title = item.title;
    setupSession(item.title);
  }
  media.audio.playbackRate = state.speed;
  paintAudio();
}

function paintAudio() {
  const button = document.getElementById("audio-btn");
  if (button) button.textContent = media.playing && !media.audio.paused ? "Пауза" : "Слушать";
  const time = document.getElementById("audio-time");
  if (time && Number.isFinite(media.audio.currentTime)) {
    time.textContent = formatClock(media.audio.currentTime);
  }
}

function setupSession(title) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "G-FIT", album: "Практики" });
  navigator.mediaSession.setActionHandler("play", () => media.audio.play());
  navigator.mediaSession.setActionHandler("pause", () => media.audio.pause());
}

function showShield() {
  document.getElementById("shield").classList.add("on");
}

function hideShield() {
  document.getElementById("shield").classList.remove("on");
}

function unlockApp() {
  unlocked = true;
  const destination = state.afterPin || state.routeBeforeLock || "home";
  state.afterPin = "home";
  state.routeBeforeLock = "";
  state.pinInput = "";
  state.pinError = "";
  state.route = ["lock", "set-pin", "login", "boot"].includes(destination) ? "home" : destination;
  render();
}

async function submitPin() {
  const pin = state.pinInput;
  if (pin.length < 4) return;
  if (Date.now() < state.lockUntil) {
    state.pinError = "Подождите несколько секунд";
    state.pinInput = "";
    render();
    return;
  }
  if (state.route === "lock") {
    const ok = await verifyPin(pin);
    state.pinInput = "";
    if (!ok) {
      state.fails += 1;
      state.pinError = state.fails >= 5 ? "Слишком много попыток. Подождите 30 секунд." : "Неверный PIN";
      if (state.fails >= 5) {
        state.lockUntil = Date.now() + 30000;
        state.fails = 0;
      }
      render();
      document.getElementById("dots")?.classList.add("bad");
      return;
    }
    state.fails = 0;
    unlockApp();
    return;
  }
  if (state.pinStage === "old") {
    const ok = await verifyPin(pin);
    state.pinInput = "";
    if (!ok) {
      state.pinError = "Неверный текущий PIN";
      render();
      return;
    }
    state.pinStage = "create";
    state.pinError = "";
    render();
    return;
  }
  if (state.pinStage === "create") {
    state.pinDraft = pin;
    state.pinInput = "";
    state.pinStage = "confirm";
    state.pinError = "";
    render();
    return;
  }
  if (pin !== state.pinDraft) {
    state.pinDraft = "";
    state.pinInput = "";
    state.pinStage = "create";
    state.pinError = "PIN не совпал. Задайте заново.";
    render();
    return;
  }
  await savePin(pin);
  toast("PIN сохранён");
  unlockApp();
}

function pinKey(key) {
  if (Date.now() < state.lockUntil) return;
  if (key === "del") state.pinInput = state.pinInput.slice(0, -1);
  else if (state.pinInput.length < 4) state.pinInput += key;
  const dots = document.getElementById("dots");
  if (dots) {
    dots.innerHTML = [0, 1, 2, 3].map((index) => `<i class="dot ${index < state.pinInput.length ? "fill" : ""}"></i>`).join("");
  }
  if (state.pinInput.length === 4) submitPin();
}

async function refreshMe() {
  applyPayload(await api("/api/me"));
}

async function login(email, password) {
  applyPayload(await api("/api/auth/login", { method: "POST", body: { email, password } }));
  state.afterPin = "home";
  if (!pinRecord()) {
    state.route = "set-pin";
    state.pinStage = "create";
  } else {
    state.route = "lock";
    unlocked = false;
  }
  state.stack = [];
  render();
}

function openSupport() {
  const phone = String(state.billing?.whatsapp || "").replace(/\D/g, "");
  const text = encodeURIComponent(`Здравствуйте! Я ${state.user?.name || ""} (${state.user?.email || ""}). Нужна поддержка G-FIT.`);
  if (!phone) {
    toast("WhatsApp администратора ещё не указан");
    return;
  }
  window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener");
}

async function sendPayment() {
  const tariff = state.tariffs.find((item) => item.id === state.tariffId);
  if (!tariff) return;
  state.busy = true;
  try {
    const note = document.getElementById("pay-note")?.value || "";
    const result = await api("/api/payments", { method: "POST", body: { tariffId: tariff.id, note, receipt: state.receipt || "" } });
    applyPayload(result);
    state.receipt = "";
    state.sheet = null;
    const phone = String(state.billing?.whatsapp || "").replace(/\D/g, "");
    const text = encodeURIComponent([`G-FIT, заявка на доступ`, `Имя: ${state.user.name}`, `Email: ${state.user.email}`, `Телефон: ${state.user.phone || "—"}`, `Тариф: ${tariff.title}`, `Сумма: ${money(tariff.price)}`, "Чек отправила(а) в приложение."].join("\n"));
    if (phone) window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener");
    toast(result.duplicate ? "Эта заявка уже ожидает проверки" : "Заявка создана: ожидает проверки");
    render();
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
  }
}

async function saveProfile() {
  const previous = state.user.email;
  const payload = {
    name: document.getElementById("p-name").value.trim(),
    birth: document.getElementById("p-birth").value,
    phone: document.getElementById("p-phone").value.trim(),
    email: document.getElementById("p-email").value.trim(),
    gender: state.gender,
    level: state.user.level,
    avatar: state.user.avatar
  };
  if (payload.birth && !adultBirth(payload.birth)) {
    toast("G-FIT только для пользователей старше 18 лет");
    return;
  }
  const data = await api("/api/me", { method: "PUT", body: payload });
  if (data.user.email !== previous) {
    const oldData = localStorage.getItem(`gfit_data_${previous}`);
    if (oldData && !localStorage.getItem(`gfit_data_${data.user.email}`)) localStorage.setItem(`gfit_data_${data.user.email}`, oldData);
    const oldPin = localStorage.getItem(`gfit_pin_${previous}`);
    if (oldPin) localStorage.setItem(`gfit_pin_${data.user.email}`, oldPin);
  }
  applyPayload(data);
  state.gender = data.user.gender;
  toast("Сохранено");
  render();
}

function resizeImage(file, max, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => reject(new Error("Не удалось прочитать фото"));
    image.src = url;
  });
}

async function loadAdmin() {
  state.admin = await api("/api/admin/requests");
  state.adminAuthed = true;
}

function stopAudio() {
  media.audio.pause();
  media.playing = false;
  media.lessonId = "";
  paintMini();
  paintAudio();
}

async function onClick(event) {
  const node = event.target.closest("[data-action]");
  if (!node) return;
  if (node.closest(".sheet") && node.dataset.action === "close-sheet") return;
  if (node.tagName === "FORM") return;
  const action = node.dataset.action;
  if (action === "close-sheet" && event.target === node) {
    state.sheet = null;
    paintModal();
    return;
  }
  try {
    if (action === "age-yes") {
      localStorage.setItem("gfit_18", "1");
      state.route = "login";
      render();
    } else if (action === "age-no") {
      state.route = "blocked";
      render();
    } else if (action === "show-register") {
      state.route = "register";
      render();
    } else if (action === "show-login") {
      state.route = "login";
      render();
    } else if (action === "show-admin") {
      location.hash = "admin";
      state.route = "admin";
      render();
    } else if (action === "demo") {
      document.getElementById("email").value = "zharbusinovag@gmail.com";
      document.getElementById("password").value = "gfit2026";
      await login("zharbusinovag@gmail.com", "gfit2026");
    } else if (action === "pin") {
      pinKey(node.dataset.key);
    } else if (action === "bio") {
      await useBiometric();
    } else if (action === "forgot") {
      state.sheet = "forgot";
      paintModal();
    } else if (action === "back") {
      back();
    } else if (action === "tab") {
      tab(node.dataset.tab);
    } else if (action === "go") {
      if (node.dataset.route === "tariffs" && !state.tariffId && state.tariffs[0]) state.tariffId = state.tariffs[0].id;
      if (node.dataset.route === "personal") state.gender = state.user.gender || "f";
      go(node.dataset.route);
    } else if (action === "week") {
      state.weekStart = shift(state.weekStart, Number(node.dataset.dir) * 7);
      render();
    } else if (action === "pick-day") {
      state.selectedDate = node.dataset.date;
      render();
    } else if (action === "metric") {
      state.metric = node.dataset.metric;
      render();
    } else if (action === "sheet") {
      state.sheet = node.dataset.sheet;
      paintModal();
    } else if (action === "course") {
      openCourse(node.dataset.id);
    } else if (action === "section") {
      state.gameText = "";
      go("section", { sectionId: node.dataset.id });
    } else if (action === "lesson") {
      go("lesson", { itemId: node.dataset.id });
    } else if (action === "pick-tariff") {
      state.tariffId = node.dataset.id;
      render();
    } else if (action === "copy") {
      try {
        await navigator.clipboard.writeText(node.dataset.text || "");
        toast("Скопировано");
      } catch {
        toast("Не удалось скопировать");
      }
    } else if (action === "send-pay") {
      await sendPayment();
    } else if (action === "support") {
      openSupport();
    } else if (action === "speed") {
      state.speed = Number(node.dataset.speed);
      const video = document.getElementById("lesson-video");
      if (video) video.playbackRate = state.speed;
      media.audio.playbackRate = state.speed;
      document.querySelectorAll("[data-speed]").forEach((button) => button.classList.toggle("on", Number(button.dataset.speed) === state.speed));
    } else if (action === "timer-toggle") {
      if (timer.running) pauseTimer();
      else {
        if (timer.left <= 0) prepareTimer(true);
        timer.running = true;
        clearInterval(timerHandle);
        timerHandle = setInterval(tick, 200);
      }
      paintTimer();
    } else if (action === "ambient" || action === "audio-toggle") {
      const { item } = currentLocation();
      const src = item?.type === "audio" && item.src ? item.src : "/api/media/ambient.wav";
      const same = media.lessonId === (item?.id || media.lessonId) && media.audio.src.includes(src.replace("/api/media/", ""));
      if (media.audio.paused || !same) {
        if (item) {
          media.audio.src = src;
          media.lessonId = item.id;
          media.title = item.title;
          setupSession(item.title);
        }
        media.audio.loop = true;
        media.audio.playbackRate = state.speed;
        await media.audio.play();
      } else {
        media.audio.pause();
      }
    } else if (action === "audio-stop") {
      stopAudio();
    } else if (action === "complete") {
      const { item } = currentLocation();
      state.local.diary.unshift({ id: uid(), date: isoDate(new Date()), title: item.title, count: item.count || item.steps?.length || 1, lessonId: item.id, courseId: state.courseId });
      saveLocal();
      pauseTimer();
      toast("Тренировка в дневнике");
      tab("diary");
    } else if (action === "repeat") {
      const entry = state.local.diary.find((item) => item.id === node.dataset.id);
      const found = entry?.lessonId ? findLesson(entry.lessonId) : null;
      if (found && !found.course.locked) go("lesson", { courseId: found.course.id, sectionId: found.section.id, itemId: found.item.id });
      else if (entry) {
        state.local.diary.unshift({ ...entry, id: uid(), date: isoDate(new Date()) });
        saveLocal();
        toast("Запись добавлена на сегодня");
        render();
      }
    } else if (action === "ask-delete") {
      state.confirm = node.dataset.id;
      state.sheet = "confirm";
      paintModal();
    } else if (action === "confirm-delete") {
      state.local.diary = state.local.diary.filter((item) => item.id !== state.confirm);
      saveLocal();
      state.sheet = null;
      render();
    } else if (action === "roll") {
      const { section } = currentLocation();
      const list = section?.[node.dataset.kind] || [];
      state.gameKind = node.dataset.kind;
      state.gameText = list[Math.floor(Math.random() * list.length)] || "";
      render();
    } else if (action === "roll-pose") {
      const poses = currentLocation().course?.sections?.find((item) => item.id === "poses")?.items || [];
      const pose = poses[Math.floor(Math.random() * poses.length)];
      if (pose) go("lesson", { sectionId: "poses", itemId: pose.id });
    } else if (action === "gender") {
      state.gender = node.dataset.gender;
      document.querySelectorAll("[data-gender]").forEach((button) => button.classList.toggle("on", button.dataset.gender === state.gender));
    } else if (action === "level") {
      state.user.level = node.dataset.level;
      await api("/api/me", { method: "PUT", body: { ...state.user, level: node.dataset.level } });
      render();
    } else if (action === "save-profile") {
      await saveProfile();
    } else if (action === "pick-avatar") {
      document.getElementById("avatar-file").click();
    } else if (action === "logout") {
      await api("/api/auth/logout", { method: "POST", body: {} });
      unlocked = false;
      state.user = null;
      stopAudio();
      state.route = "login";
      render();
    } else if (action === "change-pin") {
      state.pinStage = "old";
      state.afterPin = "security";
      state.pinInput = "";
      go("set-pin");
    } else if (action === "enable-bio") {
      await createBiometric();
      toast("Биометрия включена");
      render();
    } else if (action === "install") {
      if (window.deferredInstall) {
        window.deferredInstall.prompt();
        await window.deferredInstall.userChoice;
        window.deferredInstall = null;
      } else toast("В Chrome нажмите значок установки в адресной строке. На iPhone — «Поделиться».");
    } else if (action === "hide-install") {
      sessionStorage.setItem("gfit_hide_install", "1");
      render();
    } else if (action === "admin-login") {
      await api("/api/admin/login", { method: "POST", body: { password: document.getElementById("admin-pass").value } });
      await loadAdmin();
      render();
    } else if (action === "approve" || action === "reject") {
      await api(`/api/admin/requests/${node.dataset.id}/${action === "approve" ? "approve" : "reject"}`, { method: "POST", body: {} });
      await loadAdmin();
      toast(action === "approve" ? "Доступ открыт" : "Заявка отклонена");
      render();
    } else if (action === "grant") {
      await api("/api/admin/grant", { method: "POST", body: { email: document.getElementById("grant-email").value, courseId: document.getElementById("grant-course").value } });
      await loadAdmin();
      toast("Доступ открыт");
      render();
    } else if (action === "save-settings") {
      const body = {};
      ["holder", "bank", "kaspi", "card", "iin", "whatsapp", "adminPassword"].forEach((key) => {
        body[key] = document.getElementById(`set-${key}`).value;
      });
      await api("/api/admin/settings", { method: "PUT", body });
      await loadAdmin();
      toast("Реквизиты сохранены");
      render();
    } else if (action === "admin-out") {
      await api("/api/admin/logout", { method: "POST", body: {} });
      state.adminAuthed = false;
      render();
    }
  } catch (error) {
    toast(error.message || "Не получилось");
  }
}

function onSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const action = form.dataset.action;
  if (action === "login") login(document.getElementById("email").value.trim(), document.getElementById("password").value).catch((error) => toast(error.message));
  if (action === "register") {
    api("/api/auth/register", {
      method: "POST",
      body: {
        name: document.getElementById("r-name").value,
        email: document.getElementById("r-email").value,
        phone: document.getElementById("r-phone").value,
        password: document.getElementById("r-password").value
      }
    }).then((data) => {
      applyPayload(data);
      state.route = "set-pin";
      state.pinStage = "create";
      state.afterPin = "home";
      render();
    }).catch((error) => toast(error.message));
  }
  if (action === "save-steps") {
    const count = Number(document.getElementById("step-count").value || 0);
    state.local.steps[state.selectedDate] = count;
    state.local.stepGoal = Number(document.getElementById("step-goal").value || state.local.stepGoal);
    saveLocal();
    state.sheet = null;
    render();
  }
  if (action === "save-measure") {
    state.local.measures.push({
      id: uid(),
      date: document.getElementById("m-date").value || isoDate(new Date()),
      waist: document.getElementById("m-waist").value,
      hips: document.getElementById("m-hips").value,
      chest: document.getElementById("m-chest").value,
      leg: document.getElementById("m-leg").value,
      weight: document.getElementById("m-weight").value
    });
    saveLocal();
    state.sheet = null;
    toast("Замеры сохранены");
    render();
  }
  if (action === "save-diary") {
    state.local.diary.unshift({
      id: uid(),
      title: document.getElementById("d-title").value.trim() || "Заметка",
      count: Number(document.getElementById("d-count").value || 1),
      date: document.getElementById("d-date").value || isoDate(new Date())
    });
    saveLocal();
    state.sheet = null;
    render();
  }
  if (action === "reset-pin") {
    api("/api/auth/check", { method: "POST", body: { password: document.getElementById("forgot-pass").value } }).then(() => {
      localStorage.removeItem(pinStorageKey());
      state.sheet = null;
      state.pinStage = "create";
      state.pinInput = "";
      state.afterPin = "home";
      state.route = "set-pin";
      unlocked = false;
      render();
    }).catch((error) => toast(error.message));
  }
}

document.getElementById("chat").innerHTML = svg("chat");
document.body.addEventListener("click", onClick);
document.body.addEventListener("submit", onSubmit);
document.body.addEventListener("contextmenu", (event) => {
  if (state.user) event.preventDefault();
});
document.body.addEventListener("dragstart", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  if ((state.route === "lock" || state.route === "set-pin") && /^[0-9]$/.test(event.key)) pinKey(event.key);
  if ((state.route === "lock" || state.route === "set-pin") && event.key === "Backspace") pinKey("del");
  if (event.key === "PrintScreen") {
    showShield();
    navigator.clipboard.writeText("").catch(() => {});
    if (pinRecord()) {
      pendingRelock = true;
      state.routeBeforeLock = state.route;
      unlocked = false;
      state.route = "lock";
      state.pinInput = "";
      hideShield();
      render();
    }
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (unlocked && pinRecord()) {
      showShield();
      pendingRelock = true;
      if (state.route !== "lock") state.routeBeforeLock = state.route;
    }
    return;
  }
  hideShield();
  if (pendingRelock) {
    pendingRelock = false;
    unlocked = false;
    state.route = "lock";
    state.pinInput = "";
    state.afterPin = state.routeBeforeLock || "home";
    render();
  }
});
document.getElementById("app").addEventListener("change", async (event) => {
  if (event.target.id === "avatar-file" && event.target.files[0]) {
    try {
      state.user.avatar = await resizeImage(event.target.files[0], 480, 0.72);
      render();
    } catch (error) {
      toast(error.message);
    }
  }
  if (event.target.id === "receipt" && event.target.files[0]) {
    try {
      state.receipt = await resizeImage(event.target.files[0], 1000, 0.7);
      toast("Чек прикреплён");
    } catch (error) {
      toast(error.message);
    }
  }
});

media.audio.addEventListener("play", () => {
  media.playing = true;
  paintAudio();
  paintMini();
});
media.audio.addEventListener("pause", () => {
  media.playing = false;
  paintAudio();
  paintMini();
});
media.audio.addEventListener("timeupdate", paintAudio);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.deferredInstall = event;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function boot() {
  const today = isoDate(new Date());
  state.selectedDate = today;
  state.weekStart = mondayOf(today);
  if (location.hash === "#admin") {
    state.route = "admin";
    try { await loadAdmin(); } catch { state.adminAuthed = false; }
    render();
    return;
  }
  if (localStorage.getItem("gfit_18") !== "1") {
    state.route = "age";
    render();
    return;
  }
  state.route = "loading";
  render();
  try {
    applyPayload(await api("/api/me"));
    state.gender = state.user.gender || "f";
    state.afterPin = "home";
    if (!pinRecord()) {
      state.route = "set-pin";
      state.pinStage = "create";
    } else {
      state.route = "lock";
      unlocked = false;
    }
  } catch {
    state.route = "login";
  }
  render();
}

boot();
