(() => {
  "use strict";

  const Kizimin = {
    state: {
      searchQuery: "",
      initialized: false
    },

    init() {
      if (this.state.initialized) return;

      this.bindSearch();
      this.bindButtons();
      this.bindArticleLinks();

      this.state.initialized = true;
    },

    bindSearch() {
      const searchInput = document.querySelector(".search");
      const articles = Array.from(document.querySelectorAll(".article"));

      if (!searchInput || !articles.length) return;

      const normalize = (value) =>
        value.trim().toLocaleLowerCase("ja-JP");

      const filterArticles = () => {
        const query = normalize(searchInput.value);
        this.state.searchQuery = query;

        let visibleCount = 0;

        articles.forEach((article) => {
          const text = normalize(article.textContent || "");
          const visible = !query || text.includes(query);

          article.hidden = !visible;

          if (visible) visibleCount += 1;
        });

        this.updateSearchState(visibleCount, articles.length);
      };

      searchInput.addEventListener("input", filterArticles);

      searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          searchInput.value = "";
          filterArticles();
          searchInput.blur();
        }
      });
    },

    updateSearchState(visibleCount, totalCount) {
      const container = document.querySelector(".articles");
      if (!container) return;

      let emptyState = container.querySelector(".search-empty");

      if (this.state.searchQuery && visibleCount === 0) {
        if (!emptyState) {
          emptyState = document.createElement("div");
          emptyState.className = "empty-state search-empty";
          container.appendChild(emptyState);
        }

        emptyState.textContent =
          "「" + this.state.searchQuery + "」に一致する記事がありません。";
        return;
      }

      if (emptyState) {
        emptyState.remove();
      }

      if (totalCount === 0) {
        container.innerHTML =
          '<div class="empty-state">記事がありません。</div>';
      }
    },

    bindButtons() {
      const loginButton = document.querySelector(".login");
      const writeButton = document.querySelector(".write-button");

      if (loginButton) {
        loginButton.addEventListener("click", () => {
          this.showNotice("ログイン機能は準備中です。");
        });
      }

      if (writeButton) {
        writeButton.addEventListener("click", () => {
          this.showNotice("記事作成機能は準備中です。");
        });
      }
    },

    bindArticleLinks() {
      const links = document.querySelectorAll(".article[href='#']");

      links.forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          this.showNotice("記事ページは準備中です。");
        });
      });
    },

    showNotice(message) {
      let notice = document.querySelector(".kizimin-notice");

      if (!notice) {
        notice = document.createElement("div");
        notice.className = "kizimin-notice";
        Object.assign(notice.style, {
          position: "fixed",
          left: "50%",
          bottom: "24px",
          zIndex: "1000",
          maxWidth: "calc(100% - 32px)",
          padding: "11px 18px",
          border: "1px solid #e5e5e5",
          borderRadius: "999px",
          background: "#ffffff",
          color: "#222222",
          boxShadow: "0 8px 30px rgba(0,0,0,.12)",
          transform: "translate(-50%, 20px)",
          opacity: "0",
          transition: "opacity .2s ease, transform .2s ease",
          pointerEvents: "none"
        });

        document.body.appendChild(notice);
      }

      notice.textContent = message;
      notice.style.opacity = "1";
      notice.style.transform = "translate(-50%, 0)";

      clearTimeout(notice._timer);

      notice._timer = setTimeout(() => {
        notice.style.opacity = "0";
        notice.style.transform = "translate(-50%, 20px)";
      }, 2200);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    Kizimin.init();
  });

  window.Kizimin = Kizimin;
})();
