const KEY="ks_btp_v1";
const CATEGORIES=["Maçonnerie","Électricité","Soudure","Peinture","Plomberie","Carrelage","Autre"];
const initial={company:"KS BTP",currency:"GNF",threshold:2,materials:[],sites:[],movements:[],maintenance:[],documents:[]};
let db=load();
let currentPage="dashboard";
let userProfiles=[];
const $=s=>document.querySelector(s);
function load(){try{return {...initial,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return {...initial}}}
function save(){localStorage.setItem(KEY,JSON.stringify(db));window.KSBtpOfflineStorage?.saveSnapshot(db).then(()=>window.dispatchEvent(new CustomEvent("ks-offline-saved"))).catch(error=>{console.error(error);window.dispatchEvent(new CustomEvent("ks-offline-save-error",{detail:error.message}))});}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v){return new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(Number(v)||0)+" "+db.currency}
function date(v){return new Date(v).toLocaleDateString("fr-FR")}
function id(){return "K"+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase()}
function stockAt(item,location){return (Number(item.quantity)||0)}
function totalStock(){return db.materials.reduce((s,m)=>s+Number(m.quantity||0),0)}
function go(page){currentPage=page;document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#pageTitle").textContent=({dashboard:"Tableau de bord",materials:"Gestion des matériels",sites:"Gestion des chantiers",movements:"Mouvements de stock",maintenance:"Maintenance",reports:"Rapports",settings:"Paramètres",documents:"Bons de stock",users:"Gestion des utilisateurs"})[page];render();$("#sidebar").classList.remove("open")}
function render(){const target=$("#pageContent");({dashboard:dashboard,materials:materialsPage,sites:sitesPage,movements:movementsPage,documents:documentsPage,maintenance:maintenancePage,reports:reportsPage,settings:settingsPage,users:usersPage}[currentPage]||dashboard)(target)}
function dashboard(el){const low=db.materials.filter(m=>Number(m.quantity)<=Number(m.threshold||db.threshold));el.innerHTML=`<div class="welcome"><div><h2>Bienvenue dans KS BTP</h2><p>Suivez vos matériels du magasin central jusqu'aux chantiers.</p></div><div class="quick-actions"><button class="button primary" data-action="add-material">＋ Nouveau matériel</button><button class="button secondary" data-action="open-voucher" data-type="Sortie">Bon de sortie</button><button class="button secondary" data-action="open-voucher" data-type="Réception">Bon de réception</button><button class="button secondary" data-action="open-voucher" data-type="Retour">Bon de retour</button></div></div><div class="stats-grid"><article class="stat-card"><div class="stat-label">Matériels référencés</div><div class="stat-value">${db.materials.length}</div><div class="stat-note">Articles dans l'inventaire</div></article><article class="stat-card"><div class="stat-label">Stock total</div><div class="stat-value">${totalStock().toLocaleString("fr-FR")}</div><div class="stat-note">Quantités enregistrées</div></article><article class="stat-card"><div class="stat-label">Chantiers actifs</div><div class="stat-value">${db.sites.filter(s=>s.status!=="Clôturé").length}</div><div class="stat-note">Sites suivis</div></article><article class="stat-card"><div class="stat-label">Alertes de stock</div><div class="stat-value">${low.length}</div><div class="stat-note">Sous le seuil minimum</div></article></div><div class="panel-grid"><section class="panel"><div class="panel-head"><h3>Alertes de stock</h3><span class="tag ${low.length?"low":"good"}">${low.length} alerte(s)</span></div>${low.length?low.slice(0,6).map(m=>`<div class="list-row"><div><strong>${esc(m.name)}</strong><span class="muted">${esc(m.category)} · Seuil : ${m.threshold}</span></div><span class="tag low">${m.quantity} ${esc(m.unit)}</span></div>`).join(""):'<div class="empty-state">Aucune alerte de stock pour le moment.</div>'}</section><section class="panel"><h3>Derniers mouvements</h3>${db.movements.slice(-5).reverse().map(m=>`<div class="list-row"><div><strong>${esc(m.type)} · ${esc(m.materialName)}</strong><span class="muted">${esc(m.location)} · ${date(m.date)}</span></div><span class="kpi">${m.quantity}</span></div>`).join("")||'<div class="empty-state">Aucun mouvement enregistré.</div>'}</section></div>`}
function materialsPage(el){el.innerHTML=`<div class="welcome"><div><h2>Inventaire des matériels</h2><p>Référencez les équipements réutilisables et les consommables.</p></div><button class="button primary" data-action="add-material">＋ Ajouter un matériel</button></div><div class="toolbar"><input class="search" id="materialSearch" placeholder="Rechercher par nom ou référence…"><select class="select-filter" id="categoryFilter"><option value="">Toutes les catégories</option>${CATEGORIES.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Désignation</th><th>Catégorie</th><th>Type</th><th>Quantité</th><th>Emplacement</th><th>Actions</th></tr></thead><tbody id="materialRows"></tbody></table></div>`;drawMaterials();$("#materialSearch").addEventListener("input",drawMaterials);$("#categoryFilter").addEventListener("change",drawMaterials)}
function drawMaterials(){const q=($("#materialSearch")?.value||"").toLowerCase(),cat=$("#categoryFilter")?.value||"";const rows=db.materials.filter(m=>(m.name+" "+m.ref).toLowerCase().includes(q)&&(!cat||m.category===cat));$("#materialRows").innerHTML=rows.map(m=>`<tr><td><strong>${esc(m.ref)}</strong></td><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${m.type==="consumable"?"Consommable":"Réutilisable"}</td><td><span class="tag ${Number(m.quantity)<=Number(m.threshold)?"low":"good"}">${m.quantity} ${esc(m.unit)}</span></td><td>${esc(m.location==="central"?"Magasin central":(db.sites.find(s=>s.id===m.location)?.name||"Magasin central"))}</td><td><div class="action-group"><button class="small-button" data-action="edit-material" data-id="${m.id}">Modifier</button><button class="small-button" data-action="delete-material" data-id="${m.id}">Supprimer</button></div></td></tr>`).join("")||'<tr><td colspan="7" class="empty-state">Aucun matériel trouvé.</td></tr>'}
function sitesPage(el){el.innerHTML=`<div class="welcome"><div><h2>Chantiers</h2><p>Enregistrez les lieux de stockage et de consommation.</p></div><button class="button primary" data-action="add-site">＋ Ajouter un chantier</button></div><div class="panel"><div class="table-wrap"><table><thead><tr><th>Chantier</th><th>Responsable</th><th>Adresse / zone</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${db.sites.map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.manager||"—")}</td><td>${esc(s.address||"—")}</td><td><span class="tag">${esc(s.status)}</span></td><td><button class="small-button" data-action="delete-site" data-id="${s.id}">Supprimer</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty-state">Aucun chantier enregistré.</td></tr>'}</tbody></table></div></div>`}
function movementsPage(el){el.innerHTML=`<div class="welcome"><div><h2>Suivi des mouvements</h2><p>Enregistrez les entrées, sorties, transferts et consommations.</p></div><button class="button primary" data-action="add-movement">＋ Nouveau mouvement</button></div><div class="notice">Chaque mouvement enregistré modifie le stock local. Vérifiez le matériel, la quantité et le chantier avant validation. Cette première version ne gère pas encore les validations multi-utilisateurs.</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Matériel</th><th>Quantité</th><th>Destination / origine</th><th>Note</th></tr></thead><tbody>${db.movements.slice().reverse().map(m=>`<tr><td>${date(m.date)}</td><td>${esc(m.type)}</td><td>${esc(m.materialName)}</td><td>${m.quantity}</td><td>${esc(m.location)}</td><td>${esc(m.note||"—")}</td></tr>`).join("")||'<tr><td colspan="6" class="empty-state">Aucun mouvement enregistré.</td></tr>'}</tbody></table></div>`}
function documentsPage(el){const docs=(db.documents||[]).slice().reverse();el.innerHTML=`<div class="welcome"><div><h2>Bons de stock</h2><p>Créer, imprimer et conserver les documents de circulation des matériels.</p></div></div><div class="stats-grid"><article class="stat-card"><div class="stat-label">Bons de sortie</div><div class="stat-value">${docs.filter(d=>d.type==="Sortie").length}</div></article><article class="stat-card"><div class="stat-label">Bons de réception</div><div class="stat-value">${docs.filter(d=>d.type==="Réception").length}</div></article><article class="stat-card"><div class="stat-label">Bons de retour</div><div class="stat-value">${docs.filter(d=>d.type==="Retour").length}</div></article><article class="stat-card"><div class="stat-label">Total des documents</div><div class="stat-value">${docs.length}</div></article></div><div class="panel"><h3>Créer un nouveau document</h3><div class="quick-actions"><button class="button primary" data-action="open-voucher" data-type="Sortie">＋ Bon de sortie</button><button class="button secondary" data-action="open-voucher" data-type="Réception">＋ Bon de réception</button><button class="button secondary" data-action="open-voucher" data-type="Retour">＋ Bon de retour</button></div></div><div class="panel" style="margin-top:16px"><h3>Historique des bons</h3><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Date</th><th>Type</th><th>Matériel</th><th>Quantité</th><th>Chantier</th><th>Document</th></tr></thead><tbody>${docs.map(d=>`<tr><td><strong>${esc(d.ref)}</strong></td><td>${date(d.date)}</td><td>${esc(d.type)}</td><td>${esc(d.materialName)}</td><td>${d.quantity} ${esc(d.unit)}</td><td>${esc(d.site)}</td><td><button class="small-button" data-action="print-voucher" data-id="${d.id}">Imprimer</button></td></tr>`).join("")||'<tr><td colspan="7" class="empty-state">Aucun bon enregistré.</td></tr>'}</tbody></table></div></div>`}
function printVoucher(d){const w=window.open("","_blank");if(!w){alert("Autorisez les fenêtres contextuelles pour imprimer le bon.");return}w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.ref)}</title><style>body{font:14px Arial,sans-serif;margin:40px;color:#172334}h1{text-align:center;color:#14243a}h2{text-align:center;color:#ef8b2c}table{width:100%;border-collapse:collapse;margin:28px 0}td,th{border:1px solid #888;padding:12px;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:80px}.sign div{width:40%;border-top:1px solid #333;padding-top:10px;text-align:center}.meta{margin-top:25px;line-height:2}</style></head><body><h1>${esc(db.company||"KS BTP")}</h1><h2>BON DE ${esc(d.type.toUpperCase())}</h2><p style="text-align:center"><strong>${esc(d.ref)}</strong></p><div class="meta">Date : ${date(d.date)}<br>Chantier : ${esc(d.site)}<br>Responsable / bénéficiaire : ${esc(d.recipient||"—")}</div><table><thead><tr><th>Référence matériel</th><th>Désignation</th><th>Catégorie</th><th>Quantité</th><th>Unité</th></tr></thead><tbody><tr><td>${esc(d.materialRef)}</td><td>${esc(d.materialName)}</td><td>${esc(d.category)}</td><td>${d.quantity}</td><td>${esc(d.unit)}</td></tr></tbody></table><p>Observation : ${esc(d.note||"—")}</p>${d.purchase?`<p>Fournisseur : ${esc(d.purchase.supplier||"—")}<br>Date d’achat : ${esc(d.purchase.date)}<br>Facture : ${esc(d.purchase.invoice||"—")}<br>Prix unitaire : ${d.purchase.unitPrice} ${esc(d.purchase.currency)}<br>Montant total : ${d.purchase.total} ${esc(d.purchase.currency)}<br>Stockage : ${esc(d.purchase.storage)}</p>`:""}<div class="sign"><div>Magasinier<br><br>Signature</div><div>Responsable chantier / bénéficiaire<br><br>Signature</div></div><script>window.onload=()=>window.print()</script></body></html>`);w.document.close()}
function openVoucherForm(type){
  $("#voucherForm").reset();
  $("#voucherType").value=type;
  $("#voucherTitle").textContent="Créer un bon de "+type.toLowerCase();
  const isReceipt=type==="Réception";
  $("#receiptFields").hidden=!isReceipt;
  $("#standardVoucherFields").hidden=isReceipt;
  $("#standardVoucherExtra").hidden=isReceipt;
  $("#voucherExistingMaterial").innerHTML='<option value="">＋ Nouveau matériel à enregistrer</option>'+db.materials.map(m=>`<option value="${m.id}">${esc(m.ref)} — ${esc(m.name)} (stock : ${m.quantity} ${esc(m.unit)})</option>`).join("");
  $("#voucherMaterial").innerHTML=db.materials.map(m=>`<option value="${m.id}">${esc(m.ref)} — ${esc(m.name)} (stock : ${m.quantity} ${esc(m.unit)})</option>`).join("");
  $("#voucherSite").innerHTML='<option value="Magasin central">Magasin central</option>'+db.sites.map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  $("#voucherQuantity").value=1;
  $("#voucherQuantity").max=type==="Sortie"?Number(db.materials[0]?.quantity||0):"";
  $("#voucherSiteLabel").textContent=type==="Sortie"?"Chantier destinataire":"Chantier d'origine";
  $("#purchaseDate").value=new Date().toISOString().slice(0,10);
  $("#purchaseUnitPrice").value="";
  $("#purchaseTotal").value="";
  $("#voucherExistingMaterial").value="";
  $("#receiptMaterialName").value="";
  $("#receiptCategory").value="Maçonnerie";
  $("#receiptType").value="equipment";
  $("#receiptUnit").value="pièce";
  $("#receiptThreshold").value=db.threshold;
  $("#receiptLocation").value="Magasin central";
  $("#purchaseSupplier").value="";
  $("#purchaseInvoice").value="";
  $("#voucherExistingMaterial").onchange=()=>{$("#newReceiptMaterialFields").hidden=!!$("#voucherExistingMaterial").value};
  const total=()=>{$("#purchaseTotal").value=(Number($("#voucherQuantity").value||0)*Number($("#purchaseUnitPrice").value||0)).toLocaleString("fr-FR",{maximumFractionDigits:2})};
  $("#voucherQuantity").oninput=total;$("#purchaseUnitPrice").oninput=total;
  $("#voucherDialog").showModal();
}
function closeVoucher(){ $("#voucherDialog").close() }
function submitVoucher(e){
  e.preventDefault();
  const type=$("#voucherType").value,quantity=Number($("#voucherQuantity").value);
  if(!Number.isFinite(quantity)||quantity<=0){alert("Saisissez une quantité valide.");return}
  let m=null,purchase=null;
  if(type==="Réception"){
    const existingId=$("#voucherExistingMaterial").value;
    if(existingId){m=db.materials.find(x=>x.id===existingId)}
    else{
      const name=$("#receiptMaterialName").value.trim();
      if(!name){alert("Indiquez la désignation du matériel.");return}
      m={id:id(),ref:"MAT-"+String(db.materials.length+1).padStart(4,"0"),name,category:$("#receiptCategory").value,type:$("#receiptType").value,quantity:0,unit:$("#receiptUnit").value.trim()||"pièce",threshold:Number($("#receiptThreshold").value)||0,location:"central",purchaseHistory:[]};
      db.materials.push(m);
    }
    const unitPrice=Number($("#purchaseUnitPrice").value||0);
    purchase={id:id(),date:$("#purchaseDate").value||new Date().toISOString().slice(0,10),supplier:$("#purchaseSupplier").value.trim(),invoice:$("#purchaseInvoice").value.trim(),quantity,unitPrice,total:quantity*unitPrice,currency:db.currency,storage:$("#receiptLocation").value};
    m.quantity=Number(m.quantity||0)+quantity;
    m.location="central";
    m.purchaseHistory=m.purchaseHistory||[];m.purchaseHistory.push(purchase);
    db.purchases=db.purchases||[];db.purchases.push({...purchase,materialId:m.id,materialName:m.name,materialRef:m.ref,category:m.category});
  }else{
    m=db.materials.find(x=>x.id===$("#voucherMaterial").value);
    if(!m){alert("Choisissez un matériel.");return}
    if(type==="Sortie"&&quantity>Number(m.quantity)){alert("Stock insuffisant : bon non créé.");return}
    if(type==="Sortie")m.quantity=Number(m.quantity)-quantity;else m.quantity=Number(m.quantity)+quantity;
  }
  db.documents=db.documents||[];
  const d={id:id(),ref:"BON-"+type.toUpperCase().slice(0,3)+"-"+String(db.documents.length+1).padStart(4,"0"),date:new Date().toISOString(),type,materialId:m.id,materialRef:m.ref,materialName:m.name,category:m.category,quantity,unit:m.unit,site:type==="Réception"?$("#receiptLocation").value:$("#voucherSite").value,recipient:$("#voucherRecipient").value.trim(),note:$("#voucherNote").value.trim(),purchase};
  if(type==="Réception"){d.supplier=purchase.supplier;d.invoice=purchase.invoice;d.purchaseDate=purchase.date;d.unitPrice=purchase.unitPrice;d.totalPurchase=purchase.total}
  db.documents.push(d);
  db.movements.push({id:id(),date:d.date,type:type.toLowerCase(),materialId:m.id,materialName:m.name,quantity,location:d.site,note:"Document "+d.ref+(purchase?" · Fournisseur : "+purchase.supplier:"")});
  save();closeVoucher();render();printVoucher(d);
}
function maintenancePage(el){el.innerHTML=`<div class="welcome"><div><h2>Maintenance et réparations</h2><p>Consignez les pannes, interventions et coûts de réparation.</p></div><button class="button primary" data-action="add-maintenance">＋ Déclarer une intervention</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Matériel</th><th>Problème / intervention</th><th>Coût</th><th>Statut</th></tr></thead><tbody>${db.maintenance.slice().reverse().map(m=>`<tr><td>${date(m.date)}</td><td>${esc(m.materialName)}</td><td>${esc(m.description)}</td><td>${money(m.cost)}</td><td><span class="tag">${esc(m.status)}</span></td></tr>`).join("")||'<tr><td colspan="5" class="empty-state">Aucune intervention enregistrée.</td></tr>'}</tbody></table></div>`}
function reportsPage(el){el.innerHTML=`<div class="welcome"><div><h2>Rapports et exports</h2><p>Consultez les données enregistrées sur cet appareil.</p></div><div class="quick-actions"><button class="button secondary" data-action="export-csv">Exporter matériels (CSV)</button><button class="button primary" data-action="backup">Sauvegarder les données</button></div></div><div class="stats-grid"><article class="stat-card"><div class="stat-label">Matériels</div><div class="stat-value">${db.materials.length}</div></article><article class="stat-card"><div class="stat-label">Chantiers</div><div class="stat-value">${db.sites.length}</div></article><article class="stat-card"><div class="stat-label">Mouvements</div><div class="stat-value">${db.movements.length}</div></article><article class="stat-card"><div class="stat-label">Interventions</div><div class="stat-value">${db.maintenance.length}</div></article></div><div class="panel"><h3>Répartition par catégorie</h3><div class="category-list">${CATEGORIES.map(c=>`<span class="tag">${c} : ${db.materials.filter(m=>m.category===c).length}</span>`).join("")}</div></div><div class="panel" style="margin-top:15px"><h3>Restaurer une sauvegarde</h3><p class="muted">Le fichier JSON remplace les données locales actuelles. Faites une sauvegarde avant toute restauration.</p><input type="file" id="restoreFile" accept="application/json"></div>`}

async function usersPage(el){el.innerHTML=`<div class="notice">La gestion des comptes est désactivée dans cette démonstration indépendante.</div>`;}
function roleLabel(role){
  return ({admin:"Administrateur",director:"Chef / Directeur",storekeeper:"Magasinier",site_manager:"Chef de chantier"})[role]||"Rôle inconnu";
}
async function loadStaffProfiles(){
  const rows=$("#staffRows");
  if(!rows)return;
  try{
    const snap=await window.ksFirebase.db.collection("users").get();
    userProfiles=snap.docs.map(doc=>({uid:doc.id,...doc.data()}));
    rows.innerHTML=userProfiles.map(u=>`<tr>
      <td><strong>${esc(u.displayName||"Sans nom")}</strong></td>
      <td>${esc(u.email||"—")}</td>
      <td>${esc(roleLabel(u.role))}</td>
      <td><span class="tag ${u.active===true?"good":"low"}">${u.active===true?"Actif":"Désactivé"}</span></td>
      <td><div class="action-group">
        <button class="small-button" data-action="toggle-user" data-id="${esc(u.uid)}" ${u.uid===window.ksCurrentUser?.uid?"disabled":""}>${u.active===true?"Désactiver":"Activer"}</button>
        <button class="small-button" data-action="reset-user-password" data-id="${esc(u.uid)}" data-email="${esc(u.email||"")}">Réinitialiser MDP</button>
      </div></td>
    </tr>`).join("")||'<tr><td colspan="5" class="empty-state">Aucun profil enregistré.</td></tr>';
  }catch(error){
    rows.innerHTML='<tr><td colspan="5" class="empty-state">Impossible de charger les comptes. Vérifiez les règles Firestore.</td></tr>';
  }
}
async function createStaffAccount(event){
  event.preventDefault();
  if(window.ksCurrentUser?.role!=="admin"){alert("Action réservée à l’administrateur.");return}
  const name=$("#staffName").value.trim(),email=$("#staffEmail").value.trim(),password=$("#staffPassword").value,role=$("#staffRole").value;
  const message=$("#staffMessage"),button=$("#staffCreateButton");
  if(!name||!email||password.length<6){message.textContent="Vérifiez les informations et utilisez un mot de passe d'au moins 6 caractères.";return}
  button.disabled=true;button.textContent="Création…";message.textContent="";
  let secondaryAuth=null,createdUid=null;
  try{
    const appName="ks-btp-account-creator";
    let secondaryApp;
    try{secondaryApp=firebase.app(appName)}catch(_){secondaryApp=firebase.initializeApp(firebase.app().options,appName)}
    secondaryAuth=secondaryApp.auth();
    const credential=await secondaryAuth.createUserWithEmailAndPassword(email,password);
    createdUid=credential.user.uid;
    await window.ksFirebase.db.collection("users").doc(createdUid).set({
      displayName:name,email,role,active:true,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      createdBy:window.ksCurrentUser.uid
    });
    await secondaryAuth.signOut();
    $("#staffCreateForm").reset();
    message.style.color="#18744e";
    message.textContent="Compte créé. L'employé peut maintenant se connecter.";
    await loadStaffProfiles();
  }catch(error){
    if(secondaryAuth){try{await secondaryAuth.signOut()}catch(_){}}
    message.style.color="#b33d3d";
    if(createdUid){
      message.textContent="Le compte d'authentification a été créé, mais son profil n'a pas pu être enregistré. Contactez l'administrateur avant toute nouvelle tentative.";
    }else{
      const messages={"auth/email-already-in-use":"Cette adresse e-mail possède déjà un compte.","auth/invalid-email":"Adresse e-mail invalide.","auth/weak-password":"Mot de passe trop faible.","auth/operation-not-allowed":"Activez la connexion par e-mail et mot de passe dans Firebase Authentication."};
      message.textContent=messages[error.code]||"Création impossible. Vérifiez la connexion et les paramètres Firebase.";
    }
  }finally{
    button.disabled=false;button.textContent="Créer le compte";
  }
}
async function toggleStaffAccount(uid){
  if(window.ksCurrentUser?.role!=="admin"||uid===window.ksCurrentUser.uid)return;
  const profile=userProfiles.find(u=>u.uid===uid);if(!profile)return;
  try{
    await window.ksFirebase.db.collection("users").doc(uid).update({active:profile.active!==true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    await loadStaffProfiles();
  }catch(error){alert("Impossible de modifier ce compte. Vérifiez les règles Firestore.");}
}
async function resetStaffPassword(uid){
  if(window.ksCurrentUser?.role!=="admin")return;
  const profile=userProfiles.find(u=>u.uid===uid);
  if(!profile?.email){alert("Aucune adresse e-mail enregistrée pour ce compte.");return}
  if(!confirm("Envoyer un lien de réinitialisation à "+profile.email+" ?"))return;
  try{await window.ksFirebase.auth.sendPasswordResetEmail(profile.email);alert("Lien de réinitialisation envoyé à "+profile.email+".")}
  catch(error){alert("Envoi impossible. Vérifiez l'adresse e-mail et les paramètres Firebase Authentication.");}
}

function settingsPage(el){el.innerHTML=`<div class="welcome"><div><h2>Paramètres de l'application</h2><p>Personnalisez les informations de base de KS BTP.</p></div><button class="button primary" data-action="save-settings">Enregistrer</button></div><div class="panel settings-grid"><label>Nom de l'entreprise<input id="companySetting" value="${esc(db.company)}"></label><label>Devise<select id="currencySetting">${["GNF","CFA","EUR","USD"].map(c=>`<option ${db.currency===c?"selected":""}>${c}</option>`).join("")}</select></label><label>Seuil d'alerte par défaut<input id="thresholdSetting" type="number" min="0" value="${db.threshold}"></label><label>Langue de l'interface<select disabled><option>Français</option></select></label></div><div class="notice" style="margin-top:16px">Mode démonstration indépendant : les données sont sauvegardées sur cet appareil avec IndexedDB. Aucun compte ni serveur Firebase n’est utilisé.</div>`}
function openItem(item){$("#itemForm").reset();$("#itemId").value=item?.id||"";$("#dialogTitle").textContent=item?"Modifier le matériel":"Ajouter un matériel";$("#itemName").value=item?.name||"";$("#itemCategory").value=item?.category||"Maçonnerie";$("#itemType").value=item?.type||"equipment";$("#itemQuantity").value=item?.quantity??0;$("#itemUnit").value=item?.unit||"pièce";$("#itemThreshold").value=item?.threshold??db.threshold;$("#itemLocation").innerHTML='<option value="central">Magasin central</option>'+db.sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");$("#itemLocation").value=item?.location||"central";$("#itemDialog").showModal()}
function closeItem(){$("#itemDialog").close()}
function addMovement(){if(!db.materials.length){alert("Ajoutez d'abord un matériel.");return}const materialId=prompt("ID du matériel :\n"+db.materials.map(m=>m.id+" — "+m.name).join("\n"));const m=db.materials.find(x=>x.id===materialId);if(!m)return;const type=prompt("Type : entrée, sortie, retour ou consommation","sortie");if(!["entrée","sortie","retour","consommation"].includes(type))return;const qty=Number(prompt("Quantité", "1"));if(!Number.isFinite(qty)||qty<=0)return;if((type==="sortie"||type==="consommation")&&qty>Number(m.quantity)){alert("Stock insuffisant.");return}const site=prompt("Chantier ou origine (nom)","Magasin central")||"Non précisé";if(type==="entrée"||type==="retour")m.quantity=Number(m.quantity)+qty;else m.quantity=Number(m.quantity)-qty;db.movements.push({id:id(),date:new Date().toISOString(),type,materialId:m.id,materialName:m.name,quantity:qty,location:site,note:""});save();render()}
function exportCsv(){const rows=[["Référence","Désignation","Catégorie","Type","Quantité","Unité","Emplacement"],...db.materials.map(m=>[m.ref,m.name,m.category,m.type,m.quantity,m.unit,m.location])];const csv="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");download("ks-btp-materiels.csv",csv,"text/csv;charset=utf-8")}
function download(name,data,type){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
document.querySelectorAll(".nav-link[data-page]").forEach(nav=>{nav.addEventListener("click",e=>{e.preventDefault();go(nav.dataset.page)});});
document.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const act=b.dataset.action,mid=b.dataset.id;if(act==="add-material")openItem();if(act==="edit-material")openItem(db.materials.find(m=>m.id===mid));if(act==="delete-material"&&confirm("Supprimer ce matériel de l'inventaire ?")){db.materials=db.materials.filter(m=>m.id!==mid);save();render()}if(act==="add-site"){const name=prompt("Nom du chantier :");if(name?.trim()){db.sites.push({id:id(),name:name.trim(),manager:prompt("Responsable :")||"",address:prompt("Adresse / zone :")||"",status:"Actif"});save();render()}}if(act==="delete-site"&&confirm("Supprimer ce chantier ?")){db.sites=db.sites.filter(s=>s.id!==mid);save();render()}if(act==="add-movement")addMovement();if(act==="open-voucher")openVoucherForm(b.dataset.type);if(act==="print-voucher"){const d=(db.documents||[]).find(x=>x.id===mid);if(d)printVoucher(d)}if(act==="add-maintenance"){if(!db.materials.length){alert("Ajoutez d'abord un matériel.");return}const materialId=prompt("ID du matériel :\n"+db.materials.map(m=>m.id+" — "+m.name).join("\n"));const m=db.materials.find(x=>x.id===materialId);if(m){db.maintenance.push({id:id(),date:new Date().toISOString(),materialName:m.name,description:prompt("Description de la panne / intervention :")||"",cost:Number(prompt("Coût de l'intervention", "0"))||0,status:"À traiter"});save();render()}}if(act==="export-csv")exportCsv();if(act==="backup")download("ks-btp-sauvegarde.json",JSON.stringify(db,null,2),"application/json");if(act==="save-settings"){db.company=$("#companySetting").value.trim()||"KS BTP";db.currency=$("#currencySetting").value;db.threshold=Number($("#thresholdSetting").value)||0;save();alert("Paramètres enregistrés.");render()}});
$("#voucherForm").addEventListener("submit",submitVoucher);$("#closeVoucher").onclick=closeVoucher;$("#cancelVoucher").onclick=closeVoucher;
$("#itemForm").addEventListener("submit",e=>{e.preventDefault();const old=db.materials.find(m=>m.id===$("#itemId").value);const data={id:old?.id||id(),ref:old?.ref||"MAT-"+String(db.materials.length+1).padStart(4,"0"),name:$("#itemName").value.trim(),category:$("#itemCategory").value,type:$("#itemType").value,quantity:Number($("#itemQuantity").value),unit:$("#itemUnit").value.trim(),threshold:Number($("#itemThreshold").value)||0,location:$("#itemLocation").value};if(old)Object.assign(old,data);else db.materials.push(data);save();closeItem();render()});
$("#closeDialog").onclick=closeItem;$("#cancelDialog").onclick=closeItem;$("#menuToggle").onclick=()=>$("#sidebar").classList.toggle("open");
document.addEventListener("change",e=>{if(e.target.id==="restoreFile"&&e.target.files[0]){const reader=new FileReader();reader.onload=()=>{try{const value=JSON.parse(reader.result);if(!value||!Array.isArray(value.materials))throw Error();if(confirm("Remplacer les données locales par cette sauvegarde ?")){db={...initial,...value};save();render();alert("Sauvegarde restaurée.")}}catch{alert("Fichier de sauvegarde invalide.")}};reader.readAsText(e.target.files[0])}});
$("#todayLabel").textContent=new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
// Vérification des mises à jour : les fichiers sont téléchargés uniquement avec Internet.
if("serviceWorker" in navigator && location.protocol!=="file:"){
  let refreshing=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(refreshing)return;
    refreshing=true;
    window.location.reload();
  });
  const offerUpdate=registration=>{
    const waiting=registration.waiting;
    if(!waiting||!navigator.serviceWorker.controller||waiting.dataset?.prompted==="yes")return;
    if(waiting.dataset)waiting.dataset.prompted="yes";
    const accepted=window.confirm("Une mise à jour de KS BTP est disponible. Vos données enregistrées seront conservées. Installer maintenant ?");
    if(accepted)waiting.postMessage({type:"SKIP_WAITING"});
  };
  window.addEventListener("load",async()=>{
    try{
      const registration=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
      offerUpdate(registration);
      registration.addEventListener("updatefound",()=>{
        const installing=registration.installing;
        if(!installing)return;
        installing.addEventListener("statechange",()=>{
          if(installing.state==="installed")offerUpdate(registration);
        });
      });
      if(navigator.onLine)registration.update().catch(()=>{});
      window.addEventListener("online",()=>registration.update().catch(()=>{}));
    }catch(error){console.warn("Vérification des mises à jour indisponible",error);}
  });
}
go("dashboard");
export {go};
