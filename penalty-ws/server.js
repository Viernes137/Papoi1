const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");

const PORT = 3001;

const httpServer = http.createServer((req, res) => {
  const filePath = path.join(__dirname, "index.html");
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("index.html no encontrado"); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });

let gameState = {
  phase: "waiting",
  shooterChoice: null,
  goalkeeperChoice: null,
  scores: { shooter: 0, goalkeeper: 0 },
  round: 1,
  result: null,
};

const roles = new Map();
const clients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

function sendTo(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function getRolesSummary() {
  const vals = Array.from(roles.values());
  return {
    shooterConnected: vals.includes("shooter"),
    goalkeeperConnected: vals.includes("goalkeeper"),
  };
}

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Cliente conectado. Total:", clients.size);
  sendTo(ws, { type: "state", state: gameState, roles: getRolesSummary() });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "join") {
      const role = msg.role;
      const takenRoles = Array.from(roles.values());
      if (takenRoles.includes(role)) {
        sendTo(ws, { type: "error", message: `El rol ${role} ya esta ocupado` });
        return;
      }
      roles.set(ws, role);
      console.log(`Jugador unido como: ${role}`);
      const allRoles = Array.from(roles.values());
      if (allRoles.includes("shooter") && allRoles.includes("goalkeeper")) {
        gameState.phase = "shooter_ready";
        console.log("Ambos jugadores listos! Iniciando juego...");
      }
      broadcast({ type: "state", state: gameState, roles: getRolesSummary() });
    }

    if (msg.type === "shoot") {
      if (roles.get(ws) !== "shooter" || gameState.phase !== "shooter_ready") return;
      gameState.shooterChoice = msg.sector;
      gameState.phase = "shot_fired";
      broadcast({ type: "state", state: gameState, roles: getRolesSummary() });
    }

    if (msg.type === "save") {
      if (roles.get(ws) !== "goalkeeper" || gameState.phase !== "shot_fired") return;
      gameState.goalkeeperChoice = msg.sector;
      const isGoal = gameState.shooterChoice !== msg.sector;
      gameState.result = isGoal ? "goal" : "saved";
      if (isGoal) gameState.scores.shooter++;
      else gameState.scores.goalkeeper++;
      gameState.phase = "result";
      broadcast({ type: "state", state: gameState, roles: getRolesSummary() });
    }

    if (msg.type === "next_round") {
      gameState.phase = "shooter_ready";
      gameState.shooterChoice = null;
      gameState.goalkeeperChoice = null;
      gameState.result = null;
      gameState.round++;
      broadcast({ type: "state", state: gameState, roles: getRolesSummary() });
    }

    if (msg.type === "reset") {
      gameState = {
        phase: "waiting",
        shooterChoice: null,
        goalkeeperChoice: null,
        scores: { shooter: 0, goalkeeper: 0 },
        round: 1,
        result: null,
      };
      roles.clear();
      broadcast({ type: "state", state: gameState, roles: getRolesSummary() });
    }

    if (msg.type === "timeout_goal") {
  if (roles.get(ws) !== "goalkeeper" || gameState.phase !== "shot_fired") return;
  gameState.goalkeeperChoice = null;
  gameState.result = "goal";
  gameState.scores.shooter++;
  gameState.phase = "result";
  broadcast({ type: "state", state: gameState, roles: getRolesSummary() });
}

  });

  ws.on("close", () => {
    const role = roles.get(ws);
    roles.delete(ws);
    clients.delete(ws);
    console.log(`Cliente desconectado (era: ${role}). Total:`, clients.size);
    if (role) {
      gameState.phase = "waiting";
      gameState.shooterChoice = null;
      gameState.goalkeeperChoice = null;
      gameState.result = null;
      broadcast({ type: "state", state: gameState, roles: getRolesSummary() });
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`\n Servidor corriendo!`);
  console.log(` Abre en tu PC:    http://localhost:${PORT}`);
  console.log(` Abre en otra PC:  http://<tu-ip>:${PORT}`);
  console.log(`\n Para saber tu IP:   ip a | grep 192.168\n`);
});
