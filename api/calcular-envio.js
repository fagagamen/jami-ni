module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { cp_destino, total_frascos } = req.body;

    if (!cp_destino || String(cp_destino).length !== 5) {
      return res.status(400).json({ error: "CP invalido" });
    }

    // Paso 1: Obtener estado y municipio del CP usando API gratuita de Mexico
    var estadoDestino = "Mexico";
    var municipioDestino = "Mexico";

    try {
      var cpRes = await fetch("https://mexico-api.devaleff.com/api/codigo-postal/" + String(cp_destino));
      if (cpRes.ok) {
        var cpData = await cpRes.json();
        if (cpData.data && cpData.data.length > 0) {
          estadoDestino = cpData.data[0].d_estado || "Mexico";
          municipioDestino = cpData.data[0].D_mnpio || "Mexico";
          console.log("CP lookup OK:", estadoDestino, municipioDestino);
        }
      }
    } catch(e) {
      console.log("CP lookup failed, using defaults:", e.message);
    }

    // Paso 2: Obtener token OAuth de Skydropx
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
      return res.status(500).json({ error: "Error autenticando con Skydropx", detalle: tokenData });
    }
    const token = tokenData.access_token;
    console.log("Token OK");

    // Paso 3: Calcular peso y dimensiones
    var frascos = parseInt(total_frascos) || 1;
    var peso = frascos === 1 ? 0.32 : frascos * 0.32;
    var largo = frascos === 1 ? 12.5 : 23.0;
    var ancho = frascos === 1 ? 9.8 : 18.0;
    var alto = 10.0;

    // Paso 4: Crear cotizacion con estado y municipio reales
    var bodyObj = {
      quotation: {
      address_from: {
        country_code: "MX",
        postal_code: "16035",
        area_level1: "Ciudad de México",
        area_level2: "Xochimilco",
        area_level3: "San Lorenzo La Cebada",
        name: "Jami Ni",
        phone: "5610176064",
        email: "salsajamini@gmail.com"
      },
      address_to: {
        country_code: "MX",
        postal_code: String(cp_destino),
        area_level1: estadoDestino,
        area_level2: municipioDestino,
        area_level3: "Centro",
        name: "Cliente",
        phone: "5500000000",
        email: "cliente@email.com"
      },
      parcel: {
        weight: peso,
        length: Math.ceil(largo),
        width: Math.ceil(ancho),
        height: Math.ceil(alto),
        mass_unit: "kg",
        distance_unit: "cm"
      }
      } // end quotation
    };

    var bodyStr = JSON.stringify(bodyObj);
    console.log("Enviando a Skydropx:", bodyStr);

    const cotizacionRes = await fetch("https://api-pro.skydropx.com/api/v2/quotations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token
      },
      body: bodyStr
    });

    var cotizacionText = await cotizacionRes.text();
    console.log("Skydropx FULL response status:", cotizacionRes.status);
    console.log("Skydropx FULL response body:", cotizacionText);

    var cotizacionData;
    try { cotizacionData = JSON.parse(cotizacionText); }
    catch(e) { return res.status(500).json({ error: "Respuesta invalida", raw: cotizacionText.substring(0, 300) }); }

    if (!cotizacionRes.ok) {
      return res.status(500).json({ error: "Error cotizacion", detalle: cotizacionData });
    }

    // New API returns id directly at root level, not nested in data
    var cotizacionId = cotizacionData.id || (cotizacionData.data && cotizacionData.data.id);
    if (!cotizacionId) return res.status(500).json({ error: "Sin ID cotizacion", data: cotizacionData });
    console.log("Cotizacion ID:", cotizacionId);

    // Paso 5: Esperar y obtener rates
    var rates = [];
    for (var i = 0; i < 8; i++) {
      await new Promise(function(r) { setTimeout(r, 2500); });
      var ratesRes = await fetch("https://api-pro.skydropx.com/api/v2/quotations/" + cotizacionId, {
        headers: { "Authorization": "Bearer " + token, "Accept": "application/json" }
      });
      if (!ratesRes.ok) continue;
      var ratesData = await ratesRes.json();
      // New API returns rates directly at root level
      var isCompleted = ratesData.is_completed || (ratesData.data && ratesData.data.attributes && ratesData.data.attributes.is_completed);
      rates = ratesData.rates || (ratesData.data && ratesData.data.attributes && ratesData.data.attributes.rates) || [];
      var successRates = rates.filter(function(r) { return r.success && r.total; });
      console.log("Intento", (i+1), "- completed:", isCompleted, "rates:", rates.length, "success:", successRates.length);
      if (isCompleted || successRates.length > 0) break;
    }

    var successRatesFinal = rates.filter(function(r) { return r.success && r.total; });
    if (successRatesFinal.length === 0) {
      return res.status(200).json({ cotizacion_id: cotizacionId, rates: [], mensaje: "Sin opciones disponibles para este CP" });
    }
    rates = successRatesFinal;

    var ratesOrdenados = rates
      .filter(function(r) { return r.success && r.total; })
      .sort(function(a, b) { return (parseFloat(a.total) || 0) - (parseFloat(b.total) || 0); })
      .slice(0, 5)
      .map(function(r) {
        return {
          rate_id: r.id,
          carrier: r.provider_display_name || r.provider_name || "Paqueteria",
          service: r.provider_service_name || "Estandar",
          precio: Math.ceil(parseFloat(r.total) || 0),
          dias: r.days || "3-5",
          cotizacion_id: cotizacionId
        };
      });

    return res.status(200).json({ cotizacion_id: cotizacionId, rates: ratesOrdenados });

  } catch (error) {
    console.error("Error general:", error.message);
    return res.status(500).json({ error: "Error interno", detalle: error.message });
  }
}
