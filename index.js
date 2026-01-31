import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= API GỐC ================= */

const API_MD5 = "https://lc79md5.vercel.app/lc79/md5";
const API_HU  = "https://lc79md5.vercel.app/lc79/tx";

/* ================= HISTORY (LƯU RAM) ================= */

const HISTORY = {
  md5: [],
  hu: []
};
const MAX_HISTORY = 120;

/* ================= FETCH API ================= */

async function fetchAPI(game) {
  const url = game === "md5" ? API_MD5 : API_HU;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Không lấy được API gốc");
  return res.json(); // object 1 phiên
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

/* ================= SK PATTERN ================= */

function detectSK(history) {
  if (history.length < 9) return { detected: false };

  const last = history.slice(-9);
  let alternating = true;

  for (let i = 1; i < last.length - 1; i++) {
    if (last[i] === last[i - 1]) {
      alternating = false;
      break;
    }
  }

  if (alternating && last[7] === last[8]) {
    return {
      detected: true,
      name: "XEN_KE_DAI_BI_PHA",
      prediction: last[8],
      confidence: 0.84
    };
  }

  return { detected: false };
}

/* ================= TTOAN ================= */

function runTtoan(history) {
  let vote = { T: 0, X: 0 };

  // Trend 20
  const l20 = history.slice(-20);
  const t20 = l20.filter(x => x === "T").length;
  const x20 = l20.length - t20;
  if (t20 !== x20) vote[t20 > x20 ? "T" : "X"] += 1.2;

  // Mean reversion 12
  const l12 = history.slice(-12);
  const t12 = l12.filter(x => x === "T").length;
  const x12 = l12.length - t12;
  if (Math.abs(t12 - x12) / 12 >= 0.4) {
    vote[t12 > x12 ? "X" : "T"] += 1.1;
  }

  // Momentum 3
  const l3 = history.slice(-3);
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

function finalDecision(ttoan, sk) {
  if (sk.detected && sk.confidence >= 0.8) {
    return {
      prediction: sk.prediction,
      confidence: sk.confidence,
      source: "SK"
    };
  }
  return {
    prediction: ttoan.prediction,
    confidence: ttoan.confidence,
    source: "LC79"
  };
}

/* ================= BUILD JSON ================= */

function buildJson(game, raw, final, sk, ttoan) {
  return {
    Game: game.toUpperCase(),

    Phien_truoc: {
      Phien: raw.phien,
      Xuc_xac1: raw.xuc_xac_1,
      Xuc_xac2: raw.xuc_xac_2,
      Xuc_xac3: raw.xuc_xac_3,
      Tong: raw.tong,
      Ket_qua: mapKetQuaTX(raw.ket_qua)
    },

    Phien_hien_tai: {
      Du_doan: final.prediction,
      Do_tin_cay: `${(final.confidence * 100).toFixed(2)}%`,
      Pattern: sk.detected ? sk.name : "NONE",
      Chi_tiet: {
        Nguon: final.source,
        TTOAN: {
          Du_doan: ttoan.prediction,
          Do_tin_cay: `${(ttoan.confidence * 100).toFixed(0)}%`,
          Tong_phieu: ttoan.vote
        },
        SK: {
          Phat_hien: sk.detected,
          Do_tin_cay: sk.detected
            ? `${(sk.confidence * 100).toFixed(0)}%`
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

    const sk = detectSK(history);
    const ttoan = runTtoan(history);
    const final = finalDecision(ttoan, sk);

    res.json(buildJson(game, raw, final, sk, ttoan));

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
