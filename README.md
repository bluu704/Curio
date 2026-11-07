# Curio — 개인 콘텐츠 아카이브

**로컬 파일 그대로** 연결해 관리하는 데스크톱 앱.
Notion식 유연한 속성/메모 + 갤러리·테이블·리스트 뷰 + 카드 커스텀.

## 1. 기술 스택과 선택 이유

| 영역 | 선택 | 이유 |
|---|---|---|
| 데스크톱 셸 | **Tauri 2** | Electron 대비 설치 파일 ~10MB, 메모리 적음. `asset://` 프로토콜로 수십 GB 영상·고해상도 이미지를 **복사/base64 없이 스트리밍**. 파일 드래그 시 실제 경로 획득. |
| 백엔드 로직 | **Rust (`curio-core` 크레이트)** | DB·파일·썸네일 로직을 UI/전송 계층과 분리 → 같은 코드를 데스크톱(IPC)과 서버(HTTP)가 공유. |
| DB | **SQLite** (rusqlite, WAL) | 단일 파일, 설치 불필요, 수십만 항목도 빠름. 고정 컬럼(필터·정렬용 인덱스) + JSON 컬럼(사용자 속성·메모 블록)으로 유연성 확보. |
| 프론트 | **React + TypeScript + Vite** | 웹과 데스크톱이 100% 같은 코드. 생태계 최대. |
| 스타일 | **Tailwind CSS + CSS 변수 토큰** | 라이트/다크를 변수 교체만으로 지원. 카드 레이아웃 커스텀이 쉬움. |
| 상태 | **zustand** | 보일러플레이트 적은 전역 스토어, 낙관적 업데이트. |
| 아이콘 | **lucide-react** | 일관된 선 아이콘, 트리 셰이킹. |
| 메타데이터 | **ureq + 병렬 검색** | 키 없는 공개 API 여러 개를 동시에 조회, 한 곳이 실패해도 나머지 결과 표시. |
| 향후 서버 | **axum (`curio-server`)** | `curio-core`를 그대로 HTTP로 노출 → 웹 UI는 `VITE_API_URL`만 지정하면 동작. |

### 웹 / Google Drive 확장 전략
- **프론트는 `ApiClient` 인터페이스만 사용** (`src/api/client.ts`). 어댑터 3종:
  `tauri`(IPC) · `http`(서버) · `mock`(브라우저 미리보기). 컴포넌트는 Tauri를 직접 import하지 않음.
- **파일은 `(provider, uri)` 참조**로만 저장 (`local` / `gdrive` / `http`). Google Drive는
  `crates/core/src/storage.rs`의 `StorageProvider` 트레이트 구현만 추가하면 됨 (자리 마련됨).
- **UUID PK + `updated_at` + `deleted_at`(soft delete)** → 오프라인 생성 후 서버/다른 기기와 병합(동기화) 가능.

## 2. 폴더 구조

```
curio/
├─ src/                      # React UI (웹·데스크톱 공용)
│  ├─ api/
│  │  ├─ types.ts            # 도메인 타입 (Rust models.rs와 동일한 JSON)
│  │  ├─ client.ts           # ApiClient 인터페이스 ← UI가 아는 유일한 백엔드
│  │  └─ adapters/           # tauri.ts · http.ts · mock.ts
│  ├─ store/                 # zustand: app.ts(데이터·뷰), theme.ts
│  ├─ components/
│  │  ├─ layout/             # Sidebar(아이콘 레일), Toolbar(검색·필터·정렬·표시설정)
│  │  ├─ views/              # GalleryView · TableView · ListView
│  │  ├─ detail/             # DetailPanel · TagInput · FieldInput · FileList · BlockEditor
│  │  ├─ settings/           # SettingsModal (테마·사용자 속성·저장소)
│  │  └─ ui/                 # Popover · Stars · Segmented · Modal · Cover · TooltipLayer
│  ├─ hooks/useFileDrop.ts   # 창 전체 드래그&드롭 (Tauri: 실제 경로)
│  └─ lib/                   # meta(아이콘/라벨), defaults(기본 뷰), format
├─ crates/
│  ├─ core/                  # ★ 순수 Rust 도메인 로직 (UI/전송 무관)
│  │  ├─ migrations/0001_init.sql
│  │  └─ src/ library.rs(파사드) db.rs models.rs scan.rs media.rs storage.rs
│  └─ server/                # axum REST 서버 (향후 웹/개인 서버)
└─ src-tauri/                # 얇은 데스크톱 셸: commands.rs = core 호출 한 줄씩
```

## 3. DB 설계

| 테이블 | 역할 |
|---|---|
| `items` | 작품. 고정 컬럼(kind, status, rating, favorite, cover_uri) + `props` JSON(사용자 속성 값) + `blocks` JSON(메모 페이지) |
| `tags` | 태그·작가·장르·시리즈·서클을 `category`로 통합. `(category, name NOCASE)` 유니크 |
| `item_tags` | 다대다 + 순서 |
| `files` | 로컬 경로/클라우드 참조. 바이트는 저장하지 않음 |
| `field_defs` | 사용자 정의 속성 정의 (text/number/select/multi_select/date/url/checkbox) |
| `views` | 저장된 보기 = 쿼리 + 레이아웃 + 카드 설정(JSON) |

마이그레이션은 `PRAGMA user_version` 기반 (추가만, 수정 금지).

## 4. 실행

```bash
npm install
npm run dev            # 브라우저 미리보기 (mock 데이터, http://localhost:1420)
npm run tauri dev      # 데스크톱 앱 (Rust 툴체인 필요)
npm run tauri build    # 설치 파일 생성
cargo test -p curio-core
```

웹 + 서버 모드:
```bash
CURIO_DB=./curio.db cargo run -p curio-server          # :8787
VITE_API_URL=http://127.0.0.1:8787 npm run dev
```

Windows 사전 준비: [Rust](https://rustup.rs), Node 20+, WebView2(윈10/11 기본 포함), VS C++ Build Tools.

### 구글 드라이브 연결 넣어서 빌드하기

쓰는 사람이 "구글 계정으로 연결" 버튼만 누르면 되도록, 구글 연결 정보는 빌드할 때 앱 안에 넣어요.

1. Google Cloud 콘솔 → API 및 서비스 → **Google Drive API 사용** 설정
2. OAuth 동의 화면: 범위에 `drive.readonly`, `email` 추가 · 앱을 "테스트" 상태로 두는 동안은 **테스트 사용자**에 쓸 사람의 이메일을 넣어 주세요 (최대 100명)
3. 사용자 인증 정보 → OAuth 클라이언트 ID → **데스크톱 앱** → JSON 다운로드
4. 받은 `client_secret_….json`을 이 저장소 맨 위 폴더에 그대로 두고 빌드 (`npm run tauri build`)

이 파일은 `.gitignore`에 들어 있어서 GitHub에 올라가지 않아요. 환경 변수 `CURIO_GOOGLE_CLIENT_ID` / `CURIO_GOOGLE_CLIENT_SECRET`로 넣어도 돼요.

### GitHub에서 설치 파일 만들기 (내 PC에 아무것도 설치하지 않고)

1. 저장소 → Settings → Secrets and variables → Actions → **New repository secret**
   - `CURIO_GOOGLE_CLIENT_ID`, `CURIO_GOOGLE_CLIENT_SECRET` (OAuth JSON의 두 값, 암호화돼서 저장소에는 안 보여요)
2. Actions → **Build Curio** → Run workflow
3. 10~20분 뒤 실행 결과의 Artifacts에서 `curio-windows`(설치 파일 .msi / .exe), `curio-macos`(.dmg)를 받아요
   - `v0.2.0` 같은 태그를 올리면 Releases에 초안으로도 올라가요

### 웹 버전 (설치 없이 브라우저에서)

`npm run build:web`은 서버 없이 돌아가는 웹 버전을 만들어요. 라이브러리는 브라우저에 저장되고, 구글로 로그인하면 데스크톱 앱과 같은 드라이브의 라이브러리를 맞춰 써요.

GitHub Pages로 올리기 (`.github/workflows/web.yml`, main에 올릴 때마다 자동):
1. 저장소 → Settings → Pages → Source를 **GitHub Actions**로
2. Google Cloud(데스크톱용과 **같은 프로젝트**) → OAuth 클라이언트 ID → **웹 애플리케이션**
   - 승인된 자바스크립트 원본: `https://<GitHub 아이디>.github.io`
3. 저장소 → Settings → Secrets and variables → Actions → **Variables** → `CURIO_GOOGLE_WEB_CLIENT_ID`에 그 클라이언트 ID
   (클라이언트 ID는 공개돼도 되는 값이고, 웹 버전에는 비밀값이 없어요)
4. 주소: `https://<GitHub 아이디>.github.io/Curio/`

웹 버전에서 안 되는 것: PC 파일 연결·폴더 감시·드라이브 폴더 가져오기, 메타데이터는 AniList 등 브라우저에서 바로 부를 수 있는 곳만 검색돼요.

## 5. 구현 현황 / 로드맵

- [x] 아카이브
- [x] 폴더형 카테고리 트리 (하위 폴더, 카드를 끌어다 넣기), 태그 9종(작가·감독·스튜디오·배급·성우·서클·시리즈·장르·태그)
- [x] 일러스트 모자이크(masonry) 갤러리, 갤러리·리스트·테이블 가상 스크롤
- [x] 내장 뷰어: ZIP/CBZ·이미지 폴더(Rust 스트리밍)·PDF(pdf.js), 한 쪽/두 쪽/웹툰 세로 스크롤, 오른쪽→왼쪽
- [x] 정보 자동 검색 — 여러 소스 병렬 검색 후 합쳐서 표시
      AniList · 네이버 웹툰/시리즈 · Steam · Google Play · 위키백과(ko/en/ja)+Wikidata · YouTube/YT Music(oEmbed)+Deezer 앨범아트
      고화질 표지·배너는 로컬 캐시에 저장, 인물·장르는 태그로 연결 (동인지는 검색 없음)
- [x] 목록 붙여넣기: 고정 형식 `제목 | 상태 | 평점 | 작가 | 장르 | 태그 | 링크 | 메모` (Tab 구분도 가능), 줄별 오류 표시
- [x] FTS5(trigram) 전문 검색, ffmpeg 영상 썸네일, 감시 폴더 자동 가져오기, 서버 토큰 인증(CURIO_TOKEN)
- [x] 아카이브 편집(이름·아이콘·고정·순서·추가·삭제), 사용자 정의 상태, 항목 고정, 우클릭/길게 누르기 메뉴
- [x] 메모: 마크다운 + LaTeX(KaTeX), 블록 드래그 정렬 · 상세 패널 전체 화면 · 속성 보이기/숨기기/추가
- [x] 테이블 열 선택(모든 속성·사용자 속성), 사용자 정의 단축키, 글꼴·굵기·크기·강조색 설정
- [x] 휴대폰·태블릿 대응(서랍 메뉴, 터치 길게 누르기, 리더 스와이프)
- [ ] Google Drive provider (OAuth 클라이언트 ID 필요), 기기 간 동기화, Stove 검색(공개 API 없음)

디자인 미리보기(샘플 데이터): `npm run build:preview` → `dist-preview/index.html`
