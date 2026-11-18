const KEY="ks_btp_v1";
const status=document.createElement("div");
status.id="offlineStatus";
status.className="notice";
status.textContent="Vérification et protection du stockage local…";
const main=document.querySelector(".main-content");
const page=document.querySelector(".page-content");
if(main&&page)main.insertBefore(status,page);

function validData(value){
  return !!value&&typeof value==="object"&&!Array.isArray(value)&&
    ["materials","sites","movements","maintenance","documents","purchases"].some(key=>Array.isArray(value[key]));
}
function recordCount(value){
  return ["materials","sites","movements","maintenance","documents","purchases"]
    .reduce((sum,key)=>sum+(Array.isArray(value?.[key])?value[key].length:0),0);
}
let snapshot=null;
let storageReadError=null;
try{snapshot=await window.KSBtpOfflineStorage.readSnapshot();}catch(error){storageReadError=error;}

const localRaw=localStorage.getItem(KEY);
let localData=null;
let localIsValid=false;
let localParseError=null;
if(localRaw){
  try{
    localData=JSON.parse(localRaw);
    if(!validData(localData))throw new Error("Le stockage local ne contient pas une structure KS BTP complète.");
    localIsValid=true;
  }catch(error){localParseError=error;}
}
const snapshotIsValid=validData(snapshot);

if(localIsValid&&snapshotIsValid&&recordCount(snapshot)>recordCount(localData)){
  // Une copie plus riche ne doit jamais être remplacée par un stockage vide/incomplet.
  localStorage.setItem(KEY,JSON.stringify(snapshot));
  status.textContent="Une sauvegarde locale plus complète a été détectée et protégée. Vérifiez vos données avant de poursuivre.";
}else if(localIsValid){
  try{
    await window.KSBtpOfflineStorage.saveSnapshot(localData);
    status.textContent="Stockage local vérifié. Historique de sauvegarde mis à jour.";
  }catch(error){
    status.textContent="Données locales accessibles, mais la sauvegarde de sécurité est indisponible : "+error.message;
  }
}else if(snapshotIsValid){
  localStorage.setItem(KEY,JSON.stringify(snapshot));
  status.textContent="Données récupérées depuis la sauvegarde locale IndexedDB.";
}else if(storageReadError){
  status.textContent="Stockage local inaccessible. Aucune nouvelle base n'a été créée afin de protéger les données existantes. "+storageReadError.message;
  throw storageReadError;
}else if(localRaw){
  status.textContent="Données locales à récupérer : le format existant est illisible ou incomplet. Aucune donnée n'a été remplacée. Utilisez l'outil de récupération ou une sauvegarde JSON.";
  throw localParseError||new Error("Structure locale incomplète.");
}else{
  const initialData={company:"KS BTP",currency:"GNF",threshold:2,materials:[],sites:[],movements:[],maintenance:[],documents:[]};
  localStorage.setItem(KEY,JSON.stringify(initialData));
  try{
    await window.KSBtpOfflineStorage.saveSnapshot(initialData);
    status.textContent="Nouveau stockage local prêt. Historique de sécurité activé.";
  }catch(error){
    status.textContent="Stockage local créé, mais sauvegarde de sécurité indisponible : "+error.message;
  }
}
await import("./app.js");
window.addEventListener("ks-offline-save-error",event=>{status.textContent="Erreur de sauvegarde locale : "+event.detail;});
window.addEventListener("ks-offline-saved",()=>{status.textContent="Sauvegarde locale effectuée avec historique de sécurité.";});
