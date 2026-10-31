(() => {
"use strict";
const URL="https://bimddapbkdakspjaemsm.supabase.co";
const KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
const db=window.supabase.createClient(URL,KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const out=(s,type="info")=>{const el=$("kcmd-output");if(!el)return;const line=document.createElement("div");line.className="kcmd-line "+type;line.textContent=s;el.appendChild(line);el.scrollTop=el.scrollHeight;};
const fmt=s=>s?new Date(s).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"-";
let role="user",owner=false,ready=false;
let pendingAttachRoom=null,callPc=null,callStream=null,callTarget=null,callRoomId=null,callIce=[],callChannel=null,connectMessageChannel=null,connectSpeakEnabled=false,lastSecurityReport=null;
function tokenize(input){const a=[];input.replace(/"([^"]*)"|'([^']*)'|(\S+)/g,(_,d,s,w)=>a.push(d??s??w));return a;}
async function init(){
 const {data:{session}}=await db.auth.getSession();if(!session?.user?.id)throw Error("ログインセッションがありません。");
 const {data:p,error}=await db.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle();
 if(error)throw error;if(!p||p.account_status&&p.account_status!=="active")throw Error("有効な管理者プロフィールを確認できません。");
 const {data:o,error:oe}=await db.rpc("is_site_owner");if(oe)throw oe;owner=o===true;role=owner?"owner":p.role;
 if(!owner&&!["admin","moderator"].includes(role))throw Error("コマンドコンソールは管理者・オーナー専用です。");
 $("kcmd-auth").textContent="認証済み · "+role;$("kcmd-auth").classList.add("ok");ready=true;
 callSubscribe().catch(e=>console.warn("Admin Connect call listener unavailable",e));
 out("Kizimin Command Console 起動。/kizimin help でコマンド一覧を表示します。","success");
}

async function callSignal(recipient,signal){
 if(!callRoomId)throw Error("通話ルームが選択されていません。");
 const {data:{session},error}=await db.auth.getSession();if(error||!session?.user?.id)throw Error("ログイン状態を確認できません。");
 const {error:sendError}=await db.from("admin_connect_signals").insert({room_id:callRoomId,sender_id:session.user.id,recipient_id:recipient,signal});if(sendError)throw sendError;
}
async function callMakePeer(target){
 callPc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
 callPc.onicecandidate=e=>{if(e.candidate)callSignal(target,{type:"ice",candidate:e.candidate.toJSON()}).catch(err=>out("ICE送信失敗: "+err.message,"error"));};
 callPc.ontrack=e=>{const audio=$("kcmd-call-remote");if(audio){audio.srcObject=e.streams[0];audio.play().catch(()=>out("音声再生には画面上で再生操作が必要な場合があります。"));}};
 callPc.onconnectionstatechange=()=>out("通話状態: "+callPc?.connectionState);
 callStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
 callStream.getAudioTracks().forEach(track=>callPc.addTrack(track,callStream));
}
function callCleanup(){
 callIce=[];if(callPc){callPc.close();callPc=null;}if(callStream){callStream.getTracks().forEach(t=>t.stop());callStream=null;}
 const audio=$("kcmd-call-remote");if(audio)audio.srcObject=null;
}
async function callHandleSignal(row){
 const signal=row.signal;if(!signal)return;
 try{
  if(signal.type==="offer"){
   if(callPc)callCleanup();callRoomId=row.room_id;callTarget=row.sender_id;
   if(!confirm("Admin Connectから音声通話の着信です。応答しますか？")){await callSignal(row.sender_id,{type:"reject"});return;}
   await callMakePeer(row.sender_id);await callPc.setRemoteDescription({type:"offer",sdp:signal.sdp});
   for(const candidate of callIce.splice(0))await callPc.addIceCandidate(candidate);
   const answer=await callPc.createAnswer();await callPc.setLocalDescription(answer);await callSignal(row.sender_id,{type:"answer",sdp:answer.sdp});out("音声通話に接続しました。","success");
  }else if(signal.type==="answer"&&callPc){
   await callPc.setRemoteDescription({type:"answer",sdp:signal.sdp});for(const candidate of callIce.splice(0))await callPc.addIceCandidate(candidate);out("相手が応答しました。音声通話中です。","success");
  }else if(signal.type==="ice"&&callPc){if(callPc.remoteDescription)await callPc.addIceCandidate(signal.candidate);else callIce.push(signal.candidate);}
  else if(signal.type==="reject"){out("相手が通話を拒否しました。");callCleanup();}
  else if(signal.type==="hangup"){out("相手が通話を終了しました。");callCleanup();}
 }catch(e){out("通話エラー: "+(e.message||e),"error");callCleanup();}
}
async function callSubscribe(){
 const {data:{session},error}=await db.auth.getSession();if(error||!session?.user?.id)return;
 if(callChannel)return;
 callChannel=db.channel("kizimin-command-call-"+session.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"admin_connect_signals",filter:"recipient_id=eq."+session.user.id},payload=>callHandleSignal(payload.new)).subscribe();
}
async function profile(target){
 let q=db.from("profiles").select("id,username,display_name,role,account_status,ban_reason,ban_expires_at").limit(2);
 if(/^[0-9a-f-]{36}$/i.test(target))q=q.eq("id",target);else q=q.ilike("username",target.replace(/^@/,""));
 const {data,error}=await q;if(error)throw error;
 if(!data?.length)throw Error("ユーザーが見つかりません: "+target);
 if(data.length>1)throw Error("同じユーザー名が複数あります。ユーザーIDを指定してください。");
 return data[0];
}
async function secure(action,extra={}){
 const {data:{session},error:se}=await db.auth.getSession();if(se)throw se;if(!session?.access_token)throw Error("ログインセッションが切れています。");
 const {data,error}=await db.functions.invoke("secure-content",{body:{action,...extra},headers:{Authorization:"Bearer "+session.access_token,apikey:KEY}});
 if(error)throw error;if(data?.error||data?.ok===false)throw Error(data.error||"処理に失敗しました。");return data;
}
async function execute(raw){
 if(!ready)throw Error("権限確認が完了していません。");
 const t=tokenize(raw.trim().replace(/^\/kizimin\s*/i,""));if(!t.length)return;
 const [a,b,c,...rest]=t, target=b, value=c, extra=rest.join(" ");
 if(a==="help"){out("利用可能なコマンド:");[
 "/kizimin help","/kizimin status","/kizimin whoami","/kizimin activity [件数]","/kizimin filter history [件数]","/kizimin room info <ルームID>","/kizimin users [検索語]","/kizimin user <名前|ID>",
 "/kizimin user ban <名前|ID> <理由>","/kizimin user suspend <名前|ID> <30m|24h|7d> <理由>","/kizimin user unban <名前|ID>","/kizimin user role <名前|ID> <user|moderator|admin|debugger>",
 "/kizimin articles [検索語]","/kizimin article status <記事ID> <draft|published|archived>","/kizimin article delete <記事ID>",
 "/kizimin comments [検索語]","/kizimin comment status <コメントID> <visible|hidden|deleted>","/kizimin comment delete <コメントID>",
 "/kizimin reports [open|all]","/kizimin report status <通報ID> <open|reviewing|resolved|dismissed> [管理メモ]","/kizimin report reply <通報ID> <返信内容>",
 "/kizimin inquiries [open|all]","/kizimin inquiry status <問い合わせID> <open|reviewing|resolved|closed|dismissed> [管理メモ]","/kizimin inquiry info <問い合わせID>","/kizimin inquiry reply <問い合わせID> <返信内容>",
 "/kizimin maintenance status|on|off|reason <理由>","/kizimin bot status|run|stop",
 "/kizimin categories","/kizimin topic","/kizimin access [ユーザーID|パス]",
 "/kizimin audit [件数]","/kizimin audit page <ページ> [件数]","/kizimin export audit [件数]","/kizimin roles [ユーザーID]",
 "/kizimin orgs [検索語]","/kizimin orgapps [pending|all]","/kizimin orgmembers <団体ID>",
 "/kizimin ops incidents|schedules|approvals","/kizimin filters","/kizimin filter toggle <ID> <on|off>",
 "/kizimin article pin <記事ID> <on|off>","/kizimin article protect <記事ID> <理由>","/kizimin article unprotect <記事ID>",
 "/kizimin site settings","/kizimin bot config",
 "/kizimin article info <記事ID>","/kizimin article revisions <記事ID>","/kizimin article tags <記事ID>","/kizimin article collaborators <記事ID>",
 "/kizimin qa questions","/kizimin qa answers <質問ID>","/kizimin knowledge [検索語]","/kizimin knowledge revisions <項目ID>",
 "/kizimin polls","/kizimin poll options <投票ID>","/kizimin challenges","/kizimin challenge entries <企画ID>",
 "/kizimin orgboard <団体ID>","/kizimin orgevents <団体ID>","/kizimin orgaudit <団体ID>",
 "/kizimin notifications [ユーザーID]","/kizimin ai usage [ユーザーID]","/kizimin site history [設定キー]",
 "/kizimin filterlogs [件数]","/kizimin connect rooms","/kizimin connect messages <ルームID>",
 "/kizimin article likes <記事ID>","/kizimin poll results <投票ID>","/kizimin org info <団体ID>",
 "/kizimin insights","/kizimin articles popular","/kizimin articles recent",
 "/kizimin user interests <名前|ID>","/kizimin collections [ユーザーID]","/kizimin collection articles <コレクションID>",
 "/kizimin permissions [ロール]","/kizimin permission users <権限キー>",
 "/kizimin conversations [ユーザーID]","/kizimin conversation stats <会話ID>",
 "/kizimin topics [件数]","/kizimin role summary",
 "/kizimin org review <申請ID> <approve|reject> [理由]","/kizimin org status <団体ID> <approved|suspended> [理由]","/kizimin org audit [件数]","/kizimin connect create <ルーム名>","/kizimin connect send <ルームID> <本文>","/kizimin connect attach <ルームID>","/kizimin connect listen <on|off>","/kizimin connect call start <ルームID> <管理者ユーザーID>","/kizimin connect call end","/kizimin permissions set <ロール> <権限キー> <on|off>","/kizimin permission set <ユーザーID> <権限キー> <inherit|allow|deny>","/kizimin filters add <名前> <語句> <article|comment|both> <block|log> [理由]","/kizimin filters delete <ID>","/kizimin site theme get [項目]","/kizimin site theme set <項目> <値>","/kizimin ops stats","/kizimin ops report","/kizimin ops health","/kizimin ops tasks list|add|done|delete|export","/kizimin security diagnose","/kizimin security report","/kizimin email check <メールアドレス>"
 ].forEach(x=>out("  "+x));return;}
 if(a==="status"){
  const [dash,maint]=await Promise.all([db.rpc("admin_dashboard_stats"),db.from("site_settings").select("maintenance_mode,maintenance_type,maintenance_reason").eq("id",true).maybeSingle()]);
  if(dash.error)throw dash.error;if(maint.error)throw maint.error;
  const s=dash.data?.totals||{},m=maint.data||{};
  out("ユーザー "+(s.users??"?")+" / 記事 "+(s.articles??"?")+" / 未処理通報 "+(s.open_reports??"?")+" / 未対応問い合わせ "+(s.open_inquiries??"?"));
  out("メンテナンス: "+(m.maintenance_mode?"ON":"OFF")+" · "+(m.maintenance_type||"normal")+" · "+(m.maintenance_reason||"理由未設定"));
  out("Bot: "+($("bot-running-state")?.textContent||"状態不明"));return;
 }
 if(a==="users"){
  let q=db.from("profiles").select("id,username,display_name,role,account_status,created_at").order("created_at",{ascending:false}).limit(30);
  if(target)q=q.or("username.ilike.%"+target+"%,display_name.ilike.%"+target+"%");
  const {data,error}=await q;if(error)throw error;
  out("ユーザー "+data.length+" 件（最大30件）");
  data.forEach(x=>out((x.username||x.id)+" | "+(x.display_name||"-")+" | "+x.role+" | "+(x.account_status||"active")+" | "+x.id));return;
 }
 if(a==="user"){

  if(b==="suspend"){
   if(!["admin","owner"].includes(role))throw Error("一時停止は管理者・オーナー専用です。");
   const who=c,duration=rest[0],reason=rest.slice(1).join(" ");if(!who||!duration||!reason)throw Error("形式: /kizimin user suspend <名前|ID> <30m|24h|7d> <理由>");
   const match=duration.match(/^(\d+)(m|h|d)$/);if(!match)throw Error("期間は 30m / 24h / 7d の形式で指定してください。");
   const amount=Number(match[1]),unit=match[2],ms=amount*(unit==="m"?60000:unit==="h"?3600000:86400000);if(amount<1||ms>30*86400000)throw Error("一時停止期間は1分以上30日以内です。");
   const u=await profile(who);if(u.id==="9589135e-4f75-4913-b13f-35407eeedf3b")throw Error("オーナーアカウントは変更できません。");
   if(!confirm(u.username+" を "+duration+" 一時停止しますか？\n理由: "+reason))return;
   const {error}=await db.rpc("admin_set_account_status",{p_target_id:u.id,p_status:"suspended",p_reason:reason,p_expires_at:new Date(Date.now()+ms).toISOString()});if(error)throw error;
   out(u.username+" を "+duration+" 一時停止しました。","success");return;
  }
  if(b==="ban"||b==="unban"){
   const who=c,reason=extra;if(!who)throw Error("対象ユーザーを指定してください。");
   const u=await profile(who);if(u.id==="9589135e-4f75-4913-b13f-35407eeedf3b")throw Error("オーナーアカウントは変更できません。");
   if(b==="ban"&&!reason.trim())throw Error("BAN理由を指定してください。例: /kizimin user ban @name \"規約違反\"");
   if(!confirm((b==="ban"?"BAN":"BAN解除")+"を実行しますか？\n"+u.username+" ("+u.id+")"+(reason?"\n理由: "+reason:"")))return;
   const {error}=await db.rpc("admin_set_account_status",{p_target_id:u.id,p_status:b==="ban"?"banned":"active",p_reason:b==="ban"?reason:null,p_expires_at:null});if(error)throw error;
   out(u.username+" の状態を"+(b==="ban"?"BAN":"有効")+"に変更しました。","success");return;
  }
  if(b==="role"){
   if(!owner)throw Error("ロール変更はオーナー専用です。");
   const u=await profile(c);if(!["user","moderator","admin","debugger"].includes(value))throw Error("ロールは user / moderator / admin / debugger から指定してください。");
   if(!confirm(u.username+" のロールを "+value+" に変更しますか？"))return;
   const {error}=await db.rpc("admin_change_profile_role",{p_target_id:u.id,p_new_role:value});if(error)throw error;
   out(u.username+" のロールを "+value+" に変更しました。","success");return;
  }
  const u=await profile(b);out("ユーザー: "+(u.display_name||u.username));out("ID: "+u.id);out("ユーザー名: "+u.username);out("ロール: "+u.role);out("状態: "+(u.account_status||"active"));out("制限理由: "+(u.ban_reason||"-"));out("解除日時: "+fmt(u.ban_expires_at));return;
 }

 if(a==="filter"&&b==="toggle"){if(!["admin","owner"].includes(role))throw Error("フィルター変更は管理者・オーナー専用です。");if(!c||!["on","off"].includes(value))throw Error("フィルターIDと on/off を指定してください。");if(!confirm("フィルター #"+c+" を "+value.toUpperCase()+" にしますか？"))return;const {data,error}=await db.from("admin_abuse_filters").update({enabled:value==="on"}).eq("id",Number(c)).select("id").maybeSingle();if(error)throw error;if(!data)throw Error("フィルターが見つからないか変更権限がありません。");out("フィルターを更新しました。","success");return;}
 if(a==="article"&&b==="pin"){if(!["admin","owner"].includes(role))throw Error("記事固定は管理者・オーナー専用です。");if(!c||!["on","off"].includes(value))throw Error("記事IDと on/off を指定してください。");if(!confirm("記事 "+c+" の固定状態を変更しますか？"))return;const {data,error}=await db.from("articles").update({is_pinned:value==="on"}).eq("id",c).select("id").maybeSingle();if(error)throw error;if(!data)throw Error("記事が見つからないか権限がありません。");out("記事固定を更新しました。","success");return;}
 if(a==="article"&&b==="protect"){if(!["admin","owner"].includes(role))throw Error("記事保護は管理者・オーナー専用です。");const reason=[c,...rest].filter(Boolean).join(" ").trim();if(!c||!reason)throw Error("記事IDと保護理由を指定してください。");if(!confirm("記事 "+c+" を保護しますか？"))return;const {data:{session}}=await db.auth.getSession();const {error}=await db.from("article_protections").upsert({article_id:c,reason,protected_by:session.user.id},{onConflict:"article_id"});if(error)throw error;out("記事を保護しました。","success");return;}
 if(a==="article"&&b==="unprotect"){if(!["admin","owner"].includes(role))throw Error("記事保護解除は管理者・オーナー専用です。");if(!c)throw Error("記事IDを指定してください。");if(!confirm("記事保護を解除しますか？"))return;const {error}=await db.from("article_protections").delete().eq("article_id",c);if(error)throw error;out("記事保護を解除しました。","success");return;}
 if(a==="articles"){
  let q=db.from("articles").select("id,title,status,created_at").order("created_at",{ascending:false}).limit(30);
  if(target)q=q.ilike("title","%"+target+"%");
  const {data,error}=await q;if(error)throw error;out("記事 "+data.length+" 件（最大30件）");data.forEach(x=>out(x.title+" | "+x.status+" | "+x.id));return;
 }
 if(a==="article"){
  if(b==="delete"){if(!["admin","owner"].includes(role))throw Error("記事削除は管理者・オーナー専用です。");if(!c)throw Error("記事IDを指定してください。");if(!confirm("記事 "+c+" を完全削除しますか？関連データも削除される場合があります。"))return;await secure("article_delete",{article_id:c});out("記事を削除しました: "+c,"success");return;}
  if(b==="status"){if(!["admin","owner"].includes(role))throw Error("記事更新は管理者・オーナー専用です。");if(!c||!["draft","published","archived"].includes(value))throw Error("記事IDと draft/published/archived を指定してください。");const {data,error}=await db.from("articles").update({status:value}).eq("id",c).select("id").maybeSingle();if(error)throw error;if(!data)throw Error("記事が見つからないか、更新権限がありません。");out("記事状態を "+value+" に変更しました。","success");return;}
 }
 if(a==="comments"){
  const r=await secure("admin_comments_list");let rows=r.comments||[];if(target)rows=rows.filter(x=>String(x.content||"").toLowerCase().includes(target.toLowerCase()));out("コメント "+rows.length+" 件（検索結果、最大取得分）");rows.slice(0,30).forEach(x=>out(String(x.content||"").slice(0,100)+" | "+x.status+" | "+x.id));return;
 }
 if(a==="comment"){
  if(b==="delete"){if(!["admin","moderator","owner"].includes(role))throw Error("コメント削除権限がありません。");if(!c)throw Error("コメントIDを指定してください。");if(!confirm("コメント "+c+" を完全削除しますか？"))return;await secure("comment_delete",{comment_id:c});out("コメントを削除しました。","success");return;}
  if(b==="status"){if(!c||!["visible","hidden","deleted"].includes(value))throw Error("コメントIDと visible/hidden/deleted を指定してください。");await secure("comment_status",{comment_id:c,status:value});out("コメント状態を "+value+" に変更しました。","success");return;}
 }

 if(a==="report"&&b==="reply"){
  if(!["admin","owner"].includes(role))throw Error("通報への返信は管理者専用です。");
  const message=rest.join(" ").trim();if(!c||!message||message.length>4000)throw Error("形式: /kizimin report reply <通報ID> <返信内容（4000文字以内）>");
  if(!confirm("通報者へサイト内通知で返信しますか？"))return;
  await secure("admin_case_reply",{case_type:"report",case_id:c,reply:message});out("通報者へ返信を送信しました。","success");return;
 }
 if(a==="reports"){
  const {data,error}=await db.from("reports").select("id,reason,status,created_at").order("created_at",{ascending:false}).limit(30);if(error)throw error;const rows=target==="open"?data.filter(x=>["open","reviewing"].includes(x.status)):data;out("通報 "+rows.length+" 件");rows.forEach(x=>out(x.status+" | "+String(x.reason||"").slice(0,100)+" | "+x.id));return;
 }
 if(a==="report"&&b==="status"){
  if(!["open","reviewing","resolved","dismissed"].includes(value))throw Error("状態は open/reviewing/resolved/dismissed です。");if(!c)throw Error("通報IDを指定してください。");const update={status:value,resolved_at:["resolved","dismissed"].includes(value)?new Date().toISOString():null};const note=rest.join(" ");if(note)update.admin_note=note;const {error}=await db.from("reports").update(update).eq("id",c);if(error)throw error;out("通報状態を更新しました。","success");return;
 }

 if(a==="inquiry"&&b==="reply"){
  if(!["admin","owner"].includes(role))throw Error("問い合わせへの返信は管理者専用です。");
  const message=rest.join(" ").trim();if(!c||!message||message.length>4000)throw Error("形式: /kizimin inquiry reply <問い合わせID> <返信内容（4000文字以内）>");
  if(!confirm("問い合わせ本人へサイト内通知で返信しますか？"))return;
  await secure("admin_case_reply",{case_type:"inquiry",case_id:c,reply:message});out("問い合わせ本人へ返信を送信しました。","success");return;
 }
 if(a==="inquiry"&&b==="info"){
  if(!["admin","owner"].includes(role))throw Error("問い合わせ内容は管理者専用です。");if(!c)throw Error("問い合わせIDを指定してください。");
  const {data,error}=await db.from("inquiries").select("id,user_id,name,email,subject,message,status,admin_note,created_at,resolved_at").eq("id",Number(c)).maybeSingle();if(error)throw error;if(!data)throw Error("問い合わせが見つかりません。");
  Object.entries(data).forEach(([k,v])=>out(k+": "+(v??"-")));return;
 }
 if(a==="inquiries"){
  const {data,error}=await db.from("inquiries").select("id,subject,message,status,created_at").order("created_at",{ascending:false}).limit(30);if(error)throw error;const rows=target==="open"?data.filter(x=>["open","reviewing"].includes(x.status)):data;out("問い合わせ "+rows.length+" 件");rows.forEach(x=>out(x.status+" | "+x.subject+" | "+x.id));return;
 }
 if(a==="inquiry"&&b==="status"){
  if(!["open","reviewing","resolved","closed","dismissed"].includes(value))throw Error("状態を確認してください。");if(!c)throw Error("問い合わせIDを指定してください。");let note=rest.join(" ");if(!note){const {data,error:readError}=await db.from("inquiries").select("admin_note").eq("id",Number(c)).maybeSingle();if(readError)throw readError;if(!data)throw Error("問い合わせが見つかりません。");note=data.admin_note||"";}const {error}=await db.rpc("admin_update_inquiry_by_id",{p_inquiry_id:Number(c),p_status:value,p_admin_note:note});if(error)throw error;out("問い合わせ状態を更新しました。","success");return;
 }
 if(a==="maintenance"){
  if(b==="status"){const {data,error}=await db.from("site_settings").select("maintenance_mode,maintenance_type,maintenance_reason").eq("id",true).maybeSingle();if(error)throw error;out("メンテナンス "+(data?.maintenance_mode?"ON":"OFF")+" · "+(data?.maintenance_type||"normal")+" · "+(data?.maintenance_reason||"理由未設定"));return;}
  if(!owner)throw Error("メンテナンス操作はオーナー専用です。");
  if(b==="reason"){const reason=[c,...rest].filter(Boolean).join(" ").trim();if(!reason)throw Error("理由を入力してください。");const {error}=await db.rpc("admin_set_maintenance_reason",{p_reason:reason});if(error)throw error;out("メンテナンス理由を保存しました。","success");return;}
  if(b==="on"||b==="off"){if(b==="on"){const {data,error}=await db.from("site_settings").select("maintenance_reason").eq("id",true).maybeSingle();if(error)throw error;if(!data?.maintenance_reason?.trim())throw Error("先に /kizimin maintenance reason \"理由\" で理由を設定してください。");}
   if(!confirm("メンテナンスを "+(b==="on"?"有効":"無効")+" にしますか？"))return;const {error}=await db.rpc("admin_set_maintenance_mode",{p_enabled:b==="on"});if(error)throw error;out("メンテナンスを "+(b==="on"?"ON":"OFF")+" にしました。","success");return;}
 }
 if(a==="bot"){
  if(b==="status"){out("Bot: "+($("bot-running-state")?.textContent||"状態不明"));out("最終実行: "+($("bot-last-run")?.textContent||"未実行"));out("状態: "+($("bot-status")?.textContent||""));return;}
  const btn=$(b==="run"?"bot-run-now":b==="stop"?"bot-stop":null);if(!btn)throw Error("bot status / run / stop を指定してください。");btn.click();out(b==="run"?"Botチェックを開始しました。":"Bot停止を要求しました。","success");return;
 }

 if(a==="categories"){const {data,error}=await db.from("categories").select("id,name,slug,admin_only").order("name").limit(100);if(error)throw error;out("カテゴリ "+data.length+" 件");data.forEach(x=>out(x.name+" | "+x.slug+" | admin_only="+x.admin_only+" | "+x.id));return;}
 if(a==="topic"){const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Tokyo"});const {data,error}=await db.from("daily_topics").select("topic_date,title,description").eq("topic_date",today).maybeSingle();if(error)throw error;if(!data){out("今日のお題は未設定です。");return;}out(data.topic_date+" | "+data.title);out(data.description||"");return;}
 if(a==="access"){let q=db.from("access_logs").select("id,path,visited_at,user_id").order("visited_at",{ascending:false}).limit(30);if(target){if(/^[0-9a-f-]{36}$/i.test(target))q=q.eq("user_id",target);else q=q.ilike("path","%"+target+"%");}const {data,error}=await q;if(error)throw error;out("アクセスログ "+data.length+" 件");data.forEach(x=>out(fmt(x.visited_at)+" | "+x.path+" | "+(x.user_id||"匿名")+" | "+x.id));return;}
 
 if(a==="audit"&&b==="page"){
  const page=Math.max(1,Number(c)||1),size=Math.max(1,Math.min(100,Number(rest[0])||20)),from=(page-1)*size,to=from+size-1;
  const {data,error,count}=await db.from("admin_audit_events").select("event_type,target_type,target_id,summary,created_at,actor_id",{count:"exact"}).order("created_at",{ascending:false}).range(from,to);
  if(error)throw error;out("管理操作ログ "+(count||0)+" 件中 "+page+" ページ目（"+data.length+" 件）");
  data.forEach(x=>out(fmt(x.created_at)+" | "+x.event_type+" | "+x.summary+" | "+(x.target_type||"-")+":"+(x.target_id||"-")));return;
 }
 if(a==="export"&&b==="audit"){
  if(!["admin","owner"].includes(role))throw Error("監査ログ出力は管理者・オーナー専用です。");
  const n=Math.max(1,Math.min(500,Number(c)||100));
  const {data,error}=await db.from("admin_audit_events").select("event_type,target_type,target_id,summary,created_at,actor_id").order("created_at",{ascending:false}).limit(n);
  if(error)throw error;if(!data?.length)throw Error("出力対象のログがありません。");
  const cols=["created_at","event_type","summary","target_type","target_id","actor_id"];
  const csv=[cols.join(","),...data.map(row=>cols.map(k=>'"'+String(row[k]??"").replace(/"/g,'""')+'"').join(","))].join("\r\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),url=window.URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="kizimin-admin-audit-"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(link);link.click();link.remove();window.URL.revokeObjectURL(url);
  out("監査ログを "+data.length+" 件CSV出力しました。","success");return;
 }
 if(a==="audit"){const n=Math.max(1,Math.min(100,Number(target)||30));const {data,error}=await db.from("admin_audit_events").select("event_type,target_type,target_id,summary,created_at").order("created_at",{ascending:false}).limit(n);if(error)throw error;out("管理操作ログ "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.event_type+" | "+x.summary+" | "+(x.target_type||"")+" "+(x.target_id||"")));return;}
 if(a==="roles"){let q=db.from("role_change_audit").select("target_user_id,old_role,new_role,changed_at,changed_by").order("changed_at",{ascending:false}).limit(30);if(target)q=q.eq("target_user_id",target);const {data,error}=await q;if(error)throw error;out("権限変更履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.changed_at)+" | "+x.old_role+" → "+x.new_role+" | "+x.target_user_id));return;}


 if(a==="connect"&&b==="listen"){
  if(!["admin","owner"].includes(role))throw Error("Admin Connectの受信監視は管理者専用です。");
  if(!["on","off"].includes(c))throw Error("形式: /kizimin connect listen <on|off>");
  if(c==="off"){if(connectMessageChannel){await db.removeChannel(connectMessageChannel);connectMessageChannel=null;}connectSpeakEnabled=false;out("Admin Connectの受信監視を停止しました。");return;}
  if(connectMessageChannel){out("Admin Connectの受信監視はすでに有効です。");return;}
  const {data:{session},error:se}=await db.auth.getSession();if(se||!session?.user?.id)throw Error("ログイン状態を確認できません。");
  connectSpeakEnabled=true;
  connectMessageChannel=db.channel("kizimin-command-connect-messages-"+session.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"admin_connect_messages"},payload=>{
   if(payload.new?.sender_id===session.user.id)return;
   const body=String(payload.new?.body||"").slice(0,300);out("Admin Connect新着 | room="+payload.new.room_id+" | "+(body||"添付ファイル"));
   if(connectSpeakEnabled&&body&&"speechSynthesis" in window){const utterance=new SpeechSynthesisUtterance(body);utterance.lang="ja-JP";window.speechSynthesis.speak(utterance);}
  }).subscribe();
  out("Admin Connectの新着監視を開始しました。音声読み上げも有効です。","success");return;
 }
 if(a==="connect"&&b==="attach"){
  if(!["admin","owner"].includes(role))throw Error("Admin Connectの添付送信は管理者専用です。");
  if(!c)throw Error("形式: /kizimin connect attach <ルームID>");
  pendingAttachRoom=c;const picker=$("kcmd-attach-file");if(!picker)throw Error("添付ファイル入力欄がありません。");picker.value="";picker.click();out("画像またはPDFを選択してください。");return;
 }
 if(a==="connect"&&b==="call"){
  if(!["admin","owner"].includes(role))throw Error("音声通話は管理者専用です。");
  if(c==="end"){if(callTarget)await callSignal(callTarget,{type:"hangup"}).catch(()=>{});callCleanup();callTarget=null;callRoomId=null;out("音声通話を終了しました。","success");return;}
  if(c!=="start"||!rest[0]||!rest[1])throw Error("形式: /kizimin connect call start <ルームID> <管理者ユーザーID> または /kizimin connect call end");
  if(!navigator.mediaDevices?.getUserMedia)throw Error("このブラウザーではマイクを利用できません。HTTPS接続を確認してください。");
  const room=rest[0],recipient=rest[1];const {data:user,error}=await db.from("profiles").select("id,role,account_status").eq("id",recipient).maybeSingle();if(error)throw error;if(!user||user.role!=="admin"||user.account_status!=="active")throw Error("通話相手は有効な管理者アカウントである必要があります。");
  const {data:roomRow,error:roomError}=await db.from("admin_connect_rooms").select("id").eq("id",room).maybeSingle();if(roomError)throw roomError;if(!roomRow)throw Error("Admin Connectルームが見つかりません。");
  if(callPc)callCleanup();callRoomId=room;callTarget=recipient;out("マイクへのアクセスを要求しています...");
  await callMakePeer(recipient);const offer=await callPc.createOffer();await callPc.setLocalDescription(offer);await callSignal(recipient,{type:"offer",sdp:offer.sdp,video:false});out("音声通話を発信しました。相手の応答を待っています。","success");return;
 }
 if(a==="org"&&b==="review"){
  if(!["admin","owner"].includes(role))throw Error("団体申請の審査は管理者専用です。");
  const {data:platform,error:platformError}=await db.rpc("kizimin_is_platform_admin");if(platformError||platform!==true)throw Error("プラットフォーム管理者権限を確認できません。");
  const id=c,decision=rest[0],reason=rest.slice(1).join(" ");if(!id||!["approve","reject"].includes(decision))throw Error("形式: /kizimin org review <申請ID> <approve|reject> [理由]");
  if(!confirm("団体申請 "+id+" を "+(decision==="approve"?"承認":"却下")+"しますか？"))return;
  const {error}=await db.rpc("kizimin_review_organization_application",{p_application_id:id,p_decision:decision,p_reason:reason});if(error)throw error;out("団体申請を"+(decision==="approve"?"承認":"却下")+"しました。","success");return;
 }
 if(a==="org"&&b==="status"){
  if(!["admin","owner"].includes(role))throw Error("団体状態の変更は管理者専用です。");
  const {data:platform,error:platformError}=await db.rpc("kizimin_is_platform_admin");if(platformError||platform!==true)throw Error("プラットフォーム管理者権限を確認できません。");
  const id=c,next=rest[0],reason=rest.slice(1).join(" ")||"コマンドコンソールから変更";if(!id||!["approved","suspended"].includes(next))throw Error("形式: /kizimin org status <団体ID> <approved|suspended> [理由]");
  if(!confirm("団体 "+id+" の状態を "+next+" に変更しますか？"))return;
  const {error}=await db.rpc("kizimin_set_organization_status",{p_organization_id:id,p_status:next,p_reason:reason});if(error)throw error;out("団体状態を "+next+" に変更しました。","success");return;
 }
 if(a==="org"&&b==="audit"){
  if(!["admin","owner"].includes(role))throw Error("団体監査ログは管理者専用です。");
  const n=Math.max(1,Math.min(100,Number(c)||30));const {data,error}=await db.from("organization_audit_logs").select("id,organization_id,actor_id,action,target_user_id,details,created_at").order("created_at",{ascending:false}).limit(n);
  if(error)throw error;out("団体操作履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.action+" | org="+(x.organization_id||"申請")+" | "+x.actor_id+" | "+x.id));return;
 }
 if(a==="connect"&&b==="create"){
  if(!["admin","owner"].includes(role))throw Error("Admin Connectのルーム作成は管理者専用です。");
  const name=[c,...rest].join(" ").trim();if(!name||name.length>80)throw Error("ルーム名は1〜80文字で指定してください。");
  if(!confirm("Admin Connectに「"+name+"」ルームを作成しますか？"))return;
  const {data,error}=await db.from("admin_connect_rooms").insert({name,room_type:"text"}).select("id,name").single();if(error)throw error;out("ルームを作成しました: "+data.name+" | "+data.id,"success");return;
 }
 if(a==="connect"&&b==="send"){
  if(!["admin","owner"].includes(role))throw Error("Admin Connectの送信は管理者専用です。");
  const room=c,body=rest.join(" ").trim();if(!room||!body||body.length>5000)throw Error("形式: /kizimin connect send <ルームID> <メッセージ（5000文字以内）>");
  if(!confirm("Admin Connectの指定ルームにメッセージを送信しますか？"))return;
  const {data:{session},error:se}=await db.auth.getSession();if(se||!session?.user?.id)throw Error("ログイン状態を確認できません。");
  const {error}=await db.from("admin_connect_messages").insert({room_id:room,sender_id:session.user.id,body,attachment_path:null,attachment_type:null});if(error)throw error;out("Admin Connectへ送信しました。","success");return;
 }
 if(a==="permissions"&&b==="set"){
  if(!owner)throw Error("ロール権限の変更はオーナー専用です。");
  const targetRole=c,key=rest[0],state=rest[1];if(!["user","moderator","admin","debugger"].includes(targetRole)||!key||!["on","off"].includes(state))throw Error("形式: /kizimin permissions set <user|moderator|admin|debugger> <権限キー> <on|off>");
  if(!confirm(targetRole+" の "+key+" を "+(state==="on"?"許可":"禁止")+"しますか？"))return;
  const {error}=await db.rpc("admin_set_role_permission",{p_role:targetRole,p_permission_key:key,p_allowed:state==="on"});if(error)throw error;out("ロール権限を更新しました。","success");return;
 }
 if(a==="permission"&&b==="set"){
  if(!owner)throw Error("ユーザー別権限の変更はオーナー専用です。");
  const userId=c,key=rest[0],state=rest[1];if(!userId||!key||!["inherit","allow","deny"].includes(state))throw Error("形式: /kizimin permission set <ユーザーID> <権限キー> <inherit|allow|deny>");
  if(!confirm("ユーザー "+userId+" の "+key+" を "+state+" に変更しますか？"))return;
  const {error}=await db.rpc("admin_set_user_permission",{p_target_id:userId,p_permission_key:key,p_value:state});if(error)throw error;out("ユーザー別権限を更新しました。","success");return;
 }
 if(a==="filters"&&b==="add"){
  if(!["admin","owner"].includes(role))throw Error("フィルター追加は管理者専用です。");
  const name=c,term=rest[0],applies=rest[1],action=rest[2],reason=rest.slice(3).join(" ");if(!name||!term||term.length<2||!["article","comment","both"].includes(applies)||!["block","log"].includes(action))throw Error("形式: /kizimin filters add <名前> <検出語句> <article|comment|both> <block|log> [理由]");
  const {data:{session},error:se}=await db.auth.getSession();if(se||!session?.user?.id)throw Error("ログイン状態を確認できません。");
  if(!confirm("不正利用フィルターを追加しますか？\n"+name+" / "+term+" / "+applies+" / "+action))return;
  const {error}=await db.from("admin_abuse_filters").insert({name,term,applies_to:applies,action,reason,created_by:session.user.id});if(error)throw error;out("フィルターを追加しました。","success");return;
 }
 if(a==="filters"&&b==="delete"){
  if(!["admin","owner"].includes(role))throw Error("フィルター削除は管理者専用です。");if(!c)throw Error("フィルターIDを指定してください。");
  if(!confirm("フィルター #"+c+" を削除しますか？"))return;const {data,error}=await db.from("admin_abuse_filters").delete().eq("id",c).select("id").maybeSingle();if(error)throw error;if(!data)throw Error("削除できませんでした。対象がないか権限がありません。");out("フィルターを削除しました。","success");return;
 }
 if(a==="site"&&b==="theme"&&c==="get"){
  if(!owner)throw Error("サイト編集設定はオーナー専用です。");
  const {data,error}=await db.from("site_editor_settings").select("setting_value,updated_at").eq("setting_key","site_theme").maybeSingle();if(error)throw error;if(!data){out("カスタムテーマは未設定です。");return;}
  const field=rest[0];if(field){if(!(field in (data.setting_value||{})))throw Error("その設定項目はありません。");out(field+": "+JSON.stringify(data.setting_value[field]));}else{out("サイトテーマ設定");Object.entries(data.setting_value||{}).forEach(([k,v])=>out(k+" = "+JSON.stringify(v)));}out("最終更新: "+fmt(data.updated_at));return;
 }
 if(a==="site"&&b==="theme"&&c==="set"){
  if(!owner)throw Error("サイト編集設定の変更はオーナー専用です。");
  const field=rest[0],raw=rest.slice(1).join(" ");if(!field||!raw)throw Error("形式: /kizimin site theme set <項目> <値>");
  const allowed=["brandName","heroTitle","heroDescription","announcementTitle","announcementBody","showAnnouncements","maintenanceBrand","maintenanceTitle","maintenanceDescription","maintenanceReasonTitle","maintenanceReasonBody","maintenanceFooter","maintenanceDemoLabel","maintenanceNormalLabel","maintenanceEmergencyLabel","maintenanceOtherLabel","maintenanceBgColor","maintenanceCardColor","maintenanceAccentColor","maintenanceTextColor","banLabel","banTitle","banBody","banNote","suspendedLabel","suspendedTitle","suspendedBody","suspendedNote","accountReasonLabel","accountExpiryLabel","accountContactLabel","accountBgColor","accountCardColor","accountAccentColor","accountTextColor","termsContent","privacyContent","accentColor","backgroundColor","textColor","cardRadius","showHero","showDaily","showPopular","showCategories","showDiscovery","showPolls","showChallenges","showQA","showLibrary"];
  if(!allowed.includes(field))throw Error("変更できない項目名です。/kizimin site theme get で確認してください。");
  let value=raw;if(raw==="on")value=true;else if(raw==="off")value=false;else if(/^-?\d+(\.\d+)?$/.test(raw))value=Number(raw);
  if(["cardRadius"].includes(field)){if(typeof value!=="number"||value<0||value>32)throw Error("cardRadiusは0〜32の数値です。");}
  else if(/^show|^showAnnouncements/.test(field)){if(typeof value!=="boolean")throw Error("表示設定は on または off で指定してください。");}
  else if(/Color$/.test(field)){if(typeof value!=="string"||!/^#[0-9a-f]{6}$/i.test(value))throw Error("色は #RRGGBB 形式で指定してください。");}
  else if(typeof value!=="string"||value.length>30000)throw Error("この項目は文字列で、30000文字以内にしてください。");
  const {data:{session},error:se}=await db.auth.getSession();if(se||!session?.user?.id)throw Error("ログイン状態を確認できません。");
  const {data:current,error}=await db.from("site_editor_settings").select("setting_value").eq("setting_key","site_theme").maybeSingle();if(error)throw error;
  const next={...(current?.setting_value||{}),[field]:value};
  if(!confirm("サイトテーマの "+field+" を変更しますか？"))return;
  const {error:saveError}=await db.from("site_editor_settings").upsert({setting_key:"site_theme",setting_value:next,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:"setting_key"});if(saveError)throw saveError;out("サイトテーマを保存しました。公開ページへの反映を確認してください。","success");return;
 }
 if(a==="ops"&&b==="stats"){
  if(!["admin","owner","moderator"].includes(role))throw Error("運営統計の閲覧権限がありません。");
  const checks=[["ユーザー","profiles"],["記事","articles"],["アクセスログ","access_logs"],["コメント","comments"],["通報","reports"],["問い合わせ","inquiries"]];
  out("運営統計");for(const [label,table] of checks){const {count,error}=await db.from(table).select("*",{count:"exact",head:true});out(label+": "+(error?"取得失敗 ("+error.message+")":count+" 件"),error?"error":"success");}return;
 }

 if(a==="ops"&&b==="report"){
  if(!["admin","owner","moderator"].includes(role))throw Error("運営レポートの作成権限がありません。");
  const tables=[["users","profiles"],["articles","articles"],["comments","comments"],["access_logs","access_logs"],["reports","reports"],["inquiries","inquiries"]];
  const statistics={};for(const [label,table] of tables){const {count,error}=await db.from(table).select("*",{count:"exact",head:true});statistics[label]=error?{error:error.message}:count;}
  const {data:maintenance,error:me}=await db.from("site_settings").select("maintenance_mode,maintenance_type,maintenance_reason").eq("id",true).maybeSingle();
  if(me)statistics.maintenance={error:me.message};else statistics.maintenance=maintenance||null;
  const tasksKey="kizimin_admin_ops_tasks_v1";let tasks=[];try{const v=JSON.parse(localStorage.getItem(tasksKey)||"[]");tasks=Array.isArray(v)?v:[];}catch{}
  const report={product:"Kizimin",generated_at:new Date().toISOString(),role,statistics,handover_tasks:tasks,limitations:["RLSで参照できないデータは含まれません。","引き継ぎタスクはこのブラウザー内に保存されています。","本レポートは読み取り専用です。"]};
  const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),url=window.URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="kizimin-operations-report.json";link.click();window.URL.revokeObjectURL(url);out("運営レポートをJSON出力しました。","success");return;
 }
 if(a==="ops"&&b==="health"){
  if(!["admin","owner","moderator"].includes(role))throw Error("サイト診断の閲覧権限がありません。");
  const checks=[["プロフィール","profiles"],["記事","articles"],["コメント","comments"],["通報","reports"],["問い合わせ","inquiries"],["サイト設定","site_settings"]];
  for(const [label,table] of checks){const {error}=await db.from(table).select("id",{head:true}).limit(1);out(label+": "+(error?"異常 / "+error.message:"正常 / 読み取り成功"),error?"error":"success");}out("この診断は読み取り専用で、サイト全体の完全監査ではありません。");return;
 }
 if(a==="ops"&&b==="tasks"){
  const key="kizimin_admin_ops_tasks_v1";let tasks=[];try{const v=JSON.parse(localStorage.getItem(key)||"[]");tasks=Array.isArray(v)?v:[];}catch{}
  const action=c||"list";
  if(action==="list"){out("運営タスク "+tasks.length+" 件");tasks.forEach(t=>out(t.id+" | "+t.status+" | "+t.priority+" | "+t.title+" | "+(t.owner||"未指定")+" | "+(t.due||"期限なし")));return;}
  if(action==="export"){const cols=["id","title","priority","owner","due","status","createdAt"];const csv=[cols.join(","),...tasks.map(t=>cols.map(k=>'"'+String(t[k]??"").replace(/"/g,'""')+'"').join(","))].join("\\r\\n");const url=window.URL.createObjectURL(new Blob(["\\uFEFF"+csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download="kizimin-ops-tasks.csv";link.click();window.URL.revokeObjectURL(url);out("運営タスク "+tasks.length+" 件をCSV出力しました。","success");return;}
  if(action==="add"){const title=rest[0],priority=rest[1]||"中",ownerName=rest[2]||"",due=rest[3]||"";if(!title)throw Error("形式: /kizimin ops tasks add <タイトル> [優先度] [担当] [YYYY-MM-DD]");tasks.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),title,priority,owner:ownerName,due,status:"未完了",createdAt:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(tasks));out("運営タスクを追加しました。","success");return;}
  if(action==="done"||action==="delete"){const id=rest[0];if(!id)throw Error("タスクIDを指定してください。");const before=tasks.length;tasks=action==="done"?tasks.map(t=>t.id===id?{...t,status:t.status==="完了"?"未完了":"完了"}:t):tasks.filter(t=>t.id!==id);if(before===tasks.length&&action==="delete")throw Error("タスクが見つかりません。");localStorage.setItem(key,JSON.stringify(tasks));out(action==="done"?"タスク状態を切り替えました。":"タスクを削除しました。","success");return;}
  throw Error("tasks list / add / done / delete / export を指定してください。");
 }
 if(a==="security"&&b==="report"){if(!owner)throw Error("診断レポートはオーナー専用です。");if(!lastSecurityReport)throw Error("先に /kizimin security diagnose を実行してください。");const blob=new Blob([JSON.stringify(lastSecurityReport,null,2)],{type:"application/json"}),url=window.URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="kizimin-security-report.json";link.click();window.URL.revokeObjectURL(url);out("セキュリティ診断レポートをJSON出力しました。","success");return;}
 if(a==="security"&&b==="diagnose"){
  if(!owner)throw Error("セキュリティ診断はサイトオーナー専用です。");
  const {data:{session},error:se}=await db.auth.getSession();if(se||!session?.user?.id||!session.user.email)throw Error("再認証に必要なログイン情報がありません。");
  const password=prompt("セキュリティ診断を実行するため、サイトオーナーのパスワードを再入力してください。入力内容は保存しません。");if(!password)return;
  const {data:reauth,error:re}=await db.auth.signInWithPassword({email:session.user.email,password});if(re||reauth?.user?.id!==session.user.id)throw Error("本人確認に失敗しました。診断は実行していません。");
  const {data:ownerAgain,error:oe}=await db.rpc("is_site_owner");if(oe||ownerAgain!==true)throw Error("再認証後のオーナー権限確認に失敗しました。");
  out("読み取り専用セキュリティ診断を開始");
  const results=[],checks=[["トップページ","/"],["ログインページ","/login.html"],["管理画面HTML","/admin.html"],["診断ページ","/pentest.html"],["robots.txt","/robots.txt"]];
  for(const [label,path] of checks){try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);let res;try{res=await fetch(location.origin+path,{method:"GET",mode:"same-origin",credentials:"omit",cache:"no-store",redirect:"follow",signal:controller.signal});}finally{clearTimeout(timer);}const item={name:label,path,status:res.status,ok:res.ok};results.push(item);out(label+": HTTP "+res.status+" "+(res.ok?"応答あり":"要確認"),res.ok?"success":"error");if(path==="/"){item.headers={};for(const h of ["Content-Security-Policy","X-Content-Type-Options","X-Frame-Options","Strict-Transport-Security","Referrer-Policy"]){item.headers[h]=res.headers.get(h)||null;out(h+": "+(item.headers[h]||"ブラウザーから確認できず"));}}}catch(e){results.push({name:label,path,error:e.name==="AbortError"?"timeout":"network"});out(label+": "+(e.name==="AbortError"?"タイムアウト":"通信確認不可"),"error");}}
  const {data:{session:after},error:ae}=await db.auth.getSession(),{data:stillOwner,error:oe2}=await db.rpc("is_site_owner");if(ae||oe2||after?.user?.id!==session.user.id||stillOwner!==true)throw Error("診断後の本人確認に失敗しました。");
  lastSecurityReport={product:"Kizimin",generated_at:new Date().toISOString(),scope:location.origin,mode:"read-only",results,limitations:["RLS、Edge Functions、秘密情報、全入力欄の脆弱性は検査していません。","この診断は脆弱性不存在を保証しません。"]};out("診断完了。/kizimin security report でJSONを保存できます。","success");return;
 }
 if(a==="email"&&b==="check"){
  if(!owner)throw Error("メールチェッカーはサイトオーナー専用です。");
  const address=[c,...rest].join("").trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254)throw Error("形式: /kizimin email check <メールアドレス>");
  const {data,error}=await db.functions.invoke("owner-email-checker",{body:{email:address}});if(error)throw error;if(data?.error)throw Error("メール判定に失敗しました: "+data.error);const r=data?.result;if(!r)throw Error("判定結果を取得できませんでした。");
  out("メールドメイン判定（メールボックスの存在を保証しません）");out("ドメインDNS: "+(r.domain_resolves===true?"確認済":r.domain_resolves===false?"未確認":"判定不能"));out("MX: "+(r.mx_found===true?"あり":r.mx_found===false?"なし":"判定不能"));out("SPF: "+(r.spf_found===true?"あり":r.spf_found===false?"なし":"判定不能"));out("DMARC: "+(r.dmarc_found===true?"あり":r.dmarc_found===false?"なし":"判定不能"));out("使い捨てドメイン: "+(r.disposable==="yes"?"公開リストで検出":r.disposable==="no"?"未検出":"判定不能"));out("複数SPF: "+(r.spf_multiple===true?"疑いあり":r.spf_multiple===false?"未検出":"判定不能"));return;
 }
 if(a==="orgs"){if(!["admin","owner"].includes(role))throw Error("団体管理はプラットフォーム管理者専用です。");let q=db.from("organizations").select("id,name,organization_type,status,created_at").order("created_at",{ascending:false}).limit(50);if(target)q=q.ilike("name","%"+target+"%");const {data,error}=await q;if(error)throw error;out("団体 "+data.length+" 件");data.forEach(x=>out(x.name+" | "+x.organization_type+" | "+x.status+" | "+x.id));return;}
 if(a==="orgapps"){if(!["admin","owner"].includes(role))throw Error("団体申請の閲覧は管理者専用です。");let q=db.from("organization_applications").select("id,organization_name,organization_type,status,applicant_id,review_reason").order("created_at",{ascending:false}).limit(50);if(target&&target!=="all")q=q.eq("status",target);const {data,error}=await q;if(error)throw error;out("団体申請 "+data.length+" 件");data.forEach(x=>out(x.organization_name+" | "+x.status+" | "+x.applicant_id+" | "+x.id));return;}
 if(a==="orgmembers"){if(!["admin","owner"].includes(role))throw Error("団体メンバー情報は管理者専用です。");if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_members").select("id,user_id,role,status").eq("organization_id",target).order("created_at",{ascending:false}).limit(100);if(error)throw error;out("団体メンバー "+data.length+" 人");data.forEach(x=>out(x.user_id+" | "+x.role+" | "+x.status+" | "+x.id));return;}
 if(a==="ops"){const table=b==="incidents"?"kizimin_ops_incidents":b==="schedules"?"kizimin_ops_schedules":b==="approvals"?"kizimin_ops_approvals":null;if(!table)throw Error("ops incidents / schedules / approvals を指定してください。");const {data,error}=await db.from(table).select("*").order("created_at",{ascending:false}).limit(30);if(error)throw error;out("運営 "+b+" "+data.length+" 件");data.forEach(x=>out(b==="incidents"?(x.severity+" | "+x.title+" | "+(x.resolved_at?"解決済":"未解決")+" | "+x.id):b==="schedules"?(x.name+" | "+x.task_type+" | "+(x.enabled?"有効":"停止")+" | "+x.last_status+" | "+x.id):(x.status+" | "+x.title+" | "+x.action_type+" | "+x.id)));return;}
 if(a==="filters"){const {data,error}=await db.from("admin_abuse_filters").select("id,name,term,applies_to,action,enabled").order("id",{ascending:false}).limit(100);if(error)throw error;out("不正利用フィルター "+data.length+" 件");data.forEach(x=>out("#"+x.id+" "+x.name+" | "+x.term+" | "+x.applies_to+" | "+x.action+" | "+(x.enabled?"ON":"OFF")));return;}
 if(a==="site"&&b==="settings"){if(!owner)throw Error("サイト設定の閲覧はオーナー専用です。");const {data,error}=await db.from("site_editor_settings").select("setting_key,updated_at").order("setting_key").limit(100);if(error)throw error;out("サイト編集設定 "+data.length+" 件（値は非表示）");data.forEach(x=>out(x.setting_key+" | "+fmt(x.updated_at)));return;}
 if(a==="bot"&&b==="config"){if(!owner)throw Error("Bot設定の確認はオーナー専用です。");const {data,error}=await db.from("kizimin_bot_settings").select("id,updated_at,settings").limit(1).maybeSingle();if(error)throw error;if(!data){out("Bot設定は未登録です。");return;}out("Bot設定キー: "+Object.keys(data.settings||{}).join(", "));out("最終更新: "+fmt(data.updated_at));out("秘密値は表示していません。");return;}

 if(a==="article"&&b==="info"){if(!c)throw Error("記事IDを指定してください。");const {data,error}=await db.from("articles").select("id,title,slug,excerpt,status,visibility,view_count,like_count,is_pinned,author_id,category_id,organization_id,published_at,created_at,updated_at").eq("id",c).maybeSingle();if(error)throw error;if(!data)throw Error("記事が見つかりません。");Object.entries(data).forEach(([k,v])=>out(k+": "+(v??"-")));return;}
 if(a==="article"&&b==="revisions"){if(!c)throw Error("記事IDを指定してください。");const {data,error}=await db.from("article_revisions").select("id,editor_id,title,status,visibility,created_at").eq("article_id",c).order("created_at",{ascending:false}).limit(30);if(error)throw error;out("記事履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.title+" | "+x.status+" | editor="+x.editor_id+" | "+x.id));return;}
 if(a==="article"&&b==="tags"){if(!c)throw Error("記事IDを指定してください。");const {data,error}=await db.from("article_tags").select("tag,created_at").eq("article_id",c).order("created_at",{ascending:false});if(error)throw error;out("タグ: "+(data.map(x=>x.tag).join(", ")||"なし"));return;}
 if(a==="article"&&b==="collaborators"){if(!c)throw Error("記事IDを指定してください。");const {data,error}=await db.from("article_collaborators").select("user_id,invited_by,created_at").eq("article_id",c).order("created_at",{ascending:false});if(error)throw error;out("共同編集者 "+data.length+" 人");data.forEach(x=>out(x.user_id+" | 招待者="+x.invited_by+" | "+fmt(x.created_at)));return;}
 if(a==="qa"&&b==="questions"){const {data,error}=await db.from("qa_questions").select("id,title,solved,author_id,accepted_answer_id,created_at").order("created_at",{ascending:false}).limit(40);if(error)throw error;out("Q&A質問 "+data.length+" 件");data.forEach(x=>out((x.solved?"解決":"未解決")+" | "+x.title+" | "+x.id+" | author="+x.author_id));return;}
 if(a==="qa"&&b==="answers"){if(!c)throw Error("質問IDを指定してください。");const {data,error}=await db.from("qa_answers").select("id,author_id,body,created_at").eq("question_id",c).order("created_at",{ascending:false}).limit(50);if(error)throw error;out("回答 "+data.length+" 件");data.forEach(x=>out(x.id+" | "+x.author_id+" | "+String(x.body||"").slice(0,180)));return;}
 if(a==="knowledge"){let q=db.from("knowledge_entries").select("id,title,tags,author_id,created_at,updated_at").order("updated_at",{ascending:false}).limit(40);if(target)q=q.ilike("title","%"+target+"%");const {data,error}=await q;if(error)throw error;out("ナレッジ "+data.length+" 件");data.forEach(x=>out(x.title+" | "+(x.tags||[]).join(", ")+" | "+x.id));return;}
 if(a==="knowledge"&&b==="revisions"){if(!c)throw Error("項目IDを指定してください。");const {data,error}=await db.from("knowledge_entry_revisions").select("id,editor_id,title,created_at").eq("entry_id",c).order("created_at",{ascending:false}).limit(30);if(error)throw error;out("ナレッジ履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.title+" | "+x.editor_id+" | "+x.id));return;}
 if(a==="polls"){const {data,error}=await db.from("community_polls").select("id,title,creator_id,closes_at,created_at").order("created_at",{ascending:false}).limit(40);if(error)throw error;out("投票 "+data.length+" 件");data.forEach(x=>out(x.title+" | 締切="+fmt(x.closes_at)+" | "+x.id));return;}
 if(a==="poll"&&b==="options"){if(!c)throw Error("投票IDを指定してください。");const {data,error}=await db.from("community_poll_options").select("id,label,sort_order").eq("poll_id",c).order("sort_order");if(error)throw error;out("選択肢 "+data.length+" 件");data.forEach(x=>out(x.sort_order+". "+x.label+" | "+x.id));return;}
 if(a==="challenges"){const {data,error}=await db.from("community_challenges").select("id,title,creator_id,starts_at,ends_at,created_at").order("created_at",{ascending:false}).limit(40);if(error)throw error;out("コミュニティ企画 "+data.length+" 件");data.forEach(x=>out(x.title+" | "+fmt(x.starts_at)+" ～ "+fmt(x.ends_at)+" | "+x.id));return;}
 if(a==="challenge"&&b==="entries"){if(!c)throw Error("企画IDを指定してください。");const {data,error}=await db.from("community_challenge_entries").select("id,user_id,entry_text,created_at").eq("challenge_id",c).order("created_at",{ascending:false}).limit(50);if(error)throw error;out("参加投稿 "+data.length+" 件");data.forEach(x=>out(x.user_id+" | "+String(x.entry_text||"").slice(0,180)+" | "+x.id));return;}
 if(a==="orgboard"){if(!["admin","owner"].includes(role))throw Error("団体掲示板は管理者専用です。");if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_board_posts").select("id,title,post_type,is_pinned,author_id,created_at").eq("organization_id",target).order("created_at",{ascending:false}).limit(50);if(error)throw error;out("団体掲示板 "+data.length+" 件");data.forEach(x=>out((x.is_pinned?"📌 ":"")+x.title+" | "+x.post_type+" | "+x.id));return;}
 if(a==="orgevents"){if(!["admin","owner"].includes(role))throw Error("団体イベントは管理者専用です。");if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_events").select("id,title,location,starts_at,ends_at,created_by").eq("organization_id",target).order("starts_at",{ascending:false}).limit(50);if(error)throw error;out("団体イベント "+data.length+" 件");data.forEach(x=>out(x.title+" | "+fmt(x.starts_at)+" | "+(x.location||"場所未設定")+" | "+x.id));return;}
 if(a==="orgaudit"){if(!["admin","owner"].includes(role))throw Error("団体監査ログは管理者専用です。");if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_audit_logs").select("id,actor_id,action,target_user_id,details,created_at").eq("organization_id",target).order("created_at",{ascending:false}).limit(50);if(error)throw error;out("団体操作ログ "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.action+" | actor="+x.actor_id+" | target="+(x.target_user_id||"-")+" | "+x.id));return;}
 if(a==="notifications"){let q=db.from("notifications").select("id,recipient_id,type,title,created_at,read_at").order("created_at",{ascending:false}).limit(50);if(target)q=q.eq("recipient_id",target);const {data,error}=await q;if(error)throw error;out("通知 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.type+" | "+x.title+" | "+(x.read_at?"既読":"未読")+" | "+x.id));return;}
 if(a==="ai"&&b==="usage"){let q=db.from("ai_usage_events").select("id,user_id,estimated_neurons,actual_neurons,status,created_at").order("created_at",{ascending:false}).limit(50);if(c)q=q.eq("user_id",c);const {data,error}=await q;if(error)throw error;out("AI利用履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.status+" | 予測="+x.estimated_neurons+" | 実績="+x.actual_neurons+" | "+x.user_id));return;}
 if(a==="site"&&b==="history"){if(!owner)throw Error("サイト履歴はオーナー専用です。");let q=db.from("site_editor_history").select("id,setting_key,action,changed_by,changed_at").order("changed_at",{ascending:false}).limit(50);if(c)q=q.eq("setting_key",c);const {data,error}=await q;if(error)throw error;out("サイト編集履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.changed_at)+" | "+x.action+" | "+x.setting_key+" | "+x.changed_by));return;}
 if(a==="filterlogs"){const n=Math.max(1,Math.min(100,Number(target)||30));const {data,error}=await db.from("admin_abuse_filter_logs").select("id,filter_id,actor_id,target_type,target_id,action,matched_term,created_at").order("created_at",{ascending:false}).limit(n);if(error)throw error;out("フィルター検出ログ "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | filter="+x.filter_id+" | "+x.action+" | "+x.target_type+" "+x.target_id+" | term="+x.matched_term));return;}
 if(a==="connect"&&b==="rooms"){if(!["admin","owner"].includes(role))throw Error("Admin Connectは管理者専用です。");const {data,error}=await db.from("admin_connect_rooms").select("id,name,room_type,created_by,created_at").order("created_at",{ascending:false}).limit(50);if(error)throw error;out("Admin Connectルーム "+data.length+" 件");data.forEach(x=>out(x.name+" | "+x.room_type+" | "+x.id));return;}
 if(a==="connect"&&b==="messages"){if(!["admin","owner"].includes(role))throw Error("Admin Connectメッセージは管理者専用です。");if(!c)throw Error("ルームIDを指定してください。");const {data,error}=await db.from("admin_connect_messages").select("id,sender_id,body,attachment_type,created_at").eq("room_id",c).order("created_at",{ascending:false}).limit(50);if(error)throw error;out("運営チャットメッセージ "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.sender_id+" | "+String(x.body||"").slice(0,160)+" | "+(x.attachment_type||"")+" | "+x.id));return;}

 if(a==="article"&&b==="likes"){if(!c)throw Error("記事IDを指定してください。");const {data,error}=await db.from("article_likes").select("user_id,created_at").eq("article_id",c).order("created_at",{ascending:false}).limit(100);if(error)throw error;out("いいね "+data.length+" 件（最大100件）");data.forEach(x=>out(x.user_id+" | "+fmt(x.created_at)));return;}
 if(a==="poll"&&b==="results"){if(!c)throw Error("投票IDを指定してください。");const {data,error}=await db.from("community_poll_options").select("id,label,sort_order").eq("poll_id",c).order("sort_order");if(error)throw error;out("投票結果");for(const opt of data){const {count,error:ce}=await db.from("community_poll_votes").select("poll_id",{count:"exact",head:true}).eq("option_id",opt.id);if(ce)throw ce;out(opt.label+" : "+count+" 票");}return;}
 if(a==="org"&&b==="info"){if(!["admin","owner"].includes(role))throw Error("団体情報は管理者専用です。");if(!c)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organizations").select("id,name,organization_type,description,website,status,created_by,created_at,updated_at").eq("id",c).maybeSingle();if(error)throw error;if(!data)throw Error("団体が見つかりません。");Object.entries(data).forEach(([k,v])=>out(k+": "+(v??"-")));return;}

 if(a==="insights"){
  const [u,ar,co,re,inq,org]=await Promise.all([
   db.from("profiles").select("id",{count:"exact",head:true}),
   db.from("articles").select("id",{count:"exact",head:true}),
   db.from("comments").select("id",{count:"exact",head:true}),
   db.from("reports").select("id",{count:"exact",head:true}).in("status",["open","reviewing"]),
   db.from("inquiries").select("id",{count:"exact",head:true}).in("status",["open","reviewing"]),
   db.from("organizations").select("id",{count:"exact",head:true})
  ]);
  for(const x of [u,ar,co,re,inq,org])if(x.error)throw x.error;
  out("Kizimin 全体サマリー");
  out("ユーザー "+u.count+" | 記事 "+ar.count+" | コメント "+co.count);
  out("未処理通報 "+re.count+" | 未対応問い合わせ "+inq.count+" | 団体 "+org.count);return;
 }
 if(a==="articles"&&b==="popular"){
  const {data,error}=await db.from("articles").select("id,title,view_count,like_count,status,created_at").order("view_count",{ascending:false}).limit(20);
  if(error)throw error;out("閲覧数ランキング（上位20件）");data.forEach((x,i)=>out((i+1)+". "+x.title+" | views="+x.view_count+" | likes="+x.like_count+" | "+x.status+" | "+x.id));return;
 }
 if(a==="articles"&&b==="recent"){
  const {data,error}=await db.from("articles").select("id,title,status,updated_at,author_id").order("updated_at",{ascending:false}).limit(30);
  if(error)throw error;out("最近更新された記事 "+data.length+" 件");data.forEach(x=>out(fmt(x.updated_at)+" | "+x.title+" | "+x.status+" | "+x.author_id+" | "+x.id));return;
 }
 if(a==="user"&&b==="interests"){
  if(!c)throw Error("ユーザー名またはIDを指定してください。");const u=await profile(c);
  const {data,error}=await db.from("user_interest_tags").select("tag,created_at").eq("user_id",u.id).order("created_at",{ascending:false});
  if(error)throw error;out(u.username+" の興味タグ "+data.length+" 件");data.forEach(x=>out(x.tag+" | "+fmt(x.created_at)));return;
 }
 if(a==="collections"){
  let q=db.from("saved_collections").select("id,user_id,name,created_at").order("created_at",{ascending:false}).limit(50);
  if(target)q=q.eq("user_id",target);const {data,error}=await q;if(error)throw error;
  out("保存コレクション "+data.length+" 件");data.forEach(x=>out(x.name+" | user="+x.user_id+" | "+x.id));return;
 }
 if(a==="collection"&&b==="articles"){
  if(!c)throw Error("コレクションIDを指定してください。");
  const {data,error}=await db.from("saved_collection_articles").select("article_id,created_at").eq("collection_id",c).order("created_at",{ascending:false}).limit(100);
  if(error)throw error;out("コレクション内の記事 "+data.length+" 件");data.forEach(x=>out(x.article_id+" | "+fmt(x.created_at)));return;
 }
 if(a==="permissions"){
  if(!owner)throw Error("権限一覧はオーナー専用です。");
  let q=db.from("role_permissions").select("role,permission_key,allowed,updated_at").order("role").limit(200);
  if(target)q=q.eq("role",target);const {data,error}=await q;if(error)throw error;
  out("ロール権限 "+data.length+" 件");data.forEach(x=>out(x.role+" | "+x.permission_key+" = "+(x.allowed?"許可":"拒否")+" | "+fmt(x.updated_at)));return;
 }
 if(a==="permission"&&b==="users"){
  if(!owner)throw Error("個別権限の確認はオーナー専用です。");if(!c)throw Error("権限キーを指定してください。");
  const {data,error}=await db.from("user_permission_overrides").select("user_id,permission_key,allowed,updated_at").eq("permission_key",c).order("updated_at",{ascending:false}).limit(100);
  if(error)throw error;out("個別権限上書き "+data.length+" 件");data.forEach(x=>out(x.user_id+" | "+(x.allowed?"許可":"拒否")+" | "+fmt(x.updated_at)));return;
 }
 if(a==="role"&&b==="summary"){
  if(!owner)throw Error("ロール集計はオーナー専用です。");
  const {data,error}=await db.from("profiles").select("role");if(error)throw error;
  const counts={};data.forEach(x=>counts[x.role||"未設定"]=(counts[x.role||"未設定"]||0)+1);
  out("ロール別ユーザー数");Object.entries(counts).sort((x,y)=>y[1]-x[1]).forEach(([k,v])=>out(k+" : "+v+" 人"));return;
 }
 if(a==="conversations"){
  let q=db.from("conversations").select("id,created_by,created_at,updated_at").order("updated_at",{ascending:false}).limit(50);
  if(target)q=q.eq("created_by",target);const {data,error}=await q;if(error)throw error;
  out("会話メタデータ "+data.length+" 件（メッセージ本文は表示しません）");
  for(const x of data){const {count,error:ce}=await db.from("messages").select("id",{count:"exact",head:true}).eq("conversation_id",x.id);if(ce)throw ce;out(x.id+" | owner="+x.created_by+" | messages="+count+" | "+fmt(x.updated_at));}return;
 }
 if(a==="conversation"&&b==="stats"){
  if(!c)throw Error("会話IDを指定してください。");
  const [m,last]=await Promise.all([
   db.from("messages").select("id",{count:"exact",head:true}).eq("conversation_id",c),
   db.from("messages").select("created_at").eq("conversation_id",c).order("created_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(m.error)throw m.error;if(last.error)throw last.error;out("会話 "+c);out("メッセージ数: "+m.count);out("最終メッセージ日時: "+fmt(last.data?.created_at));return;
 }
 if(a==="topics"){
  const n=Math.max(1,Math.min(90,Number(target)||14));
  const {data,error}=await db.from("daily_topics").select("topic_date,title,description").order("topic_date",{ascending:false}).limit(n);
  if(error)throw error;out("過去のお題 "+data.length+" 件");data.forEach(x=>out(x.topic_date+" | "+x.title+" | "+String(x.description||"").slice(0,100)));return;
 }
 if(a==="whoami"){out("現在の権限: "+role);out("オーナー権限: "+(owner?"あり":"なし"));return;}

 if(a==="activity"){
  const n=Math.max(1,Math.min(100,Number(target)||25));
  const {data,error}=await db.from("admin_audit_events").select("event_type,target_type,target_id,summary,created_at,actor_id").order("created_at",{ascending:false}).limit(n);
  if(error)throw error;out("管理操作履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.event_type+" | "+x.summary+" | "+(x.target_type||"-")+":"+ (x.target_id||"-")));return;
 }
 if(a==="filter"&&b==="history"){
  const n=Math.max(1,Math.min(100,Number(c)||25));
  const {data,error}=await db.from("admin_abuse_filter_logs").select("filter_id,actor_id,target_type,target_id,action,matched_term,created_at").order("created_at",{ascending:false}).limit(n);
  if(error)throw error;out("フィルター実行履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | filter#"+x.filter_id+" | "+x.action+" | "+(x.matched_term||"-")+" | "+(x.target_type||"-")+":"+ (x.target_id||"-")));return;
 }
 if(a==="room"&&b==="info"){if(!["admin","owner"].includes(role))throw Error("Admin Connectルーム情報は管理者専用です。");
  if(!c)throw Error("ルームIDを指定してください。");
  const {data,error}=await db.from("admin_connect_rooms").select("id,name,room_type,created_by,created_at").eq("id",c).maybeSingle();
  if(error)throw error;if(!data)throw Error("ルームが見つかりません。");
  const {count,error:ce}=await db.from("admin_connect_messages").select("id",{count:"exact",head:true}).eq("room_id",c);
  if(ce)throw ce;out("ルーム: "+data.name);out("種別: "+data.room_type);out("作成日時: "+fmt(data.created_at));out("メッセージ数: "+count);out("ID: "+data.id);return;
 }

 throw Error("不明なコマンドです。/kizimin help で一覧を確認してください。");
}
function bind(){
 const form=$("kcmd-form"),input=$("kcmd-input");if(!form||form.dataset.bound)return;form.dataset.bound="1";
 const history=[];let historyIndex=0;
 form.addEventListener("submit",async e=>{e.preventDefault();const raw=input.value.trim();if(!raw)return;if(history[history.length-1]!==raw){history.push(raw);if(history.length>100)history.shift();}historyIndex=history.length;out("> "+raw,"command");input.value="";try{await execute(raw);}catch(err){console.error("[Kizimin Console]",err);out("エラー: "+(err?.message||String(err)),"error");}});
 $("kcmd-clear")?.addEventListener("click",()=>{$("kcmd-output").innerHTML="";});
 const picker=$("kcmd-attach-file");picker?.addEventListener("change",async()=>{
  const file=picker.files?.[0],room=pendingAttachRoom;pendingAttachRoom=null;if(!file||!room)return;
  const allowed=["image/jpeg","image/png","image/gif","image/webp","application/pdf"];
  if(!allowed.includes(file.type)||file.size>10*1024*1024){out("添付できるのは10MB以下の画像またはPDFです。","error");return;}
  try{const {data:{session},error:se}=await db.auth.getSession();if(se||!session?.user?.id)throw Error("ログイン状態を確認できません。");
   const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-90),path=session.user.id+"/"+crypto.randomUUID()+"-"+safe;
   const {error:uploadError}=await db.storage.from("admin-connect-files").upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;
   const {error}=await db.from("admin_connect_messages").insert({room_id:room,sender_id:session.user.id,body:"",attachment_path:path,attachment_type:file.type});if(error)throw error;
   out("Admin Connectへ添付ファイルを送信しました: "+file.name,"success");
  }catch(e){out("添付送信失敗: "+(e.message||e),"error");}
 });
 input.addEventListener("keydown",e=>{
  if(e.key==="ArrowUp"){e.preventDefault();if(!history.length)return;historyIndex=Math.max(0,historyIndex-1);input.value=history[historyIndex];}
  else if(e.key==="ArrowDown"){e.preventDefault();if(!history.length)return;historyIndex=Math.min(history.length,historyIndex+1);input.value=history[historyIndex]||"";}
 });
}
document.addEventListener("DOMContentLoaded",()=>{bind();init().catch(e=>{console.error(e);$("kcmd-auth").textContent="認証失敗: "+(e.message||e);$("kcmd-auth").classList.add("error");});});
})();