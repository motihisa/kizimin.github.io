/* Kizimin custom maintenance screen. Debugger demo bypass is temporary and client-side only. */
(() => {
  "use strict";
  const URL="https://bimddapbkdakspjaemsm.supabase.co",KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf",GATE="kizimin-maintenance-gate";
  const DEFAULTS={brand:"Kizimin",title:"ただいまメンテナンス中です",description:"サービスの品質向上と安定運用のため、一時的にサイトの利用を停止しています。",reasonTitle:"メンテナンスの理由",footer:"作業完了までしばらくお待ちください。ご不便をおかけします。",demoLabel:"デモ解除",normalLabel:"通常メンテナンス",emergencyLabel:"緊急メンテナンス",otherLabel:"その他",bgColor:"#f5f7fb",cardColor:"#ffffff",accentColor:"#25385e",textColor:"#172033"};
  let inertNodes=[],previousOverflow="",client=null;
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
  function addDemoButton(overlay,canDemo,label){
    if(!canDemo||overlay.querySelector("#kizimin-maintenance-demo-dismiss"))return;
    const button=el("button","kizimin-maintenance-demo-button",label||DEFAULTS.demoLabel);
    button.id="kizimin-maintenance-demo-dismiss";
    button.type="button";
    button.setAttribute("aria-label","デモとしてメンテナンス画面を一時的に解除");
    button.style.cssText="display:inline-flex;align-items:center;justify-content:center;min-height:42px;margin:20px 0 2px;padding:0 20px;border:1px solid #b8c5e0;border-radius:999px;background:#f2f6ff;color:#243b68;font:inherit;font-weight:750;cursor:pointer;box-shadow:0 4px 14px rgba(36,59,104,.08)";
    button.addEventListener("click",dismissDemo);
    const footer=overlay.querySelector(".kizimin-maintenance-footer");
    if(footer)footer.before(button);else overlay.querySelector(".kizimin-maintenance-card")?.append(button);
  }
  function render(data,canDemo,custom){\n    const c={...DEFAULTS,...(custom||{})};\n    const labels={normal:c.normalLabel,emergency:c.emergencyLabel,other:c.otherLabel};
    if(!document.body)return;
    const existing=document.getElementById(GATE);
    if(existing){addDemoButton(existing,canDemo);return;}
    const type=labels[data?.type]?data.type:"normal",reason=String(data?.reason||"システムメンテナンスを実施しています。").slice(0,1000);
    const overlay=el("div","kizimin-maintenance-screen");overlay.id=GATE;overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","kizimin-maintenance-title");
    const card=el("main","kizimin-maintenance-card"),brand=el("div","kizimin-maintenance-brand",c.brand),symbol=el("div","kizimin-maintenance-symbol",type==="emergency"?"!":"⚙");\n    overlay.style.background=c.bgColor;overlay.style.color=c.textColor;card.style.background=c.cardColor;card.style.color=c.textColor;brand.style.color=c.accentColor;symbol.style.background=c.bgColor;symbol.style.color=c.accentColor;
    symbol.setAttribute("aria-hidden","true");
    const pill=el("div","kizimin-maintenance-type kizimin-maintenance-type-"+type,labels[type]),heading=el("h1","",c.title);heading.id="kizimin-maintenance-title";
    const description=el("p","kizimin-maintenance-description",c.description);description.style.color=c.textColor;
    const box=el("section","kizimin-maintenance-reason"),subhead=el("h2","","メンテナンスの理由"),reasonText=el("p","",reason);
    subhead.textContent=c.reasonTitle;reasonText.style.color=c.textColor;box.append(subhead,reasonText);
    const footer=el("p","kizimin-maintenance-footer",c.footer);footer.style.color=c.textColor;
    card.append(brand,symbol,pill,heading,description,box);
    addDemoButton(card,canDemo,c.demoLabel);
    card.append(footer);overlay.appendChild(card);document.body.appendChild(overlay);
    inertNodes=[];
    Array.from(document.body.children).forEach(n=>{if(n!==overlay&&!n.hasAttribute("inert")){n.setAttribute("inert","");inertNodes.push(n);}});
    previousOverflow=document.documentElement.style.overflow;
    document.documentElement.style.overflow="hidden";
  }
  async function check(){
    try{
      client=client||window.supabase?.createClient(URL,KEY);if(!client)return;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
      let result;
      try{result=await client.rpc("get_site_maintenance_details",{}, {signal:controller.signal});}finally{clearTimeout(timer);}
      if(result.error)return;
      if(result.data?.active!==true){const existing=document.getElementById(GATE);if(existing){existing.remove();restorePage();}return;}
      let canDemo=false,custom={};\n      const {data:themeRow,error:themeError}=await client.from("site_editor_settings").select("setting_value").eq("setting_key","site_theme").maybeSingle();\n      if(!themeError&&themeRow?.setting_value){const v=themeRow.setting_value;custom={brand:v.maintenanceBrand,title:v.maintenanceTitle,description:v.maintenanceDescription,reasonTitle:v.maintenanceReasonTitle,footer:v.maintenanceFooter,demoLabel:v.maintenanceDemoLabel,normalLabel:v.maintenanceNormalLabel,emergencyLabel:v.maintenanceEmergencyLabel,otherLabel:v.maintenanceOtherLabel,bgColor:v.maintenanceBgColor,cardColor:v.maintenanceCardColor,accentColor:v.maintenanceAccentColor,textColor:v.maintenanceTextColor};}
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
      render(result.data,canDemo,custom);
    }catch(error){console.warn("メンテナンス状態を確認できませんでした。",error);}
  }
  function start(){
    check();
    try{
      client=client||window.supabase?.createClient(URL,KEY);
      client?.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT"||event==="SIGNED_IN")setTimeout(check,0);});
    }catch(error){console.warn("認証状態を監視できませんでした。",error);}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
