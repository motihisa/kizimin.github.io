(() => {
"use strict";
const URL="https://bimddapbkdakspjaemsm.supabase.co";
const KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
const db=window.supabase.createClient(URL,KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const outputTerms={
 owner:"オーナー",admin:"管理者",moderator:"モデレーター",user:"一般ユーザー",debugger:"デバッガー",
 active:"有効",inactive:"無効",suspended:"一時停止中",banned:"BAN中",protected:"アカウント保護",
 draft:"下書き",published:"公開済み",archived:"アーカイブ済み",
 visible:"表示",hidden:"非表示",deleted:"削除済み",
 open:"未対応",reviewing:"対応中",resolved:"解決済み",dismissed:"却下",closed:"終了",
 normal:"通常",emergency:"緊急",other:"その他",
 private:"非公開",public:"公開",group:"グループ",
 article:"記事",comment:"コメント",both:"両方",block:"ブロック",log:"記録",
 allow:"許可",deny:"拒否",inherit:"継承",
 pending:"審査待ち",approved:"承認済み",rejected:"却下",
 completed:"完了",failed:"失敗",success:"成功",error:"エラー",
 running:"実行中",stopped:"停止中",queued:"待機中",live:"稼働中",
 id:"ID",user_id:"ユーザーID",recipient_id:"受信者ID",sender_id:"送信者ID",
 name:"名前",email:"メールアドレス",subject:"件名",message:"本文",status:"状態",
 role:"権限",account_status:"アカウント状態",ban_reason:"制限理由",
 ban_expires_at:"制限解除日時",admin_note:"管理メモ",created_at:"作成日時",
 updated_at:"更新日時",resolved_at:"解決日時",changed_at:"変更日時",
 target_user_id:"対象ユーザーID",old_role:"変更前の権限",new_role:"変更後の権限",
 event_type:"操作種別",target_type:"対象種別",target_id:"対象ID",summary:"概要",
 organization_type:"団体種別",organization_name:"団体名",applicant_id:"申請者ID",
 review_reason:"審査理由",room_type:"ルーム種別",room_id:"ルームID",
 attachment_type:"添付ファイル種別",attachment_path:"添付ファイル保存先",
 applies_to:"適用対象",action:"動作",enabled:"有効状態",term:"検出語句",
 permission_key:"権限キー",allowed:"許可状態",setting_key:"設定キー",
 generated_at:"生成日時",scope:"対象範囲",mode:"診断方式",limitations:"診断上の制限",
 title:"タイトル",description:"説明",slug:"URL識別子",visibility:"公開範囲",
 view_count:"閲覧数",like_count:"いいね数",author_id:"投稿者ID",
 category_id:"カテゴリID",organization_id:"団体ID",published_at:"公開日時",
 starts_at:"開始日時",ends_at:"終了日時",closes_at:"締切日時",
 creator_id:"作成者ID",created_by:"作成者ID",changed_by:"変更者ID",
 location:"場所",post_type:"投稿種別",is_pinned:"固定状態",
 actual_neurons:"実消費量",estimated_neurons:"推定消費量",
 total:"合計",count:"件数",reason:"理由",priority:"優先度",assignee:"担当者",
 due:"期限",user_count:"ユーザー数",messages:"メッセージ数"
};
const translateOutput=value=>{
 let text=String(value??"");
 if(text.includes("/kizimin "))return text;
 const errorTranslations=[[/duplicate key value violates unique constraint/i,"同じデータが既に登録されています。"],[/new row violates row-level security policy/i,"この操作を実行する権限がありません（データベースの行単位セキュリティ）。"],[/row-level security policy/i,"データベースのアクセス制限により拒否されました。"],[/permission denied/i,"この操作を実行する権限がありません。"],[/invalid input syntax for type uuid/i,"ユーザーIDまたはデータIDの形式が正しくありません。"],[/violates foreign key constraint/i,"関連するデータが存在するため、この操作を完了できません。"],[/violates check constraint/i,"入力値が許可された条件を満たしていません。"],[/JWT expired|token is expired/i,"ログインの有効期限が切れています。再ログインしてください。"],[/Failed to fetch|NetworkError/i,"サーバーに接続できませんでした。通信状態を確認してください。"]];
 for(const [pattern,japanese] of errorTranslations){if(pattern.test(text))return japanese;}
 text=text.replace(/\b(owner|admin|moderator|user|debugger|active|inactive|suspended|banned|draft|published|archived|visible|hidden|deleted|open|reviewing|resolved|dismissed|closed|normal|emergency|other|private|public|group|article|comment|both|block|log|allow|deny|inherit|pending|approved|rejected|completed|failed|success|error|running|stopped|queued|live|true|false|on|off)\b/gi,word=>{
  const lower=word.toLowerCase();
  if(lower==="true")return "はい";if(lower==="false")return "いいえ";
  if(lower==="on")return "有効";if(lower==="off")return "無効";
  return outputTerms[lower]||word;
 });
 for(const [key,label] of Object.entries(outputTerms)){
  if(key==="owner")continue;
  text=text.replace(new RegExp("(^|[|\\s])"+key+"(?=\\s*[:=|])","g"),"$1"+label);
 }
 return text;
};
const out=(s,type="info")=>{const el=$("kcmd-output");if(!el)return;const line=document.createElement("div");line.className="kcmd-line "+type;line.textContent=translateOutput(s);el.appendChild(line);el.scrollTop=el.scrollHeight;};
const fmt=s=>s?new Date(s).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"-";
let role="user",owner=false,ready=false;
let lastSecurityReport=null;
function tokenize(input){const a=[];input.replace(/"([^"]*)"|'([^']*)'|(\S+)/g,(_,d,s,w)=>a.push(d??s??w));return a;}
async function init(){
 const {data:{session}}=await db.auth.getSession();if(!session?.user?.id)throw Error("ログインセッションがありません。");
 const {data:p,error}=await db.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle();
 if(error)throw error;if(!p||p.account_status&&p.account_status!=="active")throw Error("有効な管理者プロフィールを確認できません。");
 const {data:o,error:oe}=await db.rpc("is_site_owner");if(oe)throw oe;owner=o===true;role=owner?"owner":p.role;
 if(!owner&&!["admin","moderator"].includes(role))throw Error("コマンドコンソールは管理者・オーナー専用です。");
 $("kcmd-auth").textContent="認証済み · "+(outputTerms[role]||role);$("kcmd-auth").classList.add("ok");ready=true;
 out("Kizimin Command Console 起動。/kizimin help でコマンド一覧を表示します。","success");
}

async function requirePlatformAdmin(){if(!["admin","owner"].includes(role))throw Error("団体管理はプラットフォーム管理者専用です。");const {data,error}=await db.rpc("kizimin_is_platform_admin");if(error||data!==true)throw Error("プラットフォーム管理者権限を確認できません。");}
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
 const t=tokenize(raw.trim().replace(/^\/?kizimin\s*/i,""));if(!t.length)return;
 const [a,b,c,...rest]=t, target=b, value=c, extra=rest.join(" ");
 if(a==="help"&&b==="jp"){
  out("Kizimin コマンド解説（日本語）","success");
  [
   "【基本】",
   "kizimin help：コマンド名と書式の一覧を表示します。",
   "kizimin help jp：この日本語の詳しい解説を表示します。",
   "kizimin status：ユーザー数・記事数・未処理の通報や問い合わせ・メンテナンス状態を確認します。",
   "kizimin whoami：現在ログインしている管理者と権限を確認します。",
   "kizimin activity [件数]：最近の管理操作履歴を指定件数だけ表示します。",
   "kizimin audit [件数]：監査ログの新しいものから指定件数を表示します。",
   "kizimin audit page <ページ> [件数]：監査ログをページ番号で区切って表示します。",
   "kizimin export audit [件数]：監査ログをファイルに出力します。",
   "",
   "【ユーザー】",
   "kizimin users [検索語]：ユーザー一覧を表示します。検索語を付けると絞り込めます。",
   "kizimin user <名前|ID>：指定ユーザーの情報（登録メールアドレスを含む）を確認します。",
   "kizimin user email <名前|ID>：指定ユーザーの登録メールアドレスだけを確認します。",
   "kizimin user protect <名前|ID>：対象ユーザーをアカウント保護状態にします。オーナーは対象外です。",
   "kizimin user unprotect <名前|ID>：アカウント保護状態を解除します。",
   "kizimin protection status：自動保護の設定・対象人数・スケジュールを確認します。",
   "kizimin protection run：無活動期間を超えたアカウントの保護処理を手動実行します。",
   "kizimin user ban <名前|ID> <理由>：理由を記録してユーザーをBANします。",
   "kizimin user suspend <名前|ID> <30m|24h|7d> <理由>：指定時間だけ一時停止します。30mは30分、24hは24時間、7dは7日です。",
   "kizimin user unban <名前|ID>：指定ユーザーのBANを解除します。",
   "kizimin user role <名前|ID> <user|moderator|admin|debugger>：ユーザーのロールを変更します。",
   "kizimin user interests <名前|ID>：ユーザーの興味・関心情報を確認します。",
   "kizimin roles [ユーザーID]：ロール情報を一覧表示します。IDを指定すると対象を絞れます。",
   "kizimin role summary：ロールごとの人数や概要を確認します。",
   "",
   "【記事・コメント】",
   "kizimin articles [検索語]：記事一覧を表示します。検索語で絞り込めます。",
   "kizimin articles popular：人気順の記事を表示します。",
   "kizimin articles recent：新しい記事を表示します。",
   "kizimin article info <記事ID>：記事の詳細情報を確認します。",
   "kizimin article status <記事ID> <draft|published|archived>：記事を下書き・公開・アーカイブに変更します。",
   "kizimin article delete <記事ID>：指定記事を削除します。実行前に記事IDを確認してください。",
   "kizimin article pin <記事ID> <on|off>：記事の固定表示を有効・無効にします。",
   "kizimin article protect <記事ID> <理由>：記事を保護し、理由を記録します。",
   "kizimin article unprotect <記事ID>：記事の保護を解除します。",
   "kizimin article revisions <記事ID>：記事の編集履歴を確認します。",
   "kizimin article tags <記事ID>：記事に設定されたタグを確認します。",
   "kizimin article collaborators <記事ID>：共同編集者を確認します。",
   "kizimin article likes <記事ID>：記事へのいいね情報を確認します。",
   "kizimin comments [検索語]：コメント一覧を表示します。検索語で絞り込めます。",
   "kizimin comment status <コメントID> <visible|hidden|deleted>：コメントの表示状態を変更します。",
   "kizimin comment delete <コメントID>：指定コメントを削除します。",
   "",
   "【通報・問い合わせ】",
   "kizimin reports [open|all]：通報を表示します。openは未対応、allはすべてです。",
   "kizimin report status <通報ID> <open|reviewing|resolved|dismissed> [管理メモ]：通報の対応状態と管理メモを更新します。",
   "kizimin report reply <通報ID> <返信内容>：通報者への返信を登録します。",
   "kizimin inquiries [open|all]：問い合わせを表示します。openは未対応、allはすべてです。",
   "kizimin inquiry info <問い合わせID>：問い合わせの詳細を確認します。",
   "kizimin inquiry status <問い合わせID> <状態> [管理メモ]：問い合わせの対応状態と管理メモを更新します。",
   "kizimin inquiry reply <問い合わせID> <返信内容>：問い合わせへの返信を登録します。",
   "",
   "【サイト・メンテナンス・Bot】",
   "kizimin maintenance status：メンテナンス状態を確認します。",
   "kizimin maintenance on / off：メンテナンスを開始・終了します。",
   "kizimin maintenance reason <理由>：利用者向けメンテナンス理由を設定します。",
   "kizimin site settings：サイト設定の概要を確認します。",
   "kizimin site theme get [項目]：サイトテーマ設定を表示します。項目を指定すると絞り込めます。",
   "kizimin site theme set <項目> <値>：許可されたテーマ設定を変更します。",
   "kizimin site history [設定キー]：サイト設定の変更履歴を確認します。",
   "kizimin topic / topics [件数]：今日のお題、またはお題一覧を確認します。",
   "kizimin categories：記事カテゴリを確認します。",
   "kizimin bot status：Botの稼働状態を確認します。",
   "kizimin bot run：Botのチェックを手動実行します。",
   "kizimin bot stop：Botを停止します。",
   "kizimin bot config：Bot設定を確認します。",
   "",
   "【団体】",
   "kizimin orgs [検索語]：団体一覧を表示します。",
   "kizimin orgapps [pending|all]：団体申請を表示します。pendingは審査待ち、allはすべてです。",
   "kizimin orgmembers <団体ID>：団体メンバーを確認します。",
   "kizimin org info <団体ID>：団体の詳細を確認します。",
   "kizimin org review <申請ID> <approve|reject> [理由]：団体申請を承認・却下します。",
   "kizimin org status <団体ID> <approved|suspended> [理由]：団体の状態を変更します。",
   "kizimin org audit [件数]：団体関連の監査履歴を表示します。",
   "kizimin orgboard <団体ID>：団体掲示板を確認します。",
   "kizimin orgevents <団体ID>：団体イベントを確認します。",
   "",
   "【コミュニティ・データ】",
   "kizimin qa questions：Q&Aの質問一覧を表示します。",
   "kizimin qa answers <質問ID>：指定質問への回答を表示します。",
   "kizimin knowledge [検索語]：ナレッジ項目を検索します。",
   "kizimin knowledge revisions <項目ID>：ナレッジの変更履歴を確認します。",
   "kizimin polls：投票一覧を表示します。",
   "kizimin poll options <投票ID>：投票の選択肢を確認します。",
   "kizimin poll results <投票ID>：投票結果を確認します。",
   "kizimin challenges：コミュニティ企画一覧を表示します。",
   "kizimin challenge entries <企画ID>：企画への参加投稿を確認します。",
   "kizimin collections [ユーザーID]：保存コレクションを確認します。",
   "kizimin collection articles <コレクションID>：コレクション内の記事を表示します。",
   "kizimin insights：サイト利用状況の分析情報を表示します。",
   "kizimin notifications [ユーザーID]：通知情報を確認します。ユーザーIDを指定すると対象を絞れます。",
   "kizimin ai usage [ユーザーID]：AI利用量を確認します。",
   "kizimin ai logs [件数]：運営AIの会話履歴を新しい順に表示します（オーナー専用）。",
   "kizimin ai conversation <会話ID>：運営AIの会話全文を表示します（オーナー専用）。",
   "kizimin ai search <キーワード>：運営AIの会話を検索します（オーナー専用）。",
   "kizimin ai stats：運営AIの利用統計を表示します（オーナー専用）。",
   "kizimin access [ユーザーID|パス]：アクセス記録を確認します。",
   "",
   "【権限・フィルター】",
   "kizimin permissions [ロール]：ロール別の権限を表示します。",
   "kizimin permissions set <ロール> <権限キー> <on|off>：ロールに対する権限を許可・禁止します。",
   "kizimin permission users <権限キー>：指定権限を個別設定しているユーザーを確認します。",
   "kizimin permission set <ユーザーID> <権限キー> <inherit|allow|deny>：ユーザー個別の権限を継承・許可・禁止に設定します。",
   "kizimin filters：不正利用フィルターの一覧を表示します。",
   "kizimin filters add <名前> <語句> <article|comment|both> <block|log> [理由]：投稿チェック用ルールを追加します。",
   "kizimin filters delete <ID>：フィルタールールを削除します。",
   "kizimin filter toggle <ID> <on|off>：フィルターを有効・無効にします。",
   "kizimin filter history [件数] / filterlogs [件数]：フィルターの変更履歴・検出ログを確認します。",
   "",
   
   
   
   
   
   
   
   
   
   "kizimin room info <ルームID>：ルームの基本情報を確認します。",
   "kizimin conversations [ユーザーID]：会話一覧を確認します。",
   "kizimin conversation stats <会話ID>：会話の統計情報を確認します。",
   "kizimin ops incidents|schedules|approvals：運営上の障害・予定・承認待ちを確認します。",
   "kizimin ops stats：運営統計を表示します。",
   "kizimin ops report：運営レポートを表示します。",
   "kizimin ops health：サイトやサービスの稼働状態を確認します。",
   "kizimin ops tasks list|add|done|delete|export：運営タスクを一覧・追加・完了・削除・出力します。",
   "kizimin security diagnose：読み取り専用のセキュリティ診断を実行します。",
   "kizimin security report：直前の診断結果をJSONファイルに出力します。",
   "kizimin email check <メールアドレス>：メールアドレスの形式を確認します。",
   "",
   "【入力ルール】",
   "・先頭の / は省略できます。例：kizimin help jp",
   "・< > は必須の値、[ ] は省略できる値です。",
   "・複数語の理由や本文は、必要に応じて \" \" で囲んでください。",
   "・状態名やロール名などの英単語は、コマンド仕様上そのまま入力してください。",
   "・削除、BAN、権限変更などの操作は、対象IDと内容を確認してから実行してください。"
  ].forEach(line=>out(line||" "));
  return;
 }
 if(a==="help"){out("利用可能なコマンド:");[
 "/kizimin help","/kizimin status","/kizimin whoami","/kizimin activity [件数]","/kizimin filter history [件数]","/kizimin room info <ルームID>","/kizimin users [検索語]","/kizimin user <名前|ID>","/kizimin user email <名前|ID>","/kizimin user protect <名前|ID>","/kizimin user unprotect <名前|ID>","/kizimin protection status","/kizimin protection run",
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
 "/kizimin filterlogs [件数]",
 "/kizimin article likes <記事ID>","/kizimin poll results <投票ID>","/kizimin org info <団体ID>",
 "/kizimin insights","/kizimin articles popular","/kizimin articles recent",
 "/kizimin user interests <名前|ID>","/kizimin collections [ユーザーID]","/kizimin collection articles <コレクションID>",
 "/kizimin permissions [ロール]","/kizimin permission users <権限キー>",
 "/kizimin conversations [ユーザーID]","/kizimin conversation stats <会話ID>",
 "/kizimin topics [件数]","/kizimin role summary",
 "/kizimin org review <申請ID> <approve|reject> [理由]","/kizimin org status <団体ID> <approved|suspended> [理由]","/kizimin org audit [件数]","/kizimin permissions set <ロール> <権限キー> <on|off>","/kizimin permission set <ユーザーID> <権限キー> <inherit|allow|deny>","/kizimin filters add <名前> <語句> <article|comment|both> <block|log> [理由]","/kizimin filters delete <ID>","/kizimin site theme get [項目]","/kizimin site theme set <項目> <値>","/kizimin ops stats","/kizimin ops report","/kizimin ops health","/kizimin ops tasks list|add|done|delete|export","/kizimin security diagnose","/kizimin security report","/kizimin email check <メールアドレス>"
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

  if(b==="protect"||b==="unprotect"){
   if(!["admin","owner"].includes(role))throw Error("アカウント保護の操作は管理者・オーナー専用です。");
   if(!c)throw Error("対象ユーザーを指定してください。");
   const u=await profile(c);
   if(!confirm(u.username+" のアカウント保護を"+(b==="protect"?"有効化":"解除")+"しますか？"))return;
   const {error}=await db.rpc("admin_set_account_protection",{p_target_id:u.id,p_protected:b==="protect"});
   if(error)throw error;
   out(u.username+" のアカウント保護を"+(b==="protect"?"有効化":"解除")+"しました。","success");return;
  }
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
  if(b==="email"){
    if(!c)throw Error("ユーザー名またはIDを指定してください。");
    const u=await profile(c);const details=await secure("admin_user_details",{user_id:u.id});
    out(u.username+" の登録メールアドレス: "+(details.email||"未登録・非公開"));
    return;
   }
   const u=await profile(b);const details=await secure("admin_user_details",{user_id:u.id});out("ユーザー: "+(u.display_name||u.username));out("ID: "+u.id);out("ユーザー名: "+u.username);out("メールアドレス: "+(details.email||"未登録・非公開"));out("ロール: "+u.role);out("状態: "+(u.account_status||"active"));out("制限理由: "+(u.ban_reason||"-"));out("解除日時: "+fmt(u.ban_expires_at));return;
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
 if(a==="protection"){
  if(!["admin","owner"].includes(role))throw Error("自動アカウント保護の操作は管理者・オーナー専用です。");
  if(b==="status"){
   const {data,error}=await db.rpc("admin_account_protection_status");if(error)throw error;
   out("アカウント自動保護の状態");
   out("一般ユーザー: 30日 / デバッカー: 21日 / モデレーター: 14日 / 管理者: 7日 / オーナー: 対象外");
   out("有効アカウント: "+data.active+" / 保護中: "+data.protected+" / オーナー例外: "+data.owner_exemptions);
   out("自動実行スケジュール: "+(data.cron_scheduled?"登録済み":"未登録"));return;
  }
  if(b==="run"){
   if(!confirm("無活動期間を超えたアカウントを保護状態に変更します。実行しますか？"))return;
   const {data,error}=await db.rpc("admin_run_account_protection");if(error)throw error;
   out("自動保護処理が完了しました。新たに保護したアカウント: "+data+" 件","success");return;
  }
  throw Error("protection status / run を指定してください。");
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
  await requirePlatformAdmin();
  const n=Math.max(1,Math.min(100,Number(c)||30));const {data,error}=await db.from("organization_audit_logs").select("id,organization_id,actor_id,action,target_user_id,details,created_at").order("created_at",{ascending:false}).limit(n);
  if(error)throw error;out("団体操作履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.action+" | org="+(x.organization_id||"申請")+" | "+x.actor_id+" | "+x.id));return;
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
 if(a==="orgs"){await requirePlatformAdmin();let q=db.from("organizations").select("id,name,organization_type,status,created_at").order("created_at",{ascending:false}).limit(50);if(target)q=q.ilike("name","%"+target+"%");const {data,error}=await q;if(error)throw error;out("団体 "+data.length+" 件");data.forEach(x=>out(x.name+" | "+x.organization_type+" | "+x.status+" | "+x.id));return;}
 if(a==="orgapps"){await requirePlatformAdmin();let q=db.from("organization_applications").select("id,organization_name,organization_type,status,applicant_id,review_reason").order("created_at",{ascending:false}).limit(50);if(target&&target!=="all")q=q.eq("status",target);const {data,error}=await q;if(error)throw error;out("団体申請 "+data.length+" 件");data.forEach(x=>out(x.organization_name+" | "+x.status+" | "+x.applicant_id+" | "+x.id));return;}
 if(a==="orgmembers"){await requirePlatformAdmin();if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_members").select("id,user_id,role,status").eq("organization_id",target).order("created_at",{ascending:false}).limit(100);if(error)throw error;out("団体メンバー "+data.length+" 人");data.forEach(x=>out(x.user_id+" | "+x.role+" | "+x.status+" | "+x.id));return;}
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
 if(a==="orgboard"){await requirePlatformAdmin();if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_board_posts").select("id,title,post_type,is_pinned,author_id,created_at").eq("organization_id",target).order("created_at",{ascending:false}).limit(50);if(error)throw error;out("団体掲示板 "+data.length+" 件");data.forEach(x=>out((x.is_pinned?"📌 ":"")+x.title+" | "+x.post_type+" | "+x.id));return;}
 if(a==="orgevents"){await requirePlatformAdmin();if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_events").select("id,title,location,starts_at,ends_at,created_by").eq("organization_id",target).order("starts_at",{ascending:false}).limit(50);if(error)throw error;out("団体イベント "+data.length+" 件");data.forEach(x=>out(x.title+" | "+fmt(x.starts_at)+" | "+(x.location||"場所未設定")+" | "+x.id));return;}
 if(a==="orgaudit"){await requirePlatformAdmin();if(!target)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organization_audit_logs").select("id,actor_id,action,target_user_id,details,created_at").eq("organization_id",target).order("created_at",{ascending:false}).limit(50);if(error)throw error;out("団体操作ログ "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.action+" | actor="+x.actor_id+" | target="+(x.target_user_id||"-")+" | "+x.id));return;}
 if(a==="notifications"){let q=db.from("notifications").select("id,recipient_id,type,title,created_at,read_at").order("created_at",{ascending:false}).limit(50);if(target)q=q.eq("recipient_id",target);const {data,error}=await q;if(error)throw error;out("通知 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.type+" | "+x.title+" | "+(x.read_at?"既読":"未読")+" | "+x.id));return;}
 if(a==="ai"&&["logs","conversation","search","stats"].includes(b)){
  if(!owner)throw Error("運営AIの会話監査ログはオーナー専用です。");
  if(b==="logs"){
   const n=Math.max(1,Math.min(100,Number(c)||30));
   const {data,error}=await db.from("admin_ai_conversations").select("id,conversation_id,actor_id,actor_role,prompt,answer,model,created_at").order("created_at",{ascending:false}).limit(n);
   if(error)throw error;
   const ids=[...new Set(data.map(x=>x.actor_id))];
   const {data:people,error:peopleError}=await db.from("profiles").select("id,display_name,username").in("id",ids);
   if(peopleError)throw peopleError;
   const names=new Map((people||[]).map(p=>[p.id,(p.display_name||p.username||p.id)]));
   out("運営AI会話履歴 "+data.length+" 件");
   data.forEach(x=>out(fmt(x.created_at)+" | "+(names.get(x.actor_id)||x.actor_id)+" | "+x.actor_role+" | 会話ID="+x.conversation_id+" | "+x.prompt.slice(0,120)));
   return;
  }
  if(b==="conversation"){
   if(!c)throw Error("会話IDを指定してください。");
   const {data,error}=await db.from("admin_ai_conversations").select("id,conversation_id,actor_id,actor_role,prompt,answer,model,created_at").eq("conversation_id",c).order("created_at",{ascending:true});
   if(error)throw error;if(!data?.length)throw Error("会話が見つかりません。");
   out("会話 "+c+" / "+data.length+" ターン");
   data.forEach((x,i)=>{out("["+fmt(x.created_at)+"] "+x.actor_role+" / 管理者ID="+x.actor_id);out("質問: "+x.prompt);out("AI回答: "+x.answer);});
   return;
  }
  if(b==="search"){
   const q=[c,...rest].join(" ").trim();if(!q)throw Error("検索キーワードを入力してください。");
   const {data,error}=await db.from("admin_ai_conversations").select("conversation_id,actor_id,actor_role,prompt,answer,created_at").or("prompt.ilike.%"+q+"%,answer.ilike.%"+q+"%").order("created_at",{ascending:false}).limit(50);
   if(error)throw error;
   const ids=[...new Set(data.map(x=>x.actor_id))];
   const {data:people,error:peopleError}=await db.from("profiles").select("id,display_name,username").in("id",ids);
   if(peopleError)throw peopleError;
   const names=new Map((people||[]).map(p=>[p.id,(p.display_name||p.username||p.id)]));
   out("検索結果 "+data.length+" 件");
   data.forEach(x=>out(fmt(x.created_at)+" | "+(names.get(x.actor_id)||x.actor_id)+" | "+x.actor_role+" | "+x.conversation_id+" | "+x.prompt.slice(0,160)));
   return;
  }
  const {data,error}=await db.from("admin_ai_conversations").select("id,actor_id,conversation_id,created_at");
  if(error)throw error;const users=new Set(data.map(x=>x.actor_id));const convs=new Set(data.map(x=>x.conversation_id));
  out("運営AI統計");out("総メッセージ数: "+data.length);out("利用管理者数: "+users.size);out("会話数: "+convs.size);
  if(data.length)out("最終利用: "+fmt(data.reduce((a,x)=>x.created_at>a?x.created_at:a,data[0].created_at)));
  return;
 }
 if(a==="ai"&&b==="usage"){let q=db.from("ai_usage_events").select("id,user_id,estimated_neurons,actual_neurons,status,created_at").order("created_at",{ascending:false}).limit(50);if(c)q=q.eq("user_id",c);const {data,error}=await q;if(error)throw error;out("AI利用履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | "+x.status+" | 予測="+x.estimated_neurons+" | 実績="+x.actual_neurons+" | "+x.user_id));return;}
 if(a==="site"&&b==="history"){if(!owner)throw Error("サイト履歴はオーナー専用です。");let q=db.from("site_editor_history").select("id,setting_key,action,changed_by,changed_at").order("changed_at",{ascending:false}).limit(50);if(c)q=q.eq("setting_key",c);const {data,error}=await q;if(error)throw error;out("サイト編集履歴 "+data.length+" 件");data.forEach(x=>out(fmt(x.changed_at)+" | "+x.action+" | "+x.setting_key+" | "+x.changed_by));return;}
 if(a==="filterlogs"){const n=Math.max(1,Math.min(100,Number(target)||30));const {data,error}=await db.from("admin_abuse_filter_logs").select("id,filter_id,actor_id,target_type,target_id,action,matched_term,created_at").order("created_at",{ascending:false}).limit(n);if(error)throw error;out("フィルター検出ログ "+data.length+" 件");data.forEach(x=>out(fmt(x.created_at)+" | filter="+x.filter_id+" | "+x.action+" | "+x.target_type+" "+x.target_id+" | term="+x.matched_term));return;}
 
 

 if(a==="article"&&b==="likes"){if(!c)throw Error("記事IDを指定してください。");const {data,error}=await db.from("article_likes").select("user_id,created_at").eq("article_id",c).order("created_at",{ascending:false}).limit(100);if(error)throw error;out("いいね "+data.length+" 件（最大100件）");data.forEach(x=>out(x.user_id+" | "+fmt(x.created_at)));return;}
 if(a==="poll"&&b==="results"){if(!c)throw Error("投票IDを指定してください。");const {data,error}=await db.from("community_poll_options").select("id,label,sort_order").eq("poll_id",c).order("sort_order");if(error)throw error;out("投票結果");for(const opt of data){const {count,error:ce}=await db.from("community_poll_votes").select("poll_id",{count:"exact",head:true}).eq("option_id",opt.id);if(ce)throw ce;out(opt.label+" : "+count+" 票");}return;}
 if(a==="org"&&b==="info"){await requirePlatformAdmin();if(!c)throw Error("団体IDを指定してください。");const {data,error}=await db.from("organizations").select("id,name,organization_type,description,website,status,created_by,created_at,updated_at").eq("id",c).maybeSingle();if(error)throw error;if(!data)throw Error("団体が見つかりません。");Object.entries(data).forEach(([k,v])=>out(k+": "+(v??"-")));return;}

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
 throw Error("不明なコマンドです。/kizimin help で一覧を確認してください。");
}
function bind(){
 const form=$("kcmd-form"),input=$("kcmd-input");if(!form||form.dataset.bound)return;form.dataset.bound="1";
 const history=[];let historyIndex=0;
 form.addEventListener("submit",async e=>{e.preventDefault();const raw=input.value.trim();if(!raw)return;if(history[history.length-1]!==raw){history.push(raw);if(history.length>100)history.shift();}historyIndex=history.length;out("> "+raw.replace(/^\/?kizimin\b/i,"/kizimin"),"command");input.value="";try{await execute(raw);}catch(err){console.error("[Kizimin Console]",err);out("エラー: "+(err?.message||String(err)),"error");}});
 $("kcmd-clear")?.addEventListener("click",()=>{$("kcmd-output").innerHTML="";});  input.addEventListener("keydown",e=>{
  if(e.key==="ArrowUp"){e.preventDefault();if(!history.length)return;historyIndex=Math.max(0,historyIndex-1);input.value=history[historyIndex];}
  else if(e.key==="ArrowDown"){e.preventDefault();if(!history.length)return;historyIndex=Math.min(history.length,historyIndex+1);input.value=history[historyIndex]||"";}
 });
}
document.addEventListener("DOMContentLoaded",()=>{bind();init().catch(e=>{console.error(e);$("kcmd-auth").textContent="認証失敗: "+(e.message||e);$("kcmd-auth").classList.add("error");});});
})();