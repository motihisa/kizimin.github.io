(() => {
  "use strict";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpbWRkYXBia2Rha3NwamFlbXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU0MTksImV4cCI6MjEwNjg5MTQxOX0.qezG4VOkyYfaa4DxClk1PSV7bZEne7WEbxj52m1l7iM";
  if (!window.supabase) return;
  const sb = window.supabase.createClient(URL, KEY);

  async function update() {
    const links = Array.from(document.querySelectorAll('a[href="notifications.html"], a[href$="/notifications.html"]'));
    if (!links.length) return;

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        links.forEach(link => {
          link.querySelector(".notification-count-badge")?.remove();
        });
        return;
      }

      const { count, error } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", session.user.id)
        .is("read_at", null);

      if (error) throw error;
      const unread = Number(count || 0);

      links.forEach(link => {
        let label = link.querySelector(".notification-link-label");
        if (!label) {
          const original = link.textContent.trim();
          link.textContent = "";
          if (original.includes("🔔")) {
            const icon = document.createElement("span");
            icon.textContent = "🔔 ";
            icon.setAttribute("aria-hidden", "true");
            link.append(icon);
          }
          label = document.createElement("span");
          label.className = "notification-link-label";
          label.textContent = "通知";
          link.append(label);
        }

        let badge = link.querySelector(".notification-count-badge");
        if (unread > 0) {
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "notification-count-badge";
            badge.setAttribute("aria-label", "未読通知");
            link.append(badge);
          }
          badge.textContent = unread > 99 ? "99+" : String(unread);
          badge.title = "未読通知 " + unread + "件";
        } else {
          badge?.remove();
        }
      });
    } catch (error) {
      // 通知件数の取得に失敗しても、ナビゲーション自体は利用できるようにする。
      console.error("未読通知数を取得できませんでした:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    update();
    setInterval(update, 30000);
    window.addEventListener("focus", update);
  });
  window.addEventListener("pageshow", update);
})();