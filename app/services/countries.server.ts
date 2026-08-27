// COUNTRIES — a deliberately dumb mirror of the app's src/lib/countries.ts.
//
// ink is an international product (Sam, 2026-08-27), so a slice can name a
// country as readily as a US state. The three copies of this table must
// agree, so they are generated from the same source text and kept boring
// enough to diff by eye.
//
// COMPLETENESS IS THE POINT: an unresolvable country fails CLOSED, so a
// missing row would mean a merchant picks their own country and quietly
// serves nobody.

const COUNTRY_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan",
  AG: "Antigua and Barbuda", AI: "Anguilla", AL: "Albania", AM: "Armenia",
  AO: "Angola", AQ: "Antarctica", AR: "Argentina", AS: "American Samoa",
  AT: "Austria", AU: "Australia", AW: "Aruba", AX: "Åland Islands",
  AZ: "Azerbaijan", BA: "Bosnia and Herzegovina", BB: "Barbados",
  BD: "Bangladesh", BE: "Belgium", BF: "Burkina Faso", BG: "Bulgaria",
  BH: "Bahrain", BI: "Burundi", BJ: "Benin", BL: "Saint Barthélemy",
  BM: "Bermuda", BN: "Brunei", BO: "Bolivia", BQ: "Caribbean Netherlands",
  BR: "Brazil", BS: "Bahamas", BT: "Bhutan", BV: "Bouvet Island",
  BW: "Botswana", BY: "Belarus", BZ: "Belize", CA: "Canada",
  CC: "Cocos (Keeling) Islands", CD: "Congo - Kinshasa",
  CF: "Central African Republic", CG: "Congo - Brazzaville",
  CH: "Switzerland", CI: "Côte d’Ivoire", CK: "Cook Islands", CL: "Chile",
  CM: "Cameroon", CN: "China", CO: "Colombia", CR: "Costa Rica", CU: "Cuba",
  CV: "Cape Verde", CW: "Curaçao", CX: "Christmas Island", CY: "Cyprus",
  CZ: "Czechia", DE: "Germany", DJ: "Djibouti", DK: "Denmark",
  DM: "Dominica", DO: "Dominican Republic", DZ: "Algeria", EC: "Ecuador",
  EE: "Estonia", EG: "Egypt", EH: "Western Sahara", ER: "Eritrea",
  ES: "Spain", ET: "Ethiopia", FI: "Finland", FJ: "Fiji",
  FK: "Falkland Islands", FM: "Micronesia", FO: "Faroe Islands",
  FR: "France", GA: "Gabon", GB: "United Kingdom", GD: "Grenada",
  GE: "Georgia", GF: "French Guiana", GG: "Guernsey", GH: "Ghana",
  GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea",
  GP: "Guadeloupe", GQ: "Equatorial Guinea", GR: "Greece",
  GS: "South Georgia and the South Sandwich Islands", GT: "Guatemala",
  GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana", HK: "Hong Kong SAR",
  HM: "Heard and McDonald Islands", HN: "Honduras", HR: "Croatia",
  HT: "Haiti", HU: "Hungary", ID: "Indonesia", IE: "Ireland",
  IL: "Israel", IM: "Isle of Man", IN: "India",
  IO: "British Indian Ocean Territory", IQ: "Iraq", IR: "Iran",
  IS: "Iceland", IT: "Italy", JE: "Jersey", JM: "Jamaica", JO: "Jordan",
  JP: "Japan", KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia",
  KI: "Kiribati", KM: "Comoros", KN: "Saint Kitts and Nevis",
  KP: "North Korea", KR: "South Korea", KW: "Kuwait", KY: "Cayman Islands",
  KZ: "Kazakhstan", LA: "Laos", LB: "Lebanon", LC: "Saint Lucia",
  LI: "Liechtenstein", LK: "Sri Lanka", LR: "Liberia", LS: "Lesotho",
  LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", LY: "Libya",
  MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro",
  MF: "Saint Martin", MG: "Madagascar", MH: "Marshall Islands",
  MK: "North Macedonia", ML: "Mali", MM: "Myanmar (Burma)", MN: "Mongolia",
  MO: "Macao SAR", MP: "Northern Mariana Islands", MQ: "Martinique",
  MR: "Mauritania", MS: "Montserrat", MT: "Malta", MU: "Mauritius",
  MV: "Maldives", MW: "Malawi", MX: "Mexico", MY: "Malaysia",
  MZ: "Mozambique", NA: "Namibia", NC: "New Caledonia", NE: "Niger",
  NF: "Norfolk Island", NG: "Nigeria", NI: "Nicaragua", NL: "Netherlands",
  NO: "Norway", NP: "Nepal", NR: "Nauru", NU: "Niue", NZ: "New Zealand",
  OM: "Oman", PA: "Panama", PE: "Peru", PF: "French Polynesia",
  PG: "Papua New Guinea", PH: "Philippines", PK: "Pakistan", PL: "Poland",
  PM: "Saint Pierre and Miquelon", PN: "Pitcairn Islands",
  PR: "Puerto Rico", PS: "Palestine", PT: "Portugal", PW: "Palau",
  PY: "Paraguay", QA: "Qatar", RE: "Réunion", RO: "Romania", RS: "Serbia",
  RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia", SB: "Solomon Islands",
  SC: "Seychelles", SD: "Sudan", SE: "Sweden", SG: "Singapore",
  SH: "St. Helena", SI: "Slovenia", SJ: "Svalbard and Jan Mayen",
  SK: "Slovakia", SL: "Sierra Leone", SM: "San Marino", SN: "Senegal",
  SO: "Somalia", SR: "Suriname", SS: "South Sudan",
  ST: "São Tomé and Príncipe", SV: "El Salvador", SX: "Sint Maarten",
  SY: "Syria", SZ: "Eswatini", TC: "Turks and Caicos Islands", TD: "Chad",
  TF: "French Southern Territories", TG: "Togo", TH: "Thailand",
  TJ: "Tajikistan", TK: "Tokelau", TL: "Timor-Leste", TM: "Turkmenistan",
  TN: "Tunisia", TO: "Tonga", TR: "Türkiye", TT: "Trinidad and Tobago",
  TV: "Tuvalu", TW: "Taiwan", TZ: "Tanzania", UA: "Ukraine", UG: "Uganda",
  UM: "U.S. Outlying Islands", US: "United States", UY: "Uruguay",
  UZ: "Uzbekistan", VA: "Vatican City", VC: "Saint Vincent and the Grenadines",
  VE: "Venezuela", VG: "British Virgin Islands", VI: "U.S. Virgin Islands",
  VN: "Vietnam", VU: "Vanuatu", WF: "Wallis and Futuna", WS: "Samoa",
  YE: "Yemen", YT: "Mayotte", ZA: "South Africa", ZM: "Zambia",
  ZW: "Zimbabwe",
};

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB", "united kingdom": "GB", "great britain": "GB", britain: "GB",
  england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  usa: "US", "u s a": "US", "united states of america": "US", america: "US",
  "the netherlands": "NL", holland: "NL",
  "south korea": "KR", "korea republic of": "KR", "republic of korea": "KR",
  "north korea": "KP",
  "russian federation": "RU", "czech republic": "CZ", turkey: "TR",
  "ivory coast": "CI", swaziland: "SZ", macedonia: "MK", burma: "MM",
  "vatican city state": "VA", "holy see": "VA", "cape verde": "CV",
  "east timor": "TL", "hong kong": "HK", macau: "MO", macao: "MO",
  "uae": "AE", "u a e": "AE", "viet nam": "VN", laos: "LA",
  "syrian arab republic": "SY", "bolivia plurinational state of": "BO",
  "venezuela bolivarian republic of": "VE", "moldova republic of": "MD",
  "tanzania united republic of": "TZ", "congo democratic republic of the": "CD",
  "brunei darussalam": "BN", "cocos islands": "CC", "keeling islands": "CC",
};

function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NAME_TO_CODE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [code, name] of Object.entries(COUNTRY_NAMES)) map[foldName(name)] = code;
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) map[foldName(alias)] = code;
  return map;
})();

/** "GB" / "gb" / "United Kingdom" / "UK" → "GB". Unknown → null. */
export function normalizeCountryCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && upper in COUNTRY_NAMES) return upper;
  return NAME_TO_CODE[foldName(trimmed)] ?? null;
}

export const COUNTRY_CODE_SET = new Set(Object.keys(COUNTRY_NAMES));
