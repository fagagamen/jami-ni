module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { password, id, cantidad } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: "No autorizado" });
    if (typeof cantidad !== "number" || cantidad < 0) return res.status(400).json({ error: "Cantidad invalida" });

    const sbRes = await fetch(process.env.SUPABASE_URL + "/rest/v1/stock?id=eq." + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + process.env.SUPABASE_ANON_KEY,
        "Prefer": "return=representation"
      },
      body: JSON.stringify({ cantidad: cantidad, updated_at: new Date().toISOString() })
    });
    if (!sbRes.ok) return res.status(500).json({ error: "Error actualizando stock" });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
