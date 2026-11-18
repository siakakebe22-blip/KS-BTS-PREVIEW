const KEY="ks_btp_v1";
const CATEGORIES=["Maçonnerie","Électricité","Soudure","Peinture","Plomberie","Carrelage","Autre"];
const initial={company:"KS BTP",currency:"GNF",threshold:2,materials:[],sites:[],movements:[],maintenance:[],documents:[]};
let db=load();
let currentPage="dashboard";
let userProfiles=[];
const $=s=>document.querySelector(s);
function load(){try{return {...initial,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return {...initial}}}
let saveQueue=Promise.resolve();
function save(){
  let snapshot;
  try{snapshot=JSON.stringify(db);localStorage.setItem(KEY,snapshot)}
  catch(error){window.dispatchEvent(new CustomEvent("ks-offline-save-error",{detail:error.message||"Écriture locale impossible."}));return Promise.resolve(false)}
  if(!window.KSBtpOfflineStorage?.saveSnapshot){window.dispatchEvent(new CustomEvent("ks-offline-saved"));return Promise.resolve(true)}
  saveQueue=saveQueue.catch(()=>{}).then(()=>window.KSBtpOfflineStorage.saveSnapshot(JSON.parse(snapshot)));
  return saveQueue.then(()=>{window.dispatchEvent(new CustomEvent("ks-offline-saved"));return true}).catch(error=>{
    console.error(error);
    window.dispatchEvent(new CustomEvent("ks-offline-save-error",{detail:error.message||"Sauvegarde IndexedDB impossible."}));
    return false;
  });
}
function nextVoucherRef(type){
  const prefix="BON-"+String(type||"").toUpperCase().slice(0,3);
  const pattern=new RegExp("^"+prefix+"-(\\d+)$");
  const max=(db.documents||[]).reduce((n,d)=>{
    const match=pattern.exec(String(d.ref||""));
    return match?Math.max(n,Number(match[1])):n;
  },0);
  return prefix+"-"+String(max+1).padStart(4,"0");
}
function nextMaterialRef(){
  const max=db.materials.reduce((n,m)=>{const match=/^MAT-(\d+)$/.exec(String(m.ref||""));return match?Math.max(n,Number(match[1])):n},0);
  return "MAT-"+String(max+1).padStart(4,"0");
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v){return new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(Number(v)||0)+" "+db.currency}
function date(v){return new Date(v).toLocaleDateString("fr-FR")}
function id(){return "K"+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase()}
function stockLocation(value){
  if(value==="central"||value==="Magasin central")return {id:"central",name:"Magasin central"};
  const site=db.sites.find(x=>x.id===value||x.name===value);
  return site?{id:site.id,name:site.name}:{id:"__unallocated__",name:"Stock historique à répartir"};
}
function ensureStockBalances(item){
  if(Array.isArray(item.stockBalances)){
    // Normalise les anciennes fiches qui stockaient le nom du chantier à la place de son identifiant.
    item.stockBalances=item.stockBalances.map(balance=>{
      const loc=stockLocation(balance.locationId);
      const named=stockLocation(balance.locationName);
      const resolved=loc.id!=="__unallocated__"?loc:named;
      return {...balance,locationId:resolved.id,locationName:resolved.name,quantity:Math.max(0,Number(balance.quantity)||0)};
    });
    // Répare les fiches anciennes qui possèdent un tableau vide malgré un stock positif.
    if(item.stockBalances.length===0&&Number(item.quantity)>0){
      const loc=stockLocation(item.location);
      item.stockBalances=[{locationId:loc.id,locationName:loc.name,quantity:Number(item.quantity)}];
    }
    return item.stockBalances;
  }
  const loc=stockLocation(item.location);
  item.stockBalances=[{locationId:loc.id,locationName:loc.name,quantity:Math.max(0,Number(item.quantity)||0)}];
  return item.stockBalances;
}
function stockAt(item,location){
  const loc=stockLocation(location);
  return ensureStockBalances(item).filter(x=>x.locationId===loc.id).reduce((n,x)=>n+Math.max(0,Number(x.quantity)||0),0);
}
function changeStock(item,location,delta){
  const loc=stockLocation(location),balances=ensureStockBalances(item);
  let entry=balances.find(x=>x.locationId===loc.id);
  if(!entry){entry={locationId:loc.id,locationName:loc.name,quantity:0};balances.push(entry)}
  const next=Number(entry.quantity||0)+Number(delta);
  if(!Number.isFinite(next)||next<-.000001)return false;
  entry.quantity=Math.max(0,Number(next.toFixed(4)));
  item.quantity=Number(balances.reduce((n,x)=>n+Number(x.quantity||0),0).toFixed(4));
  return true;
}
function totalStock(){return db.materials.reduce((s,m)=>s+Number(m.quantity||0),0)}
function unallocatedStock(item){return stockAt(item,"__unallocated__")}
function go(page){currentPage=page;document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#pageTitle").textContent=({dashboard:"Tableau de bord",materials:"Gestion des matériels",sites:"Gestion des chantiers",movements:"Mouvements de stock",maintenance:"Maintenance",reports:"Rapports",settings:"Paramètres",documents:"Bons de stock",users:"Gestion des utilisateurs"})[page];render();$("#sidebar").classList.remove("open")}
function render(){const target=$("#pageContent");({dashboard:dashboard,materials:materialsPage,sites:sitesPage,movements:movementsPage,documents:documentsPage,maintenance:maintenancePage,reports:reportsPage,settings:settingsPage,users:usersPage}[currentPage]||dashboard)(target)}
function dashboard(el){const low=db.materials.filter(m=>Number(m.quantity)<=Number(m.threshold||db.threshold));el.innerHTML=`<div class="welcome"><div><h2>Bienvenue dans KS BTP</h2><p>Suivez vos matériels du magasin central jusqu'aux chantiers.</p></div><div class="quick-actions"><button class="button primary" data-action="add-material">＋ Nouveau matériel</button><button class="button secondary" data-action="open-voucher" data-type="Sortie">Bon de sortie</button><button class="button secondary" data-action="open-voucher" data-type="Réception">Bon de réception</button><button class="button secondary" data-action="open-voucher" data-type="Retour">Bon de retour</button></div></div><div class="stats-grid"><article class="stat-card"><div class="stat-label">Matériels référencés</div><div class="stat-value">${db.materials.length}</div><div class="stat-note">Articles dans l'inventaire</div></article><article class="stat-card"><div class="stat-label">Stock total</div><div class="stat-value">${totalStock().toLocaleString("fr-FR")}</div><div class="stat-note">Quantités enregistrées</div></article><article class="stat-card"><div class="stat-label">Chantiers actifs</div><div class="stat-value">${db.sites.filter(s=>s.status!=="Clôturé").length}</div><div class="stat-note">Sites suivis</div></article><article class="stat-card"><div class="stat-label">Alertes de stock</div><div class="stat-value">${low.length}</div><div class="stat-note">Sous le seuil minimum</div></article></div><div class="panel-grid"><section class="panel"><div class="panel-head"><h3>Alertes de stock</h3><span class="tag ${low.length?"low":"good"}">${low.length} alerte(s)</span></div>${low.length?low.slice(0,6).map(m=>`<div class="list-row"><div><strong>${esc(m.name)}</strong><span class="muted">${esc(m.category)} · Seuil : ${m.threshold}</span></div><span class="tag low">${m.quantity} ${esc(m.unit)}</span></div>`).join(""):'<div class="empty-state">Aucune alerte de stock pour le moment.</div>'}</section><section class="panel"><h3>Derniers mouvements</h3>${db.movements.slice(-5).reverse().map(m=>`<div class="list-row"><div><strong>${esc(m.type)} · ${esc(m.materialName)}</strong><span class="muted">${esc(m.location)} · ${date(m.date)}</span></div><span class="kpi">${m.quantity}</span></div>`).join("")||'<div class="empty-state">Aucun mouvement enregistré.</div>'}</section></div>`}
function materialsPage(el){el.innerHTML=`<div class="welcome"><div><h2>Inventaire des matériels</h2><p>Référencez les équipements réutilisables et les consommables.</p></div><button class="button primary" data-action="add-material">＋ Ajouter un matériel</button></div><div class="toolbar"><input class="search" id="materialSearch" placeholder="Rechercher par nom ou référence…"><select class="select-filter" id="categoryFilter"><option value="">Toutes les catégories</option>${CATEGORIES.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Désignation</th><th>Catégorie</th><th>Type</th><th>Quantité</th><th>Emplacement</th><th>Actions</th></tr></thead><tbody id="materialRows"></tbody></table></div>`;drawMaterials();$("#materialSearch").addEventListener("input",drawMaterials);$("#categoryFilter").addEventListener("change",drawMaterials)}
function drawMaterials(){const q=($("#materialSearch")?.value||"").toLowerCase(),cat=$("#categoryFilter")?.value||"";const rows=db.materials.filter(m=>(m.name+" "+m.ref).toLowerCase().includes(q)&&(!cat||m.category===cat));rows.forEach(m=>ensureStockBalances(m));$("#materialRows").innerHTML=rows.map(m=>`<tr><td><strong>${esc(m.ref)}</strong></td><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${m.type==="consumable"?"Consommable":"Réutilisable"}</td><td><span class="tag ${Number(m.quantity)<=Number(m.threshold)?"low":"good"}">${m.quantity} ${esc(m.unit)}</span></td><td>${esc((m.stockBalances||[]).filter(b=>Number(b.quantity)>0).map(b=>b.locationName+": "+b.quantity).join(", ")||"Stock historique")}</td><td><div class="action-group"><button class="small-button" data-action="edit-material" data-id="${m.id}">Modifier</button><button class="small-button" data-action="delete-material" data-id="${m.id}">Supprimer</button></div></td></tr>`).join("")||'<tr><td colspan="7" class="empty-state">Aucun matériel trouvé.</td></tr>'}
function sitesPage(el){
  const central=db.materials.reduce((n,m)=>n+stockAt(m,"central"),0);
  const unallocated=db.materials.reduce((n,m)=>n+unallocatedStock(m),0);
  const rows=db.sites.map(site=>{
    const lines=db.materials.map(m=>({m,q:stockAt(m,site.id)})).filter(x=>x.q>0);
    const total=lines.reduce((n,x)=>n+x.q,0);
    const details=lines.map(x=>esc(x.m.name)+": "+x.q+" "+esc(x.m.unit)).join("<br>")||"—";
    return "<tr><td><strong>"+esc(site.name)+"</strong></td><td>"+esc(site.manager||"—")+"</td><td>"+total.toLocaleString("fr-FR")+"</td><td>"+details+"</td><td><span class=\"tag\">"+esc(site.status)+"</span></td><td><button class=\"small-button\" data-action=\"delete-site\" data-id=\""+site.id+"\">Supprimer</button></td></tr>";
  }).join("")||'<tr><td colspan="6" class="empty-state">Aucun chantier enregistré.</td></tr>';
  el.innerHTML='<div class="welcome"><div><h2>Chantiers et stocks par emplacement</h2><p>Suivez les quantités présentes sur chaque chantier.</p></div><button class="button primary" data-action="add-site">＋ Ajouter un chantier</button></div>'+
  '<div class="stats-grid"><article class="stat-card"><div class="stat-label">Stock magasin central</div><div class="stat-value">'+central.toLocaleString("fr-FR")+'</div></article><article class="stat-card"><div class="stat-label">Stock sur les chantiers</div><div class="stat-value">'+db.materials.reduce((n,m)=>n+db.sites.reduce((a,x)=>a+stockAt(m,x.id),0),0).toLocaleString("fr-FR")+'</div></article><article class="stat-card"><div class="stat-label">Stock historique à répartir</div><div class="stat-value">'+unallocated.toLocaleString("fr-FR")+'</div></article></div>'+
  '<div class="notice">Le stock historique non ventilé est conservé séparément. Aucune quantité existante n’est attribuée automatiquement à un chantier.</div><div class="panel"><div class="table-wrap"><table><thead><tr><th>Chantier</th><th>Responsable</th><th>Stock total</th><th>Détail des matériels</th><th>Statut</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
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
  $("#voucherSite").innerHTML=db.sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  $("#receiptLocation").innerHTML=db.sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  $("#voucherQuantity").value=1;
  $("#voucherQuantity").removeAttribute("max");
  const updateVoucherLimit=()=>{
    const material=db.materials.find(x=>x.id===$("#voucherMaterial").value);
    const siteId=$("#voucherSite").value;
    const site=db.sites.find(x=>x.id===siteId);
    const tracksSiteStock=type==="Sortie"||type==="Retour";
    if(!tracksSiteStock){$("#voucherQuantity").removeAttribute("max");$("#voucherStockAvailable").textContent="";return}
    if(!material||!site){$("#voucherQuantity").removeAttribute("max");$("#voucherStockAvailable").textContent="Sélectionnez un matériel et un chantier pour connaître le stock disponible.";return}
    const available=stockAt(material,siteId);
    $("#voucherQuantity").max=String(available);
    $("#voucherStockAvailable").textContent="Stock disponible sur "+site.name+" : "+available+" "+material.unit+".";
    $("#voucherStockAvailable").dataset.available=String(available);
  };
  $("#voucherMaterial").onchange=updateVoucherLimit;$("#voucherSite").onchange=updateVoucherLimit;updateVoucherLimit();
  $("#voucherSiteLabel").textContent=type==="Sortie"?"Chantier concerné / lieu de sortie":"Chantier d'origine";
  $("#purchaseDate").value=new Date().toISOString().slice(0,10);
  $("#purchaseUnitPrice").value="";
  $("#purchaseTotal").value="";
  $("#voucherExistingMaterial").value="";
  $("#receiptMaterialName").value="";
  $("#receiptCategory").value="Maçonnerie";
  $("#receiptType").value="equipment";
  $("#receiptUnit").value="pièce";
  $("#receiptThreshold").value=db.threshold;
  $("#receiptLocation").value=db.sites[0]?.id||"";
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
      m={id:id(),ref:nextMaterialRef(),name,category:$("#receiptCategory").value,type:$("#receiptType").value,quantity:0,unit:$("#receiptUnit").value.trim()||"pièce",threshold:Number($("#receiptThreshold").value)||0,location:"central",purchaseHistory:[]};
      db.materials.push(m);
    }
    const unitPrice=Number($("#purchaseUnitPrice").value||0);
    purchase={id:id(),date:$("#purchaseDate").value||new Date().toISOString().slice(0,10),supplier:$("#purchaseSupplier").value.trim(),invoice:$("#purchaseInvoice").value.trim(),quantity,unitPrice,total:quantity*unitPrice,currency:db.currency,storage:$("#receiptLocation").selectedOptions[0]?.textContent||"Magasin central"};
    const storage=$("#receiptLocation").value;
    if(!storage||!db.sites.some(x=>x.id===storage)){alert("Choisissez le chantier qui réceptionne le matériel.");return}
    changeStock(m,storage,quantity);
    m.location=storage;
    m.purchaseHistory=m.purchaseHistory||[];m.purchaseHistory.push(purchase);
    db.purchases=db.purchases||[];db.purchases.push({...purchase,materialId:m.id,materialName:m.name,materialRef:m.ref,category:m.category});
  }else{
    m=db.materials.find(x=>x.id===$("#voucherMaterial").value);
    if(!m){alert("Choisissez un matériel.");return}
    const selectedSite=$("#voucherSite").value;
    if(!selectedSite||!db.sites.some(x=>x.id===selectedSite)){alert("Créez ou choisissez un chantier valide.");return}
    if(type==="Sortie"){
      const available=stockAt(m,selectedSite);
      if(quantity>available){alert("Stock insuffisant sur le chantier sélectionné. Disponible : "+available+" "+m.unit+".");return}
      if(!changeStock(m,selectedSite,-quantity)){alert("Impossible de débiter le stock du chantier.");return}
    }else{
      if(quantity>stockAt(m,selectedSite)){alert("Stock insuffisant sur ce chantier pour effectuer le retour.");return}
      changeStock(m,selectedSite,-quantity);changeStock(m,"central",quantity);
    }
  }
  db.documents=db.documents||[];
  const d={id:id(),ref:nextVoucherRef(type),date:new Date().toISOString(),type,materialId:m.id,materialRef:m.ref,materialName:m.name,category:m.category,quantity,unit:m.unit,site:type==="Réception"?$("#receiptLocation").selectedOptions[0]?.textContent:$("#voucherSite").selectedOptions[0]?.textContent,source:type==="Sortie"?$("#voucherSite").selectedOptions[0]?.textContent:(type==="Retour"?$("#voucherSite").selectedOptions[0]?.textContent:"Fournisseur"),destination:type==="Réception"?$("#receiptLocation").selectedOptions[0]?.textContent:(type==="Sortie"?"Sortie / utilisation":"Magasin central"),recipient:$("#voucherRecipient").value.trim(),note:$("#voucherNote").value.trim(),purchase};
  if(type==="Réception"){d.supplier=purchase.supplier;d.invoice=purchase.invoice;d.purchaseDate=purchase.date;d.unitPrice=purchase.unitPrice;d.totalPurchase=purchase.total}
  db.documents.push(d);
  db.movements.push({id:id(),date:d.date,type:type.toLowerCase(),materialId:m.id,materialName:m.name,quantity,location:d.site,source:d.source,destination:d.destination,note:"Document "+d.ref+(purchase?" · Fournisseur : "+purchase.supplier:"")});
  save();closeVoucher();render();printVoucher(d);
}
function maintenancePage(el){el.innerHTML=`<div class="welcome"><div><h2>Maintenance et réparations</h2><p>Consignez les pannes, interventions et coûts de réparation.</p></div><button class="button primary" data-action="add-maintenance">＋ Déclarer une intervention</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Matériel</th><th>Problème / intervention</th><th>Coût</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${db.maintenance.slice().reverse().map(m=>`<tr><td>${date(m.date)}</td><td>${esc(m.materialRef||"")} ${esc(m.materialName)}</td><td>${esc(m.description)}</td><td>${money(m.cost)}</td><td><span class="tag">${esc(m.status||"À traiter")}</span></td><td><div class="action-group"><button class="small-button" data-action="edit-maintenance" data-id="${m.id}">Modifier</button><button class="small-button" data-action="delete-maintenance" data-id="${m.id}">Supprimer</button></div></td></tr>`).join("")||'<tr><td colspan="6" class="empty-state">Aucune intervention enregistrée.</td></tr>'}</tbody></table></div>`}
function openMaintenance(record){
 if(!db.materials.length){alert("Ajoutez d'abord un matériel.");return}
 $("#maintenanceForm").reset();$("#maintenanceId").value=record?.id||"";
 $("#maintenanceTitle").textContent=record?"Modifier l'intervention":"Déclarer une intervention";
 $("#maintenanceMaterial").innerHTML=db.materials.map(m=>`<option value="${m.id}">${esc(m.ref)} — ${esc(m.name)}</option>`).join("");
 $("#maintenanceDate").value=record?.date?new Date(record.date).toISOString().slice(0,10):new Date().toISOString().slice(0,10);
 $("#maintenanceStatus").value=record?.status||"À traiter";$("#maintenanceDescription").value=record?.description||"";$("#maintenanceCost").value=record?.cost??0;
 if(record)$("#maintenanceMaterial").value=record.materialId||"";
 $("#maintenanceDialog").showModal();
}
function closeMaintenance(){$("#maintenanceDialog").close()}
function submitMaintenance(e){
 e.preventDefault();
 const material=db.materials.find(m=>m.id===$("#maintenanceMaterial").value),description=$("#maintenanceDescription").value.trim(),raw=$("#maintenanceCost").value,cost=Number(raw),dateValue=$("#maintenanceDate").value;
 if(!material){alert("Sélectionnez un matériel valide.");return}
 if(!description){alert("La description de l'intervention est obligatoire.");$("#maintenanceDescription").focus();return}
 if(!dateValue){alert("Indiquez la date de l'intervention.");return}
 if(raw===""||!Number.isFinite(cost)||cost<0){alert("Le coût doit être un nombre positif ou nul.");$("#maintenanceCost").focus();return}
 const existing=db.maintenance.find(x=>x.id===$("#maintenanceId").value);
 const entry={id:existing?.id||id(),date:new Date(dateValue+"T12:00:00").toISOString(),materialId:material.id,materialRef:material.ref,materialName:material.name,description,cost,status:$("#maintenanceStatus").value};
 if(existing)Object.assign(existing,entry);else db.maintenance.push(entry);
 save();closeMaintenance();render();
}
function stockAudit(){
  const materials=db.materials.map(m=>{
    const current=Number(m.quantity)||0;
    const hasBalances=Array.isArray(m.stockBalances);
    const balanceTotal=hasBalances?m.stockBalances.reduce((sum,b)=>sum+(Number.isFinite(Number(b.quantity))?Number(b.quantity):0),0):current;
    return {id:m.id,ref:m.ref,name:m.name,unit:m.unit,current,balanceTotal,difference:Number((current-balanceTotal).toFixed(4)),hasBalances};
  });
  const balanceIssues=materials.filter(m=>Math.abs(m.difference)>0.0001);
  const documents=Array.isArray(db.documents)?db.documents:[];
  const movements=Array.isArray(db.movements)?db.movements:[];
  const unlinkedDocuments=documents.filter(d=>d.ref&&!movements.some(m=>String(m.note||"").includes(String(d.ref))));
  return {materials,balanceIssues,unlinkedDocuments,total:materials.reduce((n,m)=>n+m.current,0),balanceTotal:materials.reduce((n,m)=>n+m.balanceTotal,0)};
}
function reportsPage(el){const audit=stockAudit();el.innerHTML=`<div class="welcome"><div><h2>Rapports et exports</h2><p>Consultez les données enregistrées sur cet appareil.</p></div><div class="quick-actions"><button class="button secondary" data-action="export-csv">Exporter matériels (CSV)</button><button class="button primary" data-action="backup">Sauvegarder les données</button></div></div><div class="stats-grid"><article class="stat-card"><div class="stat-label">Matériels</div><div class="stat-value">${db.materials.length}</div></article><article class="stat-card"><div class="stat-label">Chantiers</div><div class="stat-value">${db.sites.length}</div></article><article class="stat-card"><div class="stat-label">Mouvements</div><div class="stat-value">${db.movements.length}</div></article><article class="stat-card"><div class="stat-label">Interventions</div><div class="stat-value">${db.maintenance.length}</div></article></div><div class="panel"><h3>Contrôle de cohérence du stock</h3><p class="muted">Contrôle en lecture seule : aucune quantité, aucun bon et aucun mouvement ne sera modifié.</p><div class="stats-grid"><article class="stat-card"><div class="stat-label">Stock inventaire</div><div class="stat-value">${audit.total.toLocaleString("fr-FR")}</div></article><article class="stat-card"><div class="stat-label">Somme des emplacements</div><div class="stat-value">${audit.balanceTotal.toLocaleString("fr-FR")}</div></article><article class="stat-card"><div class="stat-label">Écarts de ventilation</div><div class="stat-value">${audit.balanceIssues.length}</div></article><article class="stat-card"><div class="stat-label">Bons à vérifier</div><div class="stat-value">${audit.unlinkedDocuments.length}</div></article></div><div class="notice">Important : l'historique ne permet pas de recalculer le stock final sans connaître un stock initial fiable. Les bons anciens sans lien explicite sont signalés pour vérification, pas considérés automatiquement comme des erreurs. Aucun ajustement automatique n'est effectué.</div><div class="table-wrap"><table><thead><tr><th>Matériel</th><th>Stock inventaire</th><th>Somme emplacements</th><th>Écart</th></tr></thead><tbody>${audit.materials.map(m=>`<tr><td><strong>${esc(m.ref)} — ${esc(m.name)}</strong></td><td>${m.current} ${esc(m.unit)}</td><td>${m.balanceTotal} ${esc(m.unit)}</td><td>${Math.abs(m.difference)>0.0001?'<span class="tag low">'+m.difference+'</span>':'<span class="tag good">0</span>'}</td></tr>`).join("")||'<tr><td colspan="4" class="empty-state">Aucun matériel enregistré.</td></tr>'}</tbody></table></div>${audit.unlinkedDocuments.length?'<h4>Bons sans mouvement explicitement lié</h4><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Type</th><th>Matériel</th><th>Quantité</th><th>Chantier</th></tr></thead><tbody>'+audit.unlinkedDocuments.map(d=>'<tr><td>'+esc(d.ref)+'</td><td>'+esc(d.type)+'</td><td>'+esc(d.materialName)+'</td><td>'+esc(d.quantity)+' '+esc(d.unit)+'</td><td>'+esc(d.site)+'</td></tr>').join("")+'</tbody></table></div>':'<p class="muted">Tous les bons avec référence possèdent un mouvement portant cette référence.</p>'}</div><div class="panel"><h3>Répartition par catégorie</h3><div class="category-list">${CATEGORIES.map(c=>`<span class="tag">${c} : ${db.materials.filter(m=>m.category===c).length}</span>`).join("")}</div></div><div class="panel" style="margin-top:15px"><h3>Restaurer une sauvegarde</h3><p class="muted">Le fichier JSON remplace les données locales actuelles. Faites une sauvegarde avant toute restauration.</p><input type="file" id="restoreFile" accept="application/json"></div>`}

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
function addMovement(){
  if(!db.materials.length){alert("Ajoutez d'abord un matériel.");return}
  const materialId=prompt("ID du matériel :\n"+db.materials.map(m=>m.id+" — "+m.name).join("\n"));
  const m=db.materials.find(x=>x.id===materialId);if(!m)return;
  const type=prompt("Type : entrée, sortie, retour ou consommation","sortie");
  if(!["entrée","sortie","retour","consommation"].includes(type))return;
  const qty=Number(prompt("Quantité","1"));if(!Number.isFinite(qty)||qty<=0){alert("Quantité invalide.");return}
  const choices=db.sites.map(x=>x.id+" — "+x.name).join("\n");
  let location="central",source="central",destination="central";
  if(type==="sortie"){
    const siteId=prompt("ID du chantier destinataire :\n"+choices);if(!db.sites.some(x=>x.id===siteId))return;
    const available=stockAt(m,"central")+unallocatedStock(m);if(qty>available){alert("Stock insuffisant au magasin central et dans le stock historique.");return}
    let remain=qty,take=Math.min(stockAt(m,"central"),qty);if(take){changeStock(m,"central",-take);remain-=take}if(remain)changeStock(m,"__unallocated__",-remain);
    changeStock(m,siteId,qty);location=db.sites.find(x=>x.id===siteId).name;destination=siteId;
  }else if(type==="retour"||type==="consommation"){
    const siteId=prompt("ID du chantier concerné :\n"+choices);if(!db.sites.some(x=>x.id===siteId))return;
    if(qty>stockAt(m,siteId)){alert("Stock insuffisant sur ce chantier.");return}
    changeStock(m,siteId,-qty);location=db.sites.find(x=>x.id===siteId).name;source=siteId;
    if(type==="retour")changeStock(m,"central",qty);else destination="consommé";
  }else{changeStock(m,"central",qty)}
  db.movements.push({id:id(),date:new Date().toISOString(),type,materialId:m.id,materialName:m.name,quantity:qty,location,source,destination,note:""});save();render();
}
function exportCsv(){const rows=[["Référence","Désignation","Catégorie","Type","Quantité","Unité","Emplacement"],...db.materials.map(m=>[m.ref,m.name,m.category,m.type,m.quantity,m.unit,m.location])];const csv="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");download("ks-btp-materiels.csv",csv,"text/csv;charset=utf-8")}
function download(name,data,type){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
document.querySelectorAll(".nav-link[data-page]").forEach(nav=>{nav.addEventListener("click",e=>{e.preventDefault();go(nav.dataset.page)});});
document.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const act=b.dataset.action,mid=b.dataset.id;if(act==="add-material")openItem();if(act==="edit-material")openItem(db.materials.find(m=>m.id===mid));if(act==="delete-material"){
  const used=db.movements.some(x=>x.materialId===mid)||(db.documents||[]).some(x=>x.materialId===mid)||(db.purchases||[]).some(x=>x.materialId===mid)||db.maintenance.some(x=>x.materialId===mid||(!x.materialId&&x.materialName===db.materials.find(m=>m.id===mid)?.name));
  if(used){alert("Suppression impossible : ce matériel possède un historique. Conservez sa fiche pour préserver la traçabilité.");return}
  if(confirm("Supprimer ce matériel de l'inventaire ?")){db.materials=db.materials.filter(m=>m.id!==mid);save();render()}
}if(act==="add-site"){const name=prompt("Nom du chantier :");if(name?.trim()){db.sites.push({id:id(),name:name.trim(),manager:prompt("Responsable :")||"",address:prompt("Adresse / zone :")||"",status:"Actif"});save();render()}}if(act==="delete-site"){
  const siteName=db.sites.find(s=>s.id===mid)?.name;
  const used=db.materials.some(m=>m.location===mid||(m.stockBalances||[]).some(b=>b.locationId===mid&&Number(b.quantity)>0))||(db.documents||[]).some(x=>x.site===siteName)||db.movements.some(x=>x.location===siteName);
  if(used){alert("Suppression impossible : ce chantier est référencé dans le stock ou l'historique.");return}
  if(confirm("Supprimer ce chantier ?")){db.sites=db.sites.filter(s=>s.id!==mid);save();render()}
}if(act==="add-movement")addMovement();if(act==="open-voucher")openVoucherForm(b.dataset.type);if(act==="print-voucher"){const d=(db.documents||[]).find(x=>x.id===mid);if(d)printVoucher(d)}if(act==="add-maintenance")openMaintenance();if(act==="edit-maintenance")openMaintenance(db.maintenance.find(x=>x.id===mid));if(act==="delete-maintenance"){if(confirm("Supprimer cette intervention de maintenance ?")){db.maintenance=db.maintenance.filter(x=>x.id!==mid);save();render()}}if(act==="export-csv")exportCsv();if(act==="backup")download("ks-btp-sauvegarde.json",JSON.stringify(db,null,2),"application/json");if(act==="save-settings"){db.company=$("#companySetting").value.trim()||"KS BTP";db.currency=$("#currencySetting").value;db.threshold=Number($("#thresholdSetting").value)||0;save();alert("Paramètres enregistrés.");render()}});
$("#voucherForm").addEventListener("submit",submitVoucher);$("#maintenanceForm").addEventListener("submit",submitMaintenance);$("#closeMaintenance").onclick=closeMaintenance;$("#cancelMaintenance").onclick=closeMaintenance;$("#closeVoucher").onclick=closeVoucher;$("#cancelVoucher").onclick=closeVoucher;
$("#itemForm").addEventListener("submit",e=>{e.preventDefault();const old=db.materials.find(m=>m.id===$("#itemId").value);if(old&&Number($("#itemQuantity").value)!==Number(old.quantity)){alert("Pour modifier une quantité existante, utilisez un mouvement de stock afin de conserver la traçabilité.");$("#itemQuantity").value=old.quantity;return}const data={id:old?.id||id(),ref:old?.ref||nextMaterialRef(),name:$("#itemName").value.trim(),category:$("#itemCategory").value,type:$("#itemType").value,quantity:Number($("#itemQuantity").value),unit:$("#itemUnit").value.trim(),threshold:Number($("#itemThreshold").value)||0,location:$("#itemLocation").value};if(old)Object.assign(old,data);else db.materials.push(data);save();closeItem();render()});
$("#closeDialog").onclick=closeItem;$("#cancelDialog").onclick=closeItem;$("#menuToggle").onclick=()=>$("#sidebar").classList.toggle("open");
function validateBackup(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray(value.materials))return false;
  for(const key of ["sites","movements","maintenance","documents"]){
    if(value[key]!==undefined&&!Array.isArray(value[key]))return false;
  }
  if(value.materials.some(m=>!m||typeof m!=="object"||!m.id||typeof m.name!=="string"||!Number.isFinite(Number(m.quantity))||Number(m.quantity)<0))return false;
  if((value.sites||[]).some(s=>!s||typeof s!=="object"||!s.id||typeof s.name!=="string"))return false;
  if((value.movements||[]).some(m=>!m||typeof m!=="object"||!m.materialId||!Number.isFinite(Number(m.quantity))||Number(m.quantity)<=0))return false;
  if((value.maintenance||[]).some(m=>!m||typeof m!=="object"))return false;
  if((value.documents||[]).some(d=>!d||typeof d!=="object"))return false;
  return true;
}
document.addEventListener("change",e=>{if(e.target.id==="restoreFile"&&e.target.files[0]){const reader=new FileReader();reader.onload=()=>{try{const value=JSON.parse(reader.result);if(!validateBackup(value))throw Error("Structure de sauvegarde invalide.");if(confirm("Remplacer les données locales par cette sauvegarde ?")){db={...initial,...value,sites:value.sites||[],movements:value.movements||[],maintenance:value.maintenance||[],documents:value.documents||[]};save();render();alert("Sauvegarde restaurée.")}}catch(error){alert("Fichier de sauvegarde invalide ou incomplet. Les données actuelles ont été conservées.")}};reader.readAsText(e.target.files[0])}});
$("#todayLabel").textContent=new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
// Enregistrement du service worker même si le démarrage différé a dépassé l'événement load.
if("serviceWorker" in navigator && location.protocol!=="file:"){
  let updateAccepted=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(updateAccepted)window.location.reload();
  });
  const offerUpdate=registration=>{
    const waiting=registration.waiting;
    if(!waiting||!navigator.serviceWorker.controller||waiting.dataset?.prompted==="yes")return;
    if(waiting.dataset)waiting.dataset.prompted="yes";
    const accepted=window.confirm("Une mise à jour de KS BTP est disponible. Vos données enregistrées seront conservées. Installer maintenant ?");
    if(accepted){
      updateAccepted=true;
      waiting.postMessage({type:"SKIP_WAITING"});
    }
  };
  const registerOfflineSupport=async()=>{
    try{
      const registration=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
      await navigator.serviceWorker.ready;
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
    }catch(error){console.warn("Activation du mode hors connexion impossible",error);}
  };
  if(document.readyState==="complete")registerOfflineSupport();
  else window.addEventListener("load",registerOfflineSupport,{once:true});
}
go("dashboard");
export {go};
