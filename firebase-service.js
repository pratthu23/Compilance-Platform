import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const settings = window.REGINTEL_FIREBASE || {};
const isConfigured =
  settings.useFirebase &&
  settings.config &&
  settings.config.apiKey &&
  !settings.config.apiKey.startsWith("PASTE_");

const service = {
  enabled: false,
  status: isConfigured ? "Firebase enabled" : "Firebase not configured",
  async saveAuditEvent() {
    return null;
  },
  async saveAnalysis() {
    return null;
  },
  async saveEvidenceReview() {
    return null;
  },
  async saveTrainingRun() {
    return null;
  },
  async syncSnapshot() {
    return null;
  },
  async signIn() {
    throw new Error("Firebase Auth is not configured.");
  },
  async register() {
    throw new Error("Firebase Auth is not configured.");
  },
  async saveSmsNotification() {
    return null;
  },
  async signOut() {
    return null;
  },
  onAuthChange() {
    return () => {};
  }
};

if (isConfigured) {
  try {
    const app = initializeApp(settings.config);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const prefix = settings.collectionPrefix || "regintel_demo";

    async function add(collectionName, payload) {
      const docRef = await addDoc(collection(db, `${prefix}_${collectionName}`), {
        ...payload,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    }

    service.enabled = true;
    service.status = `Connected to Firebase project ${settings.config.projectId}`;
    service.saveAuditEvent = (event) => add("audit_events", event);
    service.saveAnalysis = (payload) => add("analysis_runs", payload);
    service.saveEvidenceReview = (payload) => add("evidence_reviews", payload);
    service.saveTrainingRun = (payload) => add("training_runs", payload);
    service.syncSnapshot = (payload) => add("snapshots", payload);
    service.saveSmsNotification = (payload) => add("sms_notifications", payload);
    service.signIn = async (email, password) => {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const profileRef = doc(db, `${prefix}_user_profiles`, credential.user.uid);
      const profileSnap = await getDoc(profileRef);
      const profile = profileSnap.exists()
        ? profileSnap.data()
        : { name: credential.user.email, role: "Department User", department: "Compliance" };
      return {
        uid: credential.user.uid,
        username: credential.user.email,
        name: profile.name || credential.user.email,
        role: profile.role || "Department User",
        department: profile.department || "Compliance",
        authProvider: "Firebase"
      };
    };
    service.register = async ({ email, password, name, role, department, phone }) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const profile = {
        uid: credential.user.uid,
        email,
        name: name || email,
        role: role || "Department User",
        department: department || "Compliance",
        phone: phone || "",
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, `${prefix}_user_profiles`, credential.user.uid), profile);
      return {
        uid: credential.user.uid,
        username: email,
        name: profile.name,
        role: profile.role,
        department: profile.department,
        authProvider: "Firebase"
      };
    };
    service.signOut = () => signOut(auth);
    service.onAuthChange = (callback) =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          callback(null);
          return;
        }
        const profileSnap = await getDoc(doc(db, `${prefix}_user_profiles`, user.uid));
        const profile = profileSnap.exists() ? profileSnap.data() : {};
        callback({
          uid: user.uid,
          username: user.email,
          name: profile.name || user.email,
          role: profile.role || "Department User",
          department: profile.department || "Compliance",
          authProvider: "Firebase"
        });
      });
  } catch (error) {
    service.enabled = false;
    service.status = `Firebase initialization failed: ${error.message}`;
  }
}

window.firebaseBackend = service;
window.dispatchEvent(new CustomEvent("firebase-backend-ready", { detail: service }));
