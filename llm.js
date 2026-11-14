"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const button = $("ai-explain-button"), status = $("ai-status"), answer = $("ai-answer");
  function backendError(response, data) {
    const code = data.code || data.ErrorCode || data.Code || "";
    const message = data.error || data.ErrorMessage || data.Message || "";
    if (code === "InvalidArgument" && /Subdomain.*invalid/i.test(message)) {
      return "[InvalidArgument] 后端域名无效。请从阿里云HTTP触发器复制完整公网地址到 config.js，域名中的字母不能自行修改。";
    }
    if (code === "AccessDenied" && /Assume role/i.test(message)) {
      return "[AccessDenied] 阿里云无法使用函数角色，请检查RAM角色的信任策略及函数绑定的角色。请求尚未进入项目后端。";
    }
    const prefix = code ? `[${String(code).slice(0, 80)}] ` : `HTTP ${response.status}：`;
    if (typeof data.error === "string" && data.error) return prefix + data.error;
    return prefix + "阿里云平台拒绝了请求，请检查HTTP触发器及函数权限配置。";
  }
  async function readBackendJSON(response) {
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`后端返回HTTP ${response.status}，但内容不是JSON。请检查地址及项目后端是否已部署；示例程序也可能返回这种内容。`); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`后端返回HTTP ${response.status}，但响应格式不正确。`);
    return data;
  }
  $("check-connection").addEventListener("click", async () => {
    const control = $("check-connection"), display = $("connection-status");
    const base = (window.DEEPSEEK_DEMO_CONFIG?.apiBase || "").trim().replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    control.disabled = true; display.textContent = "正在检查连接，不会调用模型……";
    try {
      const response = await fetch(base + "/health", {credentials:"omit", cache:"no-store", redirect:"error", signal:controller.signal});
      const data = await readBackendJSON(response);
      if (!response.ok) throw new Error(backendError(response, data));
      if (data.ok !== true || data.service !== "component-decision-api" || data.build !== "aliyun-python-20261114-1") {
        throw new Error("已收到服务器成功响应，但服务名称或版本与本项目不符，请检查部署及 config.js。");
      }
      display.textContent = `后端连接正常（${data.build}）。这只验证连接，模型配置还需点击 AI 按钮验证。`;
    } catch (error) {
      display.textContent = error.name === "AbortError" ? "连接检查超时；尚未验证后端可达。" : error instanceof TypeError
        ? "未能取得后端响应。请检查网络、后端地址、HTTP触发器GET方法及跨域设置。" : error.message;
    } finally { clearTimeout(timer); control.disabled = false; }
  });
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
      status.textContent = "请先在 config.js 填入已部署的阿里云后端地址。"; return;
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
      const data = await readBackendJSON(response);
      if (requestId !== generation) return;
      if (!response.ok) throw new Error(backendError(response, data));
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("模型没有返回有效解释。");
      answer.textContent = data.text; answer.hidden = false;
      status.textContent = `已收到 ${data.model || "DeepSeek"} 的解释；本日当前口令剩余 ${data.remaining?.access ?? "?"} 次，全站剩余 ${data.remaining?.global ?? "?"} 次。`;
      if (data.truncated) status.textContent += " 回答已达到长度上限，可能未完整结束。";
    } catch (error) {
      if (requestId !== generation) return;
      status.textContent = error.name === "AbortError"
        ? "等待超时。后端请求可能仍会计费，本次不自动重试。"
        : error instanceof TypeError ? "浏览器未能取得后端响应。请先点击“检查连接”；若连接正常，再检查HTTP触发器是否允许POST、OPTIONS及跨域设置。" : error.message;
    } finally {
      clearTimeout(timer);
      if (requestId === generation) { activeRequest = null; button.disabled = false; }
    }
  });
})();
