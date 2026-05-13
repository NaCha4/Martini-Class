(function () {
  const ADMIN_SESSION_KEY = "martini_admin_authenticated";
  const ADMIN_PROFILE_KEY = "martini_admin_profile";

  const firebaseConfig = {
    apiKey: "AIzaSyBS0s30cL-sCo35nN0VjJvDaFyH_yPe930",
    authDomain: "martini-class-d4d69.firebaseapp.com",
    projectId: "martini-class-d4d69",
    storageBucket: "martini-class-d4d69.firebasestorage.app",
    messagingSenderId: "994424737344",
    appId: "1:994424737344:web:555117a1674e6ba0ae59a5",
  };

  if (!window.firebase) {
    console.error("Firebase SDK가 로드되지 않았습니다.");
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore ? firebase.firestore() : null;
  auth.languageCode = "ko";

  function saveAdminSession(isAdmin, user) {
    try {
      window.localStorage.setItem(ADMIN_SESSION_KEY, String(Boolean(isAdmin)));

      if (isAdmin && user) {
        window.localStorage.setItem(
          ADMIN_PROFILE_KEY,
          JSON.stringify({
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email,
          }),
        );
      } else {
        window.localStorage.removeItem(ADMIN_PROFILE_KEY);
      }
    } catch {
      return;
    }
  }

  function readAdminSession() {
    try {
      return window.localStorage.getItem(ADMIN_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  }

  async function isExecutive(user) {
    return Boolean(user);
  }

  async function signInWithEmail(email, password) {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    const isAdmin = await isExecutive(credential.user);

    saveAdminSession(isAdmin, credential.user);

    return {
      isAdmin,
      user: credential.user,
    };
  }

  async function signOutUser() {
    saveAdminSession(false);
    await auth.signOut();
  }

  function subscribeAuth(callback) {
    return auth.onAuthStateChanged(async (user) => {
      let isAdmin = false;

      if (user) {
        isAdmin = await isExecutive(user);
      }

      saveAdminSession(isAdmin, user);
      callback({ user, isAdmin });
    });
  }

  function getVoteConfigRef() {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("settings").doc("voteConfig");
  }

  async function getVoteConfig() {
    const snapshot = await getVoteConfigRef().get();

    if (!snapshot.exists) return null;

    return snapshot.data();
  }

  async function saveVoteConfig(config) {
    await getVoteConfigRef().set(
      {
        ...config,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function resetClassVotes(dayKeys = []) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const snapshot = await db.collection("classVotes").get();
    const writeBatches = [];
    let batch = db.batch();
    let operationCount = 0;

    snapshot.docs.forEach((documentSnapshot) => {
      batch.delete(documentSnapshot.ref);
      operationCount += 1;

      if (operationCount === 450) {
        writeBatches.push(batch);
        batch = db.batch();
        operationCount = 0;
      }
    });

    dayKeys.forEach((dayKey) => {
      batch.set(db.collection("classVoteState").doc(dayKey), { count: 0 }, { merge: true });
    });

    writeBatches.push(batch);

    await Promise.all(writeBatches.map((writeBatch) => writeBatch.commit()));
  }

  function subscribeClassVotes(callback) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("classVotes").onSnapshot((snapshot) => {
      const votes = snapshot.docs
        .map((documentSnapshot) => documentSnapshot.data())
        .sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() || 0;
          const bTime = b.updatedAt?.toMillis?.() || 0;

          return aTime - bTime;
        });

      callback(votes);
    });
  }

  async function deleteClassVote(studentId) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const voteRef = db.collection("classVotes").doc(studentId);

    await db.runTransaction(async (transaction) => {
      const voteSnapshot = await transaction.get(voteRef);

      if (!voteSnapshot.exists) return;

      const vote = voteSnapshot.data();
      const stateRef = db.collection("classVoteState").doc(vote.day);
      const stateSnapshot = await transaction.get(stateRef);
      const count = Number(stateSnapshot.data()?.count || 0);

      transaction.delete(voteRef);
      transaction.set(stateRef, { count: Math.max(count - 1, 0) }, { merge: true });
    });
  }

  async function moveClassVote(studentId, targetDay, targetDayLabel) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const voteRef = db.collection("classVotes").doc(studentId);

    await db.runTransaction(async (transaction) => {
      const voteSnapshot = await transaction.get(voteRef);

      if (!voteSnapshot.exists) {
        throw new Error("신청 데이터를 찾을 수 없습니다.");
      }

      const vote = voteSnapshot.data();

      if (vote.day === targetDay) return;

      const oldStateRef = db.collection("classVoteState").doc(vote.day);
      const targetStateRef = db.collection("classVoteState").doc(targetDay);
      const oldStateSnapshot = await transaction.get(oldStateRef);
      const targetStateSnapshot = await transaction.get(targetStateRef);
      const oldCount = Number(oldStateSnapshot.data()?.count || 0);
      const targetCount = Number(targetStateSnapshot.data()?.count || 0);

      transaction.set(oldStateRef, { count: Math.max(oldCount - 1, 0) }, { merge: true });
      transaction.set(targetStateRef, { count: targetCount + 1 }, { merge: true });
      transaction.update(voteRef, {
        day: targetDay,
        dayLabel: targetDayLabel,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
  }

  window.MartiniFirebase = {
    auth,
    db,
    readAdminSession,
    saveAdminSession,
    signInWithEmail,
    signOutUser,
    subscribeAuth,
    isExecutive,
    getVoteConfig,
    saveVoteConfig,
    resetClassVotes,
    subscribeClassVotes,
    deleteClassVote,
    moveClassVote,
  };
})();
