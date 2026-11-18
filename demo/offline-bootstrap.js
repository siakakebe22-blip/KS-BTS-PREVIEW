const KEY="ks_btp_v1";
const status=document.createElement("div");
status.id="offlineStatus";
status.className="notice";
status.textContent="Préparation du stockage local…";
const main=document.querySelector(".main-content");
const page=document.querySelector(".page-content");
if(main&&page)main.insertBefore(status,page);

let snapshot=null;
let storageReadError=null;
try{
  snapshot=await window.KSBtpOfflineStorage.readSnapshot();
}catch(error){
  storageReadError=error;
}

const localRaw=localStorage.getItem(KEY);
let localData=null;
let localIsValid=false;
let localParseError=null;

if(localRaw){
  try{
    localData=JSON.parse(localRaw);
    if(!localData||typeof localData!=="object"||Array.isArray(localData)){
      throw new Error("Format local KS BTP non reconnu.");
    }
    localIsValid=true;
  }catch(error){
    localParseError=error;
  }
}

if(localIsValid){
  // La copie locale valide est prioritaire. Une panne IndexedDB ne doit jamais
  // déclencher le remplacement de cette copie par un ancien instantané.
  try{
    await window.KSBtpOfflineStorage.saveSnapshot(localData);
    status.textContent="Stockage hors connexion prêt. Les modifications seront sauvegardées automatiquement sur cet appareil.";
  }catch(error){
    status.textContent="Données locales accessibles. Copie de sécurité IndexedDB indisponible : "+error.message;
  }
}else if(snapshot&&typeof snapshot==="object"&&!Array.isArray(snapshot)){
  // Restauration uniquement si la copie locale est absente ou illisible.
  localStorage.setItem(KEY,JSON.stringify(snapshot));
  status.textContent="Données récupérées depuis la sauvegarde locale IndexedDB.";
}else if(storageReadError){
  // Sans copie localStorage ni lecture IndexedDB fiable, ne pas créer une base vide.
  status.textContent="Stockage local inaccessible. Aucune nouvelle base n'a été créée afin de protéger les données existantes. "+storageReadError.message;
  throw storageReadError;
}else if(localRaw&&localParseError){
  // Ne pas démarrer avec une base vide qui pourrait écraser la copie illisible.
  status.textContent="Données locales à récupérer : le format existant est illisible. Aucune donnée n'a été remplacée. Exportez ou restaurez une sauvegarde avant de continuer.";
  throw localParseError;
}else{
  const initialData={
    company:"KS BTP",currency:"GNF",threshold:2,
    materials:[],sites:[],movements:[],maintenance:[],documents:[]
  };
  localStorage.setItem(KEY,JSON.stringify(initialData));
  try{
    await window.KSBtpOfflineStorage.saveSnapshot(initialData);
    status.textContent="Nouveau stockage local prêt.";
  }catch(error){
    status.textContent="Stockage local accessible, mais copie IndexedDB indisponible : "+error.message;
  }
}


await import("./app.js");

window.addEventListener("ks-offline-save-error",event=>{
  status.textContent="Erreur de sauvegarde locale : "+event.detail;
});
window.addEventListener("ks-offline-saved",()=>{
  status.textContent="Sauvegarde locale effectuée.";
});
