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
const useBlob = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const PORT = process.env.PORT || 3080;
const SCHEMA = 1;

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
      if (!loaded || loaded.schema !== SCHEMA) {
        db = seed();
        await saveDb();
        return;
      }
      db = loaded;
    })();
  }
  return ready;
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
    level: user.level
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

function viewCourse(course, open) {
  if (!open) {
    return {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      badge: course.badge,
      locked: true,
      sections: course.sections.map((section) => ({
        id: section.id,
        title: section.title,
        icon: section.icon,
        kind: section.kind || "list"
      }))
    };
  }
  return { ...course, locked: false };
}

function catalogFor(email) {
  return COURSES.map((course) => viewCourse(course, hasCourse(email, course.id)));
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
    tariffs: TARIFFS,
    catalog: catalogFor(user.email)
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
      const tariff = TARIFFS.find((item) => item.id === body.tariffId);
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
      if (!file.startsWith(MEDIA) || !fs.existsSync(file)) return send(res, 404, { error: "Файл не найден" });
      const type = fileName.endsWith(".mp4") ? "video/mp4" : "audio/wav";
      return streamFile(req, res, file, type);
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
      return send(res, 200, {
        requests: db.requests,
        settings: billing(),
        users: db.users.map(publicUser),
        access: db.access
      });
    }

    if (req.method === "POST" && pathname.startsWith("/api/admin/requests/") && pathname.endsWith("/approve")) {
      const id = pathname.split("/")[4];
      const request = db.requests.find((item) => item.id === id);
      if (!request) return send(res, 404, { error: "Заявка не найдена" });
      request.status = "approved";
      grant(request.email, request.courseId, request.tariffId);
      await saveDb();
      return send(res, 200, { ok: true, requests: db.requests, access: db.access });
    }

    if (req.method === "POST" && pathname.startsWith("/api/admin/requests/") && pathname.endsWith("/reject")) {
      const id = pathname.split("/")[4];
      const request = db.requests.find((item) => item.id === id);
      if (!request) return send(res, 404, { error: "Заявка не найдена" });
      request.status = "rejected";
      await saveDb();
      return send(res, 200, { ok: true, requests: db.requests });
    }

    if (req.method === "POST" && pathname === "/api/admin/grant") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const courseId = ["intimate", "kamasutra", "both"].includes(body.courseId) ? body.courseId : "";
      const user = db.users.find((item) => item.email === email);
      if (!user || !courseId) return send(res, 400, { error: "Проверьте почту и курс" });
      grant(email, courseId, "manual");
      await saveDb();
      return send(res, 200, { ok: true, access: db.access });
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
      return send(res, 200, { ok: true, settings: billing() });
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
