import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  getToken,
  initializeAppCheck,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { Timestamp, doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const ADMIN_EMAIL = "admin@martini.com";
const MEMBER_ACCESS_CODE_COLLECTION = "memberAccessCodes";
const MEMBER_ACCESS_SESSION_COLLECTION = "memberAccessSessions";
const FIREBASE_CONFIG_REQUIRED_MESSAGE = "Firebase Web config is required. Fill apiKey and appId in assets/js/firebase-config.js.";
const INVALID_CREDENTIAL_MESSAGE = "\uC774\uBA54\uC77C \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
const EMAIL_AUTH_DISABLED_MESSAGE = "Firebase Authentication\uC5D0\uC11C \uC774\uBA54\uC77C/\uBE44\uBC00\uBC88\uD638 \uB85C\uADF8\uC778\uC744 \uD65C\uC131\uD654\uD574\uC57C \uD569\uB2C8\uB2E4.";
const TOO_MANY_REQUESTS_MESSAGE = "\uB85C\uADF8\uC778 \uC2DC\uB3C4\uAC00 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";
const LOGIN_FAILED_MESSAGE = "\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
const ADMIN_ONLY_MESSAGE = "\uAD00\uB9AC\uC790 \uACC4\uC815\uB9CC \uC811\uADFC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
const ACCESS_CODE_REQUIRED_MESSAGE = "\uC785\uC7A5 \uCF54\uB4DC\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.";
const INVALID_ACCESS_CODE_MESSAGE = "\uC785\uC7A5 \uCF54\uB4DC\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
const ANONYMOUS_AUTH_DISABLED_MESSAGE = "\uBD80\uC6D0 \uB85C\uADF8\uC778\uC744 \uC704\uD574 Firebase Authentication\uC758 \uC775\uBA85 \uB85C\uADF8\uC778\uC744 \uD65C\uC131\uD654\uD574\uC8FC\uC138\uC694.";
const APPCHECK_SETUP_MESSAGE = "App Check \uD1A0\uD070\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. Firebase Console\uC758 App Check \uC81C\uACF5\uC790, reCAPTCHA \uC0AC\uC774\uD2B8 \uD0A4, \uD5C8\uC6A9 \uB3C4\uBA54\uC778\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.";

const APPCHECK_DEBUG_TOKEN_STORAGE_KEY = "MARTINI_APPCHECK_DEBUG_TOKEN";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

let servicesPromise;
let appCheckInstance;
let adminAuthObserverStarted = false;
let adminAuthState = null;
let adminAuthRevision = 0;
const adminAuthSubscribers = new Set();

function isLocalEnvironment() {
  const { hostname, protocol } = window.location;

  return protocol === "file:"
    || LOCAL_HOSTNAMES.has(hostname)
    || hostname.endsWith(".local");
}

function readStoredAppCheckDebugToken() {
  try {
    return window.localStorage?.getItem(APPCHECK_DEBUG_TOKEN_STORAGE_KEY) || "";
  } catch {
    // Storage access can fail in privacy modes or sandboxed frames.
    return "";
  }
}

// Resolves the App Check debug token for non-production environments
// (local servers, VMs, sandboxes) where reCAPTCHA attestation cannot pass.
// Priority: explicit token (config / window / localStorage) > auto debug
// mode (`true`) on local hosts > disabled ("") on real domains.
// The token printed to the browser console must be registered once in
// Firebase Console > App Check > 앱 > 디버그 토큰 관리.
function resolveAppCheckDebugToken(config) {
  const explicitToken = config.appCheckDebugToken
    || window.MARTINI_APPCHECK_DEBUG_TOKEN
    || readStoredAppCheckDebugToken();

  if (explicitToken) {
    return explicitToken;
  }

  return isLocalEnvironment() ? true : "";
}

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

  throw new Error(FIREBASE_CONFIG_REQUIRED_MESSAGE);
}

export function isAllowedAdminUser(user) {
  return user?.email?.toLowerCase() === ADMIN_EMAIL;
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return INVALID_CREDENTIAL_MESSAGE;
    case "auth/operation-not-allowed":
      return EMAIL_AUTH_DISABLED_MESSAGE;
    case "auth/too-many-requests":
      return TOO_MANY_REQUESTS_MESSAGE;
    default:
      return error?.message || LOGIN_FAILED_MESSAGE;
  }
}

function getAppCheckErrorMessage(error) {
  switch (error?.code) {
    case "appCheck/throttled":
    case "appCheck/recaptcha-error":
    case "appCheck/fetch-status-error":
    case "auth/firebase-app-check-token-is-invalid":
      return APPCHECK_SETUP_MESSAGE;
    default:
      return error?.message || APPCHECK_SETUP_MESSAGE;
  }
}

function createAppCheckProvider(siteKey, providerType) {
  if (providerType === "recaptcha-v3") {
    return new ReCaptchaV3Provider(siteKey);
  }

  return new ReCaptchaEnterpriseProvider(siteKey);
}

async function verifyAppCheck(appCheck) {
  if (!appCheck) {
    return;
  }

  try {
    await getToken(appCheck);
  } catch (error) {
    throw new Error(getAppCheckErrorMessage(error));
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
    const initialization = loadFirebaseConfig().then((config) => {
      const app = getApps().length ? getApp() : initializeApp(config);
      const appCheckSiteKey = config.appCheckSiteKey || window.MARTINI_APPCHECK_SITE_KEY;
      const appCheckProviderType = config.appCheckProvider || window.MARTINI_APPCHECK_PROVIDER || "recaptcha-enterprise";

      if (appCheckSiteKey && !appCheckInstance) {
        const debugToken = resolveAppCheckDebugToken(config);

        if (debugToken) {
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
          console.info(
            "[Martini] App Check debug mode. 콘솔에 출력되는 디버그 토큰을 "
            + "Firebase Console > App Check > 앱 > 디버그 토큰 관리에 등록해야 요청이 허용됩니다.",
          );
        }

        appCheckInstance = initializeAppCheck(app, {
          provider: createAppCheckProvider(appCheckSiteKey, appCheckProviderType),
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

    servicesPromise = initialization.catch((error) => {
      servicesPromise = undefined;
      throw error;
    });
  }

  return servicesPromise;
}

function settleInitialAdminAuth(subscriber, method, value) {
  if (subscriber.isInitialSettled) {
    return;
  }

  subscriber.isInitialSettled = true;
  subscriber[method](value);
}

function runAdminAuthCallback(subscriber, state) {
  return isAllowedAdminUser(state.user)
    ? subscriber.onAdmin?.(state.user, state.services)
    : subscriber.onDenied?.(state.user);
}

function restoreLatestAdminAuthState(subscriber, staleRevision) {
  if (!adminAuthState || subscriber.lastRevision === staleRevision) {
    return;
  }

  Promise.resolve().then(() => runAdminAuthCallback(subscriber, adminAuthState)).catch((error) => {
    console.error("[Martini] Admin auth state restoration failed.", error);
  });
}

function enqueueAdminAuthCallback(subscriber, state) {
  if (subscriber.lastRevision === state.revision) {
    return;
  }

  subscriber.lastRevision = state.revision;
  const isDeniedState = !isAllowedAdminUser(state.user);
  const task = (isDeniedState ? Promise.resolve() : subscriber.queue)
    .catch(() => undefined)
    .then(() => runAdminAuthCallback(subscriber, state));

  subscriber.queue = task;
  task.then(
    () => {
      if (subscriber.lastRevision !== state.revision) {
        restoreLatestAdminAuthState(subscriber, state.revision);
        return;
      }

      settleInitialAdminAuth(subscriber, "resolveInitial", state.services);
    },
    (error) => {
      if (subscriber.lastRevision !== state.revision) {
        restoreLatestAdminAuthState(subscriber, state.revision);
        return;
      }

      if (!subscriber.isInitialSettled) {
        settleInitialAdminAuth(subscriber, "rejectInitial", error);
        return;
      }

      console.error("[Martini] Admin auth state handler failed.", error);
    },
  );
}

function startAdminAuthObserver(services) {
  if (adminAuthObserverStarted) {
    return;
  }

  adminAuthObserverStarted = true;
  onAuthStateChanged(services.auth, (user) => {
    adminAuthState = {
      revision: ++adminAuthRevision,
      services,
      user,
    };

    adminAuthSubscribers.forEach((subscriber) => {
      enqueueAdminAuthCallback(subscriber, adminAuthState);
    });
  }, (error) => {
    adminAuthSubscribers.forEach((subscriber) => {
      if (!subscriber.isInitialSettled) {
        settleInitialAdminAuth(subscriber, "rejectInitial", error);
      } else {
        console.error("[Martini] Admin auth observer failed.", error);
      }
    });
  });
}

/**
 * Subscribes to the shared admin auth observer and routes each state change to
 * `onAdmin(user, services)` or `onDenied(user)`. The returned promise waits for
 * this subscriber's first callback, so initialization errors remain catchable.
 */
export async function watchAdminAuth({ onAdmin, onDenied }) {
  const services = await getFirebaseServices();
  let resolveInitial;
  let rejectInitial;
  const initialStateHandled = new Promise((resolve, reject) => {
    resolveInitial = resolve;
    rejectInitial = reject;
  });
  const subscriber = {
    isInitialSettled: false,
    lastRevision: 0,
    onAdmin,
    onDenied,
    queue: Promise.resolve(),
    rejectInitial,
    resolveInitial,
  };

  adminAuthSubscribers.add(subscriber);
  startAdminAuthObserver(services);

  if (adminAuthState) {
    enqueueAdminAuthCallback(subscriber, adminAuthState);
  }

  return initialStateHandled;
}

export async function signInAdmin(email, password) {
  const { appCheck, auth } = await getFirebaseServices();

  await verifyAppCheck(appCheck);

  let credential;

  try {
    credential = await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(getAuthErrorMessage(error));
  }

  if (!isAllowedAdminUser(credential.user)) {
    await signOut(auth);
    throw new Error(ADMIN_ONLY_MESSAGE);
  }

  return credential.user;
}

export async function signInMemberWithCode(accessCode) {
  const normalizedCode = String(accessCode || "").trim();

  if (!normalizedCode) {
    throw new Error(ACCESS_CODE_REQUIRED_MESSAGE);
  }

  const { appCheck, auth, db } = await getFirebaseServices();

  await verifyAppCheck(appCheck);

  const codeHash = await hashAccessCode(normalizedCode);
  const codeSnapshot = await getDoc(doc(db, MEMBER_ACCESS_CODE_COLLECTION, codeHash));

  if (!codeSnapshot.exists() || codeSnapshot.data()?.enabled !== true) {
    throw new Error(INVALID_ACCESS_CODE_MESSAGE);
  }

  if (auth.currentUser) {
    await signOut(auth);
  }

  let credential;

  try {
    credential = await signInAnonymously(auth);
  } catch (error) {
    throw new Error(ANONYMOUS_AUTH_DISABLED_MESSAGE);
  }

  try {
    await setDoc(doc(db, MEMBER_ACCESS_SESSION_COLLECTION, credential.user.uid), {
      codeHash,
      // Kept for compatibility with the previously deployed rules. The current
      // rules calculate expiry from the server-owned createdAt timestamp.
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await signOut(auth).catch(() => undefined);
    throw error;
  }

  return credential.user;
}
