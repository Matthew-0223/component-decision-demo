"use strict";

// All candidates, scores and evidence IDs below are synthetic test data.
// Edit this object to change the demo; it contains no real library assessments.
const DEMOS = {
  json: {
    title: "JSON 处理库", environments: ["Java 17", "Java 21"],
    advancedLabel: "必须支持流式解析（示例条件）",
    candidates: [
      { id: "J-A", name: "JSON 库 A", version: "演示 v1.0", environments: { "Java 17": true, "Java 21": true }, advanced: true, performance: 85, ease: 60 },
      { id: "J-B", name: "JSON 库 B", version: "演示 v1.0", environments: { "Java 17": true, "Java 21": false }, advanced: null, performance: 65, ease: 95 }
    ]
  },
  database: {
    title: "数据库", environments: ["Linux", "Windows"],
    advancedLabel: "必须满足指定事务条件（示例条件）",
    candidates: [
      { id: "D-A", name: "数据库 A", version: "演示 v1.0", environments: { Linux: true, Windows: false }, advanced: true, performance: 90, ease: 55 },
      { id: "D-B", name: "数据库 B", version: "演示 v1.0", environments: { Linux: true, Windows: true }, advanced: null, performance: 70, ease: 90 }
    ]
  }
};
const RULES_VERSION = "static-demo-1";
const STORAGE_KEY = "component-decision-history-v1";
const STATUS = { satisfied: "合格", violated: "排除", unknown: "待核实" };
const TRUTH = { true: "满足", false: "不满足", null: "尚未确认" };

// Three-valued conjunction: any false overrides unknown; only all true passes.
function eligibility(values) {
  if (values.some(value => value === false)) return "violated";
  if (values.some(value => value !== true)) return "unknown";
  return "satisfied";
}
function score(candidate, weight) {
  return Math.round((candidate.performance * weight / 100 + candidate.ease * (100 - weight) / 100) * 10) / 10;
}
function runDecision(caseKey, environment, requireAdvanced, weight, assumptions = {}) {
  const demo = DEMOS[caseKey];
  const fact = (key, original) => Object.prototype.hasOwnProperty.call(assumptions, key) ? assumptions[key] : original;
  const rows = demo.candidates.map(candidate => {
    const checks = [{ key: `${candidate.id}.environment`, label: `支持 ${environment}`, value: fact(`${candidate.id}.environment`, candidate.environments[environment] ?? null), evidence: `${candidate.id}-ENV` }];
    if (requireAdvanced) checks.push({ key: `${candidate.id}.advanced`, label: demo.advancedLabel, value: fact(`${candidate.id}.advanced`, candidate.advanced), evidence: `${candidate.id}-CAP` });
    return { id: candidate.id, name: candidate.name, version: candidate.version, performance: candidate.performance, ease: candidate.ease, checks, status: eligibility(checks.map(check => check.value)), score: score(candidate, weight) };
  });
  const byScore = (a, b) => b.score - a.score || a.id.localeCompare(b.id);
  const eligible = rows.filter(row => row.status === "satisfied").sort(byScore);
  const pending = rows.filter(row => row.status === "unknown").sort(byScore);
  const bestScore = eligible[0]?.score;
  const leaders = eligible.filter(row => row.score === bestScore);
  const challengers = pending.filter(row => bestScore === undefined || row.score >= bestScore);
  return { rows, leaders, pending, challengers };
}
function leaderText(result) {
  return result.leaders.length ? result.leaders.map(row => row.name).join("、") + (result.leaders.length > 1 ? "（并列）" : "") : "暂无已确认合格候选";
}
function analyseUnknowns(state, result) {
  const analysis = [];
  for (const row of result.rows) {
    if (row.status === "violated") continue;
    for (const check of row.checks.filter(item => item.value === null)) {
      const yes = runDecision(state.caseKey, state.environment, state.requireAdvanced, state.weight, { [check.key]: true });
      const no = runDecision(state.caseKey, state.environment, state.requireAdvanced, state.weight, { [check.key]: false });
      analysis.push({ candidate: row.name, condition: check.label, evidence: check.evidence,
        ifSatisfied: leaderText(yes), ifViolated: leaderText(no),
        changesConfirmedLeader: yes.leaders.map(item => item.id).join(",") !== no.leaders.map(item => item.id).join(",") });
    }
  }
  return analysis;
}

function init() {
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  let currentReport;
  function stateFromForm() {
    return { caseKey: $("case-select").value, environment: $("environment-select").value, requireAdvanced: $("advanced-required").checked, weight: Number($("performance-weight").value) };
  }
  function render() {
    const state = stateFromForm();
    const result = runDecision(state.caseKey, state.environment, state.requireAdvanced, state.weight);
    const unknowns = analyseUnknowns(state, result);
    $("performance-value").textContent = state.weight + "%";
    $("ease-value").textContent = (100 - state.weight) + "%";
    $("action-message").textContent = "";
    $("candidate-body").innerHTML = result.rows.map(row => `<tr><td><div class="candidate-name">${escapeHtml(row.name)}</div><div class="candidate-version">${escapeHtml(row.version)}</div></td><td><span class="badge ${row.status}">${STATUS[row.status]}</span></td><td><span class="score">${row.score.toFixed(1)}</span><span class="evidence">性能 ${row.performance} / 易用性 ${row.ease}${row.status === "violated" ? " · 不参与推荐" : row.status === "unknown" ? " · 仅供条件比较" : ""}</span></td><td>${row.checks.map(check => `<p class="trace">${escapeHtml(check.label)}：<strong>${TRUTH[String(check.value)]}</strong><span class="evidence">合成演示条目 ${escapeHtml(check.evidence)}</span></p>`).join("")}</td></tr>`).join("");
    let title, copy;
    if (!result.leaders.length) {
      title = result.pending.length ? "暂时无法确认推荐" : "当前没有满足必要条件的候选";
      copy = result.pending.length ? "仍有候选存在未核实的必要条件。先补充证据，再确认是否合格。" : "请检查判断依据，或调整需求后重新比较。";
    } else {
      title = "已确认合格中优先：" + leaderText(result);
      copy = result.challengers.length
        ? `${result.challengers.map(row => row.name).join("、")}尚待核实；若必要能力得到确认，可能领先或并列。因此当前建议有条件成立。`
        : result.pending.length ? "当前权重下，待核实候选即使通过必要条件，也不会凭现有偏好分超过已确认最优者。" : "以上候选满足当前必要条件，并在当前权重下获得最高偏好分。";
    }
    $("recommendation").innerHTML = `<p class="recommendation-title">${escapeHtml(title)}</p><p class="recommendation-copy">${escapeHtml(copy)}</p><p class="formula">偏好分 = 性能演示分 × ${state.weight}% + 易用性演示分 × ${100 - state.weight}%。分数范围为 0–100，依据仅为本演示的合成数据。</p>`;
    $("sensitivity-body").innerHTML = [0, 25, 50, 75, 100].map(weight => {
      const trial = runDecision(state.caseKey, state.environment, state.requireAdvanced, weight);
      return `<tr${weight === state.weight ? ' class="current-weight"' : ""}><td>${weight}%</td><td>${escapeHtml(leaderText(trial))}</td></tr>`;
    }).join("");
    $("unknown-analysis").innerHTML = unknowns.length ? unknowns.map(item => `<div class="unknown-item"><strong>${escapeHtml(item.candidate)}：${escapeHtml(item.condition)}</strong><p>假设满足 → ${escapeHtml(item.ifSatisfied)}</p><p>假设不满足 → ${escapeHtml(item.ifViolated)}</p><p class="hint">${item.changesConfirmedLeader ? "此项可能改变已确认候选中的优先选择，建议核实。" : "此项改变候选资格，但当前权重下不改变已确认最优者。"}</p></div>`).join("") + '<p class="hint">逐项假设，其他未知项保持不变；假设不会写回资料。</p>' : '<p class="hint">没有需要分析的未知条件。已因其他必要条件失败而排除的候选，不再分析其未知项。</p>';
    currentReport = { dataType: "synthetic-demo", rulesVersion: RULES_VERSION, state, dataSnapshot: DEMOS[state.caseKey], result, unknownAnalysis: unknowns, summary: title + "。" + copy };
  }
  function changeCase() {
    const demo = DEMOS[$("case-select").value];
    $("environment-select").replaceChildren(...demo.environments.map(value => {
      const option = document.createElement("option"); option.value = value; option.textContent = value; return option;
    }));
    $("advanced-label").textContent = demo.advancedLabel;
    render();
  }
  function readHistory() {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(records)) throw new Error("Invalid local history");
    return records;
  }
  function renderHistory() {
    $("history-list").replaceChildren();
    try {
      const records = readHistory();
      if (!records.length) {
        const li = document.createElement("li"); li.className = "hint"; li.textContent = "还没有保存记录。点击“保存到本浏览器”即可留下本次结果。"; $("history-list").append(li);
      }
      records.slice(0, 5).forEach(record => {
        const li = document.createElement("li");
        const time = document.createElement("span"); time.className = "history-date";
        time.textContent = new Date(record.savedAt).toLocaleString("zh-CN") + " · " + (DEMOS[record.state?.caseKey]?.title || "演示案例");
        const text = document.createElement("span"); text.textContent = record.summary || "演示决策记录";
        li.append(time, text); $("history-list").append(li);
      });
    } catch {
      const li = document.createElement("li"); li.className = "hint"; li.textContent = "当前浏览器无法读取本地记录，仍可导出 JSON 报告。"; $("history-list").append(li);
    }
  }
  $("requirements-form").addEventListener("submit", event => { event.preventDefault(); render(); });
  $("case-select").addEventListener("change", changeCase);
  $("environment-select").addEventListener("change", render);
  $("advanced-required").addEventListener("change", render);
  $("performance-weight").addEventListener("input", render);
  $("save-button").addEventListener("click", () => {
    try {
      const record = { ...currentReport, savedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...readHistory()].slice(0, 20)));
      renderHistory(); $("action-message").textContent = "已保存到当前浏览器，最多保留最近 20 条；下方显示最近 5 条。";
    } catch { $("action-message").textContent = "保存失败：浏览器可能限制了本地存储。请使用“导出 JSON 报告”。"; }
  });
  $("export-button").addEventListener("click", () => {
    const report = { ...currentReport, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `decision-${Date.now()}.json`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("action-message").textContent = "已发起报告下载。报告包含需求、合成资料快照、判断结果和规则版本。";
  });
  changeCase(); renderHistory();
}
if (typeof module !== "undefined" && module.exports) module.exports = { DEMOS, eligibility, score, runDecision, analyseUnknowns, leaderText };
if (typeof document !== "undefined") init();
