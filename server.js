// server.js  (ESM)
import express from "express";
import cors from "cors";
import morgan from "morgan";
import axios from "axios";
import "dotenv/config";

const PORT       = process.env.PORT || 8080;
const API_BASE   = process.env.BOKUN_API_BASE || "https://api.bokun.io";
const ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;
const SECRET_KEY = process.env.BOKUN_SECRET_KEY;
const VENDOR_ID  = process.env.BOKUN_VENDOR_ID || ""; // opcional

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY en las variables de entorno.");
  process.exit(1);
}

const app = express();

// ── CORS: pon todos tus orígenes aquí en Render → Environment → ALLOWED_ORIGINS
// ejemplo: https://sitebuilder.bokun.tools,https://nova-experience.bokun.io,https://novaxperience.com
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);        // server-to-server / curl
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked for: " + origin));
  }
}));

app.use(express.json());
app.use(morgan("tiny"));

// ── Cliente Bókun (enviamos varias variantes de headers por compatibilidad)
const bokun = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: {
    // variantes más comunes en Booking REST de Bókun
    "X-Bokun-AccessKey": ACCESS_KEY,
    "X-Bokun-SecretKey": SECRET_KEY,
    "Bokun-Access-Key": ACCESS_KEY,
    "Bokun-Secret-Key": SECRET_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
  }
});

// ── Normalizador para las cards
function mapActivity(a = {}) {
  const images = a.images || a.media?.images || a.media || [];
  const cover =
    a.coverImage?.url ||
    images[0]?.url ||
    images[0]?.originalUrl ||
    null;

  const ratingValue = a.feedback?.averageRating || a.rating || null;
  const ratingCount = a.feedback?.count || a.reviewCount || null;

  const from =
    a.priceFrom?.amount ??
    a.fromPrice?.amount ??
    a.lowestPrice?.amount ??
    a.price?.amount ??
    a.pricing?.fromPrice ??
    null;

  const currency =
    a.priceFrom?.currency ??
    a.fromPrice?.currency ??
    a.lowestPrice?.currency ??
    a.price?.currency ??
    a.pricing?.currency ??
    "USD";

  const id    = a.id ?? a.activityId ?? a.productId ?? a.bokunId;
  const title = a.title ?? a.name ?? "Untitled";
  const slug  = a.slug || null;
  const url   = a.publicUrl || (slug ? `/tours/${slug}` : `/tours/${id}`);

  return {
    id, title, slug, url, cover,
    subtitle: a.subtitle || a.tagline || null,
    rating: ratingValue,
    ratingCount,
    fromPrice: from,
    currency,
    duration: a.duration || a.durationText || null,
  };
}

// ── Health
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now(), allowed }));

// ── LISTA de tours: GET /api/tours?limit=6&page=1&query=text
app.get("/api/tours", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || Number(req.query.pageSize) || 6));
    const page  = Math.max(1, Number(req.query.page) || 1);
    const queryText = (req.query.query || "").toString().trim();

    const body = {
      page,
      pageSize: limit,
      ...(queryText ? { query: queryText } : {}),
      ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {})
    };

    // Bókun: POST /activity.json/search
    const { data } = await bokun.post("/activity.json/search", body);

    const rawItems = Array.isArray(data?.results) ? data.results
                    : Array.isArray(data?.items)   ? data.items
                    : Array.isArray(data)           ? data
                    : [];

    const items = rawItems.map(mapActivity);

    res.json({ page, pageSize: limit, total: data?.total ?? items.length, items });
  } catch (err) {
    const code = err.response?.status || 500;
    const payload = err.response?.data || err.message;
    console.error("BOKUN_LIST_ERROR:", code, payload);
    res.status(code).json({ error: true, status: code, message: payload });
  }
});

// ── DETALLE: GET /api/tours/:id
app.get("/api/tours/:id", async (req, res) => {
  try {
    const { data } = await bokun.get(`/activity.json/${req.params.id}`);
    res.json({ ...mapActivity(data), raw: data });
  } catch (err) {
    const code = err.response?.status || 500;
    const payload = err.response?.data || err.message;
    console.error("BOKUN_DETAIL_ERROR:", code, payload);
    res.status(code).json({ error: true, status: code, message: payload });
  }
});

// ── DEBUG: hace la misma consulta y devuelve todo el body de Bókun (para ver error real)
app.get("/api/debug/search", async (_req, res) => {
  try {
    const { data, status, headers } = await bokun.post("/activity.json/search", { page: 1, pageSize: 1, ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {}) });
    res.json({ ok: true, status, headers, data });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      ok: false,
      status: err.response?.status || 500,
      headers: err.response?.headers,
      data: err.response?.data || err.message
    });
  }
});

app.listen(PORT, () => console.log(`✅ Nova Bokun API listening on ${PORT}`));

