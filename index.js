import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= API GỐC ================= */

const API_MD5 = "https://lc79md5.vercel.app/lc79/md5";
const API_HU  = "https://lc79md5.vercel.app/lc79/tx";

/* ================= HISTORY (RAM) ================= */

const HISTORY = {
  md5: [],
  hu: []
};

const MAX_HISTORY = 120;
const MAX_PATTERN = 40;

/* ================= FETCH API ================= */

async function fetchAPI(game) {
  const url = game === "md5" ? API_MD5 : API_HU;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Không lấy được API gốc");
  return res.json();
}

/* ================= MAP KẾT QUẢ ================= */

function mapKetQuaTX(kq) {
  return kq === "Tài" ? "T" : "X";
}

/* ================= UPDATE HISTORY ================= */

function updateHistory(game, raw) {
  const arr = HISTORY[game];
  const kq = mapKetQuaTX(raw.ket_qua);

  // tránh push trùng liên tiếp
  if (arr.length && arr[arr.length - 1] === kq) return arr;

  arr.push(kq);
  if (arr.length > MAX_HISTORY) arr.shift();

  return arr;
}

/* ================= PATTERN ENGINE ================= */

function detectPattern(history) {
  if (history.length < 6) return { detected: false };

  const h = history.slice(-MAX_PATTERN);
  const last5 = h.slice(-5).join("");
  const last10 = h.slice(-10);

  // Pattern TXTXT / XTXTX
  if (last5 === "TXTXT" || last5 === "XTXTX") {
    return {
      detected: true,
      name: "XEN_KE_5",
      raw: last5,
      prediction: last5[4],
      confidence: 0.78
    };
  }

  // Trend mạnh
  const tCount = last10.filter(x => x === "T").length;
  const xCount = last10.length - tCount;

  if (Math.abs(tCount - xCount) >= 6) {
    return {
      detected: true,
      name: "TREND_MANH",
      raw: last10.join(""),
      prediction: tCount > xCount ? "T" : "X",
      confidence: 0.72
    };
  }

  return { detected: false };
}

/* ================= TTOAN TỔNG HỢP ================= */

function runTtoan(history) {
  let vote = { T: 0, X: 0 };

  // Trend 20
  const l20 = history.slice(-20);
  const t20 = l20.filter(x => x === "T").length;
  const x20 = l20.length - t20;
  if (t20 !== x20) vote[t20 > x20 ? "T" : "X"] += 1.1;

  // Mean reversion 12
  const l12 = history.slice(-12);
  const t12 = l12.filter(x => x === "T").length;
  const x12 = l12.length - t12;
  if (Math.abs(t12 - x12) / 12 >= 0.4) {
    vote[t12 > x12 ? "X" : "T"] += 1.0;
  }

  // Momentum 3
  const l3 = history.slice(-3);
  if (l3.every(x => x === "T")) vote.T += 0.8;
  if (l3.every(x => x === "X")) vote.X += 0.8;

  const totalVote = vote.T + vote.X;

  let prediction = "NO_BET";
  if (vote.T > vote.X) prediction = "T";
  if (vote.X > vote.T) prediction = "X";

  let confidence = totalVote === 0 ? 0 : Math.max(vote.T, vote.X) / totalVote;

  // khóa trần – không bao giờ 100%
  confidence = Math.min(0.89, Math.max(0.55, confidence));

  return { prediction, confidence, vote };
}

/* ================= FINAL DECISION ================= */

function finalDecision(ttoan, pattern) {
  if (pattern.detected && pattern.confidence >= 0.75) {
    return {
      prediction: pattern.prediction,
      confidence: pattern.confidence,
      source: "PATTERN"
    };
  }

  return {
    prediction: ttoan.prediction,
    confidence: ttoan.confidence,
    source: "TTOAN"
  };
}

/* ================= BUILD JSON ================= */

function buildJson(game, raw, final, pattern, ttoan, history) {
  return {
    Game: game.toUpperCase(),

    Phien_truoc: {
      Phien: raw.phien,
      Tong: raw.tong,
      Ket_qua: mapKetQuaTX(raw.ket_qua)
    },

    Phien_hien_tai: {
      Phien: raw.phien, // 🔥 LẤY TRỰC TIẾP TỪ API GỐC
      Du_doan: final.prediction,
      Do_tin_cay: `${(final.confidence * 100).toFixed(2)}%`,
      Pattern: pattern.detected ? pattern.name : "NONE",
      Pattern_raw: pattern.raw || history.slice(-5).join(""),
      Nguon: final.source
    },

    Timestamp: Date.now()
  };
}

/* ================= API ROUTE ================= */

app.get("/api/:game", async (req, res) => {
  try {
    const game = req.params.game;
    if (!["md5", "hu"].includes(game)) {
      return res.status(400).json({ error: "Game không hợp lệ" });
    }

    const raw = await fetchAPI(game);
    const history = updateHistory(game, raw);

    const pattern = detectPattern(history);
    const ttoan = runTtoan(history);
    const final = finalDecision(ttoan, pattern);

    res.json(buildJson(game, raw, final, pattern, ttoan, history));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("✅ LC79 API RUNNING");
  console.log("➡ /api/md5");
  console.log("➡ /api/hu");
});
