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

function toValidDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value.toDate === "function") {
    const date = value.toDate();

    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  if (typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Normalizes Firestore Timestamp / seconds object / number / string values
 * to a valid Date, or "" when the value is missing or unrecognized.
 */
export function normalizeDateTimeValue(value) {
  return toValidDate(value) || "";
}

/**
 * ISO/date-like value -> `datetime-local` input value (local time).
 */
export function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = toValidDate(value);

  if (!date) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return offsetDate.toISOString().slice(0, 16);
}

/**
 * `datetime-local` input value -> Date ("" when invalid).
 */
export function fromDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  return toValidDate(value) || "";
}

/**
 * Formats a date-like value as "MM. DD. HH:MM" (ko-KR), or "-" when invalid.
 */
export function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = toValidDate(value);

  if (!date) {
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
  if (value && typeof value.toMillis === "function") {
    const millis = value.toMillis();

    return Number.isFinite(millis) ? millis : fallback;
  }

  return toValidDate(value)?.getTime() ?? fallback;
}

/**
 * Resolves a manual/scheduled application window using one shared policy.
 * A close time always wins; when an open time exists it takes precedence
 * over the manual flag.
 */
export function isApplicationWindowOpen({ isOpen = false, openAt = "", closeAt = "" } = {}, now = Date.now()) {
  const nowMillis = getTimestampMillis(now, Number.NaN);
  const openMillis = getTimestampMillis(openAt, Number.NaN);
  const closeMillis = getTimestampMillis(closeAt, Number.NaN);

  if (!Number.isFinite(nowMillis)) {
    return false;
  }

  if (Number.isFinite(closeMillis) && nowMillis >= closeMillis) {
    return false;
  }

  if (Number.isFinite(openMillis)) {
    return nowMillis >= openMillis;
  }

  return Boolean(isOpen);
}
