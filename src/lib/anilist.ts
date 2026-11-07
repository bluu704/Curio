import type { Candidate, Kind, Person } from "@/api/types";

/** Browser-side AniList search (CORS-enabled) used by the preview/mock backend. Mirrors crates/core/src/metadata/anilist.rs */
const FIELDS = `id siteUrl type format countryOfOrigin title { romaji english native } synonyms
  coverImage { extraLarge } bannerImage startDate { year } description(asHtml: false) genres
  studios(isMain: true) { nodes { name } }
  staff(sort: [RELEVANCE], perPage: 25) { edges { role node { name { full native } } } }`;

const hangul = (s: string) => /[가-힣]/.test(s);

export async function searchAniList(kind: Kind, q: string): Promise<Candidate[]> {
  const scope = kind === "anime" ? "type: ANIME" : kind === "light_novel" || kind === "web_novel" ? "type: MANGA, format_in: [NOVEL]" : kind === "manga" || kind === "webtoon" ? "type: MANGA, format_not_in: [NOVEL]" : "";
  const query = `query($s: String) { Page(perPage: 8) { media(search: $s${scope ? ", " + scope : ""}, sort: [SEARCH_MATCH, POPULARITY_DESC]) { ${FIELDS} } } }`;
  const res = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables: { s: q } }) });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.data?.Page?.media ?? []).map((m: any): Candidate => {
    const ko = (m.synonyms ?? []).find(hangul);
    const title = ko ?? m.title.english ?? m.title.romaji;
    const people: Person[] = [];
    for (const e of m.staff?.edges ?? []) {
      const base = String(e.role).split(" (")[0];
      const cat = /^(Director|Chief Director)$/.test(base) ? "director" : /^(Original Creator|Original Story|Story & Art|Story|Art)$/.test(base) ? "author" : null;
      const name = e.node.name.native ?? e.node.name.full;
      if (cat && name && !people.some((p) => p.name === name)) people.push({ name, category: cat, role: e.role });
    }
    for (const s of m.studios?.nodes ?? []) people.push({ name: s.name, category: "studio", role: "Studio" });
    const novel = m.format === "NOVEL";
    const k: Kind = m.type === "ANIME" ? "anime" : novel ? (m.countryOfOrigin === "JP" ? "light_novel" : "web_novel") : m.countryOfOrigin === "KR" ? "webtoon" : "manga";
    return {
      provider: "anilist", id: String(m.id), title, altTitles: [m.title.native, m.title.romaji].filter((x: string | null) => x && x !== title),
      kind: k, year: m.startDate?.year ?? null, coverUrl: m.coverImage?.extraLarge ?? null, bannerUrl: m.bannerImage ?? null,
      summary: m.description ? String(m.description).replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").trim() : null,
      people, genres: m.genres ?? [], series: null, url: m.siteUrl ?? null, code: null,
    };
  });
}
