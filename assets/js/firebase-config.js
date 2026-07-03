(function () {
  window.process = window.process || { env: {} };

  window.MARTINI_FIREBASE_CONFIG = window.MARTINI_FIREBASE_CONFIG || {
    apiKey: "AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930",
    authDomain: "martini-class-d4d69.firebaseapp.com",
    projectId: "martini-class-d4d69",
    storageBucket: "martini-class-d4d69.firebasestorage.app",
    messagingSenderId: "994424737344",
    appId: "1:994424737344:web:555117a1674e6ba0ae59a5",
    appCheckSiteKey: "6LdzAAQtAAAAACxJHF88SGPwbnHKggKE-4cwIVKg",
    appCheckProvider: "recaptcha-enterprise",
    // 가상 실행 환경/로컬 개발용 App Check 디버그 토큰(선택).
    // 비워두면 로컬 호스트(localhost 등)에서 자동으로 디버그 모드가 켜지고,
    // 브라우저 콘솔에 출력되는 토큰을 Firebase Console > App Check >
    // 앱 > 디버그 토큰 관리에 등록하면 됩니다. 고정 토큰을 쓰려면
    // 여기에 값을 넣거나 localStorage "MARTINI_APPCHECK_DEBUG_TOKEN"에 저장하세요.
    appCheckDebugToken: "",
  };
})();

