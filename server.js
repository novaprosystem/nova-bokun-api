import express from "express";
import cors from "cors";
import morgan from "morgan";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// ---- ENV ----
const PORT = process.env.PORT || 8080;
const API_BASE = process.env.BOKUN_API_BASE || "https://api.bokun.io";
const ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;
const SECRET_KEY = process.env.BOKUN_SECRET_KEY;
const VENDOR_ID  = process.env.BOKUN_VENDOR_ID || ""; // opcional

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ Falta BOKUN_ACCESS_KEY o BOKUN_SECRET_KEY en el .env");
  process.exit(1);
}

const app = express();

// ---- CORS (solo tus dominios) ----
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    // permite también peticiones server-to-server (sin origin)
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS: " + origin));
  }
}));

app.use(express.json());
app.use(morgan("tiny"));

// ---- Cliente axios con headers de Bókun ----
const bokun = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    // En Bókun, normalmente:
    // Bokun-Access-Key y Bokun-Secret-Key (según docs compartidas)
    "Bokun-Access-Key": ACCESS_KEY,
    "Bokun-Secret-Key": SECRET_KEY,
    "Content-Type": "application/json"
  }
});

// ---- Utils: mapear actividad a un payload “limpio” para tus cards ----
function mapActivity(a = {}) {
  const images = a.images || a.media || [];
  const cover  = images[0]?.url || images[0]?.originalUrl || null;

  const ratingValue = a.feedback?.averageRating || a.rating || null;
  const ratingCount = a.feedback?.count || a.reviewCount || null;

  const pricing = a.pricing || a.price || {};
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
    // Para construir URL en tu sitio:
    url: a.publicUrl || (a.slug ? `/tours/${a.slug}` : null)
  };
}

// ---- Endpoint: lista de tours (paginado) ----
// GET /tours?page=1&pageSize=20&query=text
app.get("/tours", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Math.min(Number(req.query.pageSize || 20), 50);
    const queryText = (req.query.query || "").toString();

    // Cuerpo para /activity.json/search
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
      page,
      pageSize,
      total: data?.total || items.length,
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

// ---- Endpoint: detalle por ID ----
// GET /tours/:id
app.get("/tours/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { data } = await bokun.get(`/activity.json/${id}`);

    res.json({
      ...mapActivity(data),
      raw: data // si necesitas más campos, vienen aquí
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

// ---- Healthcheck ----
app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () =>
  console.log(`✅ Nova Bokun API running on http://localhost:${PORT}`)
);

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.get('/tours', async (req, res) => {
  try {
    const response = await fetch(`${process.env.BOKUN_API_BASE}/activity.json/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bokun-AccessKeyId': process.env.BOKUN_ACCESS_KEY,
        'X-Bokun-SecretAccessKey': process.env.BOKUN_SECRET_KEY,
      },
      body: JSON.stringify({ page: 1, pageSize: 20 })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
