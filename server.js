// server.js  (ESM)
import express from "express";
import cors from "cors";
import morgan from "morgan";
import axios from "axios";
import "dotenv/config";

// ────────────────────────────────────────────────────────────
// ENV
// ────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 8080;
const API_BASE   = process.env.BOKUN_API_BASE || "https://api.bokun.io";
const ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;
const SECRET_KEY = process.env.BOKUN_SECRET_KEY;
const VENDOR_ID  = process.env.BOKUN_VENDOR_ID || ""; // opcional

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY en las variables de entorno.");
  process.exit(1);
}

// ────────────────────────────────────────────────────────────
const app = express();

// CORS: solo orígenes permitidos (coma-separados)
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Permite server-to-server (sin origin)
    if (!origin) return cb(null, true);
    return cb(null, allowed.includes(origin));
  }
}));

app.use(express.json());
app.use(morgan("tiny"));

// ────────────────────────────────────────────────────────────
// Cliente axios con headers de Bókun
// (mandamos ambas variantes por compatibilidad)
// ────────────────────────────────────────────────────────────
const bokun = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: {
    // Variante 1 (prefijo X-)
    "X-Bokun-AccessKey": ACCESS_KEY,
    "X-Bokun-SecretKey": SECRET_KEY,
    // Variante 2 (sin prefijo) – algunas cuentas esperan esto
    "Bokun-Access-Key": ACCESS_KEY,
    "Bokun-Secret-Key": SECRET_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
  }
});

// ────────────────────────────────────────────────────────────
// Normalizador para tus cards (defensivo ante distintos payloads)
// ────────────────────────────────────────────────────────────
function mapActivity(a = {}) {
  const images =
    a.images ||
    a.media?.images ||
    a.media ||
    [];

  const cover =
    a.coverImage?.url ||
    images[0]?.url ||
    images[0]?.originalUrl ||
    null;

  const ratingValue =
    a.feedback?.averageRating ||
    a.rating ||
    null;

  const ratingCount =
    a.feedback?.count ||
    a.reviewCount ||
    null;

  // precios
  const priceFrom =
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

  const id =
    a.id ?? a.activityId ?? a.productId ?? a.bokunId;

  const title =
    a.title ?? a.name ?? a.activityName ?? "Untitled";

  const slug = a.slug || null;

  // URL pública en tu sitio (ajústala a tu routing real si quieres)
  const url = a.publicUrl || (slug ? `/tours/${slug}` : `/tours/${id}`);

  return {
    id,
    title,
    subtitle: a.subtitle || a.tagline || null,
    slug,
    cover,
    rating: ratingValue,
    ratingCount,
    fromPrice: priceFrom,
    currency,
    duration: a.duration || a.durationText || null,
    url
  };
}

// ────────────────────────────────────────────────────────────
// Healthcheck
// ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ────────────────────────────────────────────────────────────
// Lista de tours (para las cards)
// GET /api/tours?limit=6&page=1&query=text
// ────────────────────────────────────────────────────────────
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

    res.json({
      page,
      pageSize: limit,
      total: data?.total ?? items.length,
      items
    });
  } catch (err) {
    const code = err.response?.status || 500;
    const msg  = typeof err.response?.data === "string" ? err.response.data : err.message;
    console.error("BOKUN_LIST_ERROR:", msg);
    res.status(code).json({ error: true, status: code, message: msg });
  }
});

// ────────────────────────────────────────────────────────────
/**
 * Detalle de un tour por ID
 * GET /api/tours/:id
 */
// ────────────────────────────────────────────────────────────
app.get("/api/tours/:id", async (req, res) => {
  try {
    const id = req.params.id;
    // Bókun: GET /activity.json/{id}
    const { data } = await bokun.get(`/activity.json/${id}`);

    res.json({
      ...mapActivity(data),
      raw: data
    });
  } catch (err) {
    const code = err.response?.status || 500;
    const msg  = typeof err.response?.data === "string" ? err.response.data : err.message;
    console.error("BOKUN_DETAIL_ERROR:", msg);
    res.status(code).json({ error: true, status: code, message: msg });
  }
});

// ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Nova Bokun API running on port ${PORT}`);
});
