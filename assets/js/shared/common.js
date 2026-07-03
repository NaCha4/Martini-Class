// Shared helpers used by admin, member, and public page modules.
// Pure utilities only: no Firebase imports, no DOM state.

const APP_CHECK_FAILED_MESSAGE = "App Check 확인에 실패했습니다. reCAPTCHA 허용 도메인과 App Check 설정을 확인해주세요.";

const COMMON_ERROR_MESSAGES = {
  "permission-denied": "권한이 없습니다. 관리자 로그인 상태와 Firestore Rules 배포 여부를 확인해주세요.",
  "failed-precondition": "Firestore 인덱스 또는 쿼리 조건 확인이 필요합니다.",
  "appCheck/recaptcha-error": APP_CHECK_FAILED_MESSAGE,
  "appCheck/fetch-status-error": APP_CHECK_FAILED_MESSAGE,
  "auth/firebase-app-check-token-is-invalid": APP_CHECK_FAILED_MESSAGE,
};

/**
 * Returns a `(error, fallback) => message` formatter.
 * `overrides` maps Firebase error codes to module-specific messages
 * (e.g. Storage-related codes for modules that upload files).
 */
export function createFirebaseErrorFormatter(overrides = {}) {
  const messages = { ...COMMON_ERROR_MESSAGES, ...overrides };

  return (error, fallback) => messages[error?.code] || error?.message || fallback;
}

/**
 * Returns a `(message, isError) => void` status renderer bound to a selector.
 */
export function createStatusSetter(selector) {
  return (message = "", isError = false) => {
    const status = document.querySelector(selector);

    if (!status) {
      return;
    }

    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };
}

/**
 * Normalizes Firestore Timestamp / seconds object / number / string values
 * to an ISO string, or "" when the value is missing or unrecognized.
 */
export function normalizeDateTimeValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  return "";
}

/**
 * ISO/date-like value -> `datetime-local` input value (local time).
 */
export function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return offsetDate.toISOString().slice(0, 16);
}

/**
 * `datetime-local` input value -> ISO string ("" when invalid).
 */
export function fromDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Formats a date-like value as "MM. DD. HH:MM" (ko-KR), or "-" when invalid.
 */
export function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Firestore Timestamp / seconds object / number / string -> epoch millis.
 * Returns `fallback` for missing or unparsable values.
 */
export function getTimestampMillis(value, fallback = 0) {
  if (!value) {
    return fallback;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  if (typeof value === "string") {
    return new Date(value).getTime() || fallback;
  }

  return fallback;
}
