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

    // Obtener token de Skydropx PRO
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
    var frascos = parseInt(total_frascos) || 1;
    var peso, largo, ancho, alto;

    if (frascos === 1) {
      peso = 0.32;
      largo = 12.5;
      ancho = 9.8;
      alto = 10;
    } else {
      peso = frascos * 0.32;
      largo = 23.0;
      ancho = 18.0;
      alto = 10.0;
    }

    // Crear cotizacion con formato correcto de Skydropx PRO
    const cotizacionBody = {
      address_from: {
        country_code: "MX",
        postal_code: "16035",
        area_level1: "Ciudad de Mexico",
        area_level2: "Xochimilco",
        area_level3: "San Lorenzo La Cebada",
        name: "Jam i N i",
        phone: "5610176064",
        email: "salsajamini@gmail.com"
      },
      address_to: {
        country_code: "MX",
        postal_code: cp_destino,
        name: "Cliente",
        phone: "5500000000",
        email: "cliente@email.com"
      },
      packages: [
        {
          weight: peso,
          height: alto,
          width: ancho,
          length: largo,
          mass_unit: "kg",
          distance_unit: "cm"
        }
      ]
    };

    console.log("Cotizando con body:", JSON.stringify(cotizacionBody));

    const cotizacionRes = await fetch("https://api-pro.skydropx.com/api/v1/quotations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(cotizacionBody)
    });

    const cotizacionData = await cotizacionRes.json();
    console.log("Cotizacion response:", JSON.stringify(cotizacionData).substring(0, 500));

    if (!cotizacionRes.ok) {
      console.error("Cotizacion error:", cotizacionData);
      return res.status(500).json({ error: "Error al cotizar envio", detalle: cotizacionData });
    }

    const cotizacionId = cotizacionData.data && cotizacionData.data.id;
    if (!cotizacionId) {
      return res.status(500).json({ error: "No se obtuvo ID de cotizacion" });
    }

    // Reintentar hasta que la cotizacion este completa
    var rates = [];
    var intentos = 0;

    while (intentos < 8) {
      await new Promise(function(r) { setTimeout(r, 2500); });
      intentos++;

      var ratesRes = await fetch("https://api-pro.skydropx.com/api/v1/quotations/" + cotizacionId, {
        headers: { "Authorization": "Bearer " + token }
      });

      if (!ratesRes.ok) {
        console.log("Intento " + intentos + " - error obteniendo rates");
        continue;
      }

      var ratesData = await ratesRes.json();
      var attrs = ratesData.data && ratesData.data.attributes;
      var isCompleted = attrs && attrs.is_completed;
      rates = (attrs && attrs.rates) || [];

      console.log("Intento " + intentos + " - completed: " + isCompleted + " - rates: " + rates.length);

      if (isCompleted) break;
    }

    if (rates.length === 0) {
      return res.status(200).json({
        cotizacion_id: cotizacionId,
        rates: [],
        mensaje: "No hay opciones de envio disponibles para este CP"
      });
    }

    // Ordenar por precio y devolver las mejores opciones
    var ratesOrdenados = rates
      .filter(function(r) { return r.total_pricing || r.amount_local; })
      .sort(function(a, b) {
        return (a.total_pricing || a.amount_local) - (b.total_pricing || b.amount_local);
      })
      .slice(0, 5)
      .map(function(r) {
        return {
          rate_id: r.id,
          carrier: r.carrier || r.carrier_name || "Paqueteria",
          service: r.service_level_name || r.service || "Estandar",
          precio: Math.ceil(r.total_pricing || r.amount_local || 0),
          dias: r.days || r.estimated_days || "3-5",
          cotizacion_id: cotizacionId
        };
      });

    return res.status(200).json({
      cotizacion_id: cotizacionId,
      rates: ratesOrdenados
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Error interno del servidor", detalle: error.message });
  }
}
