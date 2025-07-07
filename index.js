const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const cache = {};
const cooldowns = {};
const ipRequests = {};

// 🔁 Convertit un pseudo en userId
app.get("/api/username/:username", async (req, res) => {
  const username = req.params.username;
  try {
    const r = await axios.post("https://users.roblox.com/v1/usernames/users", {
      usernames: [username],
      excludeBannedUsers: false
    }, {
      headers: { "Content-Type": "application/json" }
    });

    if (r.data.data.length > 0) {
      return res.json({ userId: r.data.data[0].id });
    } else {
      return res.status(404).json({ error: "User not found" });
    }
  } catch (e) {
    return res.status(500).json({ error: "Failed to convert username" });
  }
});

// 🔁 Récupère les Game Pass > 0 R$ du joueur
app.get("/api/passes/:userid", async (req, res) => {
  const userId = req.params.userid;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!userId) return res.status(400).json({ error: "No user ID provided" });

  // Anti-abus : 20 requêtes / minute / IP
  const now = Date.now();
  ipRequests[ip] = ipRequests[ip] || [];
  ipRequests[ip] = ipRequests[ip].filter(t => now - t < 60000);
  if (ipRequests[ip].length >= 20) {
    return res.status(429).json({ error: "Too many requests - wait 1 minute" });
  }
  ipRequests[ip].push(now);

  // Cooldown 30s par user
  if (cooldowns[userId] && now - cooldowns[userId] < 30000) {
    return res.status(429).json({ error: "Cooldown - wait 30s" });
  }
  cooldowns[userId] = now;

  if (cache[userId]) {
    return res.json(cache[userId]);
  }

  try {
    // 🔁 Étape 1 : récupérer les jeux de l'utilisateur
    const gamesRes = await axios.get(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=All&sortOrder=Asc&limit=50`);
    const games = gamesRes.data.data;

    const passes = [];

    for (const game of games) {
      const universeId = game.id;

      try {
        const devProductsRes = await axios.get(`https://develop.roblox.com/v1/universes/${universeId}/developer-products?limit=100`);
        const devProducts = devProductsRes.data;

        for (const product of devProducts) {
          if (product.priceInRobux > 0) {
            passes.push({
              id: product.productId,
              name: product.name,
              price: product.priceInRobux,
              assetType: "GamePass",
              image: `https://www.roblox.com/thumbs/image?assetId=${product.productId}&width=150&height=150&format=png`
            });
          }
        }
      } catch (err) {
        console.warn("Aucun produit ou accès interdit pour universeId", universeId);
      }
    }

    const result = { passes };
    cache[userId] = result;
    res.json(result);

  } catch (err) {
    console.error("Erreur API principale:", err.message);
    res.status(500).json({ error: "Erreur interne Roblox API" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ API en ligne sur le port ${PORT}`);
});
