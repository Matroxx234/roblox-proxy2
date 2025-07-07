const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const cache = {};
const cooldowns = {};
const ipRequests = {};

app.get("/api/passes/:userid", async (req, res) => {
  const userId = req.params.userid;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!userId) return res.status(400).json({ error: "No user ID provided" });

  // 🔐 Anti-spam IP : 20 requêtes par minute
  const now = Date.now();
  ipRequests[ip] = ipRequests[ip] || [];
  ipRequests[ip] = ipRequests[ip].filter((t) => now - t < 60000);
  if (ipRequests[ip].length >= 20) {
    return res.status(429).json({ error: "Too many requests - wait 1 min" });
  }
  ipRequests[ip].push(now);

  // 🧊 Cooldown anti-bannissement : 30s par utilisateur
  if (cooldowns[userId] && now - cooldowns[userId] < 30000) {
    return res.status(429).json({ error: "Cooldown - wait 30s" });
  }
  cooldowns[userId] = now;

  if (cache[userId]) {
    return res.json(cache[userId]);
  }

  try {
    // 🔁 Étape 1 : Récupérer les Game Pass
    const passesRes = await axios.get(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?assetType=GamePass`);
    const passesData = passesRes.data.data;

    if (!passesData || passesData.length === 0) {
      return res.json({ passes: [] });
    }

    // 🔁 Étape 2 : Filtrer les passes avec prix > 0
    const passes = [];

    for (const pass of passesData) {
      const assetId = pass.assetId;

      try {
        const detailRes = await axios.get(`https://economy.roblox.com/v1/assets/${assetId}/details`);
        const info = detailRes.data;

        if (info.price > 0) {
          passes.push({
            id: assetId,
            name: info.name,
            price: info.price,
            assetType: "GamePass",
            image: `https://www.roblox.com/thumbs/image?assetId=${assetId}&width=150&height=150&format=png`
          });
        }
      } catch (detailError) {
        // Ignore individual errors silently (can happen if private/deleted)
        console.warn(`Erreur asset ${assetId}:`, detailError.message);
      }
    }

    const result = { passes };
    cache[userId] = result;

    res.json(result);
  } catch (err) {
    console.error("Erreur principale:", err.message);
    res.status(500).json({ error: "Erreur interne Roblox API" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ API en ligne sur le port ${PORT}`);
});
