export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const { items, payer } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No hay productos en el carrito" });
    }

    const preference = {
      items: items.map(function(item) {
        return {
          title: item.nombre,
          quantity: item.cantidad,
          unit_price: item.precio,
          currency_id: "MXN"
        };
      }),
      payer: {
        name: payer.nombre,
        email: payer.email,
        phone: { number: payer.telefono }
      },
      shipments: {
        receiver_address: {
          street_name: payer.calle,
          zip_code: payer.cp,
          city_name: payer.ciudad,
          state_name: payer.estado
        }
      },
      back_urls: {
        success: "https://fagagamen.github.io/jami-ni/gracias.html",
        failure: "https://fagagamen.github.io/jami-ni/carrito.html",
        pending: "https://fagagamen.github.io/jami-ni/carrito.html"
      },
      auto_return: "approved",
      statement_descriptor: "JAMI NI SALSA MACHA",
      external_reference: "jami-ni-" + Date.now()
    };

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.MP_ACCESS_TOKEN
      },
      body: JSON.stringify(preference)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("MP Error:", data);
      return res.status(500).json({ error: "Error al crear el pago", detalle: data });
    }

    return res.status(200).json({
      init_point: data.init_point,
      id: data.id
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
