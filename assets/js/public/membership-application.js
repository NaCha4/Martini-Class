import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getFirebaseServices } from "../firebase-client.js?v=security-refactor-20260710";
import { createFirebaseErrorFormatter } from "../shared/common.js?v=security-refactor-20260710";

const COLLECTION_NAME = "membershipApplications";
const FIELD_LIMITS = {
  contact: 40,
  department: 80,
  email: 120,
  motivation: 1200,
  name: 40,
  note: 1200,
  studentId: 40,
};
const getFirebaseErrorMessage = createFirebaseErrorFormatter({
  "permission-denied": "가입 신청을 접수할 수 없습니다. 잠시 후 다시 시도해주세요.",
});

function getTrimmed(formData, key) {
  return String(formData.get(key) || "").trim();
}

function setStatus(message, isError = false) {
  const status = document.querySelector("[data-membership-application-status]");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function getApplicationValues(form) {
  const formData = new FormData(form);
  const privacyAgreed = formData.get("privacyAgreed") === "on";
  const values = {
    name: getTrimmed(formData, "name"),
    studentId: getTrimmed(formData, "studentId"),
    department: getTrimmed(formData, "department"),
    contact: getTrimmed(formData, "contact"),
    email: getTrimmed(formData, "email"),
    motivation: getTrimmed(formData, "motivation"),
    note: getTrimmed(formData, "note"),
    privacyAgreed,
    status: "pending",
  };

  if (!values.name || !values.studentId || !values.department || !values.contact || !values.email || !values.motivation) {
    throw new Error("필수 항목을 모두 입력해주세요.");
  }

  if (!privacyAgreed) {
    throw new Error("개인정보 수집 및 이용에 동의해주세요.");
  }

  const oversizedField = Object.entries(FIELD_LIMITS)
    .find(([key, maxLength]) => values[key].length > maxLength);

  if (oversizedField) {
    throw new Error("입력 가능한 글자 수를 초과한 항목이 있습니다.");
  }

  return values;
}

async function submitMembershipApplication(form) {
  const submitButton = form.querySelector('button[type="submit"]');

  submitButton.disabled = true;
  setStatus("신청서를 제출하는 중입니다.");

  try {
    const values = getApplicationValues(form);
    const { db } = await getFirebaseServices();
    const docRef = doc(collection(db, COLLECTION_NAME));

    await setDoc(docRef, {
      ...values,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    form.reset();
    setStatus("가입 신청이 접수되었습니다.");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "가입 신청 제출에 실패했습니다."), true);
  } finally {
    submitButton.disabled = false;
  }
}

function bindMembershipApplicationForm() {
  const form = document.querySelector("[data-membership-application-form]");

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMembershipApplication(form);
  });
  form.querySelector('button[type="submit"]')?.removeAttribute("disabled");
}

document.addEventListener("DOMContentLoaded", bindMembershipApplicationForm);
