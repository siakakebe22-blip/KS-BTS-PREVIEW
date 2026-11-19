import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";

const SUPABASE_URL = "https://fbqtbaeanxromfksfllr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mrjyeLhdCSiUeSXZzqpAZw_x02KJfEG";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let companyId = params.get("company_id");
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");

function showState(message, kind = "info") {
  const state = $("locationState");
  state.hidden = false;
  state.textContent = message;
  state.dataset.kind = kind;
}

async function loadLocations() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session?.user) {
    location.replace("connexion.html");
    return;
  }

  if (!isUuid(companyId)) {
    const { data, error } = await supabase.from("companies")
      .select("id,name,slug").order("created_at", { ascending: true }).limit(2);
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

  const { data: locations, error: locationsError } = await supabase.from("stock_locations")
    .select("id,name,location_type,site_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (locationsError) throw locationsError;

  const select = $("locationLabel");
  select.replaceChildren(new Option("Choisir un emplacement", ""));
  (locations || []).forEach((item) => {
    const typeLabel = item.location_type === "central" ? "Dépôt central" :
      item.location_type === "site" ? "Chantier" : item.location_type;
    const option = new Option(item.name + " — " + typeLabel, item.id);
    option.dataset.name = item.name;
    select.add(option);
  });

  if (!locations?.length) {
    select.disabled = true;
    showState("Aucun emplacement actif trouvé pour cette entreprise.", "warning");
  } else {
    select.disabled = false;
    showState(locations.length + " emplacement(s) actif(s) chargé(s) depuis Supabase en lecture seule.", "success");
  }
}

const form = $("materialForm");
const preview = $("preview");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const select = $("locationLabel");
  const values = {
    reference: $("reference").value.trim(),
    name: $("name").value.trim(),
    category: $("category").value.trim(),
    unit: $("unit").value,
    condition: $("condition").value,
    description: $("description").value.trim(),
    active: $("active").checked,
    initialQuantity: $("initialQuantity").value,
    locationLabel: select.selectedOptions[0]?.textContent || "",
    threshold: $("threshold").value
  };
  preview.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = values.name;
  preview.append(title);
  const lines = [
    "Référence : " + (values.reference || "Non renseignée"),
    "Catégorie : " + (values.category || "Non renseignée"),
    "Unité : " + values.unit,
    "État : " + values.condition,
    "Statut : " + (values.active ? "Actif" : "Inactif"),
    "Description : " + (values.description || "Aucune"),
    "Quantité initiale (aperçu) : " + (values.initialQuantity || "0"),
    "Emplacement cloud sélectionné : " + (values.locationLabel || "Aucun emplacement choisi"),
    "Seuil d'alerte (provisoire, non pris en charge par le schéma actuel) : " + (values.threshold || "Non renseigné")
  ];
  lines.forEach((value) => {
    const p = document.createElement("p");
    p.textContent = value;
    preview.append(p);
  });
  const note = document.createElement("p");
  note.textContent = "Aperçu temporaire uniquement — rien n'a été envoyé ni enregistré.";
  preview.append(note);
});

form.addEventListener("reset", () => {
  preview.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = "Aucune fiche préparée";
  const p = document.createElement("p");
  p.textContent = "Remplissez le formulaire puis choisissez « Vérifier les informations ».";
  preview.append(strong, p);
});

loadLocations().catch((error) => {
  console.error("KS BTP catalogue locations read-only:", error);
  showState(error.message || "Impossible de charger les emplacements.", "error");
});
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) location.replace("connexion.html");
});
