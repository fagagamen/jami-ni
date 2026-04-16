export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { id, estado_pedido, password } = req.body;

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const estadosValidos = ["pagado", "recibido", "en preparacion", "enviado", "entregado"];
    if (!estadosValidos.includes(estado_pedido)) {
      return res.status(400).json({ error: "Estado invalido" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    const sbRes = await fetch(supabaseUrl + "/rest/v1/pedidos?id=eq." + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": "Bearer " + supabaseKey,
        "Prefer": "return=representation"
      },
      body: JSON.stringify({ estado_pedido: estado_pedido })
    });

    if (!sbRes.ok) {
      const err = await sbRes.json();
      return res.status(500).json({ error: "Error actualizando pedido", detalle: err });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error interno" });
  }
}
