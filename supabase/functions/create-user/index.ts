import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders,
      });
    }
  try {
    const { email, password, full_name, role } = await req.json();

    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Champs manquants." }),
        { status: 400,
            headers: corsHeaders, }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader ?? "",
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Non authentifié." }),
        { status: 401,
            headers: corsHeaders, }
      );
    }

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "Profil admin introuvable." }),
        { status: 403,
            headers: corsHeaders, }
      );
    }

    if (!["admin", "super_admin"].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Accès réservé aux admins." }),
        { status: 403,
            headers: corsHeaders, }
      );
    }

    const { data: createdUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
        },
      });

    if (createError || !createdUser.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? "Création impossible." }),
        { status: 400,
            headers: corsHeaders, }
      );
    }

    const { error: profileInsertError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: createdUser.user.id,
        email,
        full_name,
        role,
      });

    if (profileInsertError) {
      return new Response(
        JSON.stringify({ error: profileInsertError.message }),
        { status: 400,
            headers: corsHeaders, }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user_id: createdUser.user.id }),
      { status: 200,
        headers: corsHeaders, }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500,
        headers: corsHeaders, }
    );
  }
});