// Known coordinates for the saved trip map queries. Unknown places keep their original map links.
const knownCoordinates = new Map([
  ["東京国際空港 羽田空港", [35.5482964, 139.7779951]],
  ["ファーストキャビン羽田ターミナル1", [35.54881, 139.7838385]],
  ["東京駅 Tokyo Station", [35.68098, 139.767057]],
  ["JR EAST Travel Service Center Tokyo Station Marunouchi North Exit", [35.6823344, 139.7661793]],
  ["東京駅 新幹線 Tokyo Station", [35.68098, 139.767057]],
  ["長野駅 Nagano Station", [36.6431243, 138.1886437]],
  ["ホテルメトロポリタン長野 Hotel Metropolitan Nagano", [36.6428174, 138.1869911]],
  ["野沢温泉スキー場 Nozawa Onsen Snow Resort", [36.920031, 138.451976]],
  ["飯山駅 Iiyama Station", [36.8455567, 138.3586613]],
  ["飯山駅 千曲川口 飯山市", [36.8455567, 138.3586613]],
  ["野沢温泉 中央ターミナル バス停", [36.9223008, 138.446064]],
  ["和風ペンションみやざわ 野沢温泉", [36.9216581, 138.4511263]],
  ["自由劇場 Jiyu Gekijo 野沢温泉村 豊郷9791", [36.92252104, 138.44524656]],
  ["SUMINOYA YAKINIKU 炭乃家 野沢温泉", [36.923711, 138.446772]],
  ["焼肉のわしの 野沢温泉村 豊郷6469-2", [36.9170835, 138.4415075]],
  ["Cafe熊の手 野沢温泉村 豊郷8971", [36.92448, 138.444735]],
  ["のざわ温泉交通 野沢温泉村 豊郷9258-8", [36.92322528, 138.44639032]],
  ["地獄谷野猿公苑 山ノ内町", [36.73314, 138.46349]],
  ["居酒屋つくしんぼ 野沢温泉村 9347", [36.92299446, 138.44809905]],
  ["成田国際空港 Narita International Airport", [35.76858, 140.38867]]
]);

function getGoogleMapUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && /^(?:www\.|maps\.)?google\.com$/.test(url.hostname)) {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

export function getGoogleMapQuery(value) {
  const url = getGoogleMapUrl(value);
  return url?.searchParams.get("query")?.trim() || url?.searchParams.get("q")?.trim() || "";
}

export function getTripCoordinates(value) {
  const url = getGoogleMapUrl(value);
  if (!url) return null;
  const query = getGoogleMapQuery(value);
  const coordinatePattern = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;
  const pinPattern = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
  const match = query.match(coordinatePattern) || url.pathname.match(pinPattern);
  if (!match) return knownCoordinates.get(query) ?? null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [latitude, longitude] : null;
}
