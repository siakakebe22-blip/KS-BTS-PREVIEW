const KEY="ks_btp_v1";
const status=document.createElement("div");
status.id="offlineStatus";
status.className="notice";
status.textContent="Préparation du stockage local…";
const main=document.querySelector(".main-content");
const page=document.querySelector(".page-content");
if(main&&page)main.insertBefore(status,page);

try{
  const snapshot=await window.KSBtpOfflineStorage.readSnapshot();
  const localRaw=localStorage.getItem(KEY);

  // localStorage reste la source prioritaire lorsqu'il contient déjà des données :
  // cela évite qu'un ancien snapshot IndexedDB remplace des changements récents.
  if(localRaw){
    try{
      const localData=JSON.parse(localRaw);
      if(!localData||typeof localData!=="object"||Array.isArray(localData)){
        throw new Error("Format local KS BTP non reconnu.");
      }
      await window.KSBtpOfflineStorage.saveSnapshot(localData);
    }catch(localError){
      if(snapshot&&typeof snapshot==="object"){
        localStorage.setItem(KEY,JSON.stringify(snapshot));
      }else{
        throw localError;
      }
    }
  }else if(snapshot&&typeof snapshot==="object"){
    localStorage.setItem(KEY,JSON.stringify(snapshot));
  }else{
    const initialData={
      company:"KS BTP",currency:"GNF",threshold:2,
      materials:[],sites:[],movements:[],maintenance:[],documents:[]
    };
    localStorage.setItem(KEY,JSON.stringify(initialData));
    await window.KSBtpOfflineStorage.saveSnapshot(initialData);
  }
  status.textContent="Stockage hors connexion prêt. Les modifications seront sauvegardées automatiquement sur cet appareil.";
}catch(error){
  status.textContent="Attention : sauvegarde locale à vérifier. "+error.message;
}

await import("./app.js");

window.addEventListener("ks-offline-save-error",event=>{
  status.textContent="Erreur de sauvegarde locale : "+event.detail;
});
window.addEventListener("ks-offline-saved",()=>{
  status.textContent="Sauvegarde locale effectuée.";
});
