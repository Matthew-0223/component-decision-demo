"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const button = $("ai-explain-button"), status = $("ai-status"), answer = $("ai-answer");
  let activeRequest = null, generation = 0;
  const readState = () => ({ caseKey: $("case-select").value, environment: $("environment-select").value,
    requireAdvanced: $("advanced-required").checked, weight: Number($("performance-weight").value) });
  function invalidate() {
    generation += 1;
    if (activeRequest) activeRequest.abort();
    activeRequest = null; button.disabled = false;
    answer.hidden = true; answer.textContent = "";
    status.textContent = "需求已变化，点击按钮可重新生成解释。";
  }
  $("requirements-form").addEventListener("input", invalidate);
  $("requirements-form").addEventListener("change", invalidate);
  $("ai-question").addEventListener("input", invalidate);
  $("demo-access-code").addEventListener("input", invalidate);
  button.addEventListener("click", async () => {
    const base = (window.DEEPSEEK_DEMO_CONFIG?.apiBase || "").trim().replace(/\/+$/, "");
    if (!base || base.includes("YOUR_WORKER")) {
      status.textContent = "请先在 config.js 填入已部署的 Cloudflare Worker 地址。"; return;
    }
    let parsed;
    try { parsed = new URL(base); } catch { status.textContent = "config.js 中的后端地址格式不正确。"; return; }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
      status.textContent = "后端地址应为 https://你的服务域名，不含路径、参数或口令。"; return;
    }
    const accessCode = $("demo-access-code").value.trim();
    if (accessCode.length < 20) { status.textContent = "请填写组长设置的至少 20 个字符的团队访问口令。这里不是填写 DeepSeek API Key。"; return; }
    const state = readState(), question = $("ai-question").value.trim();
    const requestId = ++generation;
    const controller = new AbortController(); activeRequest = controller;
    const timer = setTimeout(() => controller.abort(), 50000);
    button.disabled = true; answer.hidden = true; answer.textContent = "";
    status.textContent = "正在请求 DeepSeek，请稍候；不会自动重试。";
    try {
      const response = await fetch(base + "/explain", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessCode },
        body: JSON.stringify({ state, question }), credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal
      });
      const data = await response.json();
      if (requestId !== generation) return;
      if (!response.ok) throw new Error(data.error || "后端请求失败，请检查服务配置。");
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("模型没有返回有效解释。");
      answer.textContent = data.text; answer.hidden = false;
      status.textContent = `已收到 ${data.model || "DeepSeek"} 的解释；本日当前 IP 剩余 ${data.remaining?.ip ?? "?"} 次，全站剩余 ${data.remaining?.global ?? "?"} 次。`;
      if (data.truncated) status.textContent += " 回答已达到长度上限，可能未完整结束。";
    } catch (error) {
      if (requestId !== generation) return;
      status.textContent = error.name === "AbortError"
        ? "等待超时。后端请求可能仍会计费，本次不自动重试。"
        : error instanceof TypeError ? "无法连接后端，请检查 Worker 地址、网络、部署状态及 ALLOWED_ORIGIN。" : error.message;
    } finally {
      clearTimeout(timer);
      if (requestId === generation) { activeRequest = null; button.disabled = false; }
    }
  });
})();
