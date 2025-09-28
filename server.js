// server.js  — Nova Bokun API (CommonJS)

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");

// ────────────────────────────────────────────────────────────
// ENV
// ────────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 8080;
const API_BASE    = process.env.BOKUN_API_BASE || "https://api.bokun.io";
const ACCESS_KEY  = process.env.BOKUN_ACCESS_KEY;
const SECRET_KEY  = process.env.BOKUN_SECRET_KEY;
const VENDOR_ID   = process.env.BOKUN_VENDOR_ID || ""; // opcional

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY en las variables de entorno.");
  process.exit(1);
}

// Orígenes permitidos (ENV o defaults seguros)
const defaultAllowed = [
  "https://www.mynovaxperience.com",
  "https://mynovaxperience.com",
  "https://sitebuilder.bokun.tools",
  "https://nova-experience.bokun.io",
  "https://novaexperience.bokun.io"
];

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED = allowedOrigins.length ? allowedOrigins : defaultAllowed;

// ────────────────────────────────────────────────────────────
// App
// ────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);

// CORS sólido (incluye preflight)
const corsHandler = cors({
  origin(origin, cb) {
    // Permite server-to-server o curl (sin Origin)
    if (!origin) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
});
app.use(corsHandler);
app.options("*", corsHandler);

app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// ────────────────────────────────────────────────────────────
// Cliente Axios -> Bókun
// ────────────────────────────────────────────────────────────
const bokun = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "Bokun-Access-Key": ACCESS_KEY,
    "Bokun-Secret-Key": SECRET_KEY
  }
});

// ────────────────────────────────────────────────────────────
function mapActivity(a = {}) {
  const imgs = a.images || a.media || [];
  const cover = imgs[0]?.url || imgs[0]?.originalUrl || null;

  const ratingValue = a.feedback?.averageRating ?? a.rating ?? null;
  const ratingCount = a.feedback?.count ?? a.reviewCount ?? null;

  const pricing   = a.pricing || a.price || {};
  const fromPrice = pricing.fromPrice ?? pricing.amount ?? null;
  const currency  = pricing.currency ?? pricing.currencyCode ?? "USD";

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
    url: a.publicUrl || (a.slug ? `/tours/${a.slug}` : null),

    // por si quieres enlazar directamente a Bokun (si lo expone el payload):
    // externalUrl: a.bookingUrl || null
  };
}

// ────────────────────────────────────────────────────────────
// Endpoints
// ────────────────────────────────────────────────────────────

// Health + info útil para diagnóstico
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now(), allowed: ALLOWED });
});

// Debug: hace un search mínimo a Bókun y devuelve raw (útil para probar keys)
app.get("/api/debug/search", async (_req, res) => {
  try {
    const body = { page: 1, pageSize: 1, ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {}) };
    const r = await bokun.post("/activity.json/search", body);
    res.json({ ok: true, headers: r.headers, data: r.data });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      ok: false,
      headers: err.response?.headers || {},
      data: err.response?.data || { message: err.message }
    });
  }
});

// Lista de tours: GET /api/tours?page=1&pageSize=20&query=text
// (alias: ?limit=N usa como pageSize)
app.get("/api/tours", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const pageSize = Math.min(
      parseInt(req.query.pageSize || (limit || 20), 10),
      50
    );
    const queryText = (req.query.query || "").toString();

    const body = {
      page,
      pageSize,
      ...(queryText ? { query: queryText } : {}),
      ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {})
    };

    const { data } = await bokun.post("/activity.json/search", body);

    const list = Array.isArray(data?.results || data?.items)
      ? (data.results || data.items)
      : [];

    const items = list.map(mapActivity);

    res.json({
      page,
      pageSize,
      total: data?.total ?? items.length,
      items
    });
  } catch (err) {
    const code = err.response?.status || 500;
    res.status(code).json({
      error: true,
      status: code,
      message: err.response?.data || { message: err.message }
    });
  }
});

// Detalle por ID: GET /api/tours/:id
app.get("/api/tours/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { data } = await bokun.get(`/activity.json/${id}`);
    res.json({ ...mapActivity(data), raw: data });
  } catch (err) {
    const code = err.response?.status || 500;
    res.status(code).json({
      error: true,
      status: code,
      message: err.response?.data || { message: err.message }
    });
  }
});

// 404 claro para el resto
app.use((req, res) => {
  res.status(404).json({ error: true, message: "Not found" });
});

// ────────────────────────────────────────────────────────────
// Start
// ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Nova Bokun API listening on port ${PORT}`);
  console.log(`   Allowed origins: ${ALLOWED.join(", ")}`);
});
