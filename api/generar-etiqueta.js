export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { password, pedido_id, rate_id, cotizacion_id, destinatario } = req.body;

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "No autorizado" });
    }

    // Obtener token de Skydropx
    const tokenRes = await fetch("https://api-pro.skydropx.com/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SKYDROPX_CLIENT_ID,
        client_secret: process.env.SKYDROPX_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(500).json({ error: "Error autenticando con Skydropx" });
    }

    const token = tokenData.access_token;

    // Crear envio con la cotizacion y rate seleccionados
    const envioRes = await fetch("https://api-pro.skydropx.com/api/v1/shipments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        quotation_id: cotizacion_id,
        rate_id: rate_id,
        address_from: {
          country_code: "MX",
          postal_code: "16035",
          area_level1: "Ciudad de Mexico",
          area_level2: "Xochimilco",
          area_level3: "San Lorenzo La Cebada",
          street1: "Privada del Bosque No. 8",
          reference: "San Lorenzo La Cebada",
          name: "Jam'i N'i Salsa Macha",
          phone: "5610176064",
          email: "salsajamini@gmail.com"
        },
        address_to: {
          country_code: "MX",
          postal_code: destinatario.cp,
          area_level1: destinatario.estado,
          area_level2: destinatario.ciudad,
          area_level3: destinatario.colonia,
          street1: destinatario.calle,
          reference: destinatario.referencias || "",
          name: destinatario.nombre,
          phone: destinatario.telefono,
          email: destinatario.email
        },
        external_reference: "jami-ni-" + pedido_id.substring(0, 8)
      })
    });

    const envioData = await envioRes.json();
    if (!envioRes.ok) {
      console.error("Envio error:", envioData);
      return res.status(500).json({ error: "Error creando envio", detalle: envioData });
    }

    const shipmentId = envioData.data.id;
    const labelUrl = envioData.data.attributes.label_url || null;
    const trackingNumber = envioData.data.attributes.tracking_number || null;

    // Actualizar pedido en Supabase con datos del envio
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    await fetch(supabaseUrl + "/rest/v1/pedidos?id=eq." + pedido_id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": "Bearer " + supabaseKey
      },
      body: JSON.stringify({
        estado_pedido: "enviado",
        mp_id: shipmentId
      })
    });

    return res.status(200).json({
      success: true,
      shipment_id: shipmentId,
      label_url: labelUrl,
      tracking_number: trackingNumber
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
