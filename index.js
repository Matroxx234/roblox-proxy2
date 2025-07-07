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

  // 🔐 Anti-abus : 5 requêtes max/minute par IP
  const now = Date.now();
  ipRequests[ip] = ipRequests[ip] || [];
  ipRequests[ip] = ipRequests[ip].filter((t) => now - t < 60000);
  if (ipRequests[ip].length >= 5) {
    return res.status(429).json({ error: "Trop de requêtes - attends 1 min" });
  }
  ipRequests[ip].push(now);

  // Cooldown anti-bannissement (30s par utilisateur)
  if (cooldowns[userId] && now - cooldowns[userId] < 30000) {
    return res.status(429).json({ error: "Cooldown actif - attends 30s" });
  }
  cooldowns[userId] = now;

  if (cache[userId]) {
    return res.json(cache[userId]);
  }

  try {
    const html = (await axios.get(`https://www.roblox.com/users/${userId}/catalog?Category=9&SortType=3`)).data;

    const passes = [];

    const blockRegex = /data-item-id="(\d+)"[\s\S]*?<span class='text-label'>([^<]+)<\/span>[\s\S]*?<span class='text-robux'>([\d,]+)<\/span>/g;

    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      const id = match[1];
      const name = match[2].trim();
      const price = parseInt(match[3].replace(/,/g, ""), 10);

      if (price > 0) {
        passes.push({
          id,
          name,
          price,
          assetType: "GamePass",
          image: `https://www.roblox.com/thumbs/image?assetId=${id}&width=150&height=150&format=png`
        });
      }
    }

    const result = { passes };
    cache[userId] = result;

    res.json(result);
  } catch (err) {
    console.error("Erreur API Roblox:", err.message);
    res.status(500).json({ error: "Erreur interne Roblox" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ API en ligne sur le port ${PORT}`);
});
