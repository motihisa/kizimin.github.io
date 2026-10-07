(() => {
  "use strict";
  const URL="https://bimddapbkdakspjaemsm.supabase.co";
  const KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  if (!window.supabase) return;
  const sb=window.supabase.createClient(URL,KEY);
  const path=location.pathname||"/";
  sb.from("access_logs").insert({path}).then(()=>{}).catch(()=>{});
})();