// server.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// ==== ENV ====
const PORT = process.env.PORT || 8080;
const API_BASE = process.env.BOKUN_API_BASE || "https://api.bokun.io";
const ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;  // clave de acceso
const SECRET_KEY = process.env.BOKUN_SECRET_KEY;  // clave secreta
const VENDOR_ID  = process.env.BOKUN_VENDOR_ID || ""; // opcional

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY en las variables de entorno.");
  process.exit(1);
}

// ==== CORS ====
// Dominios permitidos por ENV o defaults (incluye tu dominio nuevo)
const defaultAllowed = [
  "https://www.mynovaxperience.com",
  "https://mynovaxperience.com",
  "https://nova-experience.bokun.io",
  "https://sitebuilder.bokun.tools"
];

const allowed = [
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
  ...defaultAllowed
].filter((v, i, a) => a.indexOf(v) === i); // únicos

const app = express();

app.use(cors({
  origin(origin, cb) {
    // Permite server-to-server (sin origin)
    if (!origin) return cb(null, true);
    return cb(null, allowed.includes(origin));
  }
}));

app.use(express.json());
app.use(morgan("tiny"));

// ==== Cliente axios con headers compatibles con Bókun ====
const bokun = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

// Interceptor para adjuntar TODOS los variantes de headers
bokun.interceptors.request.use((config) => {
  const h = config.headers ?? {};

  // Acceso
  h["Bokun-Access-Key"]   = ACCESS_KEY;
  h["X-Access-Key"]       = ACCESS_KEY;
  h["X-Bokun-Access-Key"] = ACCESS_KEY;

  // Secreto
  h["Bokun-Secret-Key"]   = SECRET_KEY;
  h["X-Secret-Key"]       = SECRET_KEY;
  h["X-Bokun-Secret-Key"] = SECRET_KEY;

  config.headers = h;
  return config;
});

// ==== Mapeo a payload limpio para las cards ====
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

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now(), allowed });
});

// Debug: prueba directa al search
app.get("/api/debug/search", async (req, res) => {
  try {
    const { data, headers, status } = await bokun.post("/activity.json/search", {
      page: 1,
      pageSize: 1
    });
    res.json({ ok: true, status, headers, sample: data });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      ok: false,
      headers: err.response?.headers,
      data: err.response?.data,
      message: err.message,
    });
  }
});

// Lista de tours
// GET /api/tours?page=1&pageSize=20&query=lagoon
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
    const itemsData = Array.isArray(data?.results || data?.items)
      ? (data.results || data.items)
      : [];

    const items = itemsData.map(mapActivity);

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

// Detalle por ID
// GET /api/tours/:id
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
      message: err.response?.data || err.message
    });
  }
});

// Root
app.get("/", (_req, res) => {
  res.type("text").send("Nova Bokun API is running.");
});

app.listen(PORT, () => {
  console.log(`✅ Nova Bokun API on http://localhost:${PORT}`);
});

