import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";

const SUPABASE_URL = "https://fbqtbaeanxromfksfllr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mrjyeLhdCSiUeSXZzqpAZw_x02KJfEG";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let companyId = params.get("company_id");
let knownSites = [];
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");

function renderSites(rows) {
  const list = $("siteList");
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun chantier n'est encore enregistré pour cette entreprise.";
    list.append(empty);
    return;
  }
  rows.forEach((site) => {
    const item = document.createElement("article");
    item.className = "item";
    const name = document.createElement("strong");
    name.textContent = site.name || "Chantier sans nom";
    const state = document.createElement("small");
    state.textContent = site.is_active ? "Statut : actif" : "Statut : inactif";
    item.append(name, state);
    list.append(item);
  });
}
async function loadPage() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session?.user) {
    location.replace("connexion.html");
    return;
  }
  if (!isUuid(companyId)) {
    const { data, error } = await supabase.from("companies")
      .select("id,name").order("created_at", { ascending: true }).limit(2);
    if (error) throw error;
    if (data?.length !== 1) {
      throw new Error(data?.length > 1
        ? "Plusieurs entreprises sont accessibles. Revenez au tableau de bord pour choisir l'entreprise."
        : "Aucune entreprise accessible pour ce compte.");
    }
    companyId = data[0].id;
  }
  const { data: company, error: companyError } = await supabase.from("companies")
    .select("id,name").eq("id", companyId).maybeSingle();
  if (companyError) throw companyError;
  if (!company) throw new Error("Entreprise introuvable ou accès non autorisé.");
  $("companyName").textContent = "Entreprise : " + company.name;
  const dashboardUrl = new URL("dashboard-cloud.html", location.href);
  dashboardUrl.searchParams.set("company_id", companyId);
  $("backLink").href = dashboardUrl.toString();

  const { data, error } = await supabase.from("construction_sites")
    .select("id,name,is_active")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  knownSites = data || [];
  renderSites(knownSites);
  $("siteState").textContent = knownSites.length
    ? knownSites.length + " chantier(s) consulté(s) en lecture seule."
    : "Aucun chantier enregistré. Vous pouvez préparer une première fiche en aperçu.";

  // Fiche de démonstration préremplie : elle reste locale et n'est jamais envoyée à Supabase.
  if (!knownSites.some((site) => (site.name || "").trim().toLocaleLowerCase() === "bâtiment gbessia")) {
    $("siteReference").value = "CH-001";
    $("siteName").value = "Bâtiment Gbessia";
    $("siteAddress").value = "Gbessia, Conakry";
    $("siteManager").value = "Barry";
    $("siteStatus").value = "active";
    $("siteDescription").value = "Aucune";
    form.requestSubmit();
  }
}
$("siteSearch").addEventListener("input", () => {
  const term = $("siteSearch").value.trim().toLocaleLowerCase();
  renderSites(knownSites.filter((site) => (site.name || "").toLocaleLowerCase().includes(term)));
});
const form = $("siteForm");
const preview = $("preview");
form.addEventListener("input", () => $("siteName").setCustomValidity(""));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("siteName");
  name.setCustomValidity("");
  const normalized = name.value.trim().toLocaleLowerCase();
  if (!normalized) name.setCustomValidity("Saisissez le nom du chantier.");
  if (knownSites.some((site) => (site.name || "").trim().toLocaleLowerCase() === normalized)) {
    name.setCustomValidity("Un chantier porte déjà ce nom dans la liste consultée.");
  }
  if (!form.reportValidity()) return;
  const lines = [
    "Référence : " + ($("siteReference").value.trim() || "Non renseignée"),
    "Localisation : " + ($("siteAddress").value.trim() || "Non renseignée"),
    "Responsable : " + ($("siteManager").value.trim() || "Non renseigné"),
    "Statut souhaité : " + ($("siteStatus").value === "active" ? "Actif" : "Terminé"),
    "Observations : " + ($("siteDescription").value.trim() || "Aucune")
  ];
  preview.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = name.value.trim();
  preview.append(title);
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    preview.append(p);
  });
  const note = document.createElement("p");
  note.textContent = "Aperçu temporaire uniquement — aucune donnée n'a été envoyée ni enregistrée.";
  preview.append(note);
});
form.addEventListener("reset", () => {
  preview.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "Aucune fiche préparée";
  const note = document.createElement("p");
  note.textContent = "Remplissez le formulaire puis vérifiez les informations.";
  preview.append(title, note);
});
loadPage().catch((error) => {
  console.error("KS BTP chantiers read-only:", error);
  $("siteState").textContent = error.message || "Impossible de charger les chantiers.";
});
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) location.replace("connexion.html");
});
