type Pair = "을/를" | "이/가" | "은/는" | "과/와" | "으로/로";

/**
 * The Korean particle that fits the end of `word`: particle("완료", "으로/로") → "로", particle("노래", "을/를") → "를".
 * Use as `"${w}"${particle(w, "을/를")}` so quotes stay around the word.
 */
export function particle(word: string, pair: Pair): string {
  const [withFinal, without] = pair.split("/");
  const ch = [...word.trim()].reverse().find((c) => /[가-힣0-9A-Za-z]/.test(c)) ?? "";
  let jong = 0; // 0 = no final consonant, 8 = ㄹ
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) jong = (code - 0xac00) % 28;
  else if (/[0-9]/.test(ch)) jong = ({ "0": 21, "1": 8, "3": 16, "6": 1, "7": 8, "8": 8 } as Record<string, number>)[ch] ?? 0;
  const final = pair === "으로/로" ? jong !== 0 && jong !== 8 : jong !== 0;
  return final ? withFinal : without;
}
