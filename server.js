import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import { fileURLToPath } from "url";
import { ACCESS_DAYS, COURSES, TARIFFS } from "./server/content.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function existingDir(name) {
  const options = [path.join(process.cwd(), name), path.join(__dirname, name)];
  return options.find((dir) => fs.existsSync(dir)) || options[0];
}

const PUBLIC = existingDir("public");
const MEDIA = existingDir("media");
const DB_PATH = path.join(process.env.VERCEL ? "/tmp" : __dirname, "data", "db.json");
const BLOB_PATH = "gfit/db.json";
const MEDIA_BLOB_PREFIX = "gfit/media/";
const useBlob = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const PORT = process.env.PORT || 3080;
const SCHEMA = 2;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon"
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const verify = crypto.scryptSync(password, salt, 32);
  const left = Buffer.from(hash, "hex");
  if (left.length !== verify.length) return false;
  return crypto.timingSafeEqual(left, verify);
}

function iso(date) {
  const d = date instanceof Date ? date : new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

function readFileDb() {
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function readBlobDb() {
  const { get } = await import("@vercel/blob");
  const file = await get(BLOB_PATH, { access: "private", useCache: false });
  if (!file || file.statusCode !== 200 || !file.stream) return null;
  return JSON.parse(await new Response(file.stream).text());
}

async function saveDb() {
  const payload = JSON.stringify(db);
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PATH, payload, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 0
    });
    return;
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, payload);
}

function cloneCourses() {
  return structuredClone(COURSES);
}

function cloneTariffs() {
  return structuredClone(TARIFFS);
}

function seed() {
  const today = iso(new Date());
  return {
    schema: SCHEMA,
    users: [
      {
        id: "u-gulnaz",
        name: "Гулназ",
        email: "zharbusinovag@gmail.com",
        phone: "+77786916878",
        birth: "2002-09-02",
        gender: "f",
        avatar: "",
        level: "profi",
        lang: "ru",
        password: hashPassword("gfit2026"),
        createdAt: today
      }
    ],
    access: [
      {
        email: "zharbusinovag@gmail.com",
        courseId: "intimate",
        status: "active",
        from: "2026-09-26",
        to: "2027-03-28",
        tariffId: "intimate-6m"
      }
    ],
    courses: cloneCourses(),
    tariffs: cloneTariffs(),
    requests: [],
    sessions: {},
    adminSessions: {},
    settings: {
      holder: "G-FIT",
      bank: "Kaspi Gold",
      kaspi: "+7 707 000 00 00",
      card: "4400 4300 1111 2222",
      iin: "000000000000",
      whatsapp: "77070000000",
      adminPassword: hashPassword("gfit-admin")
    }
  };
}

function normalizeLang(value) {
  return value === "kk" ? "kk" : "ru";
}

function itemLang(item) {
  return normalizeLang(item?.lang);
}

function migrate(loaded) {
  let dirty = false;
  if (!Array.isArray(loaded.courses) || !loaded.courses.length) {
    loaded.courses = cloneCourses();
    dirty = true;
  }
  if (!Array.isArray(loaded.tariffs) || !loaded.tariffs.length) {
    loaded.tariffs = cloneTariffs();
    dirty = true;
  }
  (loaded.users || []).forEach((user) => {
    if (user.lang !== "ru" && user.lang !== "kk") {
      user.lang = "ru";
      dirty = true;
    }
  });
  (loaded.courses || []).forEach((course) => {
    (course.sections || []).forEach((section) => {
      (section.items || []).forEach((item) => {
        if (item.lang !== "ru" && item.lang !== "kk") {
          item.lang = "ru";
          dirty = true;
        }
      });
    });
  });
  if (loaded.schema !== SCHEMA) {
    loaded.schema = SCHEMA;
    dirty = true;
  }
  return { data: loaded, dirty };
}

let db = seed();
let ready;

function ensureReady() {
  if (!ready) {
    ready = (async () => {
      let loaded = null;
      try {
        loaded = useBlob() ? await readBlobDb() : readFileDb();
      } catch (error) {
        console.error("Не удалось прочитать базу", error);
      }
      if (!loaded) {
        db = seed();
        await saveDb();
        return;
      }
      const migrated = migrate(loaded);
      db = migrated.data;
      if (migrated.dirty) await saveDb();
    })();
  }
  return ready;
}

function courseList() {
  return Array.isArray(db.courses) ? db.courses : [];
}

function tariffList() {
  return Array.isArray(db.tariffs) ? db.tariffs : [];
}

function findCourse(courseId) {
  return courseList().find((course) => course.id === courseId) || null;
}

function slugId(_title, prefix) {
  return uid(prefix);
}

function ensureVideosSection(course) {
  let section = (course.sections || []).find((item) => item.id === "videos");
  if (section) return section;
  section = (course.sections || []).find((item) => item.id === "lectures");
  if (section) return section;
  if (!Array.isArray(course.sections)) course.sections = [];
  section = { id: "videos", title: "Видеоуроки", icon: "video", items: [] };
  course.sections.unshift(section);
  return section;
}

function listVideos() {
  const rows = [];
  courseList().forEach((course) => {
    (course.sections || []).forEach((section) => {
      (section.items || []).forEach((item) => {
        if (item.type === "video") {
          rows.push({
            courseId: course.id,
            courseTitle: course.title,
            sectionId: section.id,
            sectionTitle: section.title,
            id: item.id,
            title: item.title,
            minutes: item.minutes,
            src: item.src
          });
        }
      });
    });
  });
  return rows;
}

function removeItem(courseId, itemId) {
  const course = findCourse(courseId);
  if (!course) return false;
  for (const section of course.sections || []) {
    const before = (section.items || []).length;
    section.items = (section.items || []).filter((item) => item.id !== itemId);
    if (section.items.length !== before) return true;
  }
  return false;
}

function removeVideo(courseId, itemId) {
  return removeItem(courseId, itemId);
}

function findSection(course, sectionId) {
  return (course.sections || []).find((section) => section.id === sectionId) || null;
}

function sectionFormKind(section) {
  if (!section) return "article";
  if (section.kind === "games") return "games";
  if (section.id === "recipes") return "recipe";
  if (section.id === "poses") return "pose";
  if (section.id === "meditations") return "audio";
  if (section.id === "videos" || section.id === "lectures" || section.id === "workouts") return "video";
  return "article";
}

function safeMediaName(name, contentType = "") {
  const raw = path.basename(String(name || "file.bin"));
  let ext = (path.extname(raw) || "").toLowerCase().replace(/[^\w.]/g, "");
  if (!ext) {
    if (contentType.includes("png")) ext = ".png";
    else if (contentType.includes("webp")) ext = ".webp";
    else if (contentType.includes("gif")) ext = ".gif";
    else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = ".jpg";
    else if (contentType.includes("webm")) ext = ".webm";
    else if (contentType.includes("quicktime")) ext = ".mov";
    else if (contentType.startsWith("image/")) ext = ".jpg";
    else ext = ".mp4";
  }
  const allowed = [".mp4", ".webm", ".mov", ".m4v", ".jpg", ".jpeg", ".png", ".webp", ".gif"];
  const finalExt = allowed.includes(ext) ? ext : (contentType.startsWith("image/") ? ".jpg" : ".mp4");
  return `${Date.now()}-${crypto.randomBytes(3).toString("hex")}${finalExt}`;
}

function normalizeImageSrc(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/") && raw.length < 1_800_000) return raw;
  if (raw.startsWith("/api/media/") || /^https?:\/\//i.test(raw)) return raw;
  return "";
}

function attachOptionalMedia(item, body) {
  const image = normalizeImageSrc(body.image);
  if (image) item.image = image;
  if (body.src) {
    const media = normalizeVideoSrc(body.src);
    if (media) {
      item.src = media.src;
      item.provider = media.provider;
      if (media.youtubeId) item.youtubeId = media.youtubeId;
    }
  }
  return item;
}

function youtubeId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      return (url.pathname.split("/").filter(Boolean)[0] || "").slice(0, 11);
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live", "v"].includes(parts[0]) && /^[\w-]{11}$/.test(parts[1] || "")) {
        return parts[1];
      }
    }
  } catch {
    return "";
  }
  return "";
}

function normalizeVideoSrc(input) {
  const raw = String(input || "").trim();
  const yt = youtubeId(raw);
  if (yt) {
    return {
      src: `https://www.youtube.com/watch?v=${yt}`,
      provider: "youtube",
      youtubeId: yt
    };
  }
  if (raw.startsWith("/api/media/") || /^https?:\/\//i.test(raw)) {
    return { src: raw, provider: "file" };
  }
  return null;
}

function readRawBody(req, limit = 45_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Файл слишком большой"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function storeMediaFile(fileName, buffer, contentType) {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${MEDIA_BLOB_PREFIX}${fileName}`, buffer, {
      access: "public",
      contentType: contentType || "video/mp4",
      addRandomSuffix: false,
      allowOverwrite: true
    });
    return blob.url;
  }
  fs.mkdirSync(MEDIA, { recursive: true });
  fs.writeFileSync(path.join(MEDIA, fileName), buffer);
  return `/api/media/${fileName}`;
}

function uid(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function cookieToken(req, name) {
  const raw = req.headers.cookie || "";
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function userFrom(req) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = bearer || cookieToken(req, "gfit");
  const session = db.sessions[token];
  if (!session || session.exp < Date.now()) return null;
  const user = db.users.find((item) => item.email === session.email);
  return user ? { token, user } : null;
}

function adminFrom(req) {
  const token = cookieToken(req, "gfit_admin");
  const session = db.adminSessions[token];
  if (!session || session.exp < Date.now()) return null;
  return { token };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    birth: user.birth,
    gender: user.gender,
    avatar: user.avatar,
    level: user.level,
    lang: normalizeLang(user.lang)
  };
}

function billing() {
  const { holder, bank, kaspi, card, iin, whatsapp } = db.settings;
  return { holder, bank, kaspi, card, iin, whatsapp };
}

function alive(record, today = iso(new Date())) {
  return record.status === "active" && (!record.to || record.to >= today);
}

function hasCourse(email, courseId) {
  return db.access.some((record) => {
    if (record.email !== email || !alive(record)) return false;
    return record.courseId === courseId || record.courseId === "both";
  });
}

function filterCourseByLang(course, lang) {
  const wanted = normalizeLang(lang);
  return {
    ...course,
    sections: (course.sections || []).map((section) => {
      if (section.kind === "games") return { ...section };
      return {
        ...section,
        items: (section.items || []).filter((item) => itemLang(item) === wanted)
      };
    })
  };
}

function viewCourse(course, open, lang = "ru") {
  const filtered = filterCourseByLang(course, lang);
  if (!open) {
    return {
      id: filtered.id,
      title: filtered.title,
      subtitle: filtered.subtitle,
      badge: filtered.badge,
      locked: true,
      sections: filtered.sections.map((section) => ({
        id: section.id,
        title: section.title,
        icon: section.icon,
        kind: section.kind || "list"
      }))
    };
  }
  return { ...filtered, locked: false };
}

function catalogFor(email, lang = "ru") {
  return courseList().map((course) => viewCourse(course, hasCourse(email, course.id), lang));
}

function accessFor(email) {
  return db.access.filter((record) => record.email === email);
}

function requestsFor(email) {
  return db.requests
    .filter((record) => record.email === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mePayload(user) {
  return {
    user: publicUser(user),
    access: accessFor(user.email),
    requests: requestsFor(user.email),
    billing: billing(),
    tariffs: tariffList(),
    catalog: catalogFor(user.email, user.lang)
  };
}

function adminPayload() {
  return {
    requests: db.requests,
    settings: billing(),
    users: db.users.map(publicUser),
    access: db.access,
    courses: courseList().map((course) => ({
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      badge: course.badge,
      sections: (course.sections || []).map((section) => ({
        id: section.id,
        title: section.title,
        icon: section.icon,
        kind: section.kind || "list",
        items: section.kind === "games"
          ? []
          : (section.items || []).map((item) => ({
              id: item.id,
              type: item.type,
              title: item.title,
              minutes: item.minutes,
              time: item.time || "",
              lang: itemLang(item),
              image: item.image || "",
              src: item.src || "",
              provider: item.provider || "",
              youtubeId: item.youtubeId || ""
            }))
      }))
    })),
    tariffs: tariffList(),
    videos: listVideos()
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 3_000_000) {
        reject(new Error("Файл слишком большой"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Некорректные данные"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(body);
}

function setSessionCookie(res, name, token) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function createUserSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  db.sessions[token] = { email: user.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  await saveDb();
  return token;
}

function grant(email, courseId, tariffId) {
  const from = iso(new Date());
  const to = addDays(from, ACCESS_DAYS);
  const current = db.access.find((record) => record.email === email && record.courseId === courseId);
  if (current) {
    current.status = "active";
    current.from = current.to && current.to > from ? current.from : from;
    current.to = current.to && current.to > from ? addDays(current.to, ACCESS_DAYS) : to;
    current.tariffId = tariffId || current.tariffId;
  } else {
    db.access.push({ email, courseId, status: "active", from, to, tariffId: tariffId || "" });
  }
}

function cleanAvatar(value) {
  if (!value) return "";
  if (typeof value !== "string" || !value.startsWith("data:image/") || value.length > 220000) return null;
  return value;
}

function writeWav(file) {
  const sampleRate = 22050;
  const seconds = 12;
  const count = sampleRate * seconds;
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const env = Math.min(1, i / 1500, (count - i) / 1500);
    const sample = Math.sin(2 * Math.PI * 196 * t) * 0.08
      + Math.sin(2 * Math.PI * 247 * t) * 0.05
      + Math.sin(2 * Math.PI * 294 * t) * 0.03
      + Math.sin(2 * Math.PI * 0.08 * t) * 0.02;
    data.writeInt16LE(Math.max(-1, Math.min(1, sample * env)) * 32767, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

function ensureMedia() {
  try {
    fs.mkdirSync(MEDIA, { recursive: true });
    const wav = path.join(MEDIA, "ambient.wav");
    if (!fs.existsSync(wav)) writeWav(wav);
  } catch (error) {
    console.error("Медиа уже входит в сборку", error.message);
  }
}

function endBody(res, status, body, headers) {
  res.status(status);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  if (res.req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

function streamFile(req, res, file, type) {
  const data = fs.readFileSync(file);
  const range = req.headers.range;
  if (!range) {
    endBody(res, 200, data, {
      "Content-Type": type,
      "Content-Length": data.length,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600"
    });
    return;
  }
  const match = String(range).match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    res.status(416).end();
    return;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : data.length - 1;
  if (start >= data.length || end >= data.length || start > end) {
    res.status(416).end();
    return;
  }
  const slice = data.subarray(start, end + 1);
  endBody(res, 206, slice, {
    "Content-Type": type,
    "Content-Length": slice.length,
    "Content-Range": `bytes ${start}-${end}/${data.length}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600"
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  try {
    await ensureReady();
    if (req.method === "POST" && pathname === "/api/auth/register") {
      const body = await readBody(req);
      const name = String(body.name || "").trim().slice(0, 60);
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim().slice(0, 24);
      const password = String(body.password || "");
      if (!name || !email.includes("@") || password.length < 6) {
        return send(res, 400, { error: "Укажите имя, почту и пароль от 6 символов" });
      }
      if (db.users.some((item) => item.email === email)) {
        return send(res, 409, { error: "Такая почта уже зарегистрирована" });
      }
      const user = {
        id: uid("u"),
        name,
        email,
        phone,
        birth: "",
        gender: "f",
        avatar: "",
        level: "novice",
        lang: "ru",
        password: hashPassword(password),
        createdAt: iso(new Date())
      };
      db.users.push(user);
      const token = await createUserSession(user);
      return send(res, 200, { token, ...mePayload(user) }, { "Set-Cookie": setSessionCookie(res, "gfit", token) });
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const user = db.users.find((item) => item.email === email);
      if (!user || !verifyPassword(String(body.password || ""), user.password)) {
        return send(res, 401, { error: "Неверная почта или пароль" });
      }
      const token = await createUserSession(user);
      return send(res, 200, { token, ...mePayload(user) }, { "Set-Cookie": setSessionCookie(res, "gfit", token) });
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const auth = userFrom(req);
      if (auth) delete db.sessions[auth.token];
      await saveDb();
      return send(res, 200, { ok: true }, { "Set-Cookie": clearCookie("gfit") });
    }

    if (req.method === "GET" && pathname === "/api/me") {
      const auth = userFrom(req);
      if (!auth) return send(res, 401, { error: "Нужен вход" });
      return send(res, 200, mePayload(auth.user));
    }

    if (req.method === "PUT" && pathname === "/api/me") {
      const auth = userFrom(req);
      if (!auth) return send(res, 401, { error: "Нужен вход" });
      const body = await readBody(req);
      const user = auth.user;
      const nextEmail = String(body.email || user.email).trim().toLowerCase();
      if (!nextEmail.includes("@")) return send(res, 400, { error: "Проверьте почту" });
      if (nextEmail !== user.email && db.users.some((item) => item.email === nextEmail)) {
        return send(res, 409, { error: "Эта почта уже занята" });
      }
      const avatar = body.avatar === undefined ? user.avatar : cleanAvatar(body.avatar);
      if (avatar === null) return send(res, 400, { error: "Фото слишком большое" });
      const prevEmail = user.email;
      user.name = String(body.name || user.name).trim().slice(0, 60);
      user.phone = String(body.phone ?? user.phone).trim().slice(0, 24);
      user.birth = String(body.birth ?? user.birth).slice(0, 10);
      user.gender = body.gender === "m" ? "m" : "f";
      user.level = body.level === "novice" ? "novice" : "profi";
      if (body.lang !== undefined) user.lang = normalizeLang(body.lang);
      user.avatar = avatar;
      user.email = nextEmail;
      if (prevEmail !== nextEmail) {
        db.access.forEach((record) => {
          if (record.email === prevEmail) record.email = nextEmail;
        });
        db.requests.forEach((record) => {
          if (record.email === prevEmail) record.email = nextEmail;
        });
        Object.values(db.sessions).forEach((session) => {
          if (session.email === prevEmail) session.email = nextEmail;
        });
      }
      await saveDb();
      return send(res, 200, mePayload(user));
    }

    if (req.method === "POST" && pathname === "/api/auth/check") {
      const auth = userFrom(req);
      if (!auth) return send(res, 401, { error: "Нужен вход" });
      const body = await readBody(req);
      if (!verifyPassword(String(body.password || ""), auth.user.password)) {
        return send(res, 401, { error: "Неверный пароль" });
      }
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && pathname === "/api/payments") {
      const auth = userFrom(req);
      if (!auth) return send(res, 401, { error: "Нужен вход" });
      const body = await readBody(req);
      const tariff = tariffList().find((item) => item.id === body.tariffId);
      if (!tariff) return send(res, 404, { error: "Тариф не найден" });
      const pending = db.requests.find((item) => item.email === auth.user.email && item.tariffId === tariff.id && item.status === "pending");
      if (pending) return send(res, 200, { request: pending, duplicate: true, ...mePayload(auth.user) });
      let receipt = "";
      if (typeof body.receipt === "string" && body.receipt.startsWith("data:image/") && body.receipt.length < 1_500_000) {
        receipt = body.receipt;
      }
      const request = {
        id: uid("pay"),
        email: auth.user.email,
        name: auth.user.name,
        phone: auth.user.phone,
        tariffId: tariff.id,
        tariffTitle: tariff.title,
        courseId: tariff.courseId,
        amount: tariff.price,
        note: String(body.note || "").slice(0, 500),
        receipt,
        status: "pending",
        createdAt: new Date().toISOString()
      };
      db.requests.unshift(request);
      await saveDb();
      return send(res, 200, { request, ...mePayload(auth.user) });
    }

    if (pathname.startsWith("/api/media/")) {
      const auth = userFrom(req);
      if (!auth) return send(res, 401, { error: "Нужен вход" });
      const open = db.access.some((record) => record.email === auth.user.email && alive(record));
      if (!open) return send(res, 403, { error: "Нет доступа к материалам" });
      const fileName = path.basename(pathname);
      const file = path.join(MEDIA, fileName);
      const lower = fileName.toLowerCase();
      const type = lower.endsWith(".wav")
        ? "audio/wav"
        : lower.endsWith(".png")
          ? "image/png"
          : lower.endsWith(".webp")
            ? "image/webp"
            : lower.endsWith(".gif")
              ? "image/gif"
              : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                ? "image/jpeg"
                : lower.endsWith(".webm")
                  ? "video/webm"
                  : "video/mp4";
      if (file.startsWith(MEDIA) && fs.existsSync(file)) {
        return streamFile(req, res, file, type);
      }
      if (useBlob()) {
        try {
          const { get } = await import("@vercel/blob");
          const remote = await get(`${MEDIA_BLOB_PREFIX}${fileName}`, { access: "private", useCache: false });
          if (remote?.statusCode === 200 && remote.stream) {
            const data = Buffer.from(await new Response(remote.stream).arrayBuffer());
            return endBody(res, 200, data, {
              "Content-Type": type,
              "Content-Length": data.length,
              "Accept-Ranges": "bytes",
              "Cache-Control": "private, max-age=3600"
            });
          }
        } catch (error) {
          console.error("Медиа из Blob", error.message);
        }
      }
      return send(res, 404, { error: "Файл не найден" });
    }

    if (req.method === "POST" && pathname === "/api/admin/login") {
      const body = await readBody(req);
      if (!verifyPassword(String(body.password || ""), db.settings.adminPassword)) {
        return send(res, 401, { error: "Неверный пароль администратора" });
      }
      const token = crypto.randomBytes(24).toString("hex");
      db.adminSessions[token] = { exp: Date.now() + 1000 * 60 * 60 * 12 };
      await saveDb();
      return send(res, 200, { ok: true }, { "Set-Cookie": setSessionCookie(res, "gfit_admin", token) });
    }

    if (req.method === "POST" && pathname === "/api/admin/logout") {
      const admin = adminFrom(req);
      if (admin) delete db.adminSessions[admin.token];
      await saveDb();
      return send(res, 200, { ok: true }, { "Set-Cookie": clearCookie("gfit_admin") });
    }

    if (pathname.startsWith("/api/admin/") || pathname === "/api/admin") {
      if (!adminFrom(req)) return send(res, 401, { error: "Нужен вход администратора" });
    }

    if (req.method === "GET" && pathname === "/api/admin/requests") {
      return send(res, 200, adminPayload());
    }

    if (req.method === "POST" && pathname.startsWith("/api/admin/requests/") && pathname.endsWith("/approve")) {
      const id = pathname.split("/")[4];
      const request = db.requests.find((item) => item.id === id);
      if (!request) return send(res, 404, { error: "Заявка не найдена" });
      request.status = "approved";
      grant(request.email, request.courseId, request.tariffId);
      await saveDb();
      return send(res, 200, { ok: true, ...adminPayload() });
    }

    if (req.method === "POST" && pathname.startsWith("/api/admin/requests/") && pathname.endsWith("/reject")) {
      const id = pathname.split("/")[4];
      const request = db.requests.find((item) => item.id === id);
      if (!request) return send(res, 404, { error: "Заявка не найдена" });
      request.status = "rejected";
      await saveDb();
      return send(res, 200, { ok: true, ...adminPayload() });
    }

    if (req.method === "POST" && pathname === "/api/admin/grant") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const courseId = body.courseId === "both" || findCourse(body.courseId) ? body.courseId : "";
      const user = db.users.find((item) => item.email === email);
      if (!user || !courseId) return send(res, 400, { error: "Проверьте почту и курс" });
      grant(email, courseId, "manual");
      await saveDb();
      return send(res, 200, { ok: true, ...adminPayload() });
    }

    if (req.method === "POST" && pathname === "/api/admin/courses") {
      const body = await readBody(req);
      const title = String(body.title || "").trim().slice(0, 80);
      const subtitle = String(body.subtitle || "").trim().slice(0, 160);
      const badge = String(body.badge || "Новый").trim().slice(0, 40) || "Новый";
      const price = Math.max(0, Math.round(Number(body.price) || 0));
      if (!title) return send(res, 400, { error: "Укажите название курса" });
      const id = slugId(title, "course");
      const course = {
        id,
        title,
        subtitle: subtitle || "Новый курс G-FIT",
        badge,
        sections: [{ id: "videos", title: "Видеоуроки", icon: "video", items: [] }]
      };
      db.courses.push(course);
      db.tariffs.push({
        id: `${id}-6m`,
        courseId: id,
        title,
        period: "6 месяцев",
        price,
        text: subtitle || "Доступ к курсу на 6 месяцев."
      });
      await saveDb();
      return send(res, 200, { ok: true, course, ...adminPayload() });
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/admin/courses/")) {
      const id = pathname.split("/")[4];
      if (!findCourse(id)) return send(res, 404, { error: "Курс не найден" });
      db.courses = courseList().filter((course) => course.id !== id);
      db.tariffs = tariffList().filter((tariff) => tariff.courseId !== id);
      await saveDb();
      return send(res, 200, { ok: true, ...adminPayload() });
    }

    if (req.method === "POST" && pathname === "/api/admin/videos") {
      const body = await readBody(req);
      const course = findCourse(body.courseId);
      if (!course) return send(res, 404, { error: "Курс не найден" });
      const title = String(body.title || "").trim().slice(0, 120);
      const minutes = Math.max(1, Math.round(Number(body.minutes) || 5));
      const text = String(body.text || "").trim().slice(0, 2000);
      if (!title) return send(res, 400, { error: "Укажите название видео" });
      const media = normalizeVideoSrc(body.src);
      if (!media) {
        return send(res, 400, { error: "Нужна ссылка YouTube, mp4 или загруженный файл" });
      }
      const section = (body.sectionId && findSection(course, body.sectionId)) || ensureVideosSection(course);
      if (!Array.isArray(section.items)) section.items = [];
      const item = {
        id: uid("v"),
        type: "video",
        title,
        minutes,
        count: 1,
        lang: normalizeLang(body.lang),
        src: media.src,
        provider: media.provider,
        ...(media.youtubeId ? { youtubeId: media.youtubeId } : {}),
        paragraphs: text ? text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 12) : []
      };
      section.items.push(item);
      await saveDb();
      return send(res, 200, { ok: true, item, ...adminPayload() });
    }

    if (req.method === "POST" && pathname === "/api/admin/items") {
      const body = await readBody(req);
      const course = findCourse(body.courseId);
      if (!course) return send(res, 404, { error: "Курс не найден" });
      const section = findSection(course, body.sectionId);
      if (!section || section.kind === "games") {
        return send(res, 400, { error: "Выберите раздел курса" });
      }
      if (!Array.isArray(section.items)) section.items = [];
      const title = String(body.title || "").trim().slice(0, 120);
      if (!title) return send(res, 400, { error: "Укажите название" });
      const kind = String(body.type || sectionFormKind(section));
      const lang = normalizeLang(body.lang);
      let item = null;
      if (kind === "video") {
        const media = normalizeVideoSrc(body.src);
        if (!media) return send(res, 400, { error: "Нужна ссылка YouTube, mp4 или файл" });
        const text = String(body.text || "").trim().slice(0, 2000);
        item = {
          id: uid("v"),
          type: "video",
          title,
          minutes: Math.max(1, Math.round(Number(body.minutes) || 5)),
          count: 1,
          lang,
          src: media.src,
          provider: media.provider,
          ...(media.youtubeId ? { youtubeId: media.youtubeId } : {}),
          paragraphs: text ? text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 12) : []
        };
        attachOptionalMedia(item, { image: body.image });
      } else if (kind === "recipe") {
        item = {
          id: uid("r"),
          type: "recipe",
          title,
          lang,
          time: String(body.time || "").trim().slice(0, 40) || "15 минут",
          ingredients: String(body.ingredients || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 30),
          steps: String(body.steps || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 30)
        };
        attachOptionalMedia(item, body);
      } else if (kind === "pose") {
        item = {
          id: uid("p"),
          type: "pose",
          title,
          lang,
          level: String(body.level || "Мягко").trim().slice(0, 40),
          summary: String(body.summary || body.text || "").trim().slice(0, 800),
          tips: String(body.tips || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 12)
        };
        attachOptionalMedia(item, body);
      } else if (kind === "audio") {
        const text = String(body.text || "").trim().slice(0, 2000);
        item = {
          id: uid("a"),
          type: "audio",
          title,
          lang,
          minutes: Math.max(1, Math.round(Number(body.minutes) || 5)),
          src: String(body.audio || body.src || "/api/media/ambient.wav").trim() || "/api/media/ambient.wav",
          intro: String(body.intro || "").trim().slice(0, 300),
          paragraphs: text ? text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 12) : []
        };
        const image = normalizeImageSrc(body.image);
        if (image) item.image = image;
        const video = normalizeVideoSrc(body.video || body.videoSrc || "");
        if (video) {
          item.videoSrc = video.src;
          item.videoProvider = video.provider;
          if (video.youtubeId) item.youtubeId = video.youtubeId;
        }
      } else {
        const text = String(body.text || "").trim().slice(0, 4000);
        item = {
          id: uid("t"),
          type: "article",
          title,
          lang,
          minutes: Math.max(1, Math.round(Number(body.minutes) || 3)),
          paragraphs: text ? text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 20) : []
        };
        attachOptionalMedia(item, body);
      }
      section.items.push(item);
      await saveDb();
      return send(res, 200, { ok: true, item, ...adminPayload() });
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/admin/videos/")) {
      const parts = pathname.split("/");
      const courseId = parts[4];
      const itemId = parts[5];
      if (!courseId || !itemId || !removeItem(courseId, itemId)) {
        return send(res, 404, { error: "Материал не найден" });
      }
      await saveDb();
      return send(res, 200, { ok: true, ...adminPayload() });
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/admin/items/")) {
      const parts = pathname.split("/");
      const courseId = parts[4];
      const itemId = parts[5];
      if (!courseId || !itemId || !removeItem(courseId, itemId)) {
        return send(res, 404, { error: "Материал не найден" });
      }
      await saveDb();
      return send(res, 200, { ok: true, ...adminPayload() });
    }

    if (req.method === "POST" && pathname === "/api/admin/upload") {
      const buffer = await readRawBody(req);
      if (!buffer.length) return send(res, 400, { error: "Пустой файл" });
      const contentType = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim();
      const fileName = safeMediaName(req.headers["x-filename"] || "file.bin", contentType);
      const src = await storeMediaFile(fileName, buffer, contentType);
      return send(res, 200, { ok: true, src, fileName });
    }

    if (req.method === "PUT" && pathname === "/api/admin/settings") {
      const body = await readBody(req);
      const fields = ["holder", "bank", "kaspi", "card", "iin", "whatsapp"];
      fields.forEach((field) => {
        if (body[field] !== undefined) db.settings[field] = String(body[field]).trim().slice(0, 80);
      });
      if (body.adminPassword && String(body.adminPassword).length >= 6) {
        db.settings.adminPassword = hashPassword(String(body.adminPassword));
      }
      await saveDb();
      return send(res, 200, { ok: true, settings: billing(), ...adminPayload() });
    }

    return send(res, 404, { error: "Не найдено" });
  } catch (error) {
    return send(res, 400, { error: error.message || "Ошибка" });
  }
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const relative = pathname.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, relative));
  const root = path.normalize(PUBLIC);
  if (!file.startsWith(root)) {
    res.status(403).end("Forbidden");
    return;
  }
  const target = fs.existsSync(file) && fs.statSync(file).isFile()
    ? file
    : path.join(PUBLIC, "index.html");
  if (!fs.existsSync(target)) {
    res.status(404).type("text").end("Not found");
    return;
  }
  const ext = path.extname(target).toLowerCase();
  const body = fs.readFileSync(target);
  endBody(res, 200, body, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": body.length,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300"
  });
}

ensureMedia();

const app = express();
app.use(async (req, res) => {
  const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  serveStatic(req, res, url);
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`G-FIT http://localhost:${PORT}`);
  });
}
