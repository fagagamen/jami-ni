export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { password } = req.body;

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    const sbRes = await fetch(supabaseUrl + "/rest/v1/pedidos?select=*&order=created_at.desc", {
      headers: {
        "apikey": supabaseKey,
        "Authorization": "Bearer " + supabaseKey
      }
    });

    const data = await sbRes.json();
    if (!sbRes.ok) return res.status(500).json({ error: "Error obteniendo pedidos" });

    return res.status(200).json({ pedidos: data });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error interno" });
  }
}
