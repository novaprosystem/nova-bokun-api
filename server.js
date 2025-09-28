// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Variables de entorno (Render -> Environment)
const BOKUN_ACCESS_KEY = process.env.BOKUN_ACCESS_KEY;
const BOKUN_SECRET_KEY = process.env.BOKUN_SECRET_KEY;
const BOKUN_VENDOR_ID = process.env.BOKUN_VENDOR_ID;
const BOKUN_API_BASE = process.env.BOKUN_API_BASE || "https://api.bokun.io";

// Dominios permitidos (incluyendo el nuevo)
const allowedOrigins = [
  "https://nova-experience.bokun.io",
  "https://novaxperience.com",
  "https://sitebuilder.bokun.tools",
  "https://novaexperience.bokun.io",
  "https://www.mynovaxperience.com" // 🔑 agregado
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

// Ruta de prueba para salud
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    allowed: allowedOrigins,
  });
});

// Endpoint para obtener tours
app.get("/api/tours", async (req, res) => {
  try {
    const response = await axios.get(`${BOKUN_API_BASE}/search`, {
      headers: {
        "X-Bokun-AccessKey": BOKUN_ACCESS_KEY,
        "X-Bokun-SecretKey": BOKUN_SECRET_KEY,
        "X-Bokun-VendorId": BOKUN_VENDOR_ID,
        "Content-Type": "application/json",
      },
      params: {
        limit: req.query.limit || 6,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error fetching tours:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: true,
      status: error.response?.status || 500,
      message: error.response?.data || error.message,
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
