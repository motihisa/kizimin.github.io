/* Kizimin custom maintenance screen. No redirect to Render. */
(() => {
  "use strict";
  const URL="https://bimddapbkdakspjaemsm.supabase.co",KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf",GATE="kizimin-maintenance-gate";
  const LABELS={normal:"通常メンテナンス",emergency:"緊急メンテナンス",other:"その他"};
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function render(data){
    if(document.getElementById(GATE)||!document.body)return;
    const type=LABELS[data?.type]?data.type:"normal",reason=String(data?.reason||"システムメンテナンスを実施しています。").slice(0,1000);
    const overlay=el("div","kizimin-maintenance-screen");overlay.id=GATE;overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","kizimin-maintenance-title");
    const card=el("main","kizimin-maintenance-card"),brand=el("div","kizimin-maintenance-brand","Kizimin"),symbol=el("div","kizimin-maintenance-symbol",type==="emergency"?"!":"⚙");
    symbol.setAttribute("aria-hidden","true");
    const pill=el("div","kizimin-maintenance-type kizimin-maintenance-type-"+type,LABELS[type]),heading=el("h1","","ただいまメンテナンス中です");heading.id="kizimin-maintenance-title";
    const description=el("p","kizimin-maintenance-description","サービスの品質向上と安定運用のため、一時的にサイトの利用を停止しています。");
    const box=el("section","kizimin-maintenance-reason"),subhead=el("h2","","メンテナンスの理由"),reasonText=el("p","",reason);
    box.append(subhead,reasonText);
    const footer=el("p","kizimin-maintenance-footer","作業完了までしばらくお待ちください。ご不便をおかけします。");
    card.append(brand,symbol,pill,heading,description,box,footer);overlay.appendChild(card);document.body.appendChild(overlay);
    Array.from(document.body.children).forEach(n=>{if(n!==overlay)n.setAttribute("inert","");});document.documentElement.style.overflow="hidden";
  }
  async function check(){
    try{const client=window.supabase?.createClient(URL,KEY);if(!client)return;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);let result;try{result=await client.rpc("get_site_maintenance_details",{}, {signal:controller.signal});}finally{clearTimeout(timer);}if(!result.error&&result.data?.active===true)render(result.data);}
    catch(error){console.warn("メンテナンス状態を確認できませんでした。",error);}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",check,{once:true});else check();
})();
