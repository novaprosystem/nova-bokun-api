// server.js  —  Nova Xperience ↔︎ Bókun bridge (CommonJS)

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");

// ── ENV ────────────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 8080;
const API_BASE    = process.env.BOKUN_API_BASE || "https://api.bokun.io";
const ACCESS_KEY  = process.env.BOKUN_ACCESS_KEY;
const SECRET_KEY  = process.env.BOKUN_SECRET_KEY;

// Opcional si tu endpoint lo requiere (no suele hacer falta para /activity.json/*)
const VENDOR_ID   = process.env.BOKUN_VENDOR_ID || "";

// Validación rápida
if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY en tus variables de entorno.");
  process.exit(1);
}

// ── APP ────────────────────────────────────────────────────────────────────────
const app = express();

// CORS: limita a tus sitios
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Permite también llamadas server-to-server (sin Origin)
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  }
}));

app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// ── Cliente HTTP Bókun ────────────────────────────────────────────────────────
const bokun = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    "Bokun-Access-Key": ACCESS_KEY,
    "Bokun-Secret-Key": SECRET_KEY,
    "Content-Type": "application/json"
  }
});

// ── Util: mapeo a payload “limpio” para tus cards ─────────────────────────────
function mapActivity(a = {}) {
  const images = a.images || a.media || [];
  const cover  = images[0]?.url || images[0]?.originalUrl || null;

  const ratingValue = a.feedback?.averageRating ?? a.rating ?? null;
  const ratingCount = a.feedback?.count ?? a.reviewCount ?? null;

  const pricing   = a.pricing || a.price || {};
  const fromPrice = pricing.fromPrice ?? pricing.amount ?? null;
  const currency  = pricing.currency || pricing.currencyCode || "USD";

  return {
    id: a.id || a.activityId,
    title: a.title || a.name,
    subtitle: a.subtitle || a.tagline || null,
    slug: a.slug || null,
    cover,
    rating: ratingValue,
    ratingCount,
    fromPrice,
    currency,
    duration: a.duration || a.durationText || null,
    url: a.publicUrl || (a.slug ? `/tours/${a.slug}` : null)
  };
}

// ── Rutas API ──────────────────────────────────────────────────────────────────

// Healthcheck + CORS info
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now(), allowed: allowedOrigins });
});

// Lista de tours (paginado/simple):
// GET /api/tours?page=1&pageSize=20&query=text
app.get("/api/tours", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || "20", 10)));
    const query    = (req.query.query || "").toString().trim();

    const body = {
      page,
      pageSize,
      ...(query ? { query } : {}),
      ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {})
    };

    // Bókun: POST /activity.json/search  (devuelve los productos)
    const { data } = await bokun.post("/activity.json/search", body);

    const rawItems = Array.isArray(data?.results) ? data.results
                    : Array.isArray(data?.items)   ? data.items
                    : [];

    const items = rawItems.map(mapActivity);

    res.json({
      page,
      pageSize,
      total: data?.total ?? items.length,
      items
    });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: true,
      status,
      message: err.response?.data || err.message
    });
  }
});

// Detalle por ID:
// GET /api/tours/:id
app.get("/api/tours/:id", async (req, res) => {
  try {
    const id = req.params.id;
    // Bókun: GET /activity.json/{id}
    const { data } = await bokun.get(`/activity.json/${encodeURIComponent(id)}`);
    res.json({ ...mapActivity(data), raw: data });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: true,
      status,
      message: err.response?.data || err.message
    });
  }
});

// Debug (para probar conectividad con Bókun desde el navegador):
// GET /api/debug/search
app.get("/api/debug/search", async (req, res) => {
  try {
    const { data, headers } = await bokun.post("/activity.json/search", { page: 1, pageSize: 1 });
    res.json({ ok: true, headers, data });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      ok: false,
      headers: err.response?.headers,
      data: err.response?.data,
      message: err.message
    });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Nova Bokun API running on http://localhost:${PORT}`);
});
