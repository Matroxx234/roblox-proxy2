const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🧠 Cache mémoire
const cache = new Map();
const CACHE_DURATION = 60 * 1000; // 60 sec

// 🔹 Récupération paginée avec filtre (et délai entre requêtes)
async function getAllGamePasses(userId, creatorType) {
  let passes = [];
  let cursor = "";

  while (true) {
    const url = `https://catalog.roblox.com/v1/search/items?category=Passes&creatorTargetId=${userId}&creatorType=${creatorType}&limit=30${cursor ? `&cursor=${cursor}` : ""}`;

    const res = await axios.get(url);
    const data = res.data;

    const newPasses = (data.data || [])
      .filter((item) => item.price > 0)
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        assetType: "GamePass"
      }));

    passes.push(...newPasses);

    if (!data.nextPageCursor) break;
    cursor = data.nextPageCursor;

    // 🛡️ Pause entre les requêtes pour éviter 429
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return passes;
}

// 🌐 Route test
app.get("/", (_, res) => {
  res.send("✅ API Roblox GamePass avec cache, pagination & anti-429");
});

// 📦 Route principale
app.get("/api/passes/:userId", async (req, res) => {
  const userId = req.params.userId;

  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ error: "userId invalide" });
  }

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json({ passes: cached.data });
  }

  try {
    const userPasses = await getAllGamePasses(userId, "User");
    if (userPasses.length > 0) {
      cache.set(userId, { data: userPasses, timestamp: Date.now() });
      return res.json({ passes: userPasses });
    }

    const groupPasses = await getAllGamePasses(userId, "Group");
    cache.set(userId, { data: groupPasses, timestamp: Date.now() });
    return res.json({ passes: groupPasses });
  } catch (err) {
    return handleError(err, res);
  }
});

// ❗ Gestion d’erreurs
function handleError(err, res) {
  console.error("getGamePasses ▶", err.message);
  if (err.response?.status === 429) {
    return res.status(429).json({ error: "Trop de requêtes – attends 1-2 minutes." });
  }
  return res.status(err.response?.status || 500).json({ error: "Erreur serveur" });
}

// ▶ Lancement du serveur
app.listen(PORT, () => {
  console.log(`✅ API en ligne sur le port ${PORT}`);
});
