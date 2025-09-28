// server.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

/* ===== ENV ===== */
const PORT       = process.env.PORT || 8080;
const API_BASE   = process.env.BOKUN_API_BASE || "https://api.bokun.io"; // host
const ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;
const SECRET_KEY = process.env.BOKUN_SECRET_KEY;
const VENDOR_ID  = process.env.BOKUN_VENDOR_ID || ""; // si tu endpoint lo requiere

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY en variables de entorno");
  process.exit(1);
}

const app = express();

/* ===== CORS (permite solo tus dominios) ===== */
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);           // server-to-server / Postman
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  }
}));

app.use(express.json());
app.use(morgan("tiny"));

/* ===== Cliente axios hacia Bókun ===== 
   ⚠️ Headers correctos que Bókun espera */
const bokun = axios.create({
  baseURL: API_BASE,           // p.ej. https://api.bokun.io
  timeout: 15000,
  headers: {
    "X-Bokun-Access-Key": ACCESS_KEY,
    "X-Bokun-Secret-Key": SECRET_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
  }
});

/* ===== Util: mapear actividad a lo que necesitan tus cards ===== */
function mapActivity(a = {}) {
  const images = a.images || a.media || [];
  const cover  = images[0]?.url || images[0]?.originalUrl || null;

  const ratingValue = a.feedback?.averageRating || a.rating || null;
  const ratingCount = a.feedback?.count || a.reviewCount || null;

  const pricing   = a.pricing || a.price || {};
  const fromPrice = pricing.fromPrice || pricing.amount || null;
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

/* ===== Endpoints públicos de tu API ===== */

// Health + info CORS
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now(), allowed });
});

// Lista de tours (paginado y búsqueda)
app.get("/api/tours", async (req, res) => {
  try {
    const page     = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Number(req.query.pageSize || req.query.limit || 20));
    const query    = (req.query.query || "").toString().trim();

    const body = {
      page,
      pageSize,
      ...(query ? { query } : {}),
      ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {})
    };

    // Según doc de Bókun:
    // POST /activity.json/search
    const { data } = await bokun.post("/activity.json/search", body);

    const items = Array.isArray(data?.results || data?.items)
      ? (data.results || data.items).map(mapActivity)
      : [];

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
      message: err.response?.data || err.message
    });
  }
});

// Detalle de tour por ID
app.get("/api/tours/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // GET /activity.json/{id}
    const { data } = await bokun.get(`/activity.json/${id}`);
    res.json({ ...mapActivity(data), raw: data });
  } catch (err) {
    const code = err.response?.status || 500;
    res.status(code).json({
      error: true,
      status: code,
      message: err.response?.data || err.message
    });
  }
});

/* ===== Ruta de depuración (opcional) ===== */
app.get("/api/debug/search", async (req, res) => {
  try {
    const { data, headers } = await bokun.post("/activity.json/search", { page: 1, pageSize: 1 });
    res.json({ ok: true, headersSent: { "X-Bokun-Access-Key": !!ACCESS_KEY, "X-Bokun-Secret-Key": !!SECRET_KEY }, data });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      ok: false,
      headers: err.response?.headers,
      data: err.response?.data || err.message
    });
  }
});

/* ===== Arranque ===== */
app.listen(PORT, () => {
  console.log(`✅ Nova Bokun API running on port ${PORT}`);
});
