module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sbRes = await fetch(process.env.SUPABASE_URL + "/rest/v1/stock?select=*&order=nombre.asc", {
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + process.env.SUPABASE_ANON_KEY
      }
    });
    const data = await sbRes.json();
    if (!sbRes.ok) return res.status(500).json({ error: "Error obteniendo stock" });
    return res.status(200).json({ stock: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
