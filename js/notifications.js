(() => {
  "use strict";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  if (!window.supabase?.createClient) return;
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
          // 既存のアイコンや子要素を消さず、ラベルだけ追加する。
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