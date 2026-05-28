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
  const storage = firebase.storage ? firebase.storage() : null;
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

  function getExecutiveConfigRef() {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("settings").doc("executiveConfig");
  }

  function subscribeExecutiveConfig(callback) {
    return getExecutiveConfigRef().onSnapshot((snapshot) => {
      callback(snapshot.exists ? snapshot.data() : null);
    });
  }

  async function saveExecutiveConfig(config) {
    await getExecutiveConfigRef().set(
      {
        ...config,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  function createBatchWriter(maxOperations = 450) {
    const writeBatches = [];
    let batch = db.batch();
    let operationCount = 0;

    function queue(operation) {
      operation(batch);
      operationCount += 1;

      if (operationCount < maxOperations) return;

      writeBatches.push(batch);
      batch = db.batch();
      operationCount = 0;
    }

    async function commit() {
      if (operationCount > 0) {
        writeBatches.push(batch);
      }

      await Promise.all(writeBatches.map((writeBatch) => writeBatch.commit()));
    }

    return {
      commit,
      queue,
    };
  }

  async function resetClassVotes(dayKeys = []) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const snapshot = await db.collection("classVotes").get();
    const writer = createBatchWriter();

    snapshot.docs.forEach((documentSnapshot) => {
      writer.queue((batch) => batch.delete(documentSnapshot.ref));
    });

    dayKeys.forEach((dayKey) => {
      writer.queue((batch) => {
        batch.set(db.collection("classVoteState").doc(dayKey), { count: 0 }, { merge: true });
      });
    });

    await writer.commit();
  }

  function subscribeClassVotes(callback) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("classVotes").orderBy("updatedAt").onSnapshot((snapshot) => {
      const votes = snapshot.docs
        .map((documentSnapshot) => {
          const data = documentSnapshot.data();

          return {
            ...data,
            studentId: data.studentId || documentSnapshot.id,
          };
        });

      callback(votes);
    });
  }

  function subscribeClassAttendance(callback) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("classAttendance").onSnapshot((snapshot) => {
      const attendance = snapshot.docs.map((documentSnapshot) => {
        const data = documentSnapshot.data();
        const [, ...studentIdParts] = documentSnapshot.id.split("_");

        return {
          ...data,
          attendanceId: documentSnapshot.id,
          weekKey: data.weekKey || "week-1",
          weekLabel: data.weekLabel || "1주차",
          studentId: data.studentId || studentIdParts.join("_") || documentSnapshot.id,
        };
      });

      callback(attendance);
    });
  }

  function getClassAttendanceDocId(record) {
    return `${record.weekKey || "week-1"}_${record.studentId}`;
  }

  async function saveClassAttendance(record) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    await db.collection("classAttendance").doc(getClassAttendanceDocId(record)).set(
      {
        ...record,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function replaceWeekClassAttendance(weekKey, records = []) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const snapshot = await db.collection("classAttendance").get();
    const writer = createBatchWriter();

    snapshot.docs.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();
      const isTargetWeek = data.weekKey === weekKey || (!data.weekKey && weekKey === "week-1");

      if (!isTargetWeek) return;

      writer.queue((batch) => batch.delete(documentSnapshot.ref));
    });

    records.forEach((record) => {
      writer.queue((batch) => {
        batch.set(db.collection("classAttendance").doc(getClassAttendanceDocId(record)), {
          ...record,
          status: record.status || "pending",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
    });

    await writer.commit();
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

  function normalizePrivateClassSnapshot(documentSnapshot) {
    const data = documentSnapshot.data();

    return {
      ...data,
      id: documentSnapshot.id,
      applicationCount: Number(data.applicationCount || 0),
    };
  }

  function subscribePrivateClasses(callback) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("privateClasses").onSnapshot((snapshot) => {
      const classes = snapshot.docs
        .map(normalizePrivateClassSnapshot)
        .sort((a, b) => {
          const aTime = a.eventAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const bTime = b.eventAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;

          return bTime - aTime;
        });

      callback(classes);
    });
  }

  function subscribePrivateClassApplications(callback) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("privateClassApplications").orderBy("createdAt").onSnapshot((snapshot) => {
      const applications = snapshot.docs
        .map((documentSnapshot) => ({
          ...documentSnapshot.data(),
          id: documentSnapshot.id,
        }));

      callback(applications);
    });
  }

  async function savePrivateClass(classData) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const privateClassRef = classData.id
      ? db.collection("privateClasses").doc(classData.id)
      : db.collection("privateClasses").doc();
    const snapshot = await privateClassRef.get();

    await privateClassRef.set(
      {
        ...classData,
        id: privateClassRef.id,
        applicationCount: snapshot.data()?.applicationCount || 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: snapshot.data()?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return privateClassRef.id;
  }

  async function uploadPrivateClassThumbnail(classId, thumbnailBlob, onProgress) {
    if (!storage) {
      throw new Error("Firebase Storage SDK가 로드되지 않았습니다.");
    }

    const thumbnailRef = storage.ref(`private-class-thumbnails/${classId}/thumbnail.jpg`);
    const uploadTask = thumbnailRef.put(thumbnailBlob, {
      contentType: "image/jpeg",
      cacheControl: "public,max-age=3600",
    });

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        uploadTask.cancel();
        reject(new Error("썸네일 업로드 시간이 너무 오래 걸립니다. Firebase Storage 설정을 확인해주세요."));
      }, 60000);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);

          onProgress?.(progress);
        },
        (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
        async () => {
          window.clearTimeout(timeoutId);

          try {
            resolve(await uploadTask.snapshot.ref.getDownloadURL());
          } catch (error) {
            reject(error);
          }
        },
      );
    });
  }

  async function deletePrivateClass(classId) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    await db.collection("privateClasses").doc(classId).delete();
  }

  async function deletePrivateClassApplication(application) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const classRef = db.collection("privateClasses").doc(application.classId);
    const applicationRef = db.collection("privateClassApplications").doc(application.id);

    await db.runTransaction(async (transaction) => {
      const classSnapshot = await transaction.get(classRef);
      const applicationSnapshot = await transaction.get(applicationRef);

      if (!applicationSnapshot.exists) return;

      const applicationCount = Number(classSnapshot.data()?.applicationCount || 0);

      transaction.delete(applicationRef);

      if (classSnapshot.exists) {
        transaction.update(classRef, {
          applicationCount: Math.max(applicationCount - 1, 0),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
  }

  function normalizeClassDate(value) {
    if (!value) return null;

    if (typeof value.toDate === "function") return value.toDate();

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getPrivateClassAutoStatus(privateClass, now = new Date()) {
    const eventAt = normalizeClassDate(privateClass?.eventAt);
    const recruitOpenAt = normalizeClassDate(privateClass?.recruitOpenAt);
    const recruitCloseAt = normalizeClassDate(privateClass?.recruitCloseAt);
    const capacity = Number(privateClass?.capacity || 0);
    const applicationCount = Number(privateClass?.applicationCount || 0);

    if (eventAt && eventAt <= now) return "done";
    if (capacity > 0 && applicationCount >= capacity) return "closed";
    if (recruitCloseAt && recruitCloseAt <= now) return "closed";
    if (recruitOpenAt && recruitOpenAt > now) return "upcoming";
    if (recruitOpenAt || recruitCloseAt) return "open";

    return privateClass?.status || "closed";
  }

  async function submitPrivateClassApplication(classData, applicant) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const studentId = String(applicant.studentId || "").trim().replace(/\s+/g, "");
    const classRef = db.collection("privateClasses").doc(classData.id);
    const applicationRef = db.collection("privateClassApplications").doc(`${classData.id}_${studentId}`);

    await db.runTransaction(async (transaction) => {
      const classSnapshot = await transaction.get(classRef);
      const applicationSnapshot = await transaction.get(applicationRef);

      if (!classSnapshot.exists) {
        throw new Error("게시글을 찾을 수 없습니다.");
      }

      if (applicationSnapshot.exists) {
        throw new Error("이미 신청한 게시글입니다.");
      }

      const privateClass = classSnapshot.data();
      const capacity = Number(privateClass.capacity || 0);
      const applicationCount = Number(privateClass.applicationCount || 0);

      const applicationStatus = getPrivateClassAutoStatus({
        ...privateClass,
        applicationCount,
      });

      if (applicationStatus !== "open") {
        throw new Error("현재 신청할 수 있는 게시글이 아닙니다.");
      }

      if (capacity > 0 && applicationCount >= capacity) {
        throw new Error("모집 인원이 마감되었습니다.");
      }

      transaction.set(applicationRef, {
        classId: classData.id,
        classTitle: privateClass.title,
        name: applicant.name,
        studentId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(classRef, {
        applicationCount: applicationCount + 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
  }

  function subscribeInventoryItems(callback) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("inventoryItems").onSnapshot((snapshot) => {
      const items = snapshot.docs
        .map((documentSnapshot) => ({
          ...documentSnapshot.data(),
          id: documentSnapshot.id,
        }))
        .sort((a, b) => {
          const categoryCompare = String(a.category || "").localeCompare(String(b.category || ""), "ko");

          if (categoryCompare !== 0) return categoryCompare;

          const aOrder = Number(a.itemOrder);
          const bOrder = Number(b.itemOrder);
          const hasAOrder = Number.isFinite(aOrder);
          const hasBOrder = Number.isFinite(bOrder);

          if (hasAOrder || hasBOrder) {
            if (!hasAOrder) return 1;
            if (!hasBOrder) return -1;
            if (aOrder !== bOrder) return aOrder - bOrder;
          }

          const itemCompare = String(a.itemName || a.typeName || "").localeCompare(String(b.itemName || b.typeName || ""), "ko");

          if (itemCompare !== 0) return itemCompare;

          return String(a.productName || a.name || "").localeCompare(String(b.productName || b.name || ""), "ko");
        });

      callback(items);
    });
  }

  async function saveInventoryItem(itemData) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const itemRef = itemData.id
      ? db.collection("inventoryItems").doc(itemData.id)
      : db.collection("inventoryItems").doc();
    const snapshot = await itemRef.get();

    await itemRef.set(
      {
        ...itemData,
        id: itemRef.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: snapshot.data()?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return itemRef.id;
  }

  async function updateInventoryItemOrders(updates = []) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const validUpdates = updates.filter((update) => update?.id);

    if (!validUpdates.length) return;

    const writer = createBatchWriter();

    validUpdates.forEach((update) => {
      writer.queue((batch) => {
        batch.set(
          db.collection("inventoryItems").doc(update.id),
          {
            itemOrder: Number(update.itemOrder) || 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    });

    await writer.commit();
  }

  async function updateInventoryQuantity(itemId, quantity) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    await db.collection("inventoryItems").doc(itemId).set(
      {
        quantity: Math.max(Number(quantity) || 0, 0),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function deleteInventoryItem(itemId) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    await db.collection("inventoryItems").doc(itemId).delete();
  }

  function subscribeClassSchedules(callback) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    return db.collection("classSchedules").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
      const schedules = snapshot.docs
        .map((documentSnapshot) => ({
          ...documentSnapshot.data(),
          id: documentSnapshot.id,
        }));

      callback(schedules);
    });
  }

  async function saveClassSchedule(scheduleData) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    const scheduleRef = scheduleData.id
      ? db.collection("classSchedules").doc(scheduleData.id)
      : db.collection("classSchedules").doc();
    const snapshot = await scheduleRef.get();

    await scheduleRef.set(
      {
        ...scheduleData,
        id: scheduleRef.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: snapshot.data()?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return scheduleRef.id;
  }

  async function deleteClassSchedule(scheduleId) {
    if (!db) {
      throw new Error("Firestore SDK가 로드되지 않았습니다.");
    }

    await db.collection("classSchedules").doc(scheduleId).delete();
  }

  window.MartiniFirebase = {
    auth,
    db,
    storage,
    readAdminSession,
    saveAdminSession,
    signInWithEmail,
    signOutUser,
    subscribeAuth,
    isExecutive,
    getVoteConfig,
    saveVoteConfig,
    subscribeExecutiveConfig,
    saveExecutiveConfig,
    resetClassVotes,
    subscribeClassVotes,
    subscribeClassAttendance,
    saveClassAttendance,
    replaceWeekClassAttendance,
    deleteClassVote,
    moveClassVote,
    subscribePrivateClasses,
    subscribePrivateClassApplications,
    savePrivateClass,
    uploadPrivateClassThumbnail,
    deletePrivateClass,
    deletePrivateClassApplication,
    submitPrivateClassApplication,
    subscribeInventoryItems,
    saveInventoryItem,
    updateInventoryItemOrders,
    updateInventoryQuantity,
    deleteInventoryItem,
    subscribeClassSchedules,
    saveClassSchedule,
    deleteClassSchedule,
  };
})();
