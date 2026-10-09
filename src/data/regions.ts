/**
 * The world in the regions travellers use, each country in exactly one (regions.test.ts checks): based on the UN
 * subregions, with those too broad for one trip split (Southern Europe into Iberia, Italy and the Balkans) and some
 * moved to where travellers go with them (Greenland with the Nordic countries, Turkey and Iran with the Middle East).
 */
export const REGIONS: { name: string; countries: string[] }[] = [
  { name: 'British Isles', countries: ['GB', 'IE', 'IM', 'JE', 'GG'] },
  { name: 'Nordic countries', countries: ['DK', 'NO', 'SE', 'FI', 'IS', 'FO', 'AX', 'GL'] },
  { name: 'Baltic States', countries: ['LT', 'LV', 'EE'] },
  { name: 'Western Europe', countries: ['FR', 'BE', 'NL', 'LU', 'MC'] },
  { name: 'Central Europe', countries: ['DE', 'AT', 'CH', 'LI', 'CZ', 'SK', 'HU', 'PL'] },
  { name: 'Iberia', countries: ['ES', 'PT', 'AD'] },
  { name: 'Italy & Malta', countries: ['IT', 'MT', 'SM', 'VA'] },
  { name: 'Balkans', countries: ['AL', 'ME', 'BA', 'RS', 'XK', 'MK', 'HR', 'SI', 'GR'] },
  { name: 'Eastern Europe', countries: ['RO', 'BG', 'MD', 'UA', 'BY'] },
  { name: 'Russia', countries: ['RU'] },
  { name: 'Caucasus', countries: ['GE', 'AM', 'AZ'] },
  { name: 'Middle East', countries: ['TR', 'CY', 'IL', 'PS', 'JO', 'LB', 'SY', 'IQ', 'IR'] },
  { name: 'Arabian Peninsula', countries: ['SA', 'AE', 'QA', 'BH', 'KW', 'OM', 'YE'] },
  { name: 'Central Asia', countries: ['KZ', 'KG', 'TJ', 'TM', 'UZ'] },
  { name: 'South Asia', countries: ['IN', 'PK', 'BD', 'NP', 'BT', 'LK', 'MV', 'AF'] },
  { name: 'East Asia', countries: ['CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'KP', 'MN'] },
  { name: 'Southeast Asia', countries: ['TH', 'VN', 'LA', 'KH', 'MM', 'MY', 'SG', 'ID', 'PH', 'BN', 'TL'] },
  { name: 'North Africa', countries: ['MA', 'DZ', 'TN', 'LY', 'EG', 'SD', 'EH'] },
  { name: 'West Africa', countries: ['SN', 'GM', 'GW', 'GN', 'SL', 'LR', 'CI', 'GH', 'TG', 'BJ', 'NG', 'NE', 'BF', 'ML', 'MR', 'CV', 'SH'] },
  { name: 'Central Africa', countries: ['CM', 'CF', 'TD', 'CG', 'CD', 'GA', 'GQ', 'ST', 'AO'] },
  { name: 'East Africa', countries: ['ET', 'ER', 'DJ', 'SO', 'KE', 'UG', 'RW', 'BI', 'TZ', 'SS'] },
  { name: 'Southern Africa', countries: ['ZA', 'NA', 'BW', 'ZW', 'ZM', 'MW', 'MZ', 'LS', 'SZ'] },
  { name: 'Indian Ocean islands', countries: ['MG', 'MU', 'SC', 'KM'] },
  { name: 'North America', countries: ['US', 'CA', 'BM', 'PM'] },
  { name: 'Mexico & Central America', countries: ['MX', 'BZ', 'GT', 'SV', 'HN', 'NI', 'CR', 'PA'] },
  { name: 'Caribbean', countries: ['CU', 'JM', 'HT', 'DO', 'PR', 'BS', 'TC', 'KY', 'VG', 'VI', 'AI', 'MF', 'SX', 'BL', 'KN', 'AG', 'MS', 'DM', 'LC', 'VC', 'BB', 'GD', 'TT', 'AW', 'CW'] },
  { name: 'South America', countries: ['CO', 'VE', 'GY', 'SR', 'EC', 'PE', 'BO', 'BR', 'PY', 'UY', 'AR', 'CL', 'FK'] },
  { name: 'Australia & New Zealand', countries: ['AU', 'NZ', 'NF'] },
  { name: 'Pacific Islands', countries: ['FJ', 'PG', 'SB', 'VU', 'NC', 'FM', 'GU', 'KI', 'MH', 'MP', 'NR', 'PW', 'WS', 'TO', 'TV', 'PF', 'CK', 'NU', 'AS', 'WF', 'PN'] },
]

/** The region a country is in. */
export const REGION_OF: Record<string, string> = Object.fromEntries(REGIONS.flatMap((r) => r.countries.map((c) => [c, r.name])))
