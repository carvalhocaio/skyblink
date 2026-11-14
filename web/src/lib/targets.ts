// `simbad` must resolve in SIMBAD (it enables the catalog prediction); the API saves results per name.
export const TARGETS = [
  { name: "Barnard's Star", ra: 269.4462, dec: 4.7682, simbad: "Barnard's star", moves: true },
  { name: "Epsilon Indi B", ra: 331.0967, dec: -56.8007, simbad: "eps Ind B", moves: true },
  { name: "WISE 0855", ra: 133.7601, dec: -7.2423, simbad: "WISE J085510.83-071442.5", moves: true },
  { name: "RW Aurigae", ra: 76.9562, dec: 30.4012, simbad: "RW Aur", moves: false },
  { name: "R Draconis", ra: 248.1675, dec: 66.755, simbad: "R Dra", moves: false },
];

export const findTarget = (ra?: number, dec?: number) => TARGETS.find((t) => t.ra === ra && t.dec === dec);
