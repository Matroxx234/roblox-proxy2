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

// 🔁 Récupère les Game Pass > 0 R$ d’un utilisateur
app.get("/api/passes/:userid", async (req, res) => {
  const userId = req.params.userid;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!userId) return res.status(400).json({ error: "No user ID provided" });

  // Anti-spam : 20 req/minute/IP
  const now = Date.now();
  ipRequests[ip] = ipRequests[ip] || [];
  ipRequests[ip] = ipRequests[ip].filter(t => now - t < 60000);
  if (ipRequests[ip].length >= 20) {
    return res.status(429).json({ error: "Too many requests - wait 1 minute" });
  }
  ipRequests[ip].push(now);

  // Cooldown anti-spam 30s par userId
  if (cooldowns[userId] && now - cooldowns[userId] < 30000) {
    return res.status(429).json({ error: "Cooldown - wait 30s" });
  }
  cooldowns[userId] = now;

  if (cache[userId]) {
    return res.json(cache[userId]);
  }

  try {
    const page = await axios.get(`https://www.roblox.com/users/${userId}/game-passes`);
    const html = page.data;

    const regex = /data-pass-id="(\d+)"[\s\S]*?<h3>([^<]+)<\/h3>/g;
    const passes = [];

    let match;
    while ((match = regex.exec(html)) !== null) {
      const id = match[1];
      const name = match[2].trim();

      try {
        const priceRes = await axios.get(`https://economy.roblox.com/v1/assets/${id}/details`);
        const price = priceRes.data.price;

        if (price > 0) {
          passes.push({
            id,
            name,
            price,
            assetType: "GamePass",
            image: `https://www.roblox.com/thumbs/image?assetId=${id}&width=150&height=150&format=png`
          });
        }
      } catch (e) {
        // ignore individual gamepass errors
      }
    }

    const result = { passes };
    cache[userId] = result;
    res.json(result);

  } catch (err) {
    console.error("Erreur API:", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ API active sur le port ${PORT}`);
});
