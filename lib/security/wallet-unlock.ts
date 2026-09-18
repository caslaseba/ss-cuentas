const ICBC_SESSION = "ss-icbc-open";
const ICBC_CRED = "ss-icbc-cred";

export function icbcUnlocked() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ICBC_SESSION) === "1";
  } catch {
    return false;
  }
}

export function setIcbcUnlocked() {
  try {
    sessionStorage.setItem(ICBC_SESSION, "1");
  } catch {
    /* private mode */
  }
}

export function biometricAvailable() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential === "function"
  );
}

function bytesToB64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function unlockWithBiometric(): Promise<boolean> {
  if (!biometricAvailable()) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const stored = localStorage.getItem(ICBC_CRED);
    if (!stored) {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "SS Cuentas", id: window.location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: "caja-icbc",
            displayName: "Caja ICBC",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) return false;
      localStorage.setItem(ICBC_CRED, bytesToB64(cred.rawId));
      return true;
    }
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: b64ToBytes(stored).buffer as ArrayBuffer }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return Boolean(assertion);
  } catch {
    return false;
  }
}
