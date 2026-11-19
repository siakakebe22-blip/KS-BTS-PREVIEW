import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";

const SUPABASE_URL = "https://fbqtbaeanxromfksfllr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mrjyeLhdCSiUeSXZzqpAZw_x02KJfEG";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let companyId = params.get("company_id");
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");

function showError(message) {
  $("loadState").hidden = false;
  $("loadState").textContent = message;
  $("loadState").className = "notice error";
}
function showLoaded() {
  $("loadState").hidden = false;
  $("loadState").textContent = "Données cloud consultées en lecture seule. Aucune donnée n'a été modifiée.";
  $("loadState").className = "notice success";
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fr-FR");
}
function setMetric(id, value) {
  $(id).textContent = value == null ? "—" : Number(value).toLocaleString("fr-FR");
}
function renderMovements(rows) {
  const list = $("movementList");
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun mouvement enregistré pour cette entreprise.";
    list.append(empty);
    return;
  }
  rows.forEach((movement) => {
    const item = document.createElement("article");
    item.className = "movement-row";
    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = movement.movement_type || "Mouvement";
    const detail = document.createElement("p");
    detail.textContent = (movement.reference || movement.notes || "Sans référence") +
      " · Quantité : " + Number(movement.quantity).toLocaleString("fr-FR");
    const date = document.createElement("time");
    date.className = "muted";
    date.textContent = formatDate(movement.created_at);
    main.append(title, detail);
    item.append(main, date);
    list.append(item);
  });
}

async function loadDashboard() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) {
    location.replace("connexion.html");
    return;
  }

  // Secours strictement en lecture seule : si le lien a perdu company_id,
  // on récupère automatiquement l’entreprise uniquement si RLS en retourne une seule.
  if (!isUuid(companyId)) {
    const { data: accessibleCompanies, error: listError } = await supabase
      .from("companies")
      .select("id,name,slug")
      .order("created_at", { ascending: true })
      .limit(2);
    if (listError) throw listError;
    if (accessibleCompanies?.length === 1) {
      companyId = accessibleCompanies[0].id;
    } else if (accessibleCompanies?.length > 1) {
      throw new Error("Plusieurs entreprises sont accessibles. Retournez à la sélection et choisissez KS BTP Koloma.");
    } else {
      throw new Error("Aucune entreprise accessible pour ce compte. Retournez à la sélection des entreprises.");
    }
  }

  // Cette lecture vérifie que l'utilisateur connecté est autorisé à voir cette entreprise.
  // Les politiques RLS Supabase restent la barrière de sécurité effective.
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw companyError;
  if (!company) {
    throw new Error("Entreprise introuvable ou accès non autorisé pour ce compte.");
  }

  $("company").textContent = "Entreprise : " + company.name + (company.slug ? " · " + company.slug : "");
  const catalogueUrl = new URL("catalogue-cloud.html", location.href);
  catalogueUrl.searchParams.set("company_id", companyId);
  $("catalogueLink").href = catalogueUrl.toString();

  const queries = await Promise.all([
    supabase.from("materials").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("is_active", true),
    supabase.from("construction_sites").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("is_active", true),
    supabase.from("stock_movements").select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase.from("stock_balances").select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase.from("stock_movements")
      .select("id,movement_type,quantity,reference,notes,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  const failed = queries.find((result) => result.error);
  if (failed) throw failed.error;

  setMetric("materialsCount", queries[0].count);
  setMetric("sitesCount", queries[1].count);
  setMetric("movementsCount", queries[2].count);
  setMetric("balancesCount", queries[3].count);
  renderMovements(queries[4].data || []);
  showLoaded();
}

loadDashboard().catch((error) => {
  console.error("KS BTP dashboard read-only:", error);
  showError(error.message || "Impossible de charger les données. Vérifiez la connexion et les autorisations.");
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) location.replace("connexion.html");
});
