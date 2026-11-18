/*
 * KS BTP — Stockage hors connexion protégé.
 * IMPORTANT : utiliser une base dédiée évite de modifier la base IndexedDB
 * historique partagée avec l'ancienne version de production sur la même origine.
 */
(() => {
  "use strict";
  const DB_NAME="ks_btp_safe_store";
  const DB_VERSION=2;
  const STORE="snapshots";
  const HISTORY="history";
  const LEGACY_DB_NAME="ks_btp_demo_offline";
  const LEGACY_KEY="ks_btp_v1";
  const SNAPSHOT_ID="main";
  const HISTORY_LIMIT=10;
  let dbPromise;

  function openDatabase(){
    if(!("indexedDB" in window))return Promise.reject(new Error("IndexedDB n'est pas disponible sur cet appareil."));
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const database=request.result;
        if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:"id"});
        if(!database.objectStoreNames.contains(HISTORY))database.createObjectStore(HISTORY,{keyPath:"id"});
      };
      request.onsuccess=()=>{
        const database=request.result;
        database.onversionchange=()=>database.close();
        resolve(database);
      };
      request.onerror=()=>reject(request.error||new Error("Ouverture IndexedDB impossible."));
      request.onblocked=()=>reject(new Error("La base locale est bloquée par un autre onglet KS BTP."));
    }).catch(error=>{dbPromise=null;throw error;});
    return dbPromise;
  }

  async function readFrom(databaseName){
    return new Promise((resolve,reject)=>{
      // Sans version explicite : lecture seule de la version existante, sans migration.
      const request=indexedDB.open(databaseName);
      request.onsuccess=()=>{
        const database=request.result;
        if(!database.objectStoreNames.contains(STORE)){database.close();resolve(null);return;}
        try{
          const transaction=database.transaction(STORE,"readonly");
          const read=transaction.objectStore(STORE).get(SNAPSHOT_ID);
          read.onsuccess=()=>{const value=read.result?.data??null;database.close();resolve(value);};
          read.onerror=()=>{const error=read.error;database.close();reject(error||new Error("Lecture locale impossible."));};
        }catch(error){database.close();reject(error);}
      };
      request.onerror=()=>reject(request.error||new Error("Lecture de la sauvegarde locale impossible."));
    });
  }

  async function readSnapshot(){
    const current=await readFrom(DB_NAME);
    if(current)return current;
    // Compatibilité : récupérer l'instantané historique sans modifier cette base.
    return readFrom(LEGACY_DB_NAME);
  }

  async function readHistory(){
    const database=await openDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=database.transaction(HISTORY,"readonly");
      const request=transaction.objectStore(HISTORY).getAll();
      request.onsuccess=()=>resolve((request.result||[]).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))));
      request.onerror=()=>reject(request.error||new Error("Lecture de l'historique impossible."));
    });
  }

  async function saveSnapshot(data){
    if(!data||typeof data!=="object"||Array.isArray(data))throw new TypeError("Les données KS BTP doivent être un objet.");
    const database=await openDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=database.transaction([STORE,HISTORY],"readwrite");
      const now=new Date().toISOString();
      const history=transaction.objectStore(HISTORY);
      transaction.objectStore(STORE).put({id:SNAPSHOT_ID,data,updatedAt:now});
      history.put({id:now+"-"+Math.random().toString(36).slice(2),data,createdAt:now});
      const all=history.getAll();
      all.onsuccess=()=>{
        const entries=(all.result||[]).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
        entries.slice(HISTORY_LIMIT).forEach(entry=>history.delete(entry.id));
      };
      transaction.oncomplete=()=>resolve(true);
      transaction.onerror=()=>reject(transaction.error||new Error("Enregistrement local impossible."));
      transaction.onabort=()=>reject(transaction.error||new Error("Sauvegarde annulée ; la précédente copie est conservée."));
    });
  }

  async function copyLegacyData(){
    const raw=localStorage.getItem(LEGACY_KEY);
    if(!raw)throw new Error("Aucune donnée locale KS BTP à copier.");
    let data;
    try{data=JSON.parse(raw);}catch{throw new Error("Les données locales existantes ne sont pas un JSON valide.");}
    if(!data||typeof data!=="object"||Array.isArray(data)||!["materials","sites","movements","maintenance","documents","purchases"].some(k=>Array.isArray(data[k])))throw new Error("Format des données locales KS BTP non reconnu.");
    await saveSnapshot(data);
    return {copied:true,originalPreserved:true,counts:Object.fromEntries(["materials","sites","movements","maintenance","documents","purchases"].map(k=>[k,Array.isArray(data[k])?data[k].length:0]))};
  }

  async function isAvailable(){try{await openDatabase();return true;}catch{return false;}}
  window.KSBtpOfflineStorage=Object.freeze({isAvailable,readSnapshot,readHistory,saveSnapshot,copyLegacyData});
})();
