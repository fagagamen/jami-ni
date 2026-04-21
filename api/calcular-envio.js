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

    // Paso 1: Obtener estado y municipio del CP
    var estadoDestino = "Ciudad de México";
    var municipioDestino = "Cuauhtémoc";
    try {
      var cpRes = await fetch("https://mexico-api.devaleff.com/api/codigo-postal/" + String(cp_destino));
      if (cpRes.ok) {
        var cpData = await cpRes.json();
        if (cpData.data && cpData.data.length > 0) {
          estadoDestino = cpData.data[0].d_estado || estadoDestino;
          municipioDestino = cpData.data[0].D_mnpio || municipioDestino;
          console.log("CP lookup OK:", estadoDestino, municipioDestino);
        }
      }
    } catch(e) { console.log("CP lookup failed:", e.message); }

    // Paso 2: Token OAuth
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

    // Paso 3: Calcular dimensiones
    var frascos = parseInt(total_frascos) || 1;
    var peso = frascos === 1 ? 0.32 : frascos * 0.32;
    var largo = frascos === 1 ? 13 : 23;
    var ancho = frascos === 1 ? 10 : 18;
    var alto = 10;

    // Paso 4: Crear cotizacion
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
          length: largo,
          width: ancho,
          height: alto,
          mass_unit: "kg",
          distance_unit: "cm"
        }
      }
    };

    const cotizacionRes = await fetch("https://api-pro.skydropx.com/api/v1/quotations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(bodyObj)
    });

    var cotizacionText = await cotizacionRes.text();
    if (!cotizacionRes.ok) {
      return res.status(500).json({ error: "Error cotizacion", detalle: JSON.parse(cotizacionText) });
    }

    var cotizacionData = JSON.parse(cotizacionText);
    var cotizacionId = cotizacionData.id;
    console.log("Cotizacion ID:", cotizacionId, "completed:", cotizacionData.is_completed);

    // Paso 5: Leer rates - vienen en la respuesta inicial
    var rates = cotizacionData.rates || [];
    var successRates = rates.filter(function(r) { return r.success && r.total; });

    // Si no estan completos, hacer polling
    if (!cotizacionData.is_completed || successRates.length === 0) {
      for (var i = 0; i < 5; i++) {
        await new Promise(function(r) { setTimeout(r, 2500); });
        var ratesRes = await fetch("https://api-pro.skydropx.com/api/v1/quotations/" + cotizacionId, {
          headers: { "Authorization": "Bearer " + token, "Accept": "application/json" }
        });
        if (!ratesRes.ok) continue;
        var ratesData = await ratesRes.json();
        rates = ratesData.rates || rates;
        successRates = rates.filter(function(r) { return r.success && r.total; });
        console.log("Polling", (i+1), "- completed:", ratesData.is_completed, "success:", successRates.length);
        if (ratesData.is_completed && successRates.length > 0) break;
      }
    }

    if (successRates.length === 0) {
      return res.status(200).json({ cotizacion_id: cotizacionId, rates: [] });
    }

    var ratesOrdenados = successRates
      .sort(function(a, b) { return parseFloat(a.total) - parseFloat(b.total); })
      .slice(0, 5)
      .map(function(r) {
        return {
          rate_id: r.id,
          carrier: r.provider_display_name || r.provider_name || "Paqueteria",
          service: r.provider_service_name || "Estandar",
          precio: Math.ceil(parseFloat(r.total)),
          dias: r.days || "3-5",
          cotizacion_id: cotizacionId
        };
      });

    console.log("Rates encontrados:", ratesOrdenados.length);
    return res.status(200).json({ cotizacion_id: cotizacionId, rates: ratesOrdenados });

  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ error: "Error interno", detalle: error.message });
  }
}
