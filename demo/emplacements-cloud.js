import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";

const SUPABASE_URL = "https://fbqtbaeanxromfksfllr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mrjyeLhdCSiUeSXZzqpAZw_x02KJfEG";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let companyId = params.get("company_id");
let activeLocations = [];
let activeSites = [];
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");

function setMessage(id, message) {
  $(id).textContent = message;
}
function renderLocations(rows) {
  const list = $("locationList");
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun emplacement actif trouvé.";
    list.append(empty);
    return;
  }
  rows.forEach((row) => {
    const item = document.createElement("article");
    item.className = "item";
    const name = document.createElement("strong");
    name.textContent = row.name;
    const detail = document.createElement("small");
    detail.textContent = (row.location_type === "central" ? "Dépôt central" : row.location_type === "chantier" ? "Emplacement de chantier" : row.location_type) +
      (row.site_id ? " · Chantier associé" : "");
    item.append(name, detail);
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

  const [locationsResult, sitesResult] = await Promise.all([
    supabase.from("stock_locations").select("id,name,location_type,site_id")
      .eq("company_id", companyId).eq("is_active", true).order("name", { ascending: true }),
    supabase.from("construction_sites").select("id,name")
      .eq("company_id", companyId).eq("is_active", true).order("name", { ascending: true })
  ]);
  if (locationsResult.error) throw locationsResult.error;
  if (sitesResult.error) throw sitesResult.error;
  activeLocations = locationsResult.data || [];
  activeSites = sitesResult.data || [];
  renderLocations(activeLocations);
  setMessage("locationState", activeLocations.length + " emplacement(s) actif(s) consulté(s) en lecture seule.");
  const select = $("siteId");
  select.replaceChildren(new Option("Choisir un chantier", ""));
  activeSites.forEach((site) => select.add(new Option(site.name, site.id)));
  if (!activeSites.length) {
    select.disabled = true;
    setMessage("siteState", "Aucun chantier actif n'est encore enregistré. La préparation d'un emplacement de chantier reste donc bloquée.");
  } else {
    select.disabled = false;
    setMessage("siteState", activeSites.length + " chantier(s) actif(s) disponible(s) en lecture seule.");
  }
}
const form = $("locationForm");
const preview = $("preview");
form.addEventListener("input", () => {
  $("locationName").setCustomValidity("");
  $("siteId").setCustomValidity("");
});
form.addEventListener("change", () => {
  $("locationName").setCustomValidity("");
  $("siteId").setCustomValidity("");
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("locationName");
  const siteSelect = $("siteId");
  name.setCustomValidity("");
  siteSelect.setCustomValidity("");
  if (!name.value.trim()) name.setCustomValidity("Saisissez un nom d'emplacement.");
  if (siteSelect.disabled || !siteSelect.value ||
      !activeSites.some((site) => site.id === siteSelect.value)) {
    siteSelect.setCustomValidity("Sélectionnez un chantier actif dans la liste.");
  }
  if (activeLocations.some((row) => row.name.trim().toLocaleLowerCase() === name.value.trim().toLocaleLowerCase())) {
    name.setCustomValidity("Un emplacement actif porte déjà ce nom.");
  }
  if (!form.reportValidity()) return;
  const site = activeSites.find((row) => row.id === siteSelect.value);
  preview.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = name.value.trim();
  const details = document.createElement("p");
  details.textContent = "Type : Emplacement de chantier";
  const linked = document.createElement("p");
  linked.textContent = "Chantier associé : " + site.name;
  const note = document.createElement("p");
  note.textContent = "Aperçu temporaire uniquement — aucune donnée n'a été envoyée ni enregistrée.";
  preview.append(title, details, linked, note);
});
form.addEventListener("reset", () => {
  preview.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "Aucun emplacement préparé";
  const note = document.createElement("p");
  note.textContent = "Choisissez un chantier et saisissez un nom.";
  preview.append(title, note);
});
loadPage().catch((error) => {
  console.error("KS BTP emplacements read-only:", error);
  setMessage("locationState", error.message || "Impossible de charger les emplacements.");
  setMessage("siteState", "Chargement des chantiers impossible.");
});
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) location.replace("connexion.html");
});
