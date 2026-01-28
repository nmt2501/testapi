const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

/* ================== API GỐC ================== */
const API_TX  = "https://lc79md5.vercel.app/lc79/tx";
const API_MD5 = "https://lc79md5.vercel.app/lc79/md5";

/* ================== BIẾN ================== */
let historyTX = [];
let historyMD5 = [];

let lastTX = null;
let lastMD5 = null;
let lastPhienTX = null;
let lastPhienMD5 = null;

const MAX_HISTORY = 80;

/* ================== TOOL ================== */
const toTX = kq => (kq === "Tài" ? "T" : "X");

/* ================== PATTERN TX ================== */
const TX_FOLLOW = [
  "TTXX", "XXTT",
  "TTTXXX", "XXXTTT",
  "TTTTXXXX", "XXXXTTTT"
];

const TX_BREAK = [
  "TTXXXXX", "XXTTTTT",
  "TXXTTTT", "XTTXXXX"
];

/* ================== PATTERN MD5 ================== */
const MD5_BREAK = [
  "TTXX", "XXTT",
  "TXXTT", "XTTXX",
  "TTTXXX", "XXXTTT",
  "TXXTTTT", "XTTXXXX"
];

const MD5_FOLLOW_SHORT = [
  "TXTX", "XTXT"
];

/* ================== MEMORY TỰ HỌC ================== */
const txMemory = {};
const md5Memory = {};

/* ================== MEMORY CORE ================== */
function initPattern(memory, pattern) {
  if (!memory[pattern]) {
    memory[pattern] = {
      win: 0,
      lose: 0,
      confidence: 80,
      locked: false
    };
  }
}

function updateLearning(memory, pattern, isWin) {
  initPattern(memory, pattern);

  if (isWin) {
    memory[pattern].win++;
    memory[pattern].confidence = Math.min(95, memory[pattern].confidence + 2);
  } else {
    memory[pattern].lose++;
    memory[pattern].confidence -= 5;
  }

  if (
    (memory[pattern].lose >= 3 && memory[pattern].win === 0) ||
    memory[pattern].confidence < 60
  ) {
    memory[pattern].locked = true;
  }
}

/* ================== ENGINE TX ================== */
function predictTX(pattern) {
  for (const p of TX_FOLLOW.concat(TX_BREAK)) {
    if (pattern.endsWith(p)) {
      initPattern(txMemory, p);
      const mem = txMemory[p];

      if (mem.locked) {
        return { mode: "NO BET", ly_do: "TX pattern bị khóa" };
      }

      const last = pattern.slice(-1);
      const du_doan = TX_BREAK.includes(p)
        ? (last === "T" ? "Xỉu" : "Tài")
        : (last === "T" ? "Tài" : "Xỉu");

      return {
        engine: "TX",
        du_doan,
        do_tin_cay: `${mem.confidence}%`,
        pattern: p,
        tu_hoc: true
      };
    }
  }

  return { engine: "TX", du_doan: "NO BET", do_tin_cay: "0%" };
}

/* ================== ENGINE MD5 ================== */
function predictMD5(pattern) {
  for (const p of MD5_BREAK.concat(MD5_FOLLOW_SHORT)) {
    if (pattern.endsWith(p)) {
      initPattern(md5Memory, p);
      const mem = md5Memory[p];

      if (mem.locked) {
        return { mode: "NO BET", ly_do: "MD5 pattern bị khóa" };
      }

      const last = pattern.slice(-1);
      const du_doan = MD5_BREAK.includes(p)
        ? (last === "T" ? "Xỉu" : "Tài")
        : (last === "T" ? "Tài" : "Xỉu");

      return {
        engine: "MD5",
        du_doan,
        do_tin_cay: `${mem.confidence}%`,
        pattern: p,
        tu_hoc: true
      };
    }
  }

  return { engine: "MD5", du_doan: "NO BET", do_tin_cay: "0%" };
}

/* ================== FETCH TX ================== */
async function fetchTX() {
  try {
    const { data } = await axios.get(API_TX, { timeout: 5000 });
    if (data.phien !== lastPhienTX) {
      lastPhienTX = data.phien;
      lastTX = data;
      historyTX.push(toTX(data.ket_qua));
      if (historyTX.length > MAX_HISTORY) historyTX.shift();
    }
  } catch {}
}

/* ================== FETCH MD5 ================== */
async function fetchMD5() {
  try {
    const { data } = await axios.get(API_MD5, { timeout: 5000 });
    if (data.phien !== lastPhienMD5) {
      lastPhienMD5 = data.phien;
      lastMD5 = data;
      historyMD5.push(toTX(data.ket_qua));
      if (historyMD5.length > MAX_HISTORY) historyMD5.shift();
    }
  } catch {}
}

fetchTX();
fetchMD5();
setInterval(fetchTX, 8000);
setInterval(fetchMD5, 8000);

/* ================== API TX ================== */
app.get("/api/lc79/tx", (req, res) => {
  const pattern = historyTX.join("");
  const pred = predictTX(pattern);

  res.json({
    type: "TX",
    pattern,
    ...pred,
    phien: lastTX?.phien ?? null,
    id: "LC79 TX VIP AUTO LEARN"
  });
});

/* ================== API MD5 ================== */
app.get("/api/lc79/md5", (req, res) => {
  const pattern = historyMD5.join("");
  const pred = predictMD5(pattern);

  res.json({
    type: "MD5",
    pattern,
    ...pred,
    phien: lastMD5?.phien ?? null,
    id: "LC79 MD5 VIP AUTO LEARN"
  });
});

/* ================== START ================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 LC79 VIP AUTO-LEARN RUNNING ON", PORT);
});
