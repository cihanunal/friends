const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");

const root = __dirname;
const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const data = loadData();

function loadData() {
  const script = fs.readFileSync(path.join(root, "data", "friends-data.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(script, context);
  return context.window.FRIENDS_DATA || { Episodes: [] };
}

function publicRoom(room) {
  return {
    code: room.code,
    round: room.round,
    episodeId: room.episodeId,
    lineId: room.lineId,
    options: room.options,
    correctAnswer: room.correctAnswer,
    revealed: room.revealed,
    answers: room.answers,
    players: room.players,
    feedback: room.feedback,
    updatedAt: room.updatedAt,
  };
}

function createRoom(name, episodeId) {
  const code = makeCode();
  const room = {
    code,
    episodeId,
    round: 0,
    lineId: "",
    options: [],
    correctAnswer: "",
    revealed: false,
    answers: {},
    players: {},
    feedback: "",
    updatedAt: Date.now(),
  };
  rooms.set(code, room);
  addPlayer(room, name);
  nextRound(room, episodeId);
  return room;
}

function addPlayer(room, name) {
  if (!room.players[name]) {
    room.players[name] = { name, score: 0, joinedAt: Date.now() };
  }
  room.updatedAt = Date.now();
}

function nextRound(room, episodeId) {
  if (episodeId) room.episodeId = episodeId;
  const pool = getPool(room.episodeId);
  const line = pick(pool);
  if (!line) return;
  room.round += 1;
  room.lineId = line.Id;
  room.correctAnswer = line.Turkish;
  room.options = makeOptions(line, pool);
  room.answers = {};
  room.revealed = false;
  room.feedback = "";
  room.updatedAt = Date.now();
}

function answer(room, name, value) {
  addPlayer(room, name);
  if (room.answers[name]) return;
  room.answers[name] = value;
  if (value === room.correctAnswer) {
    room.players[name].score += 10;
  }
  const playerCount = Object.keys(room.players).length;
  const answerCount = Object.keys(room.answers).length;
  if (answerCount >= Math.max(1, playerCount)) {
    room.revealed = true;
    const winners = Object.keys(room.answers).filter((playerName) => room.answers[playerName] === room.correctAnswer);
    room.feedback = winners.length ? `${winners.join(", ")} +10` : "Dogru cevap yesil";
  }
  room.updatedAt = Date.now();
}

function getPool(episodeId) {
  const episode = (data.Episodes || []).find((item) => item.Id === episodeId) || (data.Episodes || [])[0];
  const local = (episode?.Lines || []).filter((line) => line.English && line.Turkish);
  if (local.length >= 4) return local;
  return (data.Episodes || []).flatMap((item) => item.Lines || []).filter((line) => line.English && line.Turkish);
}

function makeOptions(line, pool) {
  const options = [line.Turkish];
  for (const item of shuffle(pool.filter((candidate) => candidate.Id !== line.Id))) {
    if (options.length >= 4) break;
    if (item.Turkish && !options.includes(item.Turkish)) options.push(item.Turkish);
  }
  return shuffle(options);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24) || "Oyuncu";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(json);
}

function sendText(res, status, text) {
  res.writeHead(status, { ...corsHeaders(), "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  const resolved = path.resolve(root, `.${filePath}`);
  if (!resolved.startsWith(root)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  fs.readFile(resolved, (error, buffer) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".png": "image/png",
      ".txt": "text/plain; charset=utf-8",
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(buffer);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, rooms: rooms.size, episodes: data.TotalEpisodes || 0 });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/room/create") {
      const body = await readJson(req);
      const room = createRoom(cleanName(body.name), body.episodeId);
      sendJson(res, 200, { room: publicRoom(room) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/room/join") {
      const body = await readJson(req);
      const code = String(body.roomCode || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendJson(res, 404, { error: "Room not found" });
        return;
      }
      addPlayer(room, cleanName(body.name));
      sendJson(res, 200, { room: publicRoom(room) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/room/next") {
      const body = await readJson(req);
      const room = rooms.get(String(body.roomCode || "").trim().toUpperCase());
      if (!room) {
        sendJson(res, 404, { error: "Room not found" });
        return;
      }
      addPlayer(room, cleanName(body.name));
      nextRound(room, body.episodeId);
      sendJson(res, 200, { room: publicRoom(room) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/room/answer") {
      const body = await readJson(req);
      const room = rooms.get(String(body.roomCode || "").trim().toUpperCase());
      if (!room) {
        sendJson(res, 404, { error: "Room not found" });
        return;
      }
      answer(room, cleanName(body.name), String(body.answer || ""));
      sendJson(res, 200, { room: publicRoom(room) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/room/state") {
      const room = rooms.get(String(url.searchParams.get("room") || "").trim().toUpperCase());
      if (!room) {
        sendJson(res, 404, { error: "Room not found" });
        return;
      }
      const name = cleanName(url.searchParams.get("name"));
      if (name) addPlayer(room, name);
      sendJson(res, 200, { room: publicRoom(room) });
      return;
    }
    sendJson(res, 404, { error: "Unknown API" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || String(error) });
  }
}

function localAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries || []) {
      if (item.family === "IPv4" && !item.internal) addresses.push(item.address);
    }
  }
  return addresses;
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (req.url.startsWith("/api/")) {
      handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  });
}

if (require.main === module) {
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`Friends English Arena: http://localhost:${port}`);
    for (const address of localAddresses()) {
      console.log(`Phone URL: http://${address}:${port}`);
    }
  });
}

module.exports = { createServer };
