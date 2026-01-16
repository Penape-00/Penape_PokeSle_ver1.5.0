// ==================================================
//  ▼ おてつだい時間の計算
// ==================================================

/**
 * おてつだい時間（1回）を計算する
 *
 * @param {number} baseTime - ポケモン固有の基礎おてつだい時間
 * @param {number} level - ポケモンのレベル
 * @param {object} nature - 性格補正（speed, ingredient, skill, genki）
 * @param {number} subSpeed - サブスキル（おてスピ）
 * @param {number} teamBonus - おてボ合計
 * @param {string} exType - EX適正（main / sub / none）
 * @param {number} campTicket - キャンプ補正
 *
 * @returns {{standardHelpTime:number, helpTime:number}}
 */
function calcHelpTime(baseTime, level, nature, subSpeed, teamBonus, exType, campTicket) {

  // STEP 1: 性格補正（おてスピ）
  const natureSpeed = nature.speed;

  // STEP 2: おてスピ補正（サブスキ + おてボ → 最大35%）
  let totalSpeedUp = subSpeed + teamBonus * 0.05;
  if (totalSpeedUp > 0.35) totalSpeedUp = 0.35;
  const speedFactor = 1 - totalSpeedUp;

  // STEP 3: Lv による短縮
  const levelFactor = 1 - (level - 1) * 0.002;

  // STEP 4: 標準おてつだい時間（切り捨て）
  const standardHelpTime = Math.floor(
    baseTime * levelFactor * natureSpeed * speedFactor
  );

  // STEP 5: EX適正補正
  let exFactor = 1.0;
  if (exType === "main") exFactor = 0.909;
  if (exType === "sub")  exFactor = 1.0;
  if (exType === "none") exFactor = 1.15;

  // STEP 6: キャンプ補正
  const campFactor = 1 / campTicket;

  // STEP 7: 性格ごとの元気補正
  const genkiFactor = nature.genki;

  // STEP 8: 実際のおてつだい時間
  const helpTime = standardHelpTime * exFactor * campFactor * genkiFactor;

  return { standardHelpTime, helpTime };
}

/**
 * EX適正が有効かどうか
 */
function isEXActive(exType) {
  return exType === "main" || exType === "sub";
}

// ==================================================
//  ▼ きのみエナジー計算
// ==================================================

/**
 * 1回のおてつだいで得られるきのみエナジーを計算
 */
function calcBerryEnergy(level, baseBerryEnergy, baseBerryCount, fieldBerryBonus, berryCountSkill, fieldBonus, exBonus, tokuiType, exType) {

  // STEP 1: 基礎エナジー成長（線形 or 指数 → 大きい方）
  const A = baseBerryEnergy + (level - 1);
  const B = baseBerryEnergy * Math.pow(1.025, (level - 1));
  let energy = Math.max(A, B);

  // STEP 2: フィールド適正補正
  energy *= fieldBerryBonus;

  // STEP 3: EXボーナス
  if (exBonus === "exberry" && isEXActive(exType)) {
    energy *= 1.2;
  }

  // STEP 4: フィールドボーナス
  energy *= (1 + fieldBonus / 100);

  // STEP 5: 四捨五入
  const roundedEnergy = Math.round(energy);

  // STEP 6: きのみ数（得意タイプ + スキル）
  const isTokuiBerry = (tokuiType === "きのみ" || tokuiType === "オール");
  const berryCount = baseBerryCount + (isTokuiBerry ? 1 : 0) + berryCountSkill;

  // STEP 7: 最終エナジー
  return roundedEnergy * berryCount;
}

// ==================================================
//  ▼ 食材計算
// ==================================================

/**
 * 1日あたりの食材獲得期待値を計算
 */
function calcIngredientPerDay(pokemonName, level, baseIngredientRate, nature, subIng, exBonus, tokuiType, exType, ingredientLv1, ingredientLv30, ingredientLv60, actionsPerDay) {

  // STEP 1: 有効スロットの列挙
  const slots = [];
  if (ingredientLv1) slots.push({ ingredient: ingredientLv1, unlockLevel: 1 });
  if (level >= 30 && ingredientLv30) slots.push({ ingredient: ingredientLv30, unlockLevel: 30 });
  if (level >= 60 && ingredientLv60) slots.push({ ingredient: ingredientLv60, unlockLevel: 60 });

  const slotCount = slots.length;
  if (slotCount === 0) return {};

  // STEP 2: 食材確率
  const ingredientRate =
    baseIngredientRate *
    nature.ingredient *
    (1 + subIng);

  // STEP 3: EX食材ボーナス
  const isExIngredient = (exBonus === "exingredient" && isEXActive(exType));
  const isTokuiIngredient = (tokuiType === "食材" || tokuiType === "オール");
  let exExtraPerProc = 0;
  if (isExIngredient) {
    exExtraPerProc = 1 + (isTokuiIngredient ? 0.5 : 0);
  }

  // STEP 4: 基礎個数集計
  const ingredientBaseSum = {};
  const ingredientSlotCount = {};

  const pokemonCounts = ingredientCounts[pokemonName] || {};

  slots.forEach(slot => {
    const ingName = slot.ingredient;
    const ingData = pokemonCounts[ingName];
    if (!ingData) return;

    const baseCount = ingData[slot.unlockLevel] || 0;

    if (!ingredientBaseSum[ingName]) {
      ingredientBaseSum[ingName] = 0;
      ingredientSlotCount[ingName] = 0;
    }

    ingredientBaseSum[ingName] += baseCount;
    ingredientSlotCount[ingName] += 1;
  });

  // STEP 5: 1日獲得期待値
  const result = {};

  Object.keys(ingredientBaseSum).forEach(ingName => {
    const sumBaseCount = ingredientBaseSum[ingName];
    const slotNum = ingredientSlotCount[ingName];

    const expectedPerHelp =
      ingredientRate *
      (1 / slotCount) *
      (sumBaseCount + slotNum * exExtraPerProc);

    result[ingName] = expectedPerHelp * actionsPerDay;
  });

  return result;
}

// ==================================================
//  ▼ スキル発動計算
// ==================================================

/**
 * 1日のスキル発動回数を計算
 */
function calcSkillPerDay(baseSkillRate, nature, subSkill, exBonus, exType, actionsPerDay) {

  // STEP 1: 性格補正
  const natureFactor = nature.skill;

  // STEP 2: サブスキル補正
  const subSkillFactor = 1 + subSkill;

  // STEP 3: EX補正
  const exFactor = (exBonus === "exskill" && isEXActive(exType)) ? 1.25 : 1.0;

  // STEP 4: 最終発動率
  const finalSkillRate =
      baseSkillRate *
      natureFactor *
      subSkillFactor *
      exFactor;

  return actionsPerDay * finalSkillRate;
}

// ==================================================
//  ▼ メイン計算（calculate）
// ==================================================

function calculate() {

  // STEP 1: ポケモン選択
  const selected = document.getElementById("pokemonSelect").value;
  if (!selected) {
    alert("ポケモンを選択してください");
    return;
  }

  const [name, type, tokui, baseTimeStr, berryEnergyBaseStr, ingRateStr, skillRateStr] =
    selected.split("|");

  const level = parseInt(document.getElementById("level").value);

  // STEP 2: 性格
  const natureKey = document.getElementById("natureSelect").value;
  const nature = natureModifiers[natureKey] || {
    speed: 1.0,
    ingredient: 1.0,
    skill: 1.0,
    genki: 0.492
  };

  // STEP 3: サブスキル
  const subSpeed = parseFloat(document.getElementById("subskillSpeed").value);
  const subIng = parseFloat(document.getElementById("subskillIngredient").value);
  const subSkill = parseFloat(document.getElementById("subskillSkill").value);
  const berryCountSkill = parseInt(document.getElementById("berryCountSkill").value);
  const teamBonus = parseInt(document.getElementById("teamBonus").value);

  // STEP 4: フィールド・キャンプ
  const fieldBonus = parseFloat(document.getElementById("fieldBonus").value);
  const fieldBerryBonus = parseFloat(document.getElementById("fieldBerryBonus").value);
  const campTicket = parseFloat(document.getElementById("campTicket").value);

  // STEP 5: EX
  const exType = document.getElementById("EXtype").value;
  const exBonus = document.getElementById("EXBonus").value;

  // STEP 6: 食材スロット
  const ingredientLv1 = document.getElementById("ingredientLv1").value;
  const ingredientLv30 = document.getElementById("ingredientLv30").value;
  const ingredientLv60 = document.getElementById("ingredientLv60").value;

  // STEP 7: おてつだい時間
  const { standardHelpTime, helpTime } = calcHelpTime(parseFloat(baseTimeStr), level, nature, subSpeed, teamBonus, exType, campTicket);

  // STEP 8: 1日の行動回数
  const actionsPerDay = 86400 / helpTime;

  // STEP 9: きのみエナジー（1回）
  const berryEnergyPerHelp = calcBerryEnergy(level, parseFloat(berryEnergyBaseStr), 1, fieldBerryBonus, berryCountSkill, fieldBonus, exBonus, tokui, exType);

  // STEP 10: きのみエナジー（通常）
  const finalIngredientRate =
    parseFloat(ingRateStr) * nature.ingredient * (1 + subIng);

  const berryEnergyPerDay =
    berryEnergyPerHelp * actionsPerDay * (1 - finalIngredientRate);

  // STEP 11: きのみのみモード
  const berryOnlyEnergyPerDay =
    berryEnergyPerHelp * actionsPerDay;

  // STEP 12: スキル発動
  const skillPerDay = calcSkillPerDay(parseFloat(skillRateStr), nature, subSkill, exBonus, exType, actionsPerDay);

  // STEP 13: 食材計算
  const ingredientPerDayMap = calcIngredientPerDay(name, level, parseFloat(ingRateStr), nature, subIng, exBonus, tokui, exType, ingredientLv1, ingredientLv30, ingredientLv60, actionsPerDay);

  // STEP 14: 食材エナジー集計
  let ingredientEnergyTotal = 0;
  let ingredientRows = "";

  Object.keys(ingredientPerDayMap).forEach(ingName => {
    const count = ingredientPerDayMap[ingName];
    const baseEnergy = ingredientEnergy[ingName] || 0;
    const boostedEnergy = baseEnergy * (1 + fieldBonus / 100);
    const totalEnergy = count * boostedEnergy;

    ingredientEnergyTotal += totalEnergy;

    ingredientRows += `
      <tr>
        <td>${ingName}</td>
        <td>${count.toFixed(2)}</td>
        <td>${totalEnergy.toFixed(1)}</td>
      </tr>
    `;
  });

  if (!ingredientRows) {
    ingredientRows = `<tr><td colspan="3">（食材なし）</td></tr>`;
  }

  // STEP 15: 総合エナジー
  const totalEnergy = Math.round(berryEnergyPerDay + ingredientEnergyTotal);

  // STEP 16: 出力
  document.getElementById("summary").innerHTML = `
    <p><strong>おてつだい時間:</strong> ${helpTime.toFixed(1)} 秒（標準: ${standardHelpTime} 秒）</p>
    <p><strong>きのみエナジー（通常）:</strong> ${Math.round(berryEnergyPerDay)} energy/day</p>
    <p><strong>きのみエナジー（きのみのみ）:</strong> ${Math.round(berryOnlyEnergyPerDay)} energy/day</p>
    <p><strong>スキル発動:</strong> ${skillPerDay.toFixed(2)} 回/day</p>
    <p><strong>食材エナジー:</strong> ${ingredientEnergyTotal.toFixed(1)} energy/day</p>
    <p><strong>総合エナジー:</strong> ${totalEnergy} energy/day</p>
  `;

  document.getElementById("tableArea").innerHTML = `
    <h3>1日あたりの食材内訳</h3>
    <table>
      <tr><th>食材</th><th>個数/day</th><th>合計エナジー/day</th></tr>
      ${ingredientRows}
    </table>
  `;
}

// ==================================================
//  ▼ イベントリスナー
// ==================================================

document.getElementById("calcBtn").addEventListener("click", calculate);