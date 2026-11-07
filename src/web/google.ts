/**
 * Google sign-in for the browser-only web version (Google Identity Services token model) and the
 * Drive calls the library sync needs (the app's hidden folder only).
 *
 * The OAuth client is a "Web application" client whose JavaScript origin is the site's address.
 * Its id comes from the build (VITE_GOOGLE_CLIENT_ID) — a client id is public; no secret is involved.
 */
const SCOPES = "openid email https://www.googleapis.com/auth/drive.appdata";
const ACCOUNT_KEY = "curio.web.account";
const CLIENT_KEY = "curio.web.clientId";

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string; login_hint?: string }): void }
interface Gis { accounts: { oauth2: {
  initTokenClient(o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }): TokenClient;
  revoke(token: string, done?: () => void): void;
} } }

export const clientId = (): string =>
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || (() => { try { return localStorage.getItem(CLIENT_KEY) ?? ""; } catch { return ""; } })();
export const builtinClient = () => !!(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined);
export function setClientId(id: string) { try { localStorage.setItem(CLIENT_KEY, id.trim()); } catch { /* ignore */ } }

export const account = (): string | null => { try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; } };
const setAccount = (email: string | null) => { try { if (email) localStorage.setItem(ACCOUNT_KEY, email); else localStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ } };

let gisLoad: Promise<Gis> | null = null;
function gis(): Promise<Gis> {
  gisLoad ??= new Promise((res, rej) => {
    const w = window as unknown as { google?: Gis };
    if (w.google?.accounts?.oauth2) return res(w.google);
    const s = Object.assign(document.createElement("script"), { src: "https://accounts.google.com/gsi/client", async: true });
    s.onload = () => (w.google ? res(w.google) : rej(new Error("구글 로그인을 불러오지 못했어요")));
    s.onerror = () => { gisLoad = null; rej(new Error("구글 로그인을 불러오지 못했어요 (인터넷 연결을 확인해 주세요)")); };
    document.head.appendChild(s);
  });
  return gisLoad;
}

let token: { value: string; exp: number } | null = null;

/** Ask Google for an access token. `prompt: ""` shows the consent only the first time. */
async function request(prompt: string): Promise<string> {
  const id = clientId();
  if (!id) throw new Error("이 웹 버전에는 구글 연결 정보가 없어요");
  const g = await gis();
  return new Promise((res, rej) => {
    const c = g.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPES,
      callback: (r) => {
        if (r.error || !r.access_token) return rej(new Error(r.error === "access_denied" ? "로그인을 취소했어요" : `구글 로그인 오류: ${r.error_description ?? r.error}`));
        token = { value: r.access_token, exp: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
        res(r.access_token);
      },
      error_callback: (e) => rej(new Error(e.type === "popup_closed" ? "로그인 창을 닫았어요" : e.type === "popup_failed_to_open" ? "로그인 창이 차단됐어요. 버튼을 다시 눌러 주세요" : "구글 로그인을 마치지 못했어요")),
    });
    c.requestAccessToken({ prompt, login_hint: account() ?? undefined });
  });
}

/** A token from this visit exists (background sync must not open sign-in popups). */
export const hasToken = () => !!token && Date.now() < token.exp;

/** Sign in (button press): pick the account, allow access, remember the e-mail. */
export async function signIn(): Promise<string> {
  const t = await request("select_account");
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t}` } });
  const email = r.ok ? ((await r.json()) as { email?: string }).email ?? null : null;
  setAccount(email ?? "구글 계정");
  return account()!;
}

export async function signOut() {
  const g = await gis().catch(() => null);
  if (token && g) g.accounts.oauth2.revoke(token.value);
  token = null;
  setAccount(null);
}

/** A valid access token; after a reload Google re-issues one (a popup may flash). */
export async function accessToken(): Promise<string> {
  if (token && Date.now() < token.exp) return token.value;
  if (!account()) throw new Error("먼저 구글 계정으로 로그인해 주세요");
  return request("");
}

// ---------------------------------------------------------------- Drive app folder

const API = "https://www.googleapis.com/drive/v3/files";
const auth = async () => ({ Authorization: `Bearer ${await accessToken()}` });
async function check(r: Response) {
  if (r.ok) return r;
  if (r.status === 401) { token = null; throw new Error("구글 로그인이 만료됐어요. 다시 시도해 주세요"); }
  if (r.status === 403) throw new Error("드라이브 권한이 없어요. 로그아웃 후 다시 로그인해 주세요");
  throw new Error(`드라이브 오류 ${r.status}`);
}

export interface AppFile { id: string; name: string }
export async function listAppFiles(): Promise<AppFile[]> {
  const out: AppFile[] = [];
  let page = "";
  do {
    const q = new URLSearchParams({ spaces: "appDataFolder", fields: "nextPageToken,files(id,name)", pageSize: "1000", ...(page ? { pageToken: page } : {}) });
    const j = await (await check(await fetch(`${API}?${q}`, { headers: await auth() }))).json() as { files?: AppFile[]; nextPageToken?: string };
    out.push(...(j.files ?? []));
    page = j.nextPageToken ?? "";
  } while (page);
  return out;
}

export async function getAppFile(id: string): Promise<Blob> {
  return (await check(await fetch(`${API}/${id}?alt=media`, { headers: await auth() }))).blob();
}

export async function putAppFile(name: string, data: Blob, existing?: string): Promise<string> {
  if (existing) {
    const r = await check(await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`, { method: "PATCH", headers: { ...(await auth()), "Content-Type": "application/octet-stream" }, body: data }));
    return ((await r.json()) as { id: string }).id;
  }
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name, parents: ["appDataFolder"] })], { type: "application/json" }));
  form.append("file", data);
  const r = await check(await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: await auth(), body: form }));
  return ((await r.json()) as { id: string }).id;
}

// ---------------------------------------------------------------- gzip (same format as the desktop)
export async function gzip(text: string): Promise<Blob> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
}
export async function gunzip(b: Blob): Promise<string> {
  return new Response(b.stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
