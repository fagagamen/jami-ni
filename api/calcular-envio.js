export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { cp_destino, total_frascos } = req.body;

    if (!cp_destino || cp_destino.length !== 5) {
      return res.status(400).json({ error: "CP invalido" });
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
      console.error("Token error:", tokenData);
      return res.status(500).json({ error: "Error autenticando con Skydropx" });
    }

    const token = tokenData.access_token;

    // Calcular peso y dimensiones segun cantidad de frascos
    var peso, largo, ancho, alto;
    var frascos = parseInt(total_frascos) || 1;

    if (frascos === 1) {
      peso = 0.32;
      largo = 12.5;
      ancho = 9.8;
      alto = 10;
    } else if (frascos <= 3) {
      peso = frascos * 0.32;
      largo = 23.0;
      ancho = 18.0;
      alto = 10.0;
    } else {
      peso = frascos * 0.32;
      largo = 23.0;
      ancho = 18.0;
      alto = 10.0 * Math.ceil(frascos / 3);
    }

    // Crear cotizacion con formato correcto de Skydropx PRO
    const cotizacionRes = await fetch("https://api-pro.skydropx.com/api/v1/quotations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        address_from: {
          country_code: "MX",
          postal_code: "16035"
        },
        address_to: {
          country_code: "MX",
          postal_code: cp_destino
        },
        parcels: [
          {
            weight: peso,
            height: alto,
            width: ancho,
            length: largo,
            mass_unit: "kg",
            distance_unit: "cm"
          }
        ]
      })
    });

    const cotizacionData = await cotizacionRes.json();
    if (!cotizacionRes.ok) {
      console.error("Cotizacion error:", cotizacionData);
      return res.status(500).json({ error: "Error al cotizar envio" });
    }

    const cotizacionId = cotizacionData.data.id;

    // Reintentar hasta que la cotizacion este completa (max 8 intentos)
    var rates = [];
    var intentos = 0;
    var maxIntentos = 8;

    while (intentos < maxIntentos) {
      await new Promise(function(r) { setTimeout(r, 2500); });
      intentos++;

      var ratesRes = await fetch("https://api-pro.skydropx.com/api/v1/quotations/" + cotizacionId, {
        headers: { "Authorization": "Bearer " + token }
      });

      if (!ratesRes.ok) continue;

      var ratesData = await ratesRes.json();
      var attrs = ratesData.data && ratesData.data.attributes;
      var isCompleted = attrs && attrs.is_completed;
      rates = (attrs && attrs.rates) || [];

      console.log("Intento " + intentos + " - completed: " + isCompleted + " - rates: " + rates.length);

      if (isCompleted && rates.length > 0) break;
      if (isCompleted && rates.length === 0) break;
    }

    if (rates.length === 0) {
      return res.status(200).json({
        cotizacion_id: cotizacionId,
        rates: [],
        mensaje: "No hay opciones de envio disponibles para este CP"
      });
    }

    // Ordenar por precio y devolver las mejores opciones
    const ratesOrdenados = rates
      .filter(function(r) { return r.total_pricing; })
      .sort(function(a, b) { return a.total_pricing - b.total_pricing; })
      .slice(0, 5)
      .map(function(r) {
        return {
          rate_id: r.id,
          carrier: r.carrier,
          service: r.service_level_name || r.service,
          precio: Math.ceil(r.total_pricing),
          dias: r.days || "3-5",
          cotizacion_id: cotizacionId
        };
      });

    return res.status(200).json({
      cotizacion_id: cotizacionId,
      rates: ratesOrdenados
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
