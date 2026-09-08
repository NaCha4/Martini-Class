import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
export const local = import.meta.env.DEV;
const app = initializeApp({
  apiKey: 'AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930',
  authDomain: 'martini-class-d4d69.firebaseapp.com',
  projectId: local ? 'demo-martini' : 'martini-class-d4d69',
  storageBucket: 'martini-class-d4d69.firebasestorage.app',
  messagingSenderId: '994424737344',
  appId: '1:994424737344:web:555117a1674e6ba0ae59a5'
});
if (!local && import.meta.env.VITE_APPCHECK_ENABLED !== 'false') {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider('6LdzAAQtAAAAACxJHF88SGPwbnHKggKE-4cwIVKg'), isTokenAutoRefreshEnabled: true });
}
export const auth = getAuth(app);
auth.languageCode='ko';
const functions = getFunctions(app, 'asia-northeast3');
if (local) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
const invoke = httpsCallable(functions, 'martiniApi', { timeout: 60000 });
export async function api(op, data = {}) {
  try { return (await invoke({ op, ...data })).data; }
  catch (error) {
    if (error.code === 'functions/unavailable' || error.code === 'functions/internal') throw new Error(local ? '로컬 데이터 서버에 연결하지 못했습니다. 에뮬레이터 실행 상태를 확인해 주세요.' : '잠시 연결이 원활하지 않습니다. 다시 시도해 주세요.');
    if (error.code?.startsWith('auth/')) throw new Error('이메일과 비밀번호를 확인해 주세요.');
    throw error;
  }
}
export { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail };
