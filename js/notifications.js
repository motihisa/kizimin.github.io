(() => {
  "use strict";
  const URL="https://bimddapbkdakspjaemsm.supabase.co";
  const KEY="sb_publishable_JSnuaf48KMeQ4sodofBgA8_RGlhFHpf";
  const sb=window.supabase.createClient(URL,KEY);
  async function update(){
    const {data:{session}}=await sb.auth.getSession();
    const links=[document.getElementById("notifications-link"),document.getElementById("dm-link")];
    if(!session){links.forEach(x=>x?.classList.add("hidden"));return}
    const {count}=await sb.from("notifications").select("id",{count:"exact",head:true}).eq("recipient_id",session.user.id).is("read_at",null);
    const n=Number(count||0);
    const link=links[0];
    if(link) link.textContent=n>0?"通知 ("+n+")":"通知";
  }
  document.addEventListener("DOMContentLoaded",()=>{update();setInterval(update,30000)});
})();