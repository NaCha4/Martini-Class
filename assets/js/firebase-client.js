import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  ReCaptchaV3Provider,
  getToken,
  initializeAppCheck,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { Timestamp, doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const ADMIN_EMAIL = "admin@martini.com";
const MEMBER_ACCESS_CODE_COLLECTION = "memberAccessCodes";
const MEMBER_ACCESS_SESSION_COLLECTION = "memberAccessSessions";

let servicesPromise;
let appCheckInstance;


async function loadFirebaseConfig() {
  const explicitConfig = window.MARTINI_FIREBASE_CONFIG;

  if (explicitConfig?.apiKey && explicitConfig?.appId) {
    return explicitConfig;
  }

  try {
    const response = await fetch("/__/firebase/init.json", { cache: "no-store" });

    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    // Firebase Hosting auto config is optional; non-Firebase hosting uses firebase-config.js.
  }

  throw new Error("Firebase Web config가 필요합니다. assets/js/firebase-config.js의 apiKey, appId 값을 채워주세요.");
}

export function isAllowedAdminUser(user) {
  return user?.email?.toLowerCase() === ADMIN_EMAIL;
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/operation-not-allowed":
      return "Firebase Authentication에서 이메일/비밀번호 로그인을 활성화해야 합니다.";
    case "auth/too-many-requests":
      return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
    default:
      return error?.message || "로그인에 실패했습니다.";
  }
}

export async function hashAccessCode(value) {
  const encoded = new TextEncoder().encode(String(value || "").trim());
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getFirebaseServices() {
  if (!servicesPromise) {
    servicesPromise = loadFirebaseConfig().then((config) => {
      const app = getApps().length ? getApp() : initializeApp(config);
      const appCheckSiteKey = config.appCheckSiteKey || window.MARTINI_APPCHECK_SITE_KEY;

      if (appCheckSiteKey && !appCheckInstance) {

        appCheckInstance = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      }

      return {
        app,
        appCheck: appCheckInstance,
        auth: getAuth(app),
        db: getFirestore(app),
        storage: getStorage(app),
      };
    });
  }

  return servicesPromise;
}

export async function signInAdmin(email, password) {
  const { appCheck, auth } = await getFirebaseServices();

  if (appCheck) {
    await getToken(appCheck);
  }

  let credential;

  try {
    credential = await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(getAuthErrorMessage(error));
  }

  if (!isAllowedAdminUser(credential.user)) {
    await signOut(auth);
    throw new Error("관리자 계정만 접근할 수 있습니다.");
  }

  return credential.user;
}

export async function signInMemberWithCode(accessCode) {
  const normalizedCode = String(accessCode || "").trim();

  if (!normalizedCode) {
    throw new Error("입장 코드를 입력해주세요.");
  }

  const { appCheck, auth, db } = await getFirebaseServices();

  if (appCheck) {
    await getToken(appCheck);
  }

  const codeHash = await hashAccessCode(normalizedCode);
  const codeSnapshot = await getDoc(doc(db, MEMBER_ACCESS_CODE_COLLECTION, codeHash));

  if (!codeSnapshot.exists() || codeSnapshot.data()?.enabled !== true) {
    throw new Error("입장 코드가 올바르지 않습니다.");
  }

  let credential;

  try {
    credential = await signInAnonymously(auth);
  } catch (error) {
    throw new Error("부원 로그인을 위해 Firebase Authentication의 익명 로그인을 활성화해주세요.");
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await setDoc(doc(db, MEMBER_ACCESS_SESSION_COLLECTION, credential.user.uid), {
    codeHash,
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return credential.user;
}
