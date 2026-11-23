(function (global) {
'use strict';
/* ==========================================================================
   fortune.js · 命理 / 紫微 / 星盘本地计算内核（零依赖，浏览器与 Node 通用）
   --------------------------------------------------------------------------
   纯前端计算，不上传任何出生信息。所有结果仅为传统文化与天文算法的推演展示，
   不含科学预测含义，页面须保留「娱乐参考」提示。
   暴露 global.Fortune。
   ========================================================================== */

var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
var ANI = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
var MON = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
var DAYN = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
var WUXING = ['木', '火', '土', '金', '水'];
var GAN_WX = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
var GAN_YY = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
var ZHI_WX = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
var NAYIN = [
  '海中金','炉中火','大林木','路旁土','剑锋金','山头火','涧下水','城头土','白蜡金','杨柳木',
  '泉中水','屋上土','霹雳火','松柏木','长流水','沙中金','山下火','平地木','壁上土','金箔金',
  '覆灯火','天河水','大驿土','钗钏金','桑柘木','大溪水','沙中土','天上火','石榴木','大海水'
];
var NAYIN_WX = [3,1,0,2,3,1,4,2,3,0,4,2,1,0,4,3,1,0,2,3,1,4,2,3,0,4,2,1,0,4];
var JU_OF_WX = { 4: 2, 0: 3, 3: 4, 2: 5, 1: 6 };

/* 农历压缩表 1900–2050（与万年历页同源，寿星口径） */
var LUNAR_INFO = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63];
var LMIN = 1900, LMAX = 2050, LBASE = Date.UTC(1900, 0, 31), LDAY = 86400000;

function mod(n, m) { return ((n % m) + m) % m; }
function yDays(y) { var s = 348; for (var i = 0x8000; i > 0x8; i >>= 1) s += (LUNAR_INFO[y - LMIN] & i) ? 1 : 0; return s + lDays(y); }
function lLeap(y) { return LUNAR_INFO[y - LMIN] & 0xf; }
function lDays(y) { return lLeap(y) ? ((LUNAR_INFO[y - LMIN] & 0x10000) ? 30 : 29) : 0; }
function mDays(y, m) { return (LUNAR_INFO[y - LMIN] & (0x10000 >> m)) ? 30 : 29; }

function solarToLunar(y, m, d) {
  if (y < LMIN || y > LMAX) return null;
  var off = Math.floor((Date.UTC(y, m - 1, d) - LBASE) / LDAY);
  if (off < 0) return null;
  var i, temp = 0;
  for (i = LMIN; i <= LMAX && off > 0; i++) { temp = yDays(i); off -= temp; }
  if (off < 0) { off += temp; i--; }
  var ly = i, leap = lLeap(ly), isLeap = false, month;
  for (month = 1; month < 13 && off > 0; month++) {
    if (leap > 0 && month === leap + 1 && !isLeap) { month--; isLeap = true; temp = lDays(ly); } else temp = mDays(ly, month);
    if (isLeap && month === leap + 1) isLeap = false;
    off -= temp;
  }
  if (off === 0 && leap > 0 && month === leap + 1) { if (isLeap) isLeap = false; else { isLeap = true; month--; } }
  if (off < 0) { off += temp; month--; }
  var ld = off + 1;
  return {
    year: ly, month: month, day: ld, leap: isLeap,
    lub: (isLeap ? '闰' : '') + MON[month - 1] + '月', dayName: DAYN[ld - 1],
    gz: GAN[mod(ly - 4, 10)] + ZHI[mod(ly - 4, 12)], ani: ANI[mod(ly - 4, 12)]
  };
}

/* 六十甲子序号：n % 10 = 天干，n % 12 = 地支 */
function gzIndex(stem, branch) { return mod(stem * 6 - branch * 5, 60); }
function ganzhi(stem, branch) { return GAN[stem] + ZHI[branch]; }
function stemOfYear(y) { return mod(y - 4, 10); }
function zodiacOfYear(y) { return mod(y - 4, 12); }

/* 八字：年柱以立春（约 2/4）换年，月柱以节气 approx 边界换月 */
var JIE_BOUND = [6, 4, 6, 5, 6, 6, 7, 8, 8, 8, 7, 7];
var JIE_BRANCH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
function yearStemForBazi(y, m, d) { return stemOfYear(m < 2 || (m === 2 && d < 4) ? y - 1 : y); }
function monthPillar(y, m, d, yearStem) {
  var bi = JIE_BRANCH[m - 1];
  if (d < JIE_BOUND[m - 1]) bi = mod(bi - 1, 12);
  var ordinal = mod(bi - 2, 12) + 1;
  var si = mod((yearStem % 5) * 2 + ordinal + 1, 10);
  return { stem: si, branch: bi, ordinal: ordinal };
}
function julianDay(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 2440587.5; }
function dayPillar(y, m, d) { var n = mod(Math.floor(julianDay(y, m, d)) - 2451550, 60); return { stem: mod(n, 10), branch: mod(n, 12), index: n }; }
function hourPillar(hour, dayStem) { var bi = mod(Math.floor((hour + 1) / 2), 12); return { stem: mod((dayStem % 5) * 2 + bi, 10), branch: bi }; }
function hiddenStems(branch) {
  var table = [[0],[1,2],[2,4,0],[3],[4,6,2],[5,7,3],[6,4,2],[7,5,3],[8,9,4],[9],[10,8,6],[11,0,2]];
  return table[branch];
}
function tenGod(dayStem, other) {
  if (GAN_WX[other] === GAN_WX[dayStem]) return GAN_YY[other] === GAN_YY[dayStem] ? '比肩' : '劫财';
  if (GAN_WX[dayStem] === mod(GAN_WX[other] - 1, 5)) return GAN_YY[other] === GAN_YY[dayStem] ? '偏印' : '正印';
  if (GAN_WX[other] === mod(GAN_WX[dayStem] + 1, 5)) return GAN_YY[other] === GAN_YY[dayStem] ? '食神' : '伤官';
  if (GAN_WX[other] === mod(GAN_WX[dayStem] + 2, 5)) return GAN_YY[other] === GAN_YY[dayStem] ? '偏财' : '正财';
  return GAN_YY[other] === GAN_YY[dayStem] ? '七杀' : '正官';
}
function bazi(y, m, d, hour) {
  var ys = yearStemForBazi(y, m, d);
  var yb = mod(y - (m < 2 || (m === 2 && d < 4) ? 1 : 0) - 4, 12);
  var mp = monthPillar(y, m, d, ys), dp = dayPillar(y, m, d), hp = hourPillar(hour, dp.stem);
  var pillars = [
    { name: '年柱', stem: ys, branch: yb },
    { name: '月柱', stem: mp.stem, branch: mp.branch },
    { name: '日柱', stem: dp.stem, branch: dp.branch },
    { name: '时柱', stem: hp.stem, branch: hp.branch }
  ];
  var count = [0, 0, 0, 0, 0], detail = [];
  pillars.forEach(function (p, i) {
    var hs = hiddenStems(p.branch);
    count[GAN_WX[p.stem]]++;
    count[ZHI_WX[p.branch]]++;
    detail.push({ name: p.name, gz: ganzhi(p.stem, p.branch), nayin: NAYIN[Math.floor(gzIndex(p.stem, p.branch) / 2)],
      hidden: hs.map(function (s) { return GAN[s] + '(' + tenGod(dp.stem, s) + ')'; }).join(' '),
      god: i === 2 ? '日主' : tenGod(dp.stem, p.stem) });
  });
  var dayWx = GAN_WX[dp.stem];
  var support = count[mod(dayWx - 1, 5)] + count[mod(dayWx - 4, 5)];
  var drain = count[mod(dayWx + 1, 5)] + count[mod(dayWx + 2, 5)] + count[mod(dayWx + 3, 5)];
  return { pillars: pillars, detail: detail, count: count, dayStem: dp.stem, dayName: GAN[dp.stem],
    dayWx: WUXING[dayWx], support: support, drain: drain,
    tendency: support > drain ? '偏旺' : (support < drain ? '偏弱' : '中和'),
    lunar: solarToLunar(y, m, d), zodiac: ANI[yb] };
}

/* 紫微斗数：命宫 / 身宫 / 十二宫 / 五行局 / 十四主星 + 文昌文曲左辅右弼 */
var PALACE_NAMES = ['命宫','兄弟','夫妻','子女','财帛','疾厄','迁移','交友','官禄','田宅','福德','父母'];
var ZIWEI_SERIES = { 0: '紫微', 1: '天机', 3: '太阳', 4: '武曲', 5: '天同', 8: '廉贞' };
var TIANFU_SERIES = { 0: '天府', 1: '太阴', 2: '贪狼', 3: '巨门', 4: '天相', 5: '天梁', 6: '七杀', 9: '破军' };
function ziwei(y, m, d, hour) {
  var lun = solarToLunar(y, m, d);
  if (!lun) return null;
  var lm = lun.month, ld = lun.day;
  var yStem = stemOfYear(y);
  var hi = mod(Math.floor((hour + 1) / 2), 12);
  var ming = mod(2 + lm - 1 - hi, 12);
  var shen = mod(2 + lm - 1 + hi, 12);
  var yinStem = mod((yStem % 5) * 2 + 2, 10);
  var palaceStem = function (bi) { return mod(yinStem + mod(bi - 2, 12), 10); };
  var mingStem = palaceStem(ming);
  var nayinIdx = Math.floor(gzIndex(mingStem, ming) / 2);
  var ju = JU_OF_WX[NAYIN_WX[nayinIdx]] || 5;
  var x = mod(-ld, ju), q = (ld + x) / ju;
  var zi = mod(2 + q - 1 + (x % 2 ? -x : x), 12);
  var fu = mod(10 - zi, 12);
  var stars = new Array(12);
  for (var i = 0; i < 12; i++) stars[i] = [];
  Object.keys(ZIWEI_SERIES).forEach(function (k) { stars[mod(zi - Number(k), 12)].push(ZIWEI_SERIES[k]); });
  Object.keys(TIANFU_SERIES).forEach(function (k) { stars[mod(fu + Number(k), 12)].push(TIANFU_SERIES[k]); });
  stars[mod(10 - hi, 12)].push('文昌');
  stars[mod(4 + hi, 12)].push('文曲');
  stars[mod(4 + lm - 1, 12)].push('左辅');
  stars[mod(10 - (lm - 1), 12)].push('右弼');
  var palaces = [];
  for (var k = 0; k < 12; k++) {
    var bi = mod(ming - k, 12);
    palaces.push({ name: PALACE_NAMES[k], branch: bi, stem: palaceStem(bi), ganzhi: ganzhi(palaceStem(bi), bi),
      stars: stars[bi], isMing: k === 0, isShen: bi === shen, hourBranch: ZHI[bi] });
  }
  return { lunar: lun, ming: ming, shen: shen, ju: ju, juName: ['','','水二局','木三局','金四局','土五局','火六局'][ju],
    nayin: NAYIN[nayinIdx], ziwei: zi, tianfu: fu, palaces: palaces, yearStem: yStem };
}

/* ---------- 天文：行星/geocentric 黄经、月轮、上升 ---------- */
var RAD = Math.PI / 180, DEG = 180 / Math.PI;
function norm360(x) { return mod(x, 360); }
var ELEM = {
  mercury: { a:[0.38709927,0.00000037], e:[0.20563593,0.00001906], I:[7.00497902,-0.00594749], L:[252.25032350,149472.67411175], pi:[77.45779628,0.16047689], node:[48.33076593,-0.12534081] },
  venus:   { a:[0.72333566,0.00000390], e:[0.00677672,-0.00004107], I:[3.39467605,-0.00078890], L:[181.97909950,58517.81538729], pi:[131.60246718,0.00268329], node:[76.67984255,-0.27769418] },
  earth:   { a:[1.00000261,0.00000562], e:[0.01671123,-0.00004392], I:[-0.00001531,-0.01294668], L:[100.46457166,35999.37244981], pi:[102.93768193,0.32327364], node:[0,0] },
  mars:    { a:[1.52371034,0.00001847], e:[0.09339410,0.00007882], I:[1.84969142,-0.00813131], L:[-4.55343205,19140.30268499], pi:[-23.94362959,0.44441088], node:[49.55953891,-0.29257343] },
  jupiter: { a:[5.20288700,-0.00011607], e:[0.04838624,-0.00013253], I:[1.30439695,-0.00183714], L:[34.39644051,3034.74612775], pi:[14.72847983,0.21252668], node:[100.47390909,0.20469106] },
  saturn:  { a:[9.53667594,-0.00125060], e:[0.05386179,-0.00050991], I:[2.48599187,0.00193609], L:[49.95424423,1222.49362201], pi:[92.59887831,-0.41897216], node:[113.66242448,-0.28867794] },
  uranus:  { a:[19.18916464,-0.00196176], e:[0.04725744,-0.00004397], I:[0.77263783,-0.00242939], L:[313.23810451,428.48202785], pi:[170.95427630,0.40805281], node:[74.01692503,0.04240589] },
  neptune: { a:[30.06992276,0.00026291], e:[0.00859048,0.00005105], I:[1.77004347,0.00035372], L:[-55.12002969,218.45945325], pi:[44.96476227,-0.32241464], node:[131.78422574,-0.00508664] },
  pluto:   { a:[39.48211675,-0.00031596], e:[0.24882730,0.00005170], I:[17.14001206,0.00004818], L:[238.92903833,145.20780515], pi:[224.06891629,-0.04062942], node:[110.30393684,-0.01183482] }
};
function kepler(M, e) {
  var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (var i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}
function helio(key, T) {
  var el = ELEM[key];
  var a = el.a[0] + el.a[1] * T, e = el.e[0] + el.e[1] * T;
  var I = (el.I[0] + el.I[1] * T) * RAD;
  var M = norm360(el.L[0] + el.L[1] * T - el.pi[0] - el.pi[1] * T) * RAD;
  if (M > Math.PI) M -= 2 * Math.PI;
  var E = kepler(M, e);
  var xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  var w = (el.pi[0] + el.pi[1] * T - el.node[0] - el.node[1] * T) * RAD;
  var node = (el.node[0] + el.node[1] * T) * RAD;
  var cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(I), si = Math.sin(I);
  return { x: (cw*cn - sw*sn*ci)*xv + (-sw*cn - cw*sn*ci)*yv,
           y: (cw*sn + sw*cn*ci)*xv + (-sw*sn + cw*cn*ci)*yv,
           z: sw*si*xv + cw*si*yv };
}
function planetLon(key, jd) {
  var T = (jd - 2451545.0) / 36525;
  var e = helio('earth', T);
  if (key === 'sun') return norm360(Math.atan2(e.y, e.x) * DEG + 180);
  var p = helio(key, T);
  return norm360(Math.atan2(p.y - e.y, p.x - e.x) * DEG);
}
function moonLon(jd) {
  var d = jd - 2451545.0;
  var L = 218.316 + 13.176396 * d, M = 134.963 + 13.064993 * d;
  var F = 93.272 + 13.229350 * d, S = 357.529 + 0.9856003 * d;
  var lambda = L + 6.289*Math.sin(M*RAD) + 1.274*Math.sin((2*L-M)*RAD) + 0.658*Math.sin(2*M*RAD)
    + 0.214*Math.sin(2*F*RAD) - 0.186*Math.sin(S*RAD) - 0.059*Math.sin((2*L-2*M)*RAD)
    - 0.057*Math.sin((L-2*M+S)*RAD) + 0.053*Math.sin((L+2*M)*RAD) + 0.046*Math.sin((2*L-S)*RAD)
    + 0.041*Math.sin((L-S)*RAD) - 0.035*Math.sin((L+F)*RAD) - 0.031*Math.sin((2*F-2*M)*RAD)
    - 0.015*Math.sin((L-2*F)*RAD) + 0.011*Math.sin((L-2*S)*RAD);
  return norm360(lambda);
}
function gmst(jd) {
  var d = jd - 2451545.0, T = d / 36525;
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000);
}
function angles(jd, lat, lon) {
  var theta = norm360(gmst(jd) + lon) * RAD;
  var eps = 23.4393 * RAD;
  var asc = norm360(Math.atan2(-Math.cos(theta), Math.sin(theta) * Math.cos(lat * RAD) + Math.tan(eps) * Math.sin(lat * RAD)) * DEG);
  var mc = norm360(Math.atan2(Math.sin(theta), Math.cos(theta) * Math.cos(eps)) * DEG);
  return { asc: asc, mc: mc };
}

var SIGNS = ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
var SIGN_GLYPH = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
var PLANETS = [
  { key: 'sun', name: '太阳', glyph: '☉' }, { key: 'moon', name: '月亮', glyph: '☽' },
  { key: 'mercury', name: '水星', glyph: '☿' }, { key: 'venus', name: '金星', glyph: '♀' },
  { key: 'mars', name: '火星', glyph: '♂' }, { key: 'jupiter', name: '木星', glyph: '♃' },
  { key: 'saturn', name: '土星', glyph: '♄' }, { key: 'uranus', name: '天王星', glyph: '♅' },
  { key: 'neptune', name: '海王星', glyph: '♆' }, { key: 'pluto', name: '冥王星', glyph: '♇' }
];
function signIndex(lon) { return Math.floor(norm360(lon) / 30); }
function degreeInSign(lon) { return Math.floor(norm360(lon) % 30); }
function natal(y, m, d, hour, minute, lat, lon, tz) {
  var utcMs = Date.UTC(y, m - 1, d, hour, minute) - (tz || 8) * 3600000;
  var jd = utcMs / 86400000 + 2440587.5;
  var ang = angles(jd, lat, lon);
  var planets = PLANETS.map(function (p) {
    var v = p.key === 'moon' ? moonLon(jd) : planetLon(p.key, jd);
    var si = signIndex(v);
    return { name: p.name, glyph: p.glyph, lon: v, sign: SIGNS[si], signGlyph: SIGN_GLYPH[si],
      degree: degreeInSign(v), house: mod(si - signIndex(ang.asc), 12) + 1 };
  });
  return { jd: jd, asc: ang.asc, mc: ang.mc, ascSign: SIGNS[signIndex(ang.asc)], mcSign: SIGNS[signIndex(ang.mc)],
    ascGlyph: SIGN_GLYPH[signIndex(ang.asc)], planets: planets,
    sun: planets[0].sign, moon: planets[1].sign, rising: SIGNS[signIndex(ang.asc)] };
}

/* ---------- 星座运势：日期 + 星座确定性生成，离线可用 ---------- */
function hash32(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  var s = seed >>> 0;
  return function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
var COLORS = ['珊瑚红','雾霾蓝','奶油白','森林绿','香槟金','薰衣草紫','石墨灰','天空蓝'];
var DIRECTIONS = ['东','南','西','北','东南','西南','西北','东北'];
var ADVICE = [
  '把最重要的一件事放在上午，后续会顺很多。','别急着下结论，今晚再看看会有新发现。','主动联系一位久未联络的朋友，消息会带来机会。',
  '给自己留半小时独处，灵感就在安静里。','财务上宜保守，冲动消费容易后悔。','把大目标拆成三小步，今天先迈第一步。',
  '耐心听完不同意见，你会拿到关键信息。','身体比计划诚实，早点休息胜过硬撑。'
];
function horoscope(sign, dateKey) {
  var r = rng(hash32('fortune|' + sign + '|' + dateKey));
  var star = function () { return 1 + Math.floor(r() * 5); };
  return { date: dateKey, sign: sign,
    scores: { overall: star(), love: star(), career: star(), money: star(), health: star() },
    color: COLORS[Math.floor(r() * COLORS.length)], number: 1 + Math.floor(r() * 9),
    direction: DIRECTIONS[Math.floor(r() * DIRECTIONS.length)], advice: ADVICE[Math.floor(r() * ADVICE.length)] };
}

/* ---------- 生肖配对 ---------- */
var LIUHE = [[0,1],[2,11],[3,10],[4,9],[5,8],[6,7]];
var SANHE = [[0,4,8],[1,5,9],[2,6,10],[3,7,11]];
var CHONG = [[0,6],[1,7],[2,8],[3,9],[4,10],[5,11]];
var HAI = [[0,7],[1,6],[2,5],[3,4],[8,11],[9,10]];
function pairKind(a, b) {
  function has(list) { return list.some(function (g) { return g.indexOf(a) >= 0 && g.indexOf(b) >= 0; }); }
  if (a === b) return [3, 6, 9, 11].indexOf(a) >= 0
    ? { name: '同生肖·自刑', score: 55, desc: '同生肖又逢自刑，容易内耗，宜把情绪讲出来而非憋着。' }
    : { name: '同生肖', score: 72, desc: '同频共振，容易互相理解，但也要注意别把相同的小毛病放大。' };
  if (has(LIUHE)) return { name: '六合', score: 92, desc: '六合是最紧密的搭配，彼此天然互补，相处省力。' };
  if (has(SANHE)) return { name: '三合', score: 88, desc: '三合是稳定的合力关系，目标一致时进展很快。' };
  if (has(CHONG)) return { name: '相冲', score: 52, desc: '节奏与表达方式差异较大，需要更多耐心和边界感。' };
  if (has(HAI)) return { name: '相害', score: 58, desc: '容易因误会消耗感情，把话讲明白比猜心更有效。' };
  return { name: '平和', score: 76, desc: '无明显冲合，关系走向更多取决于具体的人与经营方式。' };
}
function zodiacMatch(y1, y2) {
  var a = zodiacOfYear(y1), b = zodiacOfYear(y2);
  var k = pairKind(a, b);
  var na1 = NAYIN_WX[Math.floor(gzIndex(mod(y1 - 4, 10), mod(y1 - 4, 12)) / 2)];
  var na2 = NAYIN_WX[Math.floor(gzIndex(mod(y2 - 4, 10), mod(y2 - 4, 12)) / 2)];
  var wxRel = na1 === na2 ? '同类五行' : (na1 === mod(na2 + 1, 5) ? '五行相生' : (na2 === mod(na1 + 1, 5) ? '五行相生' : '五行相克'));
  return { a: ANI[a], b: ANI[b], aYear: GAN[mod(y1-4,10)] + ZHI[mod(y1-4,12)], bYear: GAN[mod(y2-4,10)] + ZHI[mod(y2-4,12)],
    kind: k.name, score: k.score, desc: k.desc, wxRel: wxRel,
    wx: WUXING[na1] + ' / ' + WUXING[na2] };
}

/* ---------- 塔罗：22 大阿尔卡那（正逆位关键词） ---------- */
var TAROT = [
  ['愚者','新的开始、自由、冒险','鲁莽、逃避承诺'],['魔术师','创造力、行动力、资源齐备','操弄、能力未发挥'],
  ['女祭司','直觉、静默、内在智慧','忽视直觉、秘密浮现'],['女皇','丰盛、滋养、创造','过度依赖、停滞'],
  ['皇帝','秩序、责任、稳定','专断、僵化'],['教皇','学习、传统、指引','盲从、教条'],
  ['恋人','抉择、结合、价值观一致','犹豫、失衡'],['战车','意志、前进、掌控','失控、急躁'],
  ['力量','勇气、温柔的坚定','自我怀疑、蛮力'],['隐者','独处、内省、寻找答案','孤立、逃避现实'],
  ['命运之轮','转机、周期、顺势而为','停滞、抗拒改变'],['正义','平衡、公正、因果','偏见、逃避责任'],
  ['倒吊人','换个角度、耐心等待','无谓牺牲、拖延'],['死神','结束与重生、断舍离','抗拒改变、迟迟不放'],
  ['节制','调和、节奏、耐心','失衡、极端'],['恶魔','欲望、束缚、执念','挣脱、看清真相'],
  ['高塔','突变、旧结构崩解','危机被推迟、恐惧'],['星星','希望、疗愈、灵感','信心不足、迷茫'],
  ['月亮','潜意识、迷雾、不安','真相渐显、走出困惑'],['太阳','喜悦、清晰、成功','暂时阴霾、期待过高'],
  ['审判','觉醒、总结、重新出发','自我批评、迟迟不行动'],['世界','圆满、整合、阶段完成','收尾未竟、缺乏闭环']
];
function tarotDraw(seed, count) {
  var r = rng(hash32('tarot|' + seed));
  var pool = TAROT.map(function (c, i) { return i; });
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, count).map(function (idx, k) {
    var reversed = r() < 0.42;
    return { index: idx, name: TAROT[idx][0], numeral: ['0','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI'][idx],
      reversed: reversed, meaning: reversed ? TAROT[idx][2] : TAROT[idx][1], position: ['过去','现在','未来','建议'][k] };
  });
}

var F = {
  GAN: GAN, ZHI: ZHI, WUXING: WUXING, SIGNS: SIGNS, PLANETS: PLANETS,
  solarToLunar: solarToLunar, bazi: bazi, ziwei: ziwei, natal: natal,
  horoscope: horoscope, zodiacOfYear: zodiacOfYear, zodiacMatch: zodiacMatch, tarotDraw: tarotDraw,
  signIndex: signIndex, tenGod: tenGod, ganzhi: ganzhi
};
global.Fortune = F;
if (typeof module !== 'undefined' && module.exports) module.exports = F;
})(typeof window !== 'undefined' ? window : globalThis);
