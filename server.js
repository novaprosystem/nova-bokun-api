// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- ENV (Render -> Environment) ----
const BOKUN_ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;
const BOKUN_SECRET_KEY = process.env.BOKUN_SECRET_KEY;
const BOKUN_VENDOR_ID  = process.env.BOKUN_VENDOR_ID || "";
const BOKUN_API_BASE   = process.env.BOKUN_API_BASE || "https://api.bokun.io";

// Dominios permitidos (incluye tu dominio nuevo)
const allowedOrigins = [
  "https://nova-experience.bokun.io",
  "https://novaexperience.bokun.io",
  "https://sitebuilder.bokun.tools",
  "https://novaxperience.com",
  "https://www.mynovaxperience.com"
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  }
}));

app.get("/api/health", (req, res) =>
  res.json({ ok: true, ts: Date.now(), allowed: allowedOrigins })
);

// Dev-helper para ver qué devuelve Bokun (no usar en público)
app.get("/api/debug/search", async (req, res) => {
  try {
    const r = await axios.post(
      `${BOKUN_API_BASE}/activity.json/search`,
      { page: 1, pageSize: Number(req.query.limit || 6) },
      {
        headers: {
          "Content-Type": "application/json",
          "Bokun-Access-Key": BOKUN_ACCESS_KEY,
          "Bokun-Secret-Key": BOKUN_SECRET_KEY
        },
        timeout: 15000
      }
    );
    res.json({ ok: true, headers: r.headers, data: r.data });
  } catch (e) {
    res.status(e.response?.status || 500).json({
      ok: false,
      headers: e.response?.headers,
      data: e.response?.data || { message: e.message }
    });
  }
});

// Endpoint para el frontend: lista de tours
app.get("/api/tours", async (req, res) => {
  try {
    const pageSize = Math.min(Number(req.query.limit || 6), 50);
    const body = { page: 1, pageSize };
    if (BOKUN_VENDOR_ID) body.vendorId = BOKUN_VENDOR_ID;

    const { data } = await axios.post(`${BOKUN_API_BASE}/activity.json/search`, body, {
      headers: {
        "Content-Type": "application/json",
        "Bokun-Access-Key": BOKUN_ACCESS_KEY,
        "Bokun-Secret-Key": BOKUN_SECRET_KEY
      },
      timeout: 15000
    });

    const results = Array.isArray(data?.results) ? data.results : [];
    const items = results.map(a => {
      const img = (a.images || a.media || [])[0];
      const cover = img?.url || img?.originalUrl || null;
      const rating = a.feedback?.averageRating ?? null;
      const ratingCount = a.feedback?.count ?? null;
      const fromPrice = a.pricing?.fromPrice ?? null;
      const currency = a.pricing?.currency ?? "USD";

      return {
        id: a.id || a.activityId,
        title: a.title || a.name,
        cover,
        rating,
        ratingCount,
        fromPrice,
        currency
      };
    });

    res.json({ total: data?.total || items.length, items });
  } catch (e) {
    res.status(e.response?.status || 500).json({
      error: true,
      status: e.response?.status || 500,
      message: e.response?.data || e.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Nova Bokun API on :${PORT}`);
});
