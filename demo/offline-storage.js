/*
 * KS BTP — Couche de stockage hors connexion
 *
 * Ce module fournit une copie de sauvegarde IndexedDB pour l'application de démonstration.
 * La copie locale principale reste dans localStorage ; aucune donnée n'est supprimée ici.
 */
(() => {
  "use strict";

  const DB_NAME = "ks_btp_demo_offline";
  const DB_VERSION = 1;
  const STORE = "snapshots";
  const LEGACY_KEY = "ks_btp_v1";
  const SNAPSHOT_ID = "main";
  let dbPromise;

  function openDatabase() {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("IndexedDB n'est pas disponible sur cet appareil."));
    }
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible."));
      request.onblocked = () => reject(new Error("La base locale est bloquée par un autre onglet KS BTP."));
    }).catch(error => {
      dbPromise = null;
      throw error;
    });

    return dbPromise;
  }

  async function readSnapshot() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(SNAPSHOT_ID);
      request.onsuccess = () => resolve(request.result?.data ?? null);
      request.onerror = () => reject(request.error || new Error("Lecture locale impossible."));
    });
  }

  async function saveSnapshot(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TypeError("Les données KS BTP doivent être un objet.");
    }
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({
        id: SNAPSHOT_ID,
        data,
        updatedAt: new Date().toISOString()
      });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Enregistrement local impossible."));
      transaction.onabort = () => reject(transaction.error || new Error("Enregistrement local annulé."));
    });
  }

  // Copie l'ancien stockage vers IndexedDB sans supprimer ni modifier l'original.
  async function copyLegacyData() {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) throw new Error("Aucune donnée locale KS BTP à copier.");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("Les données locales existantes ne sont pas un JSON valide.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Format des données locales KS BTP non reconnu.");
    }
    await saveSnapshot(data);
    return {
      copied: true,
      originalPreserved: true,
      counts: {
        materials: Array.isArray(data.materials) ? data.materials.length : 0,
        sites: Array.isArray(data.sites) ? data.sites.length : 0,
        movements: Array.isArray(data.movements) ? data.movements.length : 0,
        documents: Array.isArray(data.documents) ? data.documents.length : 0
      }
    };
  }

  async function isAvailable() {
    try {
      await openDatabase();
      return true;
    } catch {
      return false;
    }
  }

  window.KSBtpOfflineStorage = Object.freeze({
    isAvailable,
    readSnapshot,
    saveSnapshot,
    copyLegacyData
  });
})();
