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

  if (arr.length && arr[arr.length - 1] === kq) return arr;

  arr.push(kq);
  if (arr.length > MAX_HISTORY) arr.shift();

  return arr;
}

/* ================= PATTERN MẪU ================= */

const PATTERNS = [
  {
    name: "TREND_MANH",
    detect: (h) => {
      const l = h.slice(-5);
      return l.length === 5 && l.every(x => x === l[0]);
    },
    predict: (h) => h.at(-1),
    baseConfidence: 0.78
  },
  {
    name: "TREND_YEU",
    detect: (h) => {
      const l = h.slice(-6);
      return l.filter(x => x === l[0]).length >= 4;
    },
    predict: (h) => h.at(-1),
    baseConfidence: 0.65
  },
  {
    name: "TXTXT",
    detect: (h) => h.slice(-5).join("") === "TXTXT",
    predict: (h) => "X",
    baseConfidence: 0.35
  },
  {
    name: "XTXTX",
    detect: (h) => h.slice(-5).join("") === "XTXTX",
    predict: (h) => "T",
    baseConfidence: 0.35
  },
  {
    name: "XEN_KE_DAI",
    detect: (h) => {
      const l = h.slice(-8);
      return l.every((v, i) => i === 0 || v !== l[i - 1]);
    },
    predict: (h) => (h.at(-1) === "T" ? "X" : "T"),
    baseConfidence: 0.32
  }
];

/* ================= PATTERN ENGINE ================= */

function detectPattern(history) {
  if (history.length < 5) return { detected: false };

  const h = history.slice(-MAX_PATTERN);

  for (const p of PATTERNS) {
    if (p.detect(h)) {
      return {
        detected: true,
        name: p.name,
        prediction: p.predict(h),
        confidence: adjustConfidence(h, p.baseConfidence)
      };
    }
  }

  return { detected: false };
}

/* ================= CONFIDENCE ADJUST ================= */

function adjustConfidence(history, base) {
  const h = history.slice(-MAX_PATTERN);

  let flips = 0;
  for (let i = 1; i < h.length; i++) {
    if (h[i] !== h[i - 1]) flips++;
  }

  const flipRate = flips / (h.length - 1);

  let maxStreak = 1, cur = 1;
  for (let i = 1; i < h.length; i++) {
    if (h[i] === h[i - 1]) {
      cur++;
      maxStreak = Math.max(maxStreak, cur);
    } else cur = 1;
  }

  let confidence = base;

  if (flipRate > 0.7) confidence -= 0.1;
  if (maxStreak >= 4) confidence += 0.1;
  if (maxStreak <= 2) confidence -= 0.05;

  return Math.max(0.2, Math.min(confidence, 0.85));
}

/* ================= THUẬT TOÁN TỔNG HỢP ================= */

function runTtoan(history) {
  const h = history.slice(-MAX_PATTERN);
  let vote = { T: 0, X: 0 };

  // Trend 20
  const l20 = h.slice(-20);
  const t20 = l20.filter(x => x === "T").length;
  const x20 = l20.length - t20;
  if (t20 !== x20) vote[t20 > x20 ? "T" : "X"] += 1.2;

  // Mean reversion 12
  const l12 = h.slice(-12);
  const t12 = l12.filter(x => x === "T").length;
  const x12 = l12.length - t12;
  if (Math.abs(t12 - x12) / 12 >= 0.4) {
    vote[t12 > x12 ? "X" : "T"] += 1.1;
  }

  // Momentum 3
  const l3 = h.slice(-3);
  if (l3.every(x => x === "T")) vote.T += 1;
  if (l3.every(x => x === "X")) vote.X += 1;

  const prediction =
    vote.T > vote.X ? "T" :
    vote.X > vote.T ? "X" : "NO_BET";

  const confidence =
    Math.max(vote.T, vote.X) /
    (vote.T + vote.X || 1);

  return { prediction, confidence, vote };
}

/* ================= FINAL DECISION ================= */

function finalDecision(ttoan, pattern) {
  if (pattern.detected && pattern.confidence >= 0.6) {
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

function buildJson(game, raw, final, pattern, ttoan) {
  return {
    Game: game.toUpperCase(),
    Phien_truoc: {
      Phien: raw.phien,
      Tong: raw.tong,
      Ket_qua: mapKetQuaTX(raw.ket_qua)
    },
    Phien_hien_tai: {
      Du_doan: final.prediction,
      Do_tin_cay: `${(final.confidence * 100).toFixed(2)}%`,
      Pattern: pattern.detected ? pattern.name : "NONE",
      Chi_tiet: {
        Nguon: final.source,
        TTOAN: {
          Du_doan: ttoan.prediction,
          Do_tin_cay: `${(ttoan.confidence * 100).toFixed(0)}%`,
          Tong_phieu: ttoan.vote
        },
        PATTERN: {
          Phat_hien: pattern.detected,
          Do_tin_cay: pattern.detected
            ? `${(pattern.confidence * 100).toFixed(0)}%`
            : "0%"
        }
      }
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

    res.json(buildJson(game, raw, final, pattern, ttoan));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("✅ LC79 API RUNNING");
  console.log(`MD5 → /api/md5`);
  console.log(`HŨ  → /api/hu`);
});
