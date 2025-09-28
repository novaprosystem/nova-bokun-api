import express from "express";
import cors from "cors";
import morgan from "morgan";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// ==== ENV ====
const PORT = process.env.PORT || 8080;
const API_BASE = process.env.BOKUN_API_BASE || "https://api.bokun.io";
const ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;
const SECRET_KEY = process.env.BOKUN_SECRET_KEY;
const VENDOR_ID  = process.env.BOKUN_VENDOR_ID || "";

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY.");
  process.exit(1);
}

// ==== CORS ====
const defaultAllowed = [
  "https://www.mynovaxperience.com",
  "https://mynovaxperience.com",
  "https://nova-experience.bokun.io",
  "https://sitebuilder.bokun.tools",
];

const allowed = [
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
  ...defaultAllowed
].filter((v, i, a) => a.indexOf(v) === i);

const app = express();

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    cb(null, allowed.includes(origin));
  }
}));
app.use(express.json());
app.use(morgan("tiny"));

// ==== Cliente axios ====
const bokun = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { "Content-Type": "application/json" }
});

// 👉 Interceptor: setea TODAS las variantes de headers que Bókun suele aceptar
bokun.interceptors.request.use((config) => {
  const h = config.headers ?? {};

  const k = ACCESS_KEY;
  const s = SECRET_KEY;

  // Acceso
  h["Bokun-Access-Key"]      = k;
  h["X-Bokun-Access-Key"]    = k;
  h["X-Access-Key"]          = k;
  h["X-API-KEY"]             = k;
  h["X-Api-Key"]             = k;
  h["X-Booking-API-Key"]     = k;
  h["X-Booking-Api-Key"]     = k;

  // Secreto
  h["Bokun-Secret-Key"]      = s;
  h["X-Bokun-Secret-Key"]    = s;
  h["X-Secret-Key"]          = s;
  h["X-API-SECRET"]          = s;
  h["X-Api-Secret"]          = s;
  h["X-Booking-API-Secret"]  = s;
  h["X-Booking-Api-Secret"]  = s;

  config.headers = h;
  return config;
});

// ==== Utils ====
function mapActivity(a = {}) {
  const images = a.images || a.media || [];
  const cover  = images[0]?.url || images[0]?.originalUrl || null;

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
    url: a.publicUrl || (a.slug ? `/tours/${a.slug}` : null)
  };
}

// ==== Endpoints ====
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), allowed });
});

// Para probar claves/headers contra Bókun
app.get("/api/debug/search", async (_req, res) => {
  try {
    const { data, headers, status } = await bokun.post("/activity.json/search", {
      page: 1, pageSize: 1
    });
    res.json({ ok: true, status, sample: data, headers });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      ok: false,
      status: err.response?.status,
      headers: err.response?.headers,
      data: err.response?.data,
      message: err.message
    });
  }
});

// Lista de tours
app.get("/api/tours", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Math.min(Number(req.query.pageSize || req.query.limit || 20), 50);
    const queryText = (req.query.query || "").toString();

    const body = {
      page,
      pageSize,
      ...(queryText ? { query: queryText } : {}),
      ...(VENDOR_ID ? { vendorId: VENDOR_ID } : {})
    };

    const { data } = await bokun.post("/activity.json/search", body);
    const items = Array.isArray(data?.results || data?.items)
      ? (data.results || data.items).map(mapActivity)
      : [];

    res.json({
      page, pageSize,
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

// Detalle
app.get("/api/tours/:id", async (req, res) => {
  try {
    const { data } = await bokun.get(`/activity.json/${req.params.id}`);
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

app.get("/", (_req, res) => res.type("text").send("Nova Bokun API is running."));
app.listen(PORT, () => console.log(`✅ Nova Bokun API on http://localhost:${PORT}`));

