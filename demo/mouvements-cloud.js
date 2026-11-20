import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
const SUPABASE_URL="https://fbqtbaeanxromfksfllr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_mrjyeLhdCSiUeSXZzqpAZw_x02KJfEG";
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let companyId=params.get("company_id"),allMovements=[];
const isUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||"");
const safe=value=>String(value??"");
function fmtDate(value){if(!value)return "—";const date=new Date(value);return Number.isNaN(date.getTime())?"—":date.toLocaleString("fr-FR");}
function render(){
 const q=$("search").value.trim().toLocaleLowerCase("fr"),type=$("typeFilter").value;
 const rows=allMovements.filter(m=>(!type||safe(m.movement_type)===type)&&[m.reference,m.notes,m.movement_type].some(v=>safe(v).toLocaleLowerCase("fr").includes(q)));
 const body=$("movementRows");body.replaceChildren();
 if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent="Aucun mouvement ne correspond à votre recherche.";tr.append(td);body.append(tr);}
 rows.forEach(m=>{
  const tr=document.createElement("tr");
  [fmtDate(m.created_at),safe(m.movement_type)||"—",safe(m.reference)||"—",Number(m.quantity).toLocaleString("fr-FR"),safe(m.notes)||"—"].forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});
  body.append(tr);
 });
 $("resultInfo").textContent=rows.length+" mouvement(s) affiché(s) sur "+allMovements.length+" chargé(s).";
}
async function load(){
 const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
 if(sessionError)throw sessionError;
 if(!sessionData.session?.user){location.replace("connexion.html");return;}
 if(!isUuid(companyId)){
  const {data,error}=await supabase.from("companies").select("id,name,slug").order("created_at",{ascending:true}).limit(2);
  if(error)throw error;
  if(data?.length!==1)throw new Error(data?.length>1?"Plusieurs entreprises sont accessibles. Revenez au tableau de bord pour choisir l'entreprise.":"Aucune entreprise accessible pour ce compte.");
  companyId=data[0].id;
 }
 const {data:company,error:companyError}=await supabase.from("companies").select("id,name").eq("id",companyId).maybeSingle();
 if(companyError)throw companyError;
 if(!company)throw new Error("Entreprise introuvable ou accès non autorisé.");
 $("companyName").textContent="Entreprise : "+company.name;
 const back=new URL("dashboard-cloud.html",location.href);back.searchParams.set("company_id",companyId);$("backLink").href=back.toString();
 const {data,error}=await supabase.from("stock_movements").select("id,movement_type,quantity,reference,notes,created_at").eq("company_id",companyId).order("created_at",{ascending:false}).limit(100);
 if(error)throw error;
 allMovements=data||[];
 const types=[...new Set(allMovements.map(m=>safe(m.movement_type)).filter(Boolean))].sort();
 types.forEach(value=>$("typeFilter").add(new Option(value,value)));
 $("totalCount").textContent=allMovements.length.toLocaleString("fr-FR");
 $("inCount").textContent=allMovements.filter(m=>/entrée|reception|réception|achat/i.test(safe(m.movement_type))).length.toLocaleString("fr-FR");
 $("outCount").textContent=allMovements.filter(m=>/sortie|consommation/i.test(safe(m.movement_type))).length.toLocaleString("fr-FR");
 $("search").addEventListener("input",render);$("typeFilter").addEventListener("change",render);render();
}
load().catch(error=>{$("movementRows").innerHTML="";const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent=error.message||"Impossible de charger les mouvements.";tr.append(td);$("movementRows").append(tr);$("resultInfo").textContent="Chargement interrompu.";console.error("KS BTP mouvements read-only:",error);});
supabase.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"||!session)location.replace("connexion.html");});
