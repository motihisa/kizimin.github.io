(() => {
  "use strict";
  const escCsv = value => '"' + String(value ?? "").replace(/"/g, '""') + '"';
  const downloadCsv = (name, rows) => {
    const csv = "\uFEFF" + rows.map(row => row.map(escCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const button = (label, cls = "admin-btn") => {
    const el = document.createElement("button"); el.type = "button"; el.className = cls; el.textContent = label; return el;
  };
  function enhanceTables() {
    document.querySelectorAll(".admin-table-wrap table, #editor-history table").forEach((table, index) => {
      if (table.dataset.adminEnhanced === "1") return;
      const body = table.tBodies[0]; if (!body) return;
      table.dataset.adminEnhanced = "1";
      const wrap = table.closest(".admin-table-wrap") || table.parentElement;
      const bar = document.createElement("div");
      bar.className = "admin-enhance-toolbar";
      const search = document.createElement("input");
      search.type = "search"; search.className = "admin-search"; search.placeholder = "この一覧を検索…"; search.setAttribute("aria-label", "一覧を検索");
      const count = document.createElement("span"); count.className = "admin-muted"; count.setAttribute("aria-live", "polite");
      const exportBtn = button("表示中をCSV出力");
      bar.append(search, count, exportBtn); wrap.parentNode.insertBefore(bar, wrap);
      const rows = () => Array.from(body.rows);
      const apply = () => {
        const q = search.value.trim().toLocaleLowerCase("ja");
        let shown = 0;
        rows().forEach(row => { const match = row.textContent.toLocaleLowerCase("ja").includes(q); row.hidden = !match; if (match) shown++; });
        count.textContent = shown + " / " + rows().length + " 件";
      };
      search.addEventListener("input", apply);
      exportBtn.addEventListener("click", () => {
        const visible = rows().filter(row => !row.hidden);
        if (!visible.length) { alert("出力できる行がありません。"); return; }
        const headers = Array.from(table.tHead?.rows[0]?.cells || []).map(cell => cell.innerText.trim());
        const data = [headers, ...visible.map(row => Array.from(row.cells).map(cell => cell.innerText.trim()))];
        downloadCsv("kizimin-admin-list-" + (index + 1) + "-" + new Date().toISOString().slice(0, 10) + ".csv", data);
      });
      const observer = new MutationObserver(apply); observer.observe(body, { childList: true, subtree: true });
      apply();
    });
  }
  function enhanceCardLists(selector, prefix) {
    document.querySelectorAll(selector).forEach((container, index) => {
      if (container.dataset.adminListEnhanced === "1") return;
      container.dataset.adminListEnhanced = "1";
      const bar = document.createElement("div"); bar.className = "admin-enhance-toolbar";
      const search = document.createElement("input"); search.type = "search"; search.className = "admin-search"; search.placeholder = "一覧を検索…"; search.setAttribute("aria-label", "一覧を検索");
      const count = document.createElement("span"); count.className = "admin-muted"; count.setAttribute("aria-live", "polite");
      const exportBtn = button("表示中をCSV出力"); bar.append(search, count, exportBtn); container.parentNode.insertBefore(bar, container);
      const cards = () => Array.from(container.children).filter(el => el.matches(".org-admin-item, .ops-item"));
      const apply = () => { const q = search.value.trim().toLocaleLowerCase("ja"); let shown=0; cards().forEach(card=>{const match=card.textContent.toLocaleLowerCase("ja").includes(q);card.hidden=!match;if(match)shown++;});count.textContent=shown+" / "+cards().length+" 件"; };
      search.addEventListener("input", apply);
      exportBtn.addEventListener("click", () => { const visible=cards().filter(card=>!card.hidden); if(!visible.length){alert("出力できる項目がありません。");return;} downloadCsv("kizimin-"+prefix+"-"+(index+1)+"-"+new Date().toISOString().slice(0,10)+".csv",[["内容"],...visible.map(card=>[card.innerText.trim()])]); });
      new MutationObserver(apply).observe(container,{childList:true,subtree:true});
      apply();
    });
  }
  function addStyles() {
    if (document.getElementById("admin-enhancements-style")) return;
    const style = document.createElement("style"); style.id = "admin-enhancements-style";
    style.textContent = ".admin-enhance-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 12px}.admin-enhance-toolbar input[type=search]{flex:1;min-width:180px;max-width:440px}.admin-enhance-toolbar [aria-live]{font-size:12px}.admin-enhance-toolbar button{white-space:nowrap}.admin-enhance-toolbar input:focus-visible,.admin-enhance-toolbar button:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}@media(max-width:600px){.admin-enhance-toolbar{align-items:stretch}.admin-enhance-toolbar input[type=search]{max-width:none;width:100%}.admin-enhance-toolbar button{width:100%}}";
    document.head.appendChild(style);
  }
  function init() {
    addStyles(); enhanceTables();
    enhanceCardLists("#org-admin-applications, #org-admin-organizations, #org-admin-audit", "organizations");
    enhanceCardLists("#ops-task-list", "tasks");
    new MutationObserver(() => { enhanceTables(); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();