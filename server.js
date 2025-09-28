// server.js (Node 18+ ESM)
import express from "express";
import cors from "cors";
import morgan from "morgan";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// ──────────────────────────────────────────────────────────────────────────────
// ENV
// ──────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const API_BASE = (process.env.BOKUN_API_BASE || "https://api.bokun.io").replace(/\/+$/,'');
const ACCESS_KEY = process.env.BOKUN_ACCESS_KEY || "";
const SECRET_KEY = process.env.BOKUN_SECRET_KEY || "";
const ACCESS_TOKEN = process.env.BOKUN_ACCESS_TOKEN || "";
const VENDOR_ID  = process.env.BOKUN_VENDOR_ID || "";

// Para depurar rápidamente en /api/health
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Qué modo de auth usaremos
const AUTH_MODE = ACCESS_TOKEN ? "token" : (ACCESS_KEY && SECRET_KEY ? "keypair" : "none");
if (AUTH_MODE === "none") {
  console.warn("⚠️  No se encontraron credenciales. Define BOKUN_ACCESS_TOKEN o (BOKUN_ACCESS_KEY + BOKUN_SECRET_KEY).");
}

// ──────────────────────────────────────────────────────────────────────────────
// APP & CORS
// ──────────────────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // SSR / curl
    cb(null, allowedOrigins.includes(origin));
  }
}));

app.use(express.json());
app.use(morgan("tiny"));

// ──────────────────────────────────────────────────────────────────────────────
/** Crea cliente axios con el esquema de auth correcto.
 * He visto dos variantes en Bókun:
 * 1) Par de claves:   "Bokun-Access-Key" + "Bokun-Secret-Key"
 * 2) Token único:     "X-Bokun-Access-Token"  (algunos usan "Authorization: Bearer <token>")
 * Si tu doc dice otra cabecera exacta, cámbiala aquí.
 */
function buildBokunClient() {
  const headers = { "Content-Type": "application/json" };

  if (AUTH_MODE === "keypair") {
    headers["Bokun-Access-Key"] = ACCESS_KEY;
    headers["Bokun-Secret-Key"] = SECRET_KEY;
  } else if (AUTH_MODE === "token") {
    // Intenta primero con cabecera dedicada…
    headers["X-Bokun-Access-Token"] = ACCESS_TOKEN;
    // …y de respaldo también como Bearer (algunas puertas de enlace lo exigen)
    headers["Authorization"] = `Bearer ${ACCESS_TOKEN}`;
  }

  return axios.create({
    baseURL: API_BASE,
    timeout: 15000,
    headers,
    // para ver todo en /api/debug cuando falle
    validateStatus: () => true
  });
}

const bokun = buildBokunClient();

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function mapActivity(a = {}) {
  const images = a.images || a.media || [];
  const cover  = images[0]?.url || images[0]?.originalUrl || null;

  const ratingValue = a.feedback?.averageRating ?? a.rating ?? null;
  const ratingCount = a.feedback?.count ?? a.reviewCount ?? null;

  const pricing    = a.pricing || a.price || {};
  const fromPrice  = pricing.fromPrice ?? pricing.amount ?? null;
  const currency   = pricing.currency || pricing.currencyCode || "USD";

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

function sendBokunError(res, axiosResp) {
  const status = axiosResp?.status || 500;
  return res.status(status).json({
    error: true,
    status,
    message: axiosResp?.data || axiosResp?.statusText || "Unknown error from Bokun"
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Health / Debug
// ──────────────────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    apiBase: API_BASE,
    authMode: AUTH_MODE,
    allowed: allowedOrigins
  });
});

/** Pega contra el search tal cual y te devuelve TODO (headers+cuerpo) para depurar */
app.get("/api/debug/search", async (req, res) => {
  const body = {
    page: Number(req.query.page || 1),
    pageSize: Math.min(Number(req.query.pageSize || 6), 50),
    ...(req.query.q ? { query: String(req.query.q) } : {}),
    ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {})
  };

  try {
    const r = await bokun.post("/activity.json/search", body);
    res.status(r.status).json({
      ok: r.status < 400,
      headers: r.headers,
      data:  r.data
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// API PÚBLICA PARA LA WEB
// ──────────────────────────────────────────────────────────────────────────────
app.get("/api/tours", async (req, res) => {
  const page     = Number(req.query.page || 1);
  const pageSize = Math.min(Number(req.query.pageSize || req.query.limit || 6), 50);
  const query    = (req.query.query || req.query.q || "").toString();

  const body = {
    page,
    pageSize,
    ...(query ? { query } : {}),
    ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {})
  };

  const r = await bokun.post("/activity.json/search", body);
  if (r.status >= 400) return sendBokunError(res, r);

  const list = Array.isArray(r.data?.results || r.data?.items)
    ? (r.data.results || r.data.items).map(mapActivity)
    : [];

  res.json({
    page,
    pageSize,
    total: r.data?.total ?? list.length,
    items: list
  });
});

app.get("/api/tours/:id", async (req, res) => {
  const r = await bokun.get(`/activity.json/${encodeURIComponent(req.params.id)}`);
  if (r.status >= 400) return sendBokunError(res, r);

  res.json({
    ...mapActivity(r.data),
    raw: r.data
  });
});

// ──────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Nova Bokun API running on :${PORT}`);
  console.log(`   Base: ${API_BASE} | Auth: ${AUTH_MODE}`);
});
