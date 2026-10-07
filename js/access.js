(() => {
  "use strict";
  const sb=window.Kizimin?.supabase;
  if(!sb)return;
  const path=location.pathname||"/";
  void sb.from("access_logs").insert({path});
})();