const KEY="ks_btp_v1";
const CATEGORIES=["Maçonnerie","Électricité","Soudure","Peinture","Plomberie","Carrelage","Autre"];
const initial={company:"KS BTP",currency:"GNF",threshold:2,materials:[],sites:[],movements:[],maintenance:[],documents:[],purchases:[],activityLog:[]};
let storageLoadError="";
let db=load();
let currentPage="dashboard";
let userProfiles=[];
const $=s=>document.querySelector(s);
function load(){
 const raw=localStorage.getItem(KEY);
 if(!raw)return {...initial};
 try{
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Structure locale invalide.");
  const collections=["materials","sites","movements","maintenance","documents","purchases","activityLog"];
  for(const key of collections){
    if(parsed[key]!==undefined&&!Array.isArray(parsed[key]))throw new Error("La rubrique "+key+" n'est pas une liste valide.");
    if(Array.isArray(parsed[key])&&parsed[key].some(record=>!record||typeof record!=="object"||Array.isArray(record)))throw new Error("Un enregistrement de la rubrique "+key+" est illisible.");
  }
  if(Array.isArray(parsed.materials)&&parsed.materials.some(material=>material.stockBalances!==undefined&&(!Array.isArray(material.stockBalances)||material.stockBalances.some(balance=>!balance||typeof balance!=="object"||Array.isArray(balance)))))throw new Error("La ventilation d'un stock matériel est illisible.");
  return {...initial,...parsed};
 }
 catch(error){storageLoadError="Les données locales présentent une structure illisible ("+(error.message||"erreur inconnue")+"). Aucune écriture ne sera autorisée afin de ne pas écraser les données existantes. Utilisez l’outil de récupération ou exportez une copie avant toute restauration.";console.error(error);return {...initial}}
}
let saveQueue=Promise.resolve();
function save(){
  if(storageLoadError){window.dispatchEvent(new CustomEvent("ks-offline-save-error",{detail:storageLoadError}));return Promise.resolve(false)}
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
    // Normalise uniquement les emplacements reconnus. Les quantités invalides et
    // les anciens identifiants inconnus restent intacts pour l'audit et la récupération.
    item.stockBalances=item.stockBalances.map(balance=>{
      const rawId=String(balance.locationId??"");
      let resolved=null;
      if(rawId==="central"||rawId==="Magasin central")resolved={id:"central",name:"Magasin central"};
      else if(rawId==="__unallocated__")resolved={id:"__unallocated__",name:"Stock historique à répartir"};
      else{
        const byId=db.sites.find(site=>site.id===rawId);
        const byLegacyName=db.sites.find(site=>site.name===rawId);
        const byName=balance.locationName?db.sites.find(site=>site.name===balance.locationName):null;
        const site=byId||byLegacyName||byName;
        if(site)resolved={id:site.id,name:site.name};
        else if(!rawId&&balance.locationName==="Magasin central")resolved={id:"central",name:"Magasin central"};
        else if(!rawId&&balance.locationName==="Stock historique à répartir")resolved={id:"__unallocated__",name:"Stock historique à répartir"};
      }
      return {...balance,locationId:resolved?resolved.id:(rawId||"__unknown__"),locationName:resolved?resolved.name:(balance.locationName||"Emplacement non identifié")};
    });
    // Répare les fiches historiques sans ventilation uniquement si leur quantité est valide.
    if(item.stockBalances.length===0&&Number.isFinite(Number(item.quantity))&&Number(item.quantity)>0){
      const loc=stockLocation(item.location);
      item.stockBalances=[{locationId:loc.id,locationName:loc.name,quantity:Number(item.quantity)}];
    }
    return item.stockBalances;
  }
  const loc=stockLocation(item.location);
  const quantity=Number(item.quantity);
  item.stockBalances=[{locationId:loc.id,locationName:loc.name,quantity:Number.isFinite(quantity)&&quantity>=0?quantity:item.quantity}];
  return item.stockBalances;
}
function stockAt(item,location){
  const loc=stockLocation(location);
  return ensureStockBalances(item).filter(x=>x.locationId===loc.id).reduce((n,x)=>n+Math.max(0,Number(x.quantity)||0),0);
}
function changeStock(item,location,delta){
  const loc=stockLocation(location),balances=ensureStockBalances(item),amount=Number(delta);
  // Refuse toute écriture si une quantité ou la ventilation globale est incohérente.
  if(!Number.isFinite(amount)||balances.some(x=>!Number.isFinite(Number(x.quantity))||Number(x.quantity)<0))return false;
  const balanceTotal=balances.reduce((n,x)=>n+Number(x.quantity),0);
  const aggregate=Number(item.quantity);
  if(Number.isFinite(aggregate)&&Math.abs(aggregate-balanceTotal)>0.0001)return false;
  let entry=balances.find(x=>x.locationId===loc.id);
  if(!entry){entry={locationId:loc.id,locationName:loc.name,quantity:0};balances.push(entry)}
  else{entry.locationId=loc.id;entry.locationName=loc.name}
  const next=Number(entry.quantity)+amount;
  if(!Number.isFinite(next)||next<-.000001)return false;
  entry.quantity=Math.max(0,Number(next.toFixed(4)));
  item.quantity=Number(balances.reduce((n,x)=>n+Number(x.quantity),0).toFixed(4));
  return true;
}

function applyStockChanges(item,changes){
  // Applique une opération multi-emplacements sur une copie : aucun débit partiel
  // n'est conservé si l'un des crédits/débits échoue.
  const working={...item};
  if(Array.isArray(item.stockBalances))working.stockBalances=item.stockBalances.map(balance=>({...balance}));
  else delete working.stockBalances;
  for(const [location,delta] of changes){
    if(Number(delta)===0)continue;
    if(!changeStock(working,location,delta))return false;
  }
  item.stockBalances=working.stockBalances;
  item.quantity=working.quantity;
  return true;
}

function logAction(action,entity,description,entityId=""){
 db.activityLog=Array.isArray(db.activityLog)?db.activityLog:[];
 db.activityLog.push({id:id(),date:new Date().toISOString(),action,entity,entityId:String(entityId||""),description:String(description||"")});
 if(db.activityLog.length>5000)db.activityLog=db.activityLog.slice(-5000);
}
function activityPage(el){
 const entries=(db.activityLog||[]).slice().reverse();
 const rows=entries.map(x=>"<tr><td>"+esc(new Date(x.date).toLocaleString("fr-FR"))+"</td><td>"+esc(x.action)+"</td><td>"+esc(x.entity)+"</td><td>"+esc(x.description)+"</td></tr>").join("");
 el.innerHTML="<div class=\"welcome\"><div><h2>Journal des activités</h2><p>Historique automatique des opérations réalisées dans KS BTP.</p></div><div class=\"quick-actions\"><button class=\"button primary\" data-action=\"print-activity\">Imprimer / Enregistrer en PDF</button></div></div><div class=\"notice\">Les actions sont enregistrées automatiquement sur cet appareil, même hors connexion. Le journal est conservé avec les sauvegardes.</div><div class=\"table-wrap\"><table><thead><tr><th>Date et heure</th><th>Opération</th><th>Rubrique</th><th>Détails</th></tr></thead><tbody>"+(rows||"<tr><td colspan=\"4\">Aucune activité enregistrée.</td></tr>")+"</tbody></table></div>";
}
function printActivityLog(){
 const entries=(db.activityLog||[]).slice().reverse(),w=window.open("","_blank");
 if(!w){alert("Autorisez les fenêtres contextuelles pour imprimer le journal.");return}
 const rows=entries.map(x=>"<tr><td>"+esc(new Date(x.date).toLocaleString("fr-FR"))+"</td><td>"+esc(x.action)+"</td><td>"+esc(x.entity)+"</td><td>"+esc(x.description)+"</td></tr>").join("");
 const html="<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>Journal KS BTP</title><style>@page{size:A4 landscape;margin:14mm}body{font:10pt Arial;color:#172334}h1{color:#14243a}h2{color:#ef8b2c}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#14243a;color:white}th,td{border:1px solid #bbc4cf;padding:7px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.meta{padding:10px;background:#f1f4f8;margin:14px 0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>"+esc(db.company||"KS BTP")+"</h1><h2>JOURNAL DES ACTIVITÉS</h2><p>Historique chronologique des opérations</p><div class=\"meta\">Actions : "+entries.length+" | Édité le : "+new Date().toLocaleString("fr-FR")+"</div><table><thead><tr><th>Date et heure</th><th>Opération</th><th>Rubrique</th><th>Détails</th></tr></thead><tbody>"+(rows||"<tr><td colspan=\"4\">Aucune activité enregistrée.</td></tr>")+"</tbody></table><p>KS BTP · Document généré depuis l’application</p><script>window.onload=()=>window.print()</script></body></html>";
 w.document.write(html);w.document.close();
}

function stockByUnit(){return db.materials.reduce((out,m)=>{const unit=String(m.unit||"unité");out[unit]=(out[unit]||0)+Number(m.quantity||0);return out},{} )}
function totalStock(){return db.materials.reduce((s,m)=>s+Number(m.quantity||0),0)}
function stockSummary(){return Object.entries(stockByUnit()).map(([unit,quantity])=>quantity.toLocaleString("fr-FR")+" "+unit).join(" · ")||"Aucun stock"}
function unallocatedStock(item){return stockAt(item,"__unallocated__")}
function go(page){currentPage=page;document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#pageTitle").textContent=({dashboard:"Tableau de bord",materials:"Gestion des matériels",sites:"Gestion des chantiers",movements:"Mouvements de stock",maintenance:"Maintenance",reports:"Rapports",activity:"Journal des activités",settings:"Paramètres",documents:"Bons de stock",users:"Gestion des utilisateurs"})[page];render();$("#sidebar").classList.remove("open")}
function render(){const target=$("#pageContent");({dashboard:dashboard,materials:materialsPage,sites:sitesPage,movements:movementsPage,documents:documentsPage,maintenance:maintenancePage,reports:reportsPage,activity:activityPage,settings:settingsPage,users:usersPage}[currentPage]||dashboard)(target);if(storageLoadError)target.insertAdjacentHTML("afterbegin","<div class=\"notice\" role=\"alert\">"+esc(storageLoadError)+"</div>")}
function dashboard(el){const low=db.materials.filter(m=>Number(m.quantity)<=Number(m.threshold??db.threshold));el.innerHTML=`<div class="welcome"><div><h2>Bienvenue dans KS BTP</h2><p>Suivez vos matériels du magasin central jusqu'aux chantiers.</p></div><div class="quick-actions"><button class="button primary" data-action="add-material">＋ Nouveau matériel</button></div></div><div class="stats-grid"><article class="stat-card"><div class="stat-label">Matériels référencés</div><div class="stat-value">${db.materials.length}</div><div class="stat-note">Articles dans l'inventaire</div></article><article class="stat-card"><div class="stat-label">Stock disponible par unité</div><div class="stat-value">${esc(stockSummary())}</div><div class="stat-note">Quantités séparées selon leur unité</div></article><article class="stat-card"><div class="stat-label">Chantiers actifs</div><div class="stat-value">${db.sites.filter(s=>s.status!=="Clôturé").length}</div><div class="stat-note">Sites suivis</div></article><article class="stat-card"><div class="stat-label">Alertes de stock</div><div class="stat-value">${low.length}</div><div class="stat-note">Sous le seuil minimum</div></article></div><div class="panel-grid"><section class="panel"><div class="panel-head"><h3>Alertes de stock</h3><span class="tag ${low.length?"low":"good"}">${low.length} alerte(s)</span></div>${low.length?low.slice(0,6).map(m=>`<div class="list-row"><div><strong>${esc(m.name)}</strong><span class="muted">${esc(m.category)} · Seuil : ${m.threshold}</span></div><span class="tag low">${m.quantity} ${esc(m.unit)}</span></div>`).join(""):'<div class="empty-state">Aucune alerte de stock pour le moment.</div>'}</section><section class="panel"><h3>Derniers mouvements</h3>${db.movements.slice(-5).reverse().map(m=>`<div class="list-row"><div><strong>${esc(m.type)} · ${esc(m.materialName)}</strong><span class="muted">${esc(m.location)} · ${date(m.date)}</span></div><span class="kpi">${m.quantity}</span></div>`).join("")||'<div class="empty-state">Aucun mouvement enregistré.</div>'}</section></div>`;el.insertAdjacentHTML("beforeend",`<nav class="home-voucher-dock" aria-label="Actions rapides des bons"><button class="home-voucher-button voucher-out" data-action="open-voucher" data-type="Sortie"><span class="voucher-icon" aria-hidden="true">↗</span><span>Bon de sortie</span></button><button class="home-voucher-button voucher-in" data-action="open-voucher" data-type="Réception"><span class="voucher-icon" aria-hidden="true">＋</span><span>Bon de réception</span></button><button class="home-voucher-button voucher-return" data-action="open-voucher" data-type="Retour"><span class="voucher-icon" aria-hidden="true">↩</span><span>Bon de retour</span></button></nav>`)}
function materialsPage(el){el.innerHTML=`<div class="welcome"><div><h2>Inventaire des matériels</h2><p>Référencez les équipements réutilisables et les consommables.</p></div><button class="button primary" data-action="add-material">＋ Ajouter un matériel</button></div><div class="toolbar"><input class="search" id="materialSearch" placeholder="Rechercher par nom ou référence…"><select class="select-filter" id="categoryFilter"><option value="">Toutes les catégories</option>${CATEGORIES.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Désignation</th><th>Catégorie</th><th>Type</th><th>Quantité</th><th>Emplacement</th><th>Actions</th></tr></thead><tbody id="materialRows"></tbody></table></div>`;drawMaterials();$("#materialSearch").addEventListener("input",drawMaterials);$("#categoryFilter").addEventListener("change",drawMaterials)}
function drawMaterials(){const q=($("#materialSearch")?.value||"").toLowerCase(),cat=$("#categoryFilter")?.value||"";const rows=db.materials.filter(m=>(m.name+" "+m.ref).toLowerCase().includes(q)&&(!cat||m.category===cat));rows.forEach(m=>ensureStockBalances(m));$("#materialRows").innerHTML=rows.map(m=>`<tr><td><strong>${esc(m.ref)}</strong></td><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${m.type==="consumable"?"Consommable":"Réutilisable"}</td><td><span class="tag ${Number(m.quantity)<=Number(m.threshold)?"low":"good"}">${m.quantity} ${esc(m.unit)}</span></td><td>${esc((m.stockBalances||[]).filter(b=>Number(b.quantity)>0).map(b=>b.locationName+": "+b.quantity).join(", ")||"Stock historique")}</td><td><div class="action-group"><button class="small-button" data-action="edit-material" data-id="${m.id}">Modifier</button><button class="small-button" data-action="delete-material" data-id="${m.id}">Supprimer</button></div></td></tr>`).join("")||'<tr><td colspan="7" class="empty-state">Aucun matériel trouvé.</td></tr>'}
function siteMaterialFlow(site,material){
  const sameMaterial=x=>x.materialId===material.id||(!x.materialId&&x.materialName===material.name);
  const docs=(db.documents||[]).filter(d=>sameMaterial(d)&&d.site===site.name);
  const refs=new Set(docs.map(d=>String(d.ref||"")).filter(Boolean));
  const sum=list=>list.reduce((n,x)=>n+Math.max(0,Number(x.quantity)||0),0);
  const receivedDocs=docs.filter(d=>d.type==="Réception");
  const consumedDocs=docs.filter(d=>d.type==="Sortie");
  const returnedDocs=docs.filter(d=>d.type==="Retour");
  const standalone=(db.movements||[]).filter(m=>{
    if(!sameMaterial(m))return false;
    if([...refs].some(ref=>String(m.note||"").startsWith("Document "+ref)))return false;
    return m.location===site.name||m.source===site.id||m.destination===site.id||m.source===site.name||m.destination===site.name;
  });
  const received=sum(receivedDocs)+sum(standalone.filter(m=>m.type==="sortie"&&(m.destination===site.id||m.location===site.name)));
  const consumed=sum(consumedDocs)+sum(standalone.filter(m=>m.type==="consommation"));
  const returned=sum(returnedDocs)+sum(standalone.filter(m=>m.type==="retour"));
  const available=stockAt(material,site.id);
  return {received,consumed,returned,available,opening:available-received+consumed+returned};
}
function sitesPage(el){
  const summarize=items=>{
    const totals=new Map();
    items.forEach(({quantity,unit})=>{const key=String(unit||"unité");totals.set(key,(totals.get(key)||0)+Number(quantity||0));});
    return [...totals.entries()].map(([unit,quantity])=>Number(quantity.toFixed(3)).toLocaleString("fr-FR")+" "+unit).join(" · ")||"0";
  };
  const centralItems=db.materials.map(m=>({quantity:stockAt(m,"central"),unit:m.unit})).filter(x=>x.quantity>0);
  const siteItems=db.sites.flatMap(site=>db.materials.map(m=>({quantity:stockAt(m,site.id),unit:m.unit})).filter(x=>x.quantity>0));
  const unallocatedItems=db.materials.map(m=>({quantity:unallocatedStock(m),unit:m.unit})).filter(x=>x.quantity>0);
  const active=db.sites.filter(s=>s.status!=="Clôturé").length;
  const cards=db.sites.map(site=>{
    const grouped=new Map();
    db.materials.forEach(m=>{
      const flow=siteMaterialFlow(site,m);
      const quantity=flow.available;
      if(quantity<=0&&flow.received<=0&&flow.consumed<=0&&flow.returned<=0)return;
      const key=String(m.name||"").trim().toLocaleLowerCase("fr")+"|"+String(m.unit||"unité").trim().toLocaleLowerCase("fr");
      if(!grouped.has(key))grouped.set(key,{name:m.name,unit:m.unit||"unité",quantity:0,opening:0,received:0,consumed:0,returned:0,refs:[]});
      const item=grouped.get(key);item.quantity+=quantity;item.opening+=flow.opening;item.received+=flow.received;item.consumed+=flow.consumed;item.returned+=flow.returned;if(m.ref)item.refs.push(m.ref);
    });
    const lines=[...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    const details=lines.length?lines.map(item=>'<div class="site-material-row"><span class="site-material-name">'+esc(item.name)+'<small>'+item.refs.length+' référence(s) : '+esc(item.refs.join(" · "))+'</small><small>Initial : '+Number(item.opening.toFixed(3)).toLocaleString("fr-FR")+' · Réceptionné : '+Number(item.received.toFixed(3)).toLocaleString("fr-FR")+' · Consommé : '+Number(item.consumed.toFixed(3)).toLocaleString("fr-FR")+' · Retourné : '+Number(item.returned.toFixed(3)).toLocaleString("fr-FR")+'</small></span><strong>'+Number(item.quantity.toFixed(3)).toLocaleString("fr-FR")+' '+esc(item.unit)+'<small>Disponible</small></strong></div>').join(""):'<div class="site-empty-stock">Aucun matériel affecté à ce chantier</div>';
    const status=site.status||"Actif";
    return '<article class="site-card"><div class="site-card-head"><div class="site-title-wrap"><span class="site-symbol">⌂</span><div><h3>'+esc(site.name)+'</h3><p>Responsable : '+esc(site.manager||"Non renseigné")+'</p></div></div><span class="tag '+(status==="Clôturé"?"":"good")+'">'+esc(status)+'</span></div><div class="site-section-title">Matériels présents <span>'+lines.length+' désignation(s)</span></div><div class="site-material-list">'+details+'</div><div class="site-card-actions"><span class="site-caption">Suivi du stock par matériel</span><button class="small-button danger" data-action="delete-site" data-id="'+esc(site.id)+'">Supprimer le chantier</button></div></article>';
  }).join("");
  el.innerHTML='<div class="sites-heading"><div><p class="eyebrow">PARC ET EMPLACEMENTS</p><h2>Gestion des chantiers</h2><p>Consultez les responsables et les matériels affectés à chaque chantier.</p></div><button class="button primary" data-action="add-site">＋ Nouveau chantier</button></div>'+
  '<section class="site-overview" aria-label="Synthèse des stocks"><div class="site-overview-item"><span>Chantiers actifs</span><strong>'+active+' <small>/ '+db.sites.length+'</small></strong></div><div class="site-overview-item"><span>Stock sur les chantiers</span><strong>'+esc(summarize(siteItems))+'</strong></div><div class="site-overview-item"><span>Magasin central</span><strong>'+esc(summarize(centralItems))+'</strong></div></section>'+
  (unallocatedItems.length?'<div class="notice">Stock historique non affecté : '+esc(summarize(unallocatedItems))+'. Il reste séparé et ne sera attribué à aucun chantier automatiquement.</div>':'')+
  '<div class="site-toolbar"><input class="search" id="siteSearch" type="search" placeholder="Rechercher un chantier ou un responsable…" aria-label="Rechercher un chantier ou un responsable"><select class="select-filter" id="siteStatusFilter" aria-label="Filtrer par statut"><option value="">Tous les statuts</option><option value="Actif">Actifs</option><option value="Clôturé">Clôturés</option></select><span class="site-count">'+db.sites.length+' chantier(s)</span></div>'+
  '<div class="site-grid" id="siteGrid">'+(cards||'<div class="site-empty panel">Aucun chantier enregistré. Créez un chantier pour commencer le suivi.</div>')+'</div>';
  const search=$("#siteSearch"),filter=$("#siteStatusFilter"),grid=$("#siteGrid");
  const applyFilters=()=>{
    const query=(search.value||"").trim().toLocaleLowerCase("fr"),status=filter.value;let visible=0;
    grid.querySelectorAll(".site-card").forEach(card=>{const show=card.dataset.search.includes(query)&&(!status||card.dataset.status===status);card.hidden=!show;if(show)visible++;});
    const count=el.querySelector(".site-count");if(count)count.textContent=visible+" chantier(s)";
    let empty=grid.querySelector(".site-filter-empty");
    if(!visible&&cards){if(!empty){empty=document.createElement("div");empty.className="site-empty panel site-filter-empty";empty.textContent="Aucun chantier ne correspond à votre recherche.";grid.append(empty);}empty.hidden=false;}else if(empty)empty.hidden=true;
  };
  grid.querySelectorAll(".site-card").forEach((card,index)=>{const site=db.sites[index];card.dataset.search=(String(site.name||"")+" "+String(site.manager||"")).toLocaleLowerCase("fr");card.dataset.status=site.status||"Actif";});
  search.addEventListener("input",applyFilters);filter.addEventListener("change",applyFilters);
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
  if(storageLoadError){alert(storageLoadError);return}
  const type=$("#voucherType").value,quantity=Number($("#voucherQuantity").value);
  if(!Number.isFinite(quantity)||quantity<=0){alert("Saisissez une quantité valide.");return}
  let m=null,purchase=null;
  if(type==="Réception"){
    const existingId=$("#voucherExistingMaterial").value;
    const storage=$("#receiptLocation").value;
    if(!storage||!db.sites.some(x=>x.id===storage)){alert("Choisissez le chantier qui réceptionne le matériel.");return}
    if(existingId){m=db.materials.find(x=>x.id===existingId);if(!m){alert("Le matériel sélectionné est introuvable.");return}}
    else{
      const name=$("#receiptMaterialName").value.trim();
      if(!name){alert("Indiquez la désignation du matériel.");return}
      m={id:id(),ref:nextMaterialRef(),name,category:$("#receiptCategory").value,type:$("#receiptType").value,quantity:0,unit:$("#receiptUnit").value.trim()||"pièce",threshold:Number($("#receiptThreshold").value)||0,location:"central",purchaseHistory:[]};
    }
    const unitPrice=Number($("#purchaseUnitPrice").value||0);
    purchase={id:id(),date:$("#purchaseDate").value||new Date().toISOString().slice(0,10),supplier:$("#purchaseSupplier").value.trim(),invoice:$("#purchaseInvoice").value.trim(),quantity,unitPrice,total:quantity*unitPrice,currency:db.currency,storage:$("#receiptLocation").selectedOptions[0]?.textContent||"Magasin central"};
    if(!changeStock(m,storage,quantity)){alert("Réception impossible : vérifiez le chantier et la quantité.");return}
    if(!existingId)db.materials.push(m);
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
      if(!applyStockChanges(m,[[selectedSite,-quantity]])){alert("Impossible de débiter le stock du chantier. Vérifiez sa ventilation.");return}
    }else{
      if(quantity>stockAt(m,selectedSite)){alert("Stock insuffisant sur ce chantier pour effectuer le retour.");return}
      if(!applyStockChanges(m,[[selectedSite,-quantity],["central",quantity]])){alert("Retour impossible : vérifiez les stocks et leur ventilation avant de recommencer.");return}
    }
  }
  db.documents=db.documents||[];
  const d={id:id(),ref:nextVoucherRef(type),date:new Date().toISOString(),type,materialId:m.id,materialRef:m.ref,materialName:m.name,category:m.category,quantity,unit:m.unit,site:type==="Réception"?$("#receiptLocation").selectedOptions[0]?.textContent:$("#voucherSite").selectedOptions[0]?.textContent,source:type==="Sortie"?$("#voucherSite").selectedOptions[0]?.textContent:(type==="Retour"?$("#voucherSite").selectedOptions[0]?.textContent:"Fournisseur"),destination:type==="Réception"?$("#receiptLocation").selectedOptions[0]?.textContent:(type==="Sortie"?"Sortie / utilisation":"Magasin central"),recipient:$("#voucherRecipient").value.trim(),note:$("#voucherNote").value.trim(),purchase};
  if(type==="Réception"){d.supplier=purchase.supplier;d.invoice=purchase.invoice;d.purchaseDate=purchase.date;d.unitPrice=purchase.unitPrice;d.totalPurchase=purchase.total}
  db.documents.push(d);
  db.movements.push({id:id(),date:d.date,type:type.toLowerCase(),materialId:m.id,materialName:m.name,quantity,location:d.site,source:d.source,destination:d.destination,note:"Document "+d.ref+(purchase?" · Fournisseur : "+purchase.supplier:"")});
  logAction("Création de bon "+type,"Bon de stock",d.ref+" · "+m.ref+" — "+m.name+" · "+quantity+" "+m.unit+" · "+d.site,d.id);
  save();closeVoucher();render();printVoucher(d);
}
function maintenancePage(el){el.innerHTML=`<div class="welcome"><div><h2>Maintenance et réparations</h2><p>Consignez les pannes, interventions et coûts de réparation.</p></div><button class="button primary" data-action="add-maintenance">＋ Déclarer une intervention</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Matériel</th><th>Problème / intervention</th><th>Coût</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${db.maintenance.slice().reverse().map(m=>`<tr><td>${date(m.date)}</td><td>${esc(m.materialRef||"")} ${esc(m.materialName)}</td><td>${esc(m.description)}</td><td>${money(m.cost)}</td><td><span class="tag">${esc(m.status||"À traiter")}</span></td><td><div class="action-group"><button class="small-button" data-action="edit-maintenance" data-id="${m.id}">Modifier</button><button class="small-button" data-action="delete-maintenance" data-id="${m.id}">Supprimer</button></div></td></tr>`).join("")||'<tr><td colspan="6" class="empty-state">Aucune intervention enregistrée.</td></tr>'}</tbody></table></div>`}
function openMaintenance(record){
 if(!db.materials.length){alert("Ajoutez d'abord un matériel.");return}
 $("#maintenanceForm").reset();$("#maintenanceId").value=record?.id||"";
 $("#maintenanceTitle").textContent=record?"Modifier l'intervention":"Déclarer une intervention";
 $("#maintenanceMaterial").innerHTML=db.materials.map(m=>`<option value="${m.id}">${esc(m.ref)} — ${esc(m.name)}</option>`).join("");
 $("#maintenanceDate").value=record?.date?new Date(record.date).toISOString().slice(0,10):new Date().toISOString().slice(0,10);$("#maintenanceCurrency").textContent=db.currency;
 $("#maintenanceStatus").value=record?.status||"À traiter";$("#maintenanceDescription").value=record?.description||"";$("#maintenanceCost").value=record?.cost??0;
 if(record)$("#maintenanceMaterial").value=record.materialId||"";
 $("#maintenanceDialog").showModal();
}
function closeMaintenance(){$("#maintenanceDialog").close()}
function submitMaintenance(e){
 e.preventDefault();
 if(storageLoadError){alert(storageLoadError);return}
 const material=db.materials.find(m=>m.id===$("#maintenanceMaterial").value),description=$("#maintenanceDescription").value.trim(),raw=$("#maintenanceCost").value,cost=Number(raw),dateValue=$("#maintenanceDate").value;
 if(!material){alert("Sélectionnez un matériel valide.");return}
 if(!description){alert("La description de l'intervention est obligatoire.");$("#maintenanceDescription").focus();return}
 if(!dateValue){alert("Indiquez la date de l'intervention.");return}
 if(raw===""||!Number.isFinite(cost)||cost<0){alert("Le coût doit être un nombre positif ou nul.");$("#maintenanceCost").focus();return}
 const existing=db.maintenance.find(x=>x.id===$("#maintenanceId").value);
 const entry={id:existing?.id||id(),date:new Date(dateValue+"T12:00:00").toISOString(),materialId:material.id,materialRef:material.ref,materialName:material.name,description,cost,status:$("#maintenanceStatus").value};
 if(existing){Object.assign(existing,entry);logAction("Modification","Maintenance",material.ref+" — "+material.name+" · "+description,entry.id)}else{db.maintenance.push(entry);logAction("Création","Maintenance",material.ref+" — "+material.name+" · "+description,entry.id)}
 save();closeMaintenance();render();
}
function stockAudit(){
  const knownSites=new Map((db.sites||[]).map(site=>[site.id,site.name]));
  const locationRows=[],invalidBalances=[];
  const materials=db.materials.map(m=>{
    const current=Number(m.quantity)||0;
    const rawBalances=Array.isArray(m.stockBalances)?m.stockBalances:[];
    const auditCopy={...m,stockBalances:rawBalances.map(b=>({...b}))};
    const balances=ensureStockBalances(auditCopy);
    const balanceTotal=balances.reduce((sum,b)=>sum+(Number.isFinite(Number(b.quantity))?Number(b.quantity):0),0);
    const seen=new Set();
    rawBalances.forEach(b=>{
      const q=Number(b.quantity),key=String(b.locationId||"");
      if(!Number.isFinite(q)||q<0)invalidBalances.push({ref:m.ref,name:m.name,location:b.locationName||key,quantity:b.quantity});
      if(seen.has(key))invalidBalances.push({ref:m.ref,name:m.name,location:b.locationName||key,quantity:"Emplacement en double"});
      seen.add(key);
      if(key!=="__unallocated__"&&key!=="central"&&!knownSites.has(key))invalidBalances.push({ref:m.ref,name:m.name,location:b.locationName||key,quantity:"Chantier introuvable"});
    });
    balances.forEach(b=>{
      const q=Number(b.quantity),key=String(b.locationId||"");
      if(q>0)locationRows.push({ref:m.ref,name:m.name,unit:m.unit,location:b.locationName||(key==="central"?"Magasin central":knownSites.get(key)||"Emplacement non identifié"),quantity:q});
    });
    return {id:m.id,ref:m.ref,name:m.name,unit:m.unit,current,balanceTotal,difference:Number((current-balanceTotal).toFixed(4)),hasBalances:true};
  });
  const balanceIssues=materials.filter(m=>Math.abs(m.difference)>0.0001);
  const documents=Array.isArray(db.documents)?db.documents:[];
  const movements=Array.isArray(db.movements)?db.movements:[];
  const unlinkedDocuments=documents.filter(d=>d.ref&&!movements.some(m=>String(m.note||"").startsWith("Document "+String(d.ref))));
  const refs=documents.map(d=>String(d.ref||"")).filter(Boolean);
  const duplicateRefs=refs.filter((ref,index)=>refs.indexOf(ref)!==index);
  const orphanMovements=movements.filter(m=>m.materialId&&!db.materials.some(item=>item.id===m.materialId));
  const totalByUnit={},balanceByUnit={};
  materials.forEach(m=>{
    const unit=String(m.unit||"unité");
    totalByUnit[unit]=(totalByUnit[unit]||0)+m.current;
    balanceByUnit[unit]=(balanceByUnit[unit]||0)+m.balanceTotal;
  });
  return {materials,balanceIssues,unlinkedDocuments,locationRows,invalidBalances,duplicateRefs,orphanMovements,totalByUnit,balanceByUnit};
}
function printGeneralReport(){
 const w=window.open("","_blank");
 if(!w){alert("Autorisez les fenêtres contextuelles pour générer le rapport.");return}
 const audit=stockAudit(),now=new Date().toLocaleString("fr-FR");
 const byUnit=list=>{const totals={};list.forEach(x=>{const unit=x.unit||"unité";totals[unit]=(totals[unit]||0)+(Number(x.quantity)||0)});return Object.entries(totals).map(([u,q])=>q.toLocaleString("fr-FR")+" "+u).join(" · ")||"0"};
 const materialRows=db.materials.map(m=>"<tr><td>"+esc(m.ref)+"</td><td>"+esc(m.name)+"</td><td>"+esc(m.category)+"</td><td>"+Number(m.quantity||0).toLocaleString("fr-FR")+" "+esc(m.unit)+"</td><td>"+esc(m.location||"—")+"</td></tr>").join("")||'<tr><td colspan="5">Aucun matériel</td></tr>';
 const siteSections=db.sites.map(site=>{
  const rows=db.materials.map(m=>({m,flow:siteMaterialFlow(site,m)})).filter(x=>x.flow.available>0||x.flow.received>0||x.flow.consumed>0||x.flow.returned>0);
  return "<h3>Chantier : "+esc(site.name)+"</h3><p>Responsable : "+esc(site.manager||"—")+" · Statut : "+esc(site.status||"—")+"</p><table><thead><tr><th>Matériel</th><th>Stock initial</th><th>Réceptionné</th><th>Consommé (bons de sortie inclus)</th><th>Retourné</th><th>Disponible</th></tr></thead><tbody>"+(rows.map(({m,flow})=>"<tr><td>"+esc(m.name)+" ("+esc(m.unit||"unité")+")</td><td>"+flow.opening.toLocaleString("fr-FR")+"</td><td>"+flow.received.toLocaleString("fr-FR")+"</td><td>"+flow.consumed.toLocaleString("fr-FR")+"</td><td>"+flow.returned.toLocaleString("fr-FR")+"</td><td><strong>"+flow.available.toLocaleString("fr-FR")+"</strong></td></tr>").join("")||'<tr><td colspan="6">Aucun matériel suivi</td></tr>')+"</tbody></table>";
 }).join("")||"<p>Aucun chantier enregistré.</p>";
 const movementRows=db.movements.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(m=>"<tr><td>"+date(m.date)+"</td><td>"+esc(m.type)+"</td><td>"+esc(m.materialName||m.materialId||"—")+"</td><td>"+esc(m.quantity)+" "+esc(m.unit||"")+"</td><td>"+esc(m.location||m.source||"—")+"</td><td>"+esc(m.note||"—")+"</td></tr>").join("")||'<tr><td colspan="6">Aucun mouvement</td></tr>';
 const docRows=db.documents.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(d=>"<tr><td>"+esc(d.ref)+"</td><td>"+date(d.date)+"</td><td>"+esc(d.type)+"</td><td>"+esc(d.materialName)+"</td><td>"+esc(d.quantity)+" "+esc(d.unit)+"</td><td>"+esc(d.site)+"</td></tr>").join("")||'<tr><td colspan="6">Aucun bon</td></tr>';
 const maintenanceRows=db.maintenance.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(x=>"<tr><td>"+date(x.date)+"</td><td>"+esc(x.materialName||x.materialRef||"—")+"</td><td>"+esc(x.description||"—")+"</td><td>"+esc(x.status||"—")+"</td><td>"+esc(x.cost??"—")+"</td></tr>").join("")||'<tr><td colspan="5">Aucune intervention</td></tr>';
 const purchaseRows=(db.purchases||[]).slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(x=>"<tr><td>"+date(x.date)+"</td><td>"+esc(x.materialRef||x.materialName||"—")+"</td><td>"+esc(x.supplier||"—")+"</td><td>"+esc(x.invoice||"—")+"</td><td>"+esc(x.quantity??"—")+"</td><td>"+money(x.total??0)+"</td></tr>").join("")||'<tr><td colspan="6">Aucun achat enregistré</td></tr>';
 const activityRows=(db.activityLog||[]).slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(x=>"<tr><td>"+date(x.date)+"</td><td>"+esc(x.action||"")+"</td><td>"+esc(x.entity||"")+"</td><td>"+esc(x.description||"")+"</td></tr>").join("")||'<tr><td colspan="4">Aucune activité</td></tr>';
 const issues=audit.balanceIssues.length+audit.invalidBalances.length+audit.duplicateRefs.length+audit.orphanMovements.length+audit.unlinkedDocuments.length;
 const html="<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>Rapport général KS BTP</title><style>@page{size:A4 landscape;margin:12mm}body{font:9pt Arial;color:#172334}h1{color:#14243a;margin-bottom:4px}h2{background:#14243a;color:white;padding:8px;margin-top:22px}h3{color:#d97720;margin:14px 0 5px}p{margin:5px 0 12px}.meta,.summary{background:#f1f4f8;padding:10px;margin:10px 0}table{width:100%;border-collapse:collapse;margin:8px 0 18px}th{background:#e8edf3}th,td{border:1px solid #b8c2ce;padding:6px;text-align:left;vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}.summary{display:flex;gap:22px;flex-wrap:wrap}.summary span{font-weight:bold}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>"+esc(db.company||"KS BTP")+"</h1><h2>RAPPORT GÉNÉRAL DE GESTION</h2><div class='meta'>Document consolidé · Généré le "+now+" · Données enregistrées sur cet appareil</div><div class='summary'><span>Matériels : "+db.materials.length+"</span><span>Chantiers : "+db.sites.length+"</span><span>Mouvements : "+db.movements.length+"</span><span>Bons : "+db.documents.length+"</span><span>Maintenances : "+db.maintenance.length+"</span><span>Achats : "+(db.purchases||[]).length+"</span><span>Anomalies à vérifier : "+issues+"</span></div><h2>1. ÉTAT DU PARC MATÉRIEL</h2><p>Stock par unité : "+esc(byUnit(db.materials.map(m=>({unit:m.unit,quantity:m.quantity}))))+"</p><table><thead><tr><th>Référence</th><th>Désignation</th><th>Catégorie</th><th>Stock total</th><th>Emplacement déclaré</th></tr></thead><tbody>"+materialRows+"</tbody></table><h2>2. SITUATION DES CHANTIERS</h2><p>Le stock disponible est le solde réel par emplacement. Les bons de sortie sont comptés comme consommations ; les mouvements liés aux bons ne sont pas comptés deux fois.</p>"+siteSections+"<h2>3. HISTORIQUE DES MOUVEMENTS</h2><table><thead><tr><th>Date</th><th>Opération</th><th>Matériel</th><th>Quantité</th><th>Emplacement</th><th>Observation</th></tr></thead><tbody>"+movementRows+"</tbody></table><h2>4. BONS DE STOCK</h2><table><thead><tr><th>Référence</th><th>Date</th><th>Type</th><th>Matériel</th><th>Quantité</th><th>Chantier</th></tr></thead><tbody>"+docRows+"</tbody></table><h2>5. ACHATS ET RÉCEPTIONS</h2><table><thead><tr><th>Date</th><th>Matériel</th><th>Fournisseur</th><th>Facture</th><th>Quantité</th><th>Montant</th></tr></thead><tbody>"+purchaseRows+"</tbody></table><h2>6. MAINTENANCE</h2><table><thead><tr><th>Date</th><th>Matériel</th><th>Intervention</th><th>Statut</th><th>Coût</th></tr></thead><tbody>"+maintenanceRows+"</tbody></table><h2>7. CONTRÔLE DE COHÉRENCE</h2><p>Écarts de ventilation : "+audit.balanceIssues.length+" · Soldes invalides : "+audit.invalidBalances.length+" · Références de bons en double : "+audit.duplicateRefs.length+" · Mouvements orphelins : "+audit.orphanMovements.length+" · Bons sans mouvement lié : "+audit.unlinkedDocuments.length+".</p><p>Ce rapport ne corrige et ne modifie aucune donnée. Les quantités initiales historiques sont conservées ; les anomalies éventuelles doivent être vérifiées avant toute correction.</p><h2>8. JOURNAL DES ACTIVITÉS</h2><table><thead><tr><th>Date</th><th>Action</th><th>Rubrique</th><th>Détails</th></tr></thead><tbody>"+activityRows+"</tbody></table><p>KS BTP · Fin du rapport général</p><script>window.onload=()=>window.print()</script></body></html>";
 w.document.open();w.document.write(html);w.document.close();
}
function reportsPage(el){const audit=stockAudit();el.innerHTML=`<div class="welcome"><div><h2>Rapports et exports</h2><p>Consultez les données enregistrées sur cet appareil.</p></div><div class="quick-actions"><button class="button secondary" data-action="print-general-report">Télécharger le rapport général (PDF)</button><button class="button secondary" data-action="export-csv">Exporter matériels (CSV)</button><button class="button primary" data-action="backup">Sauvegarder les données</button></div></div><div class="stats-grid"><article class="stat-card"><div class="stat-label">Matériels</div><div class="stat-value">${db.materials.length}</div></article><article class="stat-card"><div class="stat-label">Chantiers</div><div class="stat-value">${db.sites.length}</div></article><article class="stat-card"><div class="stat-label">Mouvements</div><div class="stat-value">${db.movements.length}</div></article><article class="stat-card"><div class="stat-label">Interventions</div><div class="stat-value">${db.maintenance.length}</div></article></div><div class="panel"><h3>Contrôle de cohérence du stock</h3><p class="muted">Contrôle en lecture seule : aucune quantité, aucun bon et aucun mouvement ne sera modifié.</p><div class="stats-grid"><article class="stat-card"><div class="stat-label">Stock inventaire par unité</div><div class="stat-value">${esc(Object.entries(audit.totalByUnit).map(([unit,quantity])=>quantity.toLocaleString("fr-FR")+" "+unit).join(" · ")||"0")}</div></article><article class="stat-card"><div class="stat-label">Emplacements par unité</div><div class="stat-value">${esc(Object.entries(audit.balanceByUnit).map(([unit,quantity])=>quantity.toLocaleString("fr-FR")+" "+unit).join(" · ")||"0")}</div></article><article class="stat-card"><div class="stat-label">Écarts de ventilation</div><div class="stat-value">${audit.balanceIssues.length}</div></article><article class="stat-card"><div class="stat-label">Bons à vérifier</div><div class="stat-value">${audit.unlinkedDocuments.length}</div></article></div><div class="notice">Important : l'historique ne permet pas de recalculer le stock final sans connaître un stock initial fiable. Les bons anciens sans lien explicite sont signalés pour vérification, pas considérés automatiquement comme des erreurs. Aucun ajustement automatique n'est effectué.</div><div class="table-wrap"><table><thead><tr><th>Matériel</th><th>Stock inventaire</th><th>Somme emplacements</th><th>Écart</th></tr></thead><tbody>${audit.materials.map(m=>`<tr><td><strong>${esc(m.ref)} — ${esc(m.name)}</strong></td><td>${m.current} ${esc(m.unit)}</td><td>${m.balanceTotal} ${esc(m.unit)}</td><td>${Math.abs(m.difference)>0.0001?'<span class="tag low">'+m.difference+'</span>':'<span class="tag good">0</span>'}</td></tr>`).join("")||'<tr><td colspan="4" class="empty-state">Aucun matériel enregistré.</td></tr>'}</tbody></table></div>${audit.locationRows.length?'<h4>Répartition réelle par emplacement</h4><div class="table-wrap"><table><thead><tr><th>Matériel</th><th>Emplacement</th><th>Quantité</th></tr></thead><tbody>'+audit.locationRows.map(x=>'<tr><td>'+esc(x.ref)+' — '+esc(x.name)+'</td><td>'+esc(x.location)+'</td><td>'+esc(x.quantity)+' '+esc(x.unit)+'</td></tr>').join("")+'</tbody></table></div>':'<p class="muted">Aucun solde positif par emplacement.</p>'}${audit.invalidBalances.length||audit.duplicateRefs.length||audit.orphanMovements.length?'<h4>Anomalies à examiner</h4><ul>'+audit.invalidBalances.map(x=>'<li>'+esc(x.ref)+' · '+esc(x.location)+' : '+esc(x.quantity)+'</li>').concat(audit.duplicateRefs.map(x=>'<li>Référence de bon en double : '+esc(x)+'</li>'),audit.orphanMovements.map(x=>'<li>Mouvement sans matériel correspondant : '+esc(x.materialName||x.materialId)+'</li>')).join("")+'</ul>':'<p class="muted">Aucune anomalie structurelle détectée dans les emplacements, références de bons et liens des mouvements.</p>'}${audit.unlinkedDocuments.length?'<h4>Bons sans mouvement explicitement lié</h4><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Type</th><th>Matériel</th><th>Quantité</th><th>Chantier</th></tr></thead><tbody>'+audit.unlinkedDocuments.map(d=>'<tr><td>'+esc(d.ref)+'</td><td>'+esc(d.type)+'</td><td>'+esc(d.materialName)+'</td><td>'+esc(d.quantity)+' '+esc(d.unit)+'</td><td>'+esc(d.site)+'</td></tr>').join("")+'</tbody></table></div>':'<p class="muted">Tous les bons avec référence possèdent un mouvement portant cette référence.</p>'}</div><div class="panel"><h3>Répartition par catégorie</h3><div class="category-list">${CATEGORIES.map(c=>`<span class="tag">${c} : ${db.materials.filter(m=>m.category===c).length}</span>`).join("")}</div></div><div class="panel" style="margin-top:15px"><h3>Restaurer une sauvegarde</h3><p class="muted">Le fichier JSON remplace les données locales actuelles. Faites une sauvegarde avant toute restauration.</p><input type="file" id="restoreFile" accept="application/json"></div>`}

async function usersPage(el){el.innerHTML=`<div class="welcome"><div><h2>Gestion des utilisateurs</h2><p>Préparation de l’administration des accès KS BTP.</p></div></div><div class="panel"><h3>Comptes et permissions</h3><p class="muted">Cette version fonctionne en mode local et hors connexion. Elle ne possède pas encore de service d’authentification actif. Pour créer de vrais comptes, attribuer des rôles et contrôler les accès entre plusieurs appareils, il faudra connecter un serveur d’authentification et une base de données sécurisée.</p><div class="notice">Aucun faux compte ni contrôle d’accès simulé n’est activé. Les données restent stockées sur cet appareil.</div></div>`;}
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
function openItem(item){$("#itemForm").reset();$("#itemId").value=item?.id||"";$("#dialogTitle").textContent=item?"Modifier le matériel":"Ajouter un matériel";$("#itemName").value=item?.name||"";$("#itemCategory").value=item?.category||"Maçonnerie";$("#itemType").value=item?.type||"equipment";$("#itemQuantity").value=item?.quantity??0;$("#itemUnit").value=item?.unit||"pièce";$("#itemThreshold").value=item?.threshold??db.threshold;$("#itemLocation").innerHTML='<option value="central">Magasin central</option>'+db.sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");$("#itemLocation").value=item?.location||"central";$("#itemQuantity").readOnly=!!item;$("#itemLocation").disabled=!!item;$("#itemDialog").showModal()}
function closeItem(){$("#itemDialog").close()}
function addMovement(){
  $("#movementMaterial").innerHTML='<option value="">Choisir un matériel</option>'+db.materials.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.ref)+' — '+esc(m.name)+' ('+m.quantity+' '+esc(m.unit)+')</option>').join("");
  $("#movementSite").innerHTML='<option value="">Choisir un chantier</option>'+db.sites.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join("");
  $("#movementType").value="entrée"; $("#movementQuantity").value="1"; $("#movementNote").value="";
  updateMovementForm(); $("#movementDialog").showModal();
}
function updateMovementForm(){
  const type=$("#movementType").value,needsSite=type==="sortie"||type==="retour"||type==="consommation";
  $("#movementSiteFields").hidden=!needsSite; $("#movementSite").required=needsSite;
  $("#movementSiteLabel").textContent=type==="sortie"?"Chantier destinataire":"Chantier concerné";
  const material=db.materials.find(m=>m.id===$("#movementMaterial").value),siteId=$("#movementSite").value;
  let message="Pour une entrée, la quantité sera ajoutée au magasin central.";
  if(material&&type==="sortie")message="Stock mobilisable au magasin central : "+(stockAt(material,"central")+unallocatedStock(material))+" "+material.unit+".";
  if(material&&(type==="retour"||type==="consommation")){const site=db.sites.find(s=>s.id===siteId);message=site?"Stock disponible sur "+site.name+" : "+stockAt(material,siteId)+" "+material.unit+".":"Sélectionnez un chantier pour consulter son stock.";}
  $("#movementStockInfo").textContent=message;
}
function closeMovement(){ $("#movementDialog").close() }
function submitMovement(e){
  e.preventDefault();
  if(storageLoadError){alert(storageLoadError);return}
  const type=$("#movementType").value,m=db.materials.find(x=>x.id===$("#movementMaterial").value),qty=Number($("#movementQuantity").value),siteId=$("#movementSite").value;
  if(!m){alert("Choisissez un matériel dans la liste.");return}
  if(!Number.isFinite(qty)||qty<=0){alert("Saisissez une quantité strictement supérieure à zéro.");return}
  let location="Magasin central",source="central",destination="central";
  if(type==="sortie"){
    if(!db.sites.some(s=>s.id===siteId)){alert("Choisissez le chantier destinataire.");return}
    const available=stockAt(m,"central")+unallocatedStock(m);if(qty>available){alert("Stock insuffisant au magasin central. Disponible : "+available+" "+m.unit+".");return}
    const take=Math.min(stockAt(m,"central"),qty),remain=qty-take;
    if(!applyStockChanges(m,[["central",-take],["__unallocated__",-remain],[siteId,qty]])){alert("Transfert impossible : vérifiez les stocks et leur ventilation avant de recommencer.");return}
    location=db.sites.find(s=>s.id===siteId).name;destination=siteId;
  }else if(type==="retour"||type==="consommation"){
    if(!db.sites.some(s=>s.id===siteId)){alert("Choisissez le chantier concerné.");return}
    const available=stockAt(m,siteId);if(qty>available){alert("Stock insuffisant sur ce chantier. Disponible : "+available+" "+m.unit+".");return}
    const changes=type==="retour"?[[siteId,-qty],["central",qty]]:[[siteId,-qty]];
    if(!applyStockChanges(m,changes)){alert("Opération impossible : vérifiez les stocks et leur ventilation avant de recommencer.");return}
    location=db.sites.find(s=>s.id===siteId).name;source=siteId;
    if(type==="consommation")destination="consommé";
  }else if(type==="entrée"){if(!changeStock(m,"central",qty)){alert("Impossible d\'ajouter la quantité au magasin central.");return}}
  else{alert("Type de mouvement non reconnu.");return}
  const movement={id:id(),date:new Date().toISOString(),type,materialId:m.id,materialName:m.name,quantity:qty,location,source,destination,note:$("#movementNote").value.trim()};db.movements.push(movement);logAction("Mouvement : "+type,"Stock",m.ref+" — "+m.name+" · "+qty+" "+m.unit+" · "+location+(movement.note?" · "+movement.note:""),movement.id);
  save();closeMovement();render();
}
function exportCsv(){const rows=[["Référence","Désignation","Catégorie","Type","Quantité","Unité","Emplacement"],...db.materials.map(m=>[m.ref,m.name,m.category,m.type,m.quantity,m.unit,m.location])];const csv="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");download("ks-btp-materiels.csv",csv,"text/csv;charset=utf-8")}
function download(name,data,type){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
document.querySelectorAll(".nav-link[data-page]").forEach(nav=>{nav.addEventListener("click",e=>{e.preventDefault();go(nav.dataset.page)});});
document.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const act=b.dataset.action,mid=b.dataset.id;
 if(storageLoadError&&["add-material","edit-material","delete-material","add-site","delete-site","add-movement","open-voucher","add-maintenance","edit-maintenance","delete-maintenance","save-settings"].includes(act)){alert(storageLoadError);return}if(act==="add-material")openItem();if(act==="edit-material")openItem(db.materials.find(m=>m.id===mid));if(act==="delete-material"){
  const itemToDelete=db.materials.find(m=>m.id===mid);const hasRemainingStock=Number(itemToDelete?.quantity)>0||(itemToDelete?.stockBalances||[]).some(balance=>Number(balance.quantity)>0);const used=hasRemainingStock||db.movements.some(x=>x.materialId===mid)||(db.documents||[]).some(x=>x.materialId===mid)||(db.purchases||[]).some(x=>x.materialId===mid)||db.maintenance.some(x=>x.materialId===mid||(!x.materialId&&x.materialName===itemToDelete?.name));
  if(used){alert("Suppression impossible : ce matériel possède un historique. Conservez sa fiche pour préserver la traçabilité.");return}
  if(confirm("Supprimer ce matériel de l'inventaire ?")){const item=db.materials.find(m=>m.id===mid);logAction("Suppression","Matériel",(item?.ref||"")+" — "+(item?.name||"Matériel"),mid);db.materials=db.materials.filter(m=>m.id!==mid);save();render()}
}if(act==="add-site"){const name=prompt("Nom du chantier :");if(name?.trim()){const site={id:id(),name:name.trim(),manager:prompt("Responsable :")||"",address:prompt("Adresse / zone :")||"",status:"Actif"};db.sites.push(site);logAction("Création","Chantier",site.name+(site.manager?" · Responsable : "+site.manager:""),site.id);save();render()}}if(act==="delete-site"){
  const siteName=db.sites.find(s=>s.id===mid)?.name;
  const used=db.materials.some(m=>m.location===mid||(m.stockBalances||[]).some(b=>b.locationId===mid&&Number(b.quantity)>0))||(db.documents||[]).some(x=>x.site===siteName)||db.movements.some(x=>x.location===siteName);
  if(used){alert("Suppression impossible : ce chantier est référencé dans le stock ou l'historique.");return}
  if(confirm("Supprimer ce chantier ?")){logAction("Suppression","Chantier",siteName||"Chantier",mid);db.sites=db.sites.filter(s=>s.id!==mid);save();render()}
}if(act==="add-movement")addMovement();if(act==="open-voucher")openVoucherForm(b.dataset.type);if(act==="print-voucher"){const d=(db.documents||[]).find(x=>x.id===mid);if(d)printVoucher(d)}if(act==="add-maintenance")openMaintenance();if(act==="edit-maintenance")openMaintenance(db.maintenance.find(x=>x.id===mid));if(act==="delete-maintenance"){if(confirm("Supprimer cette intervention de maintenance ?")){const entry=db.maintenance.find(x=>x.id===mid);logAction("Suppression","Maintenance",(entry?.materialRef||"")+" — "+(entry?.materialName||"")+" · "+(entry?.description||""),mid);db.maintenance=db.maintenance.filter(x=>x.id!==mid);save();render()}}if(act==="print-general-report")printGeneralReport();if(act==="export-csv")exportCsv();if(act==="print-activity")printActivityLog();if(act==="backup")download("ks-btp-sauvegarde.json",JSON.stringify(db,null,2),"application/json");if(act==="save-settings"){db.company=$("#companySetting").value.trim()||"KS BTP";db.currency=$("#currencySetting").value;db.threshold=Number($("#thresholdSetting").value)||0;logAction("Modification","Paramètres","Entreprise : "+db.company+" · Devise : "+db.currency+" · Seuil : "+db.threshold);save();alert("Paramètres enregistrés.");render()}});
$("#movementForm").addEventListener("submit",submitMovement);$("#movementType").addEventListener("change",updateMovementForm);$("#movementMaterial").addEventListener("change",updateMovementForm);$("#movementSite").addEventListener("change",updateMovementForm);$("#closeMovement").onclick=closeMovement;$("#cancelMovement").onclick=closeMovement;$("#voucherForm").addEventListener("submit",submitVoucher);$("#maintenanceForm").addEventListener("submit",submitMaintenance);$("#closeMaintenance").onclick=closeMaintenance;$("#cancelMaintenance").onclick=closeMaintenance;$("#closeVoucher").onclick=closeVoucher;$("#cancelVoucher").onclick=closeVoucher;
$("#itemForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(storageLoadError){alert(storageLoadError);return}
 const form=e.currentTarget;
 if(!form.reportValidity())return;
 const old=db.materials.find(m=>m.id===$("#itemId").value);
 const quantity=Number($("#itemQuantity").value),threshold=Number($("#itemThreshold").value);
 const name=$("#itemName").value.trim(),unit=$("#itemUnit").value.trim();
 if(!name||!unit||!Number.isFinite(quantity)||quantity<0||!Number.isFinite(threshold)||threshold<0){alert("Vérifiez la désignation, l'unité, la quantité et le seuil.");return}
 if(old&&quantity!==Number(old.quantity)){
  alert("Pour modifier une quantité existante, utilisez un mouvement de stock afin de conserver la traçabilité.");
  $("#itemQuantity").value=old.quantity;return;
 }
 const location=$("#itemLocation").value||"central";
 const loc=stockLocation(location);
 const data={
  id:old?.id||id(),ref:old?.ref||nextMaterialRef(),name,
  category:$("#itemCategory").value,type:$("#itemType").value,
  quantity,unit,threshold,location,
  stockBalances:old?.stockBalances||[{locationId:loc.id,locationName:loc.name,quantity}]
 };
 if(old){
  const changes=[];
  for(const key of ["name","category","type","unit","threshold","location"]){
   if(String(old[key]??"")!==String(data[key]??""))changes.push(key+" : "+String(old[key]??"—")+" → "+String(data[key]??"—"));
  }
  Object.assign(old,data);
  logAction("Modification","Matériel",data.ref+" — "+data.name+(changes.length?" · "+changes.join("; "):" · Aucun changement de champ"),old.id);
 }else{
  db.materials.push(data);
  logAction("Création","Matériel",data.ref+" — "+data.name+" · Quantité initiale : "+data.quantity+" "+data.unit,data.id);
 }
 const saved=await save();
 closeItem();
 render();
 if(!saved)alert("Le matériel est visible dans l'inventaire et la copie locale a été conservée, mais la sauvegarde hors ligne secondaire a signalé une erreur. Faites une sauvegarde JSON dès que possible.");
});
$("#closeDialog").onclick=closeItem;$("#cancelDialog").onclick=closeItem;$("#menuToggle").onclick=()=>$("#sidebar").classList.toggle("open");
function validateBackup(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray(value.materials))return false;
  for(const key of ["sites","movements","maintenance","documents","purchases","activityLog"]){
    if(value[key]!==undefined&&!Array.isArray(value[key]))return false;
  }
  if(value.materials.some(m=>!m||typeof m!=="object"||Array.isArray(m)||!m.id||typeof m.name!=="string"||!Number.isFinite(Number(m.quantity))||Number(m.quantity)<0||(m.stockBalances!==undefined&&(!Array.isArray(m.stockBalances)||m.stockBalances.some(b=>!b||typeof b!=="object"||Array.isArray(b))))))return false;
  if((value.sites||[]).some(s=>!s||typeof s!=="object"||Array.isArray(s)||!s.id||typeof s.name!=="string"))return false;
  if((value.movements||[]).some(m=>!m||typeof m!=="object"||Array.isArray(m)||(!m.materialId&&typeof m.materialName!=="string")||!Number.isFinite(Number(m.quantity))||Number(m.quantity)<=0))return false;
  if((value.maintenance||[]).some(m=>!m||typeof m!=="object"||Array.isArray(m)))return false;
  if((value.documents||[]).some(d=>!d||typeof d!=="object"||Array.isArray(d)))return false;
  if((value.purchases||[]).some(p=>!p||typeof p!=="object"||Array.isArray(p)))return false;
  if((value.activityLog||[]).some(x=>!x||typeof x!=="object"||Array.isArray(x)))return false;
  return true;
}
document.addEventListener("change",e=>{if(e.target.id==="restoreFile"&&e.target.files[0]){const reader=new FileReader();reader.onload=async()=>{try{
  const value=JSON.parse(reader.result);
  if(!validateBackup(value))throw Error("Structure de sauvegarde invalide.");
  if(!confirm("Remplacer les données locales par cette sauvegarde ? Une copie de l'état actuel sera d'abord enregistrée."))return;
  const backupReady=await save();
  if(!backupReady){alert("Restauration annulée : la sauvegarde de sécurité de l'état actuel n'a pas pu être vérifiée. Les données actuelles restent en place. Téléchargez d'abord une copie JSON ou réessayez lorsque le stockage local fonctionne.");return}
  const oldLog=Array.isArray(db.activityLog)?db.activityLog:[],importedLog=Array.isArray(value.activityLog)?value.activityLog:[];
  const seen=new Set();
  db={...initial,...value,sites:value.sites||[],movements:value.movements||[],maintenance:value.maintenance||[],documents:value.documents||[],purchases:value.purchases||[],activityLog:[...oldLog,...importedLog].filter(x=>x&&x.id&&!seen.has(x.id)&&seen.add(x.id)).slice(-5000)};
  logAction("Restauration","Sauvegarde","Sauvegarde restaurée; historique précédent fusionné et conservé.");
  const restored=await save();render();
  alert(restored?"Sauvegarde restaurée. L'état précédent reste conservé dans l'historique de sécurité.":"Sauvegarde chargée dans le stockage principal, mais la copie secondaire a signalé une erreur. Téléchargez immédiatement une sauvegarde JSON et vérifiez l'outil de récupération.");
}catch(error){alert("Fichier de sauvegarde invalide ou incomplet. Les données actuelles ont été conservées. Détail : "+(error.message||"erreur inconnue"));}};reader.readAsText(e.target.files[0])}});
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
