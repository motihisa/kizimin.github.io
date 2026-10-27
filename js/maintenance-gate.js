/* Kizimin custom maintenance screen. Debugger demo bypass is temporary and client-side only. */
(() => {
  "use strict";
  const URL="https://bimddapbkdakspjaemsm.supabase.co",KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf",GATE="kizimin-maintenance-gate";
  const LABELS={normal:"通常メンテナンス",emergency:"緊急メンテナンス",other:"その他"};
  let inertNodes=[],previousOverflow="";
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function restorePage(){
    inertNodes.forEach(n=>n.removeAttribute("inert"));
    inertNodes=[];
    document.documentElement.style.overflow=previousOverflow;
  }
  function dismissDemo(){
    const overlay=document.getElementById(GATE);
    if(!overlay)return;
    overlay.remove();
    restorePage();
  }
  function addDemoButton(overlay,canDemo){
    if(!canDemo||overlay.querySelector("#kizimin-maintenance-demo-dismiss"))return;
    const button=el("button","kizimin-maintenance-demo-button","デモ解除");
    button.id="kizimin-maintenance-demo-dismiss";
    button.type="button";
    button.setAttribute("aria-label","デモとしてメンテナンス画面を一時的に解除");
    button.addEventListener("click",dismissDemo);
    const footer=overlay.querySelector(".kizimin-maintenance-footer");
    if(footer)footer.before(button);else overlay.querySelector(".kizimin-maintenance-card")?.append(button);
  }
  function render(data,canDemo){
    if(!document.body)return;
    const existing=document.getElementById(GATE);
    if(existing){addDemoButton(existing,canDemo);return;}
    const type=LABELS[data?.type]?data.type:"normal",reason=String(data?.reason||"システムメンテナンスを実施しています。").slice(0,1000);
    const overlay=el("div","kizimin-maintenance-screen");overlay.id=GATE;overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","kizimin-maintenance-title");
    const card=el("main","kizimin-maintenance-card"),brand=el("div","kizimin-maintenance-brand","Kizimin"),symbol=el("div","kizimin-maintenance-symbol",type==="emergency"?"!":"⚙");
    symbol.setAttribute("aria-hidden","true");
    const pill=el("div","kizimin-maintenance-type kizimin-maintenance-type-"+type,LABELS[type]),heading=el("h1","","ただいまメンテナンス中です");heading.id="kizimin-maintenance-title";
    const description=el("p","kizimin-maintenance-description","サービスの品質向上と安定運用のため、一時的にサイトの利用を停止しています。");
    const box=el("section","kizimin-maintenance-reason"),subhead=el("h2","","メンテナンスの理由"),reasonText=el("p","",reason);
    box.append(subhead,reasonText);
    const footer=el("p","kizimin-maintenance-footer","作業完了までしばらくお待ちください。ご不便をおかけします。");
    card.append(brand,symbol,pill,heading,description,box);
    addDemoButton(card,canDemo);
    card.append(footer);overlay.appendChild(card);document.body.appendChild(overlay);
    inertNodes=[];
    Array.from(document.body.children).forEach(n=>{if(n!==overlay&&!n.hasAttribute("inert")){n.setAttribute("inert","");inertNodes.push(n);}});
    previousOverflow=document.documentElement.style.overflow;
    document.documentElement.style.overflow="hidden";
  }
  async function check(){
    try{
      const client=window.supabase?.createClient(URL,KEY);if(!client)return;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
      let result;
      try{result=await client.rpc("get_site_maintenance_details",{}, {signal:controller.signal});}finally{clearTimeout(timer);}
      if(result.error||result.data?.active!==true)return;
      let canDemo=false;
      const {data:sessionData}=await client.auth.getSession();
      const user=sessionData?.session?.user;
      if(user?.id){
        const {data:profile,error:profileError}=await client.from("profiles").select("role,account_status").eq("id",user.id).maybeSingle();
        if(!profileError&&profile&&(!profile.account_status||profile.account_status==="active")){
          canDemo=profile.role==="debugger";
          if(!canDemo){
            const {data:owner,error:ownerError}=await client.rpc("is_site_owner");
            canDemo=!ownerError&&owner===true;
          }
        }
      }
      render(result.data,canDemo);
    }catch(error){console.warn("メンテナンス状態を確認できませんでした。",error);}
  }
  function start(){
    check();
    try{
      const client=window.supabase?.createClient(URL,KEY);
      client?.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT"||event==="SIGNED_IN")setTimeout(check,0);});
    }catch(error){console.warn("認証状態を監視できませんでした。",error);}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
