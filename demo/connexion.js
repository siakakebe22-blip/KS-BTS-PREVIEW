import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";

const SUPABASE_URL = "https://fbqtbaeanxromfksfllr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mrjyeLhdCSiUeSXZzqpAZw_x02KJfEG";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);

let mode = "login";
let busy = false;
let currentUserId = null;
let selectedCompanyId = null;
let companyLoadSequence = 0;
let recoveryMode = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";

function notice(message, kind = "") {
  const el = $("notice");
  el.textContent = message;
  el.className = "notice" + (kind ? " " + kind : "");
  el.hidden = !message;
}
function setBusy(value) {
  busy = value;
  $("submitAuth").disabled = value;
  $("createCompany").disabled = value;
}
function showMode(next) {
  mode = next;
  $("loginTab").classList.toggle("active", mode === "login");
  $("signupTab").classList.toggle("active", mode === "signup");
  $("loginTab").setAttribute("aria-selected", String(mode === "login"));
  $("signupTab").setAttribute("aria-selected", String(mode === "signup"));
  $("nameField").hidden = mode !== "signup";
  $("forgotPassword").hidden = mode !== "login";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("submitAuth").textContent = mode === "login" ? "Se connecter" : "Créer mon compte";
  $("heading").textContent = mode === "login" ? "Accéder à KS BTP" : "Créer votre compte";
  $("intro").textContent = mode === "login" ? "Connectez-vous à votre compte professionnel." : "Créez votre accès personnel à KS BTP.";
  notice("");
}
function showAuthenticated(user) {
  currentUserId = user.id;
  $("authPanel").hidden = true;
  $("recoveryPanel").hidden = true;
  $("companyPanel").hidden = false;
  $("heading").textContent = "Votre espace KS BTP";
  $("intro").textContent = "Choisissez l'entreprise que vous souhaitez gérer.";
  $("signedInEmail").textContent = user.email || "";
  loadCompanies(user.id);
}
function showUnauthenticated() {
  currentUserId = null;
  selectedCompanyId = null;
  companyLoadSequence++;
  $("authPanel").hidden = false;
  $("companyPanel").hidden = true;
  $("recoveryPanel").hidden = true;
  if (!recoveryMode) showMode("login");
}
function renderCompanies(companies) {
  const list = $("companyList");
  const openDashboard = $("openDashboard");
  openDashboard.hidden = true;
  openDashboard.onclick = null;
  list.replaceChildren();
  if (!companies.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucune entreprise n'est encore associée à ce compte. Vous pouvez créer votre premier espace ci-dessous.";
    list.append(empty);
    $("createCompanyPanel").open = true;
    return;
  }
  companies.forEach((company) => {
    const card = document.createElement("article");
    card.className = "company-card";
    const details = document.createElement("div");
    details.className = "company-details";
    const name = document.createElement("strong");
    name.textContent = company.name;
    const slug = document.createElement("span");
    slug.className = "muted";
    slug.textContent = company.slug;
    details.append(name, slug);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "company-select";
    button.textContent = selectedCompanyId === company.id ? "Entreprise sélectionnée" : "Sélectionner";
    button.disabled = selectedCompanyId === company.id;
    button.addEventListener("click", () => {
      selectedCompanyId = company.id;
      renderCompanies(companies);
      notice("Entreprise sélectionnée : " + company.name + ". Les modules de gestion cloud seront raccordés dans une prochaine étape.", "success");
    });
    card.append(details, button);
    if (selectedCompanyId === company.id) card.classList.add("selected");
    list.append(card);
  });
  const selectedCompany = companies.find(company => company.id === selectedCompanyId);
  if (selectedCompany) {
    openDashboard.hidden = false;
    openDashboard.onclick = () => {
      const params = new URLSearchParams({
        company_name: selectedCompany.name,
        company_slug: selectedCompany.slug || ""
      });
      location.href = "dashboard-cloud.html?" + params.toString();
    };
  }
}
async function loadCompanies(userId, selectAfterLoad = null) {
  const sequence = ++companyLoadSequence;
  $("companyList").textContent = "Chargement de vos entreprises…";
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .order("created_at", { ascending: true });
  if (sequence !== companyLoadSequence || currentUserId !== userId) return;
  if (error) {
    $("companyList").textContent = "Impossible de charger les entreprises. Vérifiez la connexion et les autorisations RLS.";
    notice("Chargement des entreprises impossible : " + error.message, "error");
    return;
  }
  const companies = Array.isArray(data) ? data : [];
  if (selectAfterLoad && companies.some(company => company.id === selectAfterLoad)) {
    selectedCompanyId = selectAfterLoad;
  } else if (selectedCompanyId && !companies.some(company => company.id === selectedCompanyId)) {
    selectedCompanyId = null;
  }
  renderCompanies(companies);
}

$("loginTab").addEventListener("click", () => showMode("login"));
$("signupTab").addEventListener("click", () => showMode("signup"));

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const email = $("email").value.trim();
  const password = $("password").value;
  setBusy(true);
  notice("Traitement en cours…");
  try {
    if (mode === "signup") {
      const fullName = $("fullName").value.trim();
      if (fullName.length < 2) throw new Error("Veuillez saisir votre nom complet.");
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { display_name: fullName },
          emailRedirectTo: location.origin + location.pathname
        }
      });
      if (error) throw error;
      if (data.session) showAuthenticated(data.user);
      else notice("Compte créé. Consultez votre boîte e-mail pour confirmer l'adresse avant de vous connecter.", "success");
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showAuthenticated(data.user);
    }
  } catch (error) {
    notice(error.message || "Impossible de terminer cette opération.", "error");
  } finally {
    setBusy(false);
  }
});

$("forgotPassword").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) { notice("Saisissez d'abord votre adresse e-mail."); $("email").focus(); return; }
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
    if (error) throw error;
    notice("Si cette adresse est associée à un compte, un e-mail de réinitialisation sera envoyé.", "success");
  } catch (error) {
    notice(error.message || "Envoi de l'e-mail impossible.", "error");
  }
});

$("recoveryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("newPassword").value;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    recoveryMode = false;
    history.replaceState(null, "", location.pathname + location.search);
    notice("Mot de passe mis à jour. Vous êtes connecté.", "success");
    const { data } = await supabase.auth.getUser();
    if (data.user) showAuthenticated(data.user);
  } catch (error) {
    notice(error.message || "Mise à jour impossible.", "error");
  }
});

$("companyName").addEventListener("input", () => {
  if (!$("companySlug").dataset.edited) $("companySlug").value = slugify($("companyName").value);
});
$("companySlug").addEventListener("input", () => { $("companySlug").dataset.edited = "1"; });
function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
$("companyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const name = $("companyName").value.trim();
  const slug = $("companySlug").value.trim().toLowerCase();
  if (name.length < 2 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3) {
    notice("Vérifiez le nom et l'identifiant de l'entreprise (3 caractères minimum, lettres minuscules, chiffres et tirets).", "error");
    return;
  }
  setBusy(true);
  notice("Création de l'espace entreprise…");
  try {
    const { data, error } = await supabase.rpc("create_company_with_central_stock", {
      p_name: name,
      p_slug: slug
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.company_id || !result?.central_location_id) {
      throw new Error("La réponse de création est incomplète. Vérifiez l'espace entreprise avant de recommencer.");
    }
    $("companyForm").reset();
    $("companySlug").dataset.edited = "";
    notice("Espace entreprise créé. Actualisation de votre liste…", "success");
    if (currentUserId) await loadCompanies(currentUserId, result.company_id);
  } catch (error) {
    notice(error.message || "Création de l'espace impossible. Vérifiez les autorisations Supabase et la disponibilité de l'identifiant.", "error");
  } finally {
    setBusy(false);
  }
});

$("signOut").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) notice(error.message, "error");
  else { recoveryMode = false; showUnauthenticated(); }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    $("authPanel").hidden = true;
    $("companyPanel").hidden = true;
    $("recoveryPanel").hidden = false;
    $("heading").textContent = "Réinitialiser le mot de passe";
    $("intro").textContent = "Choisissez un nouveau mot de passe pour votre compte.";
    notice("");
    return;
  }
  if (session?.user && !recoveryMode) showAuthenticated(session.user);
  else if (!session && !recoveryMode) showUnauthenticated();
});

const { data: { session } } = await supabase.auth.getSession();
if (recoveryMode) {
  $("authPanel").hidden = true;
  $("companyPanel").hidden = true;
  $("recoveryPanel").hidden = false;
  $("heading").textContent = "Réinitialiser le mot de passe";
  $("intro").textContent = "Choisissez un nouveau mot de passe pour votre compte.";
} else if (session?.user) showAuthenticated(session.user);
else showUnauthenticated();
