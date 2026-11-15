// Words a curious 12-year-old may not know, explained in one line where they appear.
import type { Lang } from "@/lib/i18n";

export type Entry = { re: RegExp; title: string; text: string };

export const GLOSSARY: Record<Lang, Entry[]> = {
  en: [
    { re: /\bRA\b/, title: "RA (right ascension)", text: "The sky’s longitude. It’s counted in hours because the sky turns once a day: 1 h = 15°." },
    { re: /\bDec\b/, title: "Dec (declination)", text: "The sky’s latitude: from −90° at the sky’s south pole to +90° at its north pole." },
    { re: /\barcmin(?:utes?)?\b/i, title: "Arcminute (′)", text: "1/60 of a degree. The full Moon is about 30′ wide." },
    { re: /\barcsec(?:onds?)?\b/i, title: "Arcsecond (″)", text: "1/60 of an arcminute: about the width of a coin seen from 4 km away." },
    { re: /µm/, title: "Micrometer (µm)", text: "A thousandth of a millimeter. Here it measures light waves: our eyes see 0.4–0.7 µm, SPHEREx sees 0.75–5 µm." },
    { re: /\binfrared\b/i, title: "Infrared", text: "Light with longer waves than red, invisible to our eyes. Warm things glow in it: that’s how night-vision cameras see." },
    { re: /\blight-years?\b/i, title: "Light-year", text: "The distance light travels in a year, about 9.5 trillion km. Sunlight reaches us in just 8 minutes." },
    { re: /\bbrown dwarfs?\b/i, title: "Brown dwarf", text: "Too big to be a planet, too small to be a star: it never lights up like the Sun and slowly cools down." },
    { re: /\bred dwarfs?\b/i, title: "Red dwarf", text: "A small, cool star, the most common kind in our galaxy. They can shine for trillions of years." },
    { re: /\bpixels?\b/i, title: "Pixel", text: "One square of a digital picture. Each SPHEREx pixel covers about 6″ of sky (6.15″), which is why stars look blocky." },
  ],
  pt: [
    { re: /\bRA\b/, title: "RA (ascensão reta)", text: "A longitude do céu. É contada em horas porque o céu dá uma volta por dia: 1 h = 15°." },
    { re: /\bDec\b/, title: "Dec (declinação)", text: "A latitude do céu: de −90° no polo sul do céu a +90° no polo norte." },
    { re: /\barcmin\b|minutos? de arco/i, title: "Minuto de arco (′)", text: "1/60 de grau. A Lua cheia tem uns 30′ de largura." },
    { re: /segundos? de arco/i, title: "Segundo de arco (″)", text: "1/60 de minuto de arco: mais ou menos a largura de uma moeda vista a 4 km." },
    { re: /µm/, title: "Micrômetro (µm)", text: "Um milésimo de milímetro. Aqui mede ondas de luz: nossos olhos veem 0,4–0,7 µm, o SPHEREx vê 0,75–5 µm." },
    { re: /\binfravermelh[oa]s?\b/i, title: "Infravermelho", text: "Luz com ondas mais longas que o vermelho, invisível para nós. Coisas quentes brilham nela: é assim que câmeras de visão noturna enxergam." },
    { re: /\banos?-luz\b/i, title: "Ano-luz", text: "A distância que a luz percorre em um ano, uns 9,5 trilhões de km. A luz do Sol chega aqui em só 8 minutos." },
    { re: /\banãs? marro(?:m|ns)\b/i, title: "Anã marrom", text: "Grande demais para ser planeta, pequena demais para ser estrela: nunca acende como o Sol e vai esfriando devagar." },
    { re: /\banãs? vermelhas?\b/i, title: "Anã vermelha", text: "Uma estrela pequena e fria, o tipo mais comum na nossa galáxia. Pode brilhar por trilhões de anos." },
    { re: /\bpixe(?:l|ls|is)\b/i, title: "Pixel", text: "Um quadradinho de uma imagem digital. Cada pixel do SPHEREx cobre cerca de 6″ de céu (6,15″), por isso as estrelas parecem quadriculadas." },
  ],
};

/** Split `text` into plain strings and glossary hits, marking only the first hit of each entry. */
export function glossParts(text: string, entries: Entry[]): (string | { word: string; entry: Entry })[] {
  const hits = entries
    .map((entry) => ({ entry, m: entry.re.exec(text) }))
    .filter((h): h is { entry: Entry; m: RegExpExecArray } => h.m !== null)
    .sort((a, b) => a.m.index - b.m.index);
  const out: (string | { word: string; entry: Entry })[] = [];
  let at = 0;
  for (const { entry, m } of hits) {
    if (m.index < at) continue; // overlaps an earlier hit
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push({ word: m[0], entry });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
