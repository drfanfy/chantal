import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json() as { prompt: string };

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: "prompt manquant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hfToken = Deno.env.get("HUGGINGFACE_TOKEN");
    if (!hfToken) {
      return new Response(
        JSON.stringify({ error: "HUGGINGFACE_TOKEN non configuré dans les secrets Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Timeout 50s pour rester dans les limites Supabase Edge Functions
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50_000);

    let hfRes: Response;
    try {
      // stabilityai/sdxl-turbo : modèle rapide (1-4s), toujours chaud sur HF
      hfRes = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/sdxl-turbo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${hfToken}`,
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { num_inference_steps: 2, guidance_scale: 0 },
          }),
          signal: controller.signal,
        }
      );
    } catch (e) {
      clearTimeout(timer);
      return new Response(JSON.stringify({ error: `Timeout ou erreur réseau HF: ${e}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    clearTimeout(timer);

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      return new Response(JSON.stringify({ error: `HuggingFace ${hfRes.status}: ${errText}` }), {
        status: hfRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Uploader directement dans Supabase Storage (pas de round-trip navigateur)
    const imageBlob = await hfRes.blob();
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, imageBlob, { contentType: "image/jpeg" });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Storage: ${uploadError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("avatars")
      .getPublicUrl(uploadData.path);

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
