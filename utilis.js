const axios = require("axios");

async function getGamePasses(userId) {
  try {
    const url = `https://games.roblox.com/v1/users/${userId}/games`;
    const { data } = await axios.get(url);

    const gameId = data.data[0]?.id;
    if (!gameId) return [];

    const passesRes = await axios.get(`https://www.roblox.com/game-pass-api/game/` + gameId);
    const html = passesRes.data;

    const passIds = [...html.matchAll(/data-passid="(\d+)"/g)].map(match => match[1]);
    const passNames = [...html.matchAll(/data-passname="([^"]+)"/g)].map(match => match[1]);

    const passes = passIds.map((id, i) => ({
      id: Number(id),
      name: passNames[i] || "GamePass",
      price: 0, // optionnel — tu peux ajouter un appel à /api/productinfo
      assetType: "GamePass"
    }));

    return passes;
  } catch (error) {
    console.error("Erreur getGamePasses:", error.message);
    return [];
  }
}

module.exports = { getGamePasses };
