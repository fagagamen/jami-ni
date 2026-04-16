export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { items, payer, tipo, mp_id } = req.body;
    const total = items.reduce(function(s, i) { return s + i.precio * i.cantidad; }, 0);

    const pedido = {
      nombre: payer.nombre,
      email: payer.email,
      telefono: payer.telefono,
      calle: payer.calle,
      colonia: payer.colonia,
      cp: payer.cp,
      ciudad: payer.ciudad,
      estado: payer.estado,
      referencias: payer.referencias || "",
      notas: payer.notas || "",
      productos: items,
      total: total,
      tipo: tipo || "linea",
      estado_pedido: "pagado",
      mp_id: mp_id || ""
    };

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    const sbRes = await fetch(supabaseUrl + "/rest/v1/pedidos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": "Bearer " + supabaseKey,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(pedido)
    });

    const sbData = await sbRes.json();
    if (!sbRes.ok) {
      console.error("Supabase error:", sbData);
      return res.status(500).json({ error: "Error guardando pedido" });
    }

    const pedidoId = sbData[0].id;
    const productosHtml = items.map(function(i) {
      return "<tr><td style='padding:8px;border-bottom:1px solid #2a2a2a'>" + i.nombre + (i.cantidad > 1 ? " x" + i.cantidad : "") + (i.nombrePersonalizado ? " (" + i.nombrePersonalizado + ")" : "") + "</td><td style='padding:8px;border-bottom:1px solid #2a2a2a;text-align:right'>$" + (i.precio * i.cantidad) + " MXN</td></tr>";
    }).join("");

    const emailCliente = {
      to: payer.email,
      subject: "Jam'i N'i — Confirmacion de tu pedido",
      html: "<div style='background:#0a0a0a;padding:40px;font-family:Georgia,serif;color:#f5f0e8;max-width:600px;margin:0 auto'>" +
        "<h1 style='color:#c9a84c;font-size:28px;margin-bottom:8px'>Jam'i N'i</h1>" +
        "<h2 style='font-size:20px;font-weight:400;margin-bottom:24px'>Gracias por tu pedido, " + payer.nombre + "!</h2>" +
        "<p style='color:#bbb;margin-bottom:24px'>Hemos recibido tu pedido y esta siendo procesado. Te contactaremos pronto para confirmar el envio.</p>" +
        "<table style='width:100%;border-collapse:collapse;background:#1a1a1a;margin-bottom:24px'>" +
        "<tr style='background:#2a2a2a'><td style='padding:10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase'>Producto</td><td style='padding:10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;text-align:right'>Precio</td></tr>" +
        productosHtml +
        "<tr><td style='padding:12px;font-weight:bold;color:#c9a84c'>Total</td><td style='padding:12px;font-weight:bold;color:#c9a84c;text-align:right'>$" + total + " MXN</td></tr>" +
        "</table>" +
        "<div style='background:#1a1a1a;padding:16px;border-left:3px solid #c0392b;margin-bottom:24px'>" +
        "<p style='margin:0;font-size:14px;color:#bbb'>Direccion de envio:<br>" +
        "<strong style='color:#f5f0e8'>" + payer.calle + ", Col. " + payer.colonia + "<br>" + payer.ciudad + ", " + payer.estado + " CP " + payer.cp + "</strong></p>" +
        "</div>" +
        "<p style='color:#888;font-size:13px'>Numero de pedido: <strong style='color:#c9a84c'>" + pedidoId.substring(0, 8).toUpperCase() + "</strong></p>" +
        "<p style='color:#888;font-size:13px'>Dudas: <strong style='color:#f5f0e8'>56 1017 6064</strong> · salsajamini@gmail.com</p>" +
        "</div>"
    };

    const emailAdmin = {
      to: "salsajamini@gmail.com",
      subject: "Nuevo pedido Jam'i N'i — $" + total + " MXN",
      html: "<div style='background:#0a0a0a;padding:40px;font-family:Georgia,serif;color:#f5f0e8;max-width:600px;margin:0 auto'>" +
        "<h1 style='color:#c9a84c'>Nuevo pedido recibido</h1>" +
        "<p style='color:#bbb'>ID: <strong style='color:#f5f0e8'>" + pedidoId.substring(0, 8).toUpperCase() + "</strong></p>" +
        "<h3 style='color:#c9a84c;margin-top:24px'>Cliente</h3>" +
        "<p style='color:#bbb'>" + payer.nombre + "<br>" + payer.email + "<br>" + payer.telefono + "</p>" +
        "<h3 style='color:#c9a84c'>Direccion</h3>" +
        "<p style='color:#bbb'>" + payer.calle + ", Col. " + payer.colonia + "<br>" + payer.ciudad + ", " + payer.estado + " CP " + payer.cp + (payer.referencias ? "<br>Ref: " + payer.referencias : "") + "</p>" +
        "<h3 style='color:#c9a84c'>Productos</h3>" +
        "<table style='width:100%;border-collapse:collapse;background:#1a1a1a'>" +
        productosHtml +
        "<tr><td style='padding:12px;font-weight:bold;color:#c9a84c'>Total</td><td style='padding:12px;font-weight:bold;color:#c9a84c;text-align:right'>$" + total + " MXN</td></tr>" +
        "</table>" +
        (payer.notas ? "<h3 style='color:#c9a84c'>Notas</h3><p style='color:#bbb'>" + payer.notas + "</p>" : "") +
        "<p style='margin-top:24px'><a href='https://jami-ni.vercel.app/admin.html' style='background:#c9a84c;color:#0a0a0a;padding:12px 24px;text-decoration:none;font-size:13px;letter-spacing:0.1em'>Ver panel de pedidos</a></p>" +
        "</div>"
    };

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.RESEND_API_KEY
      },
      body: JSON.stringify({ from: "Jam'i N'i <pedidos@jami-ni.com>", to: emailCliente.to, subject: emailCliente.subject, html: emailCliente.html })
    });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.RESEND_API_KEY
      },
      body: JSON.stringify({ from: "Jam'i N'i <pedidos@jami-ni.com>", to: emailAdmin.to, subject: emailAdmin.subject, html: emailAdmin.html })
    });

    return res.status(200).json({ success: true, pedidoId: pedidoId });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error interno" });
  }
}
