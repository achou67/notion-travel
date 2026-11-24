// Known coordinates for the saved trip map queries. Unknown places keep their original map links.
const knownCoordinates = new Map([
  ["東京国際空港 羽田空港", [35.55333, 139.78111]],
  ["ファーストキャビン羽田ターミナル1", [35.54875622, 139.78388645]],
  ["東京駅 Tokyo Station", [35.68126, 139.76714]],
  ["東京駅 新幹線 Tokyo Station", [35.68126, 139.76714]],
  ["長野駅 Nagano Station", [36.643114, 138.188058]],
  ["ホテルメトロポリタン長野 Hotel Metropolitan Nagano", [36.6428481, 138.18688378]],
  ["野沢温泉スキー場 Nozawa Onsen Snow Resort", [36.920031, 138.451976]],
  ["飯山駅 Iiyama Station", [36.8477, 138.3592]],
  ["飯山駅 千曲川口 飯山市", [36.8477, 138.3592]],
  ["和風ペンションみやざわ 野沢温泉", [36.92166237, 138.44893762]],
  ["自由劇場 Jiyu Gekijo 野沢温泉村 豊郷9791", [36.92252104, 138.44524656]],
  ["SUMINOYA YAKINIKU 炭乃家 野沢温泉", [36.923711, 138.446772]],
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
